'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function calcHoras(inicio: string, fin: string): number {
  const [hi, mi] = inicio.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.round(((hf * 60 + mf) - (hi * 60 + mi)) / 60 * 100) / 100
}

export async function getDiasInternosEntries(startDate: string, endDate: string) {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T23:59:59')
  return prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: start, lte: end } },
    include: { truck: { select: { plate: true } } },
    orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
  })
}

export async function getDiasInternosTotalHoras(startDate: string, endDate: string): Promise<number> {
  const entries = await getDiasInternosEntries(startDate, endDate)
  return entries.reduce((s, e) => s + e.totalHoras, 0)
}

export async function createDiasInternosEntry(data: FormData) {
  const truckId     = data.get('truckId')    as string
  const conductor   = (data.get('conductor') as string)?.trim()
  const fecha       = data.get('fecha')       as string
  const horaInicio  = data.get('horaInicio') as string
  const horaFin     = data.get('horaFin')    as string
  const descripcion = (data.get('descripcion') as string)?.trim() || 'INTERNO TRONCAL A PLANTA'
  const actividad   = (data.get('actividad')  as string)?.trim() || 'ACARREO DE ÑUMA DE TRONCAL A PLANTA'

  if (!truckId || !conductor || !fecha || !horaInicio || !horaFin)
    return { error: 'Todos los campos son requeridos' }

  const totalHoras = calcHoras(horaInicio, horaFin)
  if (totalHoras <= 0) return { error: 'La hora fin debe ser mayor a la hora inicio' }

  await prisma.diasInternosEntry.create({
    data: {
      truckId, conductor, descripcion, actividad, horaInicio, horaFin, totalHoras,
      fecha: new Date(fecha + 'T12:00:00'),
    },
  })
  revalidatePath('/dias-internos')
  return {}
}

export async function updateDiasInternosEntry(id: string, data: FormData) {
  const conductor   = (data.get('conductor') as string)?.trim()
  const horaInicio  = data.get('horaInicio') as string
  const horaFin     = data.get('horaFin')    as string
  const descripcion = (data.get('descripcion') as string)?.trim() || 'INTERNO TRONCAL A PLANTA'
  const actividad   = (data.get('actividad')  as string)?.trim() || 'ACARREO DE ÑUMA DE TRONCAL A PLANTA'

  if (!conductor || !horaInicio || !horaFin) return { error: 'Campos requeridos' }

  const totalHoras = calcHoras(horaInicio, horaFin)
  if (totalHoras <= 0) return { error: 'La hora fin debe ser mayor a la hora inicio' }

  await prisma.diasInternosEntry.update({
    where: { id },
    data: { conductor, descripcion, actividad, horaInicio, horaFin, totalHoras },
  })
  revalidatePath('/dias-internos')
  return {}
}

export async function deleteDiasInternosEntry(id: string) {
  await prisma.diasInternosEntry.delete({ where: { id } })
  revalidatePath('/dias-internos')
}

/** Detecta camiones con DIAS INTERNOS en la romana para el período dado */
export async function getDiasInternosDetections(startDate: string, endDate: string) {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T23:59:59')

  const trips = await prisma.trip.findMany({
    where: {
      date: { gte: start, lte: end },
      route: { name: { contains: 'DIAS INTERNOS' } },
    },
    include: {
      truck: { select: { id: true, plate: true, driver: { select: { name: true } } } },
    },
    orderBy: [{ date: 'asc' }],
  })

  // Agrupar por truckId + fecha
  const map = new Map<string, { truckId: string; plate: string; conductor: string; date: string; tripCount: number }>()
  for (const t of trips) {
    const dateKey = t.date.toISOString().slice(0, 10)
    const key = `${t.truckId}|${dateKey}`
    if (!map.has(key)) {
      map.set(key, {
        truckId:   t.truck.id,
        plate:     t.truck.plate,
        conductor: t.truck.driver?.name ?? t.conductor ?? '—',
        date:      dateKey,
        tripCount: 0,
      })
    }
    map.get(key)!.tripCount++
  }
  return Array.from(map.values())
}
