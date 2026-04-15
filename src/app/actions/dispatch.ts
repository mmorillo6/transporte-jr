'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

type EntryInput = { truckId: string; routeId: string; plannedTrips: number; notes?: string }

export async function createOrUpdateDispatch(date: string, entries: EntryInput[], notes?: string) {
  if (!date) return { error: 'Fecha requerida' }
  if (entries.length === 0) return { error: 'Asigna al menos un camión' }

  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd   = new Date(date + 'T23:59:59')

  // Guardar o actualizar el despacho
  const existing = await prisma.dispatch.findFirst({
    where: { date: { gte: dayStart, lte: dayEnd } },
  })

  if (existing) {
    await prisma.dispatchEntry.deleteMany({ where: { dispatchId: existing.id } })
    await prisma.dispatch.update({
      where: { id: existing.id },
      data: {
        notes: notes || null,
        entries: { create: entries.map(e => ({ ...e, notes: e.notes || null })) },
      },
    })
  } else {
    await prisma.dispatch.create({
      data: {
        date: dayStart,
        notes: notes || null,
        entries: { create: entries.map(e => ({ ...e, notes: e.notes || null })) },
      },
    })
  }

  // ── Auto-registrar gasoil por despacho ─────────────────────────────────────
  // Borrar FuelEntries previos de este día generados por despacho
  await prisma.fuelEntry.deleteMany({
    where: {
      date:   { gte: dayStart, lte: dayEnd },
      source: 'DESPACHO',
    },
  })

  // Crear nuevos FuelEntries para cada asignación con viajes > 0
  const routeIds = [...new Set(entries.map(e => e.routeId))]
  const routes = await prisma.route.findMany({
    where: { id: { in: routeIds } },
    select: { id: true, name: true, fuelLitersPerTrip: true },
  })
  const routeMap = new Map(routes.map(r => [r.id, r]))

  const fuelEntries = entries
    .filter(e => e.plannedTrips > 0)
    .map(e => {
      const route = routeMap.get(e.routeId)
      if (!route || route.fuelLitersPerTrip === 0) return null
      return {
        truckId: e.truckId,
        routeId: e.routeId,
        liters:  e.plannedTrips * route.fuelLitersPerTrip,
        date:    dayStart,
        source:  'DESPACHO',
        notes:   `${e.plannedTrips} viaje${e.plannedTrips !== 1 ? 's' : ''} a ${route.name}`,
      }
    })
    .filter(Boolean) as { truckId: string; routeId: string; liters: number; date: Date; source: string; notes: string }[]

  if (fuelEntries.length > 0) {
    await prisma.fuelEntry.createMany({ data: fuelEntries })
  }

  revalidatePath('/despacho')
  revalidatePath('/gasoil')
  return { ok: true }
}

export async function getDispatchForDate(date: string) {
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59')
  return prisma.dispatch.findFirst({
    where: { date: { gte: dayStart, lte: dayEnd } },
    include: {
      entries: {
        include: {
          truck: { select: { id: true, plate: true, driver: { select: { name: true } } } },
          route: { select: { id: true, name: true } },
        },
      },
    },
  })
}
