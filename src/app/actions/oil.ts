'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

export async function createOilBatch(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const type = fd.get('type') as string
  const liters = parseFloat(fd.get('liters') as string)
  const cost = parseFloat(fd.get('cost') as string)
  const dateStr = fd.get('date') as string
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!type || isNaN(liters) || liters <= 0 || isNaN(cost) || cost <= 0 || !dateStr)
    return { error: 'Tipo, litros, costo y fecha son requeridos' }

  await prisma.oilBatch.create({
    data: { type: type as any, liters, cost, date: new Date(dateStr), notes },
  })

  revalidatePath('/aceite')
  return { ok: true }
}

export async function deleteOilBatch(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.oilBatch.delete({ where: { id } })
  revalidatePath('/aceite')
  return { ok: true }
}

export async function createOilUsage(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const batchId = fd.get('batchId') as string
  const truckId = fd.get('truckId') as string
  const liters = parseFloat(fd.get('liters') as string)
  const dateStr = fd.get('date') as string

  if (!batchId || !truckId || isNaN(liters) || liters <= 0 || !dateStr)
    return { error: 'Paila, camión, litros y fecha requeridos' }

  // Check remaining liters
  const batch = await prisma.oilBatch.findUnique({
    where: { id: batchId },
    include: { usages: { select: { liters: true } } },
  })
  if (!batch) return { error: 'Paila no encontrada' }

  const used = batch.usages.reduce((s, u) => s + u.liters, 0)
  const remaining = batch.liters - used
  if (liters > remaining) return { error: `Solo quedan ${remaining.toFixed(1)}L en esta paila` }

  await prisma.oilUsage.create({
    data: { batchId, truckId, liters, date: new Date(dateStr) },
  })

  revalidatePath('/aceite')
  return { ok: true }
}

export async function deleteOilUsage(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.oilUsage.delete({ where: { id } })
  revalidatePath('/aceite')
  return { ok: true }
}
