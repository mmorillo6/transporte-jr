'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

const ESTERIL_RATE     = 100   // $100 por viaje (flete)
const ESTERIL_WAGE     = 20    // $20 sueldo chofer por viaje de estéril

async function getOrCreateEsterilRoute(clientName: 'AURUMIN' | 'LUIS PEÑA') {
  const name = `MATERIAL ESTERIL - ${clientName}`
  const existing = await prisma.route.findFirst({
    where: { name, active: true },
  })
  if (existing) return existing
  return prisma.route.create({
    data: {
      name,
      clientName,
      rateType:   'PER_TRIP',
      rate:       ESTERIL_RATE,
      driverWage: ESTERIL_WAGE,
      active:     true,
    },
  })
}

export async function createMaterialEsterilEntries(entries: {
  truckId:    string
  fecha:      string        // YYYY-MM-DD
  nViajes:    number
  clientName: 'AURUMIN' | 'LUIS PEÑA'
  periodId:   string
}[]) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role))
    return { error: 'No autorizado' }
  if (entries.length === 0) return { error: 'Sin datos para guardar' }

  // Obtener/crear rutas por cliente
  const routeAurumin  = await getOrCreateEsterilRoute('AURUMIN')
  const routeLuisPena = await getOrCreateEsterilRoute('LUIS PEÑA')

  const trips = entries.flatMap(e => {
    const route = e.clientName === 'LUIS PEÑA' ? routeLuisPena : routeAurumin
    // Crear N viajes de $100 cada uno con sueldo $10
    return Array.from({ length: e.nViajes }, () => ({
      date:     new Date(e.fecha + 'T12:00:00'),
      truckId:  e.truckId,
      routeId:  route.id,
      amount:   ESTERIL_RATE,
      viatico:  ESTERIL_WAGE,
      periodId: e.periodId,
    }))
  })

  await prisma.trip.createMany({ data: trips })

  revalidatePath('/dias-internos')
  revalidatePath('/nomina')
  revalidatePath('/viajes')
  return { ok: true, created: trips.length }
}

export async function getMaterialEsterilEntries(periodId: string) {
  return prisma.trip.findMany({
    where: {
      periodId,
      route: { name: { startsWith: 'MATERIAL ESTERIL' } },
    },
    include: {
      truck: { select: { plate: true, driver: { select: { name: true } } } },
      route: { select: { name: true, clientName: true } },
    },
    orderBy: [{ date: 'asc' }, { truck: { plate: 'asc' } }],
  })
}

export async function deleteMaterialEsterilTrip(tripId: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role))
    return { error: 'No autorizado' }
  await prisma.trip.delete({ where: { id: tripId } })
  revalidatePath('/dias-internos')
  revalidatePath('/nomina')
  return { ok: true }
}
