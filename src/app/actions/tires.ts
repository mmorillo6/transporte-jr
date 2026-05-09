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

export async function addTireDebtPayment(debtId: string, fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const amount = parseFloat(fd.get('amount') as string)
  const notes = (fd.get('notes') as string)?.trim() || null
  if (isNaN(amount) || amount <= 0) return { error: 'Monto inválido' }

  const debt = await prisma.tireDebt.findUnique({ where: { id: debtId } })
  if (!debt) return { error: 'Deuda no encontrada' }

  const newPaid    = debt.amountPaid + amount
  const newBalance = Math.max(0, debt.totalAmount - newPaid)
  const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'

  await prisma.$transaction([
    prisma.tireDebtPayment.create({ data: { debtId, amount, notes, date: new Date() } }),
    prisma.tireDebt.update({ where: { id: debtId }, data: { amountPaid: newPaid, balance: newBalance, status } }),
  ])

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function createTireDebt(fd: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const ownerName   = (fd.get('ownerName') as string)?.trim().toUpperCase()
  const truckPlate  = (fd.get('truckPlate') as string)?.trim().toUpperCase() || null
  const tireType    = (fd.get('tireType') as string)?.trim() || '1200r24'
  const quantity    = parseInt(fd.get('quantity') as string) || 1
  const unitCost    = parseFloat(fd.get('unitCost') as string) || 0
  const notes       = (fd.get('notes') as string)?.trim() || null
  const dateStr     = fd.get('date') as string

  if (!ownerName || unitCost <= 0) return { error: 'Nombre y costo requeridos' }

  const totalAmount = quantity * unitCost

  await prisma.tireDebt.create({
    data: { ownerName, truckPlate, tireType, quantity, unitCost, totalAmount, amountPaid: 0, balance: totalAmount, status: 'PENDING', date: dateStr ? new Date(dateStr) : new Date(), notes },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}
