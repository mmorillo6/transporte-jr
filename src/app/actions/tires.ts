'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

export async function createTireRepair(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const truckId = fd.get('truckId') as string
  const quantity = parseInt(fd.get('quantity') as string) || 1
  const unitCost = parseFloat(fd.get('unitCost') as string) || 0
  const dateStr = fd.get('date') as string
  const notes = (fd.get('notes') as string)?.trim() || null

  if (!truckId || !dateStr) return { error: 'Camión y fecha requeridos' }

  await prisma.tireRepair.create({
    data: { truckId, quantity, unitCost, date: new Date(dateStr), notes },
  })

  revalidatePath('/cauchos')
  return { ok: true }
}

export async function markTireRepairPaid(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.tireRepair.update({ where: { id }, data: { paidAt: new Date() } })
  revalidatePath('/cauchos')
  return { ok: true }
}

export async function deleteTireRepair(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.tireRepair.delete({ where: { id } })
  revalidatePath('/cauchos')
  return { ok: true }
}
