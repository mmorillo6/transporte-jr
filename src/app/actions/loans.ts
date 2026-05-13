'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function createLoan(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const driverName = (formData.get('driverName') as string)?.trim()
  const amount = parseFloat(formData.get('amount') as string)
  const deductType = formData.get('deductType') as string
  const deductAmount = parseFloat(formData.get('deductAmount') as string) || 0
  const notes = formData.get('notes') as string

  if (!driverName || isNaN(amount) || amount <= 0) return { error: 'Nombre y monto son requeridos' }

  await prisma.loan.create({
    data: {
      driverName,
      amount,
      balance: amount,
      deductType: deductType as any,
      deductAmount,
      notes: notes || null,
      date: new Date(),
    },
  })

  revalidatePath('/prestamos')
  return { ok: true }
}

export async function updateLoan(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const driverName = (formData.get('driverName') as string)?.trim()
  const amount = parseFloat(formData.get('amount') as string)
  const balance = parseFloat(formData.get('balance') as string)
  const deductType = formData.get('deductType') as string
  const deductAmount = parseFloat(formData.get('deductAmount') as string) || 0
  const notes = formData.get('notes') as string

  if (!driverName || isNaN(amount) || amount <= 0) return { error: 'Nombre y monto son requeridos' }

  await prisma.loan.update({
    where: { id },
    data: {
      driverName,
      amount,
      balance: isNaN(balance) ? amount : Math.max(0, balance),
      deductType: deductType as any,
      deductAmount,
      notes: notes || null,
    },
  })

  revalidatePath('/prestamos')
  return { ok: true }
}

export async function markLoanPaid(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.loan.update({ where: { id }, data: { balance: 0 } })
  revalidatePath('/prestamos')
  revalidatePath('/caja')
  return { ok: true }
}

export async function abonarLoan(id: string, amount: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  if (isNaN(amount) || amount <= 0) return { error: 'Monto inválido' }

  const loan = await prisma.loan.findUnique({ where: { id } })
  if (!loan) return { error: 'Préstamo no encontrado' }

  const newBalance = Math.max(0, Math.round((loan.balance - amount) * 100) / 100)
  await prisma.loan.update({ where: { id }, data: { balance: newBalance } })
  revalidatePath('/prestamos')
  revalidatePath('/caja')
  return { ok: true, newBalance }
}

export async function deleteLoan(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.loan.delete({ where: { id } })
  revalidatePath('/prestamos')
  return { ok: true }
}
