'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createCuenta(data: FormData) {
  const clientName = (data.get('clientName') as string)?.trim()
  const concept    = (data.get('concept') as string)?.trim()
  const periodLabel = (data.get('periodLabel') as string)?.trim() || null
  const date       = new Date(data.get('date') as string)
  const totalAmount = parseFloat(data.get('totalAmount') as string)
  const amountPaid  = parseFloat((data.get('amountPaid') as string) || '0')
  const notes      = (data.get('notes') as string)?.trim() || null

  if (!clientName || !concept || isNaN(totalAmount)) return { error: 'Completa los campos requeridos' }

  const balance = totalAmount - amountPaid
  const status  = balance <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING'

  await prisma.cuentaPorCobrar.create({
    data: { clientName, concept, periodLabel, date, totalAmount, amountPaid, balance, status: status as 'PAID' | 'PARTIAL' | 'PENDING', notes },
  })
  revalidatePath('/cuentas-por-cobrar')
  return {}
}

export async function updateCuenta(id: string, data: FormData) {
  const clientName  = (data.get('clientName') as string)?.trim()
  const concept     = (data.get('concept') as string)?.trim()
  const periodLabel = (data.get('periodLabel') as string)?.trim() || null
  const date        = new Date(data.get('date') as string)
  const totalAmount = parseFloat(data.get('totalAmount') as string)
  const amountPaid  = parseFloat((data.get('amountPaid') as string) || '0')
  const notes       = (data.get('notes') as string)?.trim() || null

  if (!clientName || !concept || isNaN(totalAmount)) return { error: 'Completa los campos requeridos' }

  const balance = totalAmount - amountPaid
  const status  = balance <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING'

  await prisma.cuentaPorCobrar.update({
    where: { id },
    data: { clientName, concept, periodLabel, date, totalAmount, amountPaid, balance, status: status as 'PAID' | 'PARTIAL' | 'PENDING', notes },
  })
  revalidatePath('/cuentas-por-cobrar')
  return {}
}

export async function addPayment(cxcId: string, data: FormData) {
  const amount = parseFloat(data.get('amount') as string)
  const date   = new Date(data.get('date') as string)
  const method = (data.get('method') as string)?.trim() || null
  const notes  = (data.get('notes') as string)?.trim() || null

  if (isNaN(amount) || amount <= 0) return { error: 'Monto inválido' }

  const cxc = await prisma.cuentaPorCobrar.findUnique({ where: { id: cxcId } })
  if (!cxc) return { error: 'Cuenta no encontrada' }

  const newPaid    = cxc.amountPaid + amount
  const newBalance = cxc.totalAmount - newPaid
  const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'
  const currency   = method?.toUpperCase().includes('USDT') ? 'USDT' : 'EFECTIVO'

  await prisma.$transaction([
    prisma.cxCPayment.create({ data: { cxcId, amount, date, method, notes } }),
    prisma.cuentaPorCobrar.update({
      where: { id: cxcId },
      data: { amountPaid: newPaid, balance: Math.max(0, newBalance), status: status as 'PAID' | 'PARTIAL' },
    }),
    // Registrar automáticamente en Caja
    prisma.cashEntry.create({
      data: {
        type: 'INGRESO',
        currency: currency as 'EFECTIVO' | 'USDT',
        amount,
        concept: `Cobro ${cxc.clientName} — ${cxc.concept}`,
        source: cxc.clientName,
        notes: notes || null,
        date,
      },
    }),
  ])
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/caja')
  return {}
}

export async function deleteCuenta(id: string) {
  await prisma.cuentaPorCobrar.delete({ where: { id } })
  revalidatePath('/cuentas-por-cobrar')
}
