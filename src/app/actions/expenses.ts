'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function createExpense(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const dateStr = formData.get('date') as string
  const category = formData.get('category') as string
  const truckId = formData.get('truckId') as string
  const description = formData.get('description') as string
  const amountStr = formData.get('amount') as string
  const paymentStatus = (formData.get('paymentStatus') as string) || 'pagado'
  const amountPaidStr = formData.get('amountPaid') as string
  const invoiceUrl = formData.get('invoiceUrl') as string

  if (!dateStr || !category || !description || !amountStr) {
    return { error: 'Todos los campos obligatorios son requeridos' }
  }

  const date = new Date(dateStr)
  const amount = parseFloat(amountStr)
  const isCredit = paymentStatus !== 'pagado'
  const amountPaid = paymentStatus === 'pagado' ? amount
    : paymentStatus === 'parcial' ? (parseFloat(amountPaidStr) || 0)
    : 0
  const paidDate = paymentStatus === 'pagado' ? new Date() : null

  // Find or create period for this date
  const day = date.getDate()
  const month = date.getMonth()
  const year = date.getFullYear()
  const isFirstHalf = day <= 16
  const startDay = isFirstHalf ? 1 : 17
  const endDay   = isFirstHalf ? 16 : new Date(year, month + 1, 0).getDate()
  const startDate = new Date(Date.UTC(year, month, startDay, 0, 0, 0))
  const endDate   = new Date(Date.UTC(year, month, endDay,   23, 59, 59))

  let period = await prisma.period.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN' },
  })
  if (!period) {
    period = await prisma.period.create({ data: { startDate, endDate, status: 'OPEN' } })
  }

  await prisma.expense.create({
    data: {
      date,
      category: category as any,
      truckId: truckId || null,
      periodId: period.id,
      description,
      amount,
      isCredit,
      amountPaid,
      paidDate,
      invoiceUrl: invoiceUrl || null,
    },
  })

  revalidatePath('/gastos')
  return { ok: true }
}

export async function updateExpense(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const dateStr = formData.get('date') as string
  const category = formData.get('category') as string
  const truckId = formData.get('truckId') as string
  const description = formData.get('description') as string
  const amountStr = formData.get('amount') as string
  const paymentStatus = (formData.get('paymentStatus') as string) || 'pagado'
  const amountPaidStr = formData.get('amountPaid') as string
  const invoiceUrl = formData.get('invoiceUrl') as string

  if (!dateStr || !category || !description || !amountStr) {
    return { error: 'Todos los campos obligatorios son requeridos' }
  }

  const amount = parseFloat(amountStr)
  const isCredit = paymentStatus !== 'pagado'
  const amountPaid = paymentStatus === 'pagado' ? amount
    : paymentStatus === 'parcial' ? (parseFloat(amountPaidStr) || 0)
    : 0
  const paidDate = paymentStatus === 'pagado' ? new Date() : null

  await prisma.expense.update({
    where: { id },
    data: {
      date: new Date(dateStr),
      category: category as any,
      truckId: truckId || null,
      description,
      amount,
      isCredit,
      amountPaid,
      paidDate,
      invoiceUrl: invoiceUrl || null,
    },
  })

  revalidatePath('/gastos')
  return { ok: true }
}

export async function markExpensePaid(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const expense = await prisma.expense.findUnique({ where: { id }, select: { amount: true } })
  await prisma.expense.update({
    where: { id },
    data: { paidDate: new Date(), isCredit: false, amountPaid: expense?.amount ?? 0 },
  })

  revalidatePath('/gastos')
  return { ok: true }
}

export async function markExpensePartialPaid(id: string, amountPaid: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const expense = await prisma.expense.findUnique({ where: { id }, select: { amount: true } })
  if (!expense) return { error: 'Gasto no encontrado' }

  const fullyPaid = amountPaid >= expense.amount
  await prisma.expense.update({
    where: { id },
    data: {
      amountPaid,
      isCredit: !fullyPaid,
      paidDate: fullyPaid ? new Date() : null,
    },
  })

  revalidatePath('/gastos')
  return { ok: true }
}

export async function deleteExpense(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.expense.delete({ where: { id } })
  revalidatePath('/gastos')
  return { ok: true }
}
