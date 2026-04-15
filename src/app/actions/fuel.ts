'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

// ─── Fuel entries (surtidas a camiones) ──────────────────────────────────────

export async function createFuelEntry(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const truckId = fd.get('truckId') as string
  const liters = parseFloat(fd.get('liters') as string)
  const dateStr = fd.get('date') as string
  const routeId = (fd.get('routeId') as string) || null
  const source = (fd.get('source') as string)?.trim() || null
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!truckId || isNaN(liters) || liters <= 0 || !dateStr) return { error: 'Camión, litros y fecha son requeridos' }

  await prisma.fuelEntry.create({
    data: { truckId, liters, date: new Date(dateStr), routeId, source, notes },
  })

  revalidatePath('/gasoil')
  return { ok: true }
}

export async function deleteFuelEntry(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.fuelEntry.delete({ where: { id } })
  revalidatePath('/gasoil')
  return { ok: true }
}

// ─── Bulk fuel supply order (orden de suministro) ────────────────────────────

export async function createFuelSupplyBatch(
  orders: { truckId: string; liters: number; routeId?: string }[],
  date: string,
  notes?: string,
) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  if (!orders.length) return { error: 'No hay camiones en la orden' }

  await prisma.fuelEntry.createMany({
    data: orders.map(o => ({
      truckId: o.truckId,
      liters: o.liters,
      date: new Date(date),
      routeId: o.routeId ?? null,
      notes: notes || null,
    })),
  })

  revalidatePath('/gasoil')
  return { ok: true, count: orders.length }
}

// ─── Fuel tanks (tanques) ─────────────────────────────────────────────────────

export async function createFuelTank(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = (fd.get('name') as string)?.trim()
  const capacityL = parseFloat(fd.get('capacityL') as string)
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!name || isNaN(capacityL) || capacityL <= 0) return { error: 'Nombre y capacidad son requeridos' }

  await prisma.fuelTank.create({ data: { name, capacityL, notes } })
  revalidatePath('/gasoil')
  return { ok: true }
}

export async function updateFuelTank(id: string, fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = (fd.get('name') as string)?.trim()
  const capacityL = parseFloat(fd.get('capacityL') as string)
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!name || isNaN(capacityL) || capacityL <= 0) return { error: 'Nombre y capacidad son requeridos' }

  await prisma.fuelTank.update({ where: { id }, data: { name, capacityL, notes } })
  revalidatePath('/gasoil')
  return { ok: true }
}

export async function deleteFuelTank(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.fuelTank.delete({ where: { id } })
  revalidatePath('/gasoil')
  return { ok: true }
}

// ─── Fuel intakes (entradas bulk a tanques) ───────────────────────────────────

export async function createFuelIntake(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const tankId = fd.get('tankId') as string
  const liters = parseFloat(fd.get('liters') as string)
  const dateStr = fd.get('date') as string
  const source = (fd.get('source') as string)?.trim() || null
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!tankId || isNaN(liters) || liters <= 0 || !dateStr) return { error: 'Tanque, litros y fecha son requeridos' }

  await prisma.fuelIntake.create({
    data: { tankId, liters, date: new Date(dateStr), source, notes },
  })
  revalidatePath('/gasoil')
  return { ok: true }
}

export async function deleteFuelIntake(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.fuelIntake.delete({ where: { id } })
  revalidatePath('/gasoil')
  return { ok: true }
}
