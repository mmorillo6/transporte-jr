'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

export async function createCuenta(data: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const clientName  = (data.get('clientName') as string)?.trim()
  const concept     = (data.get('concept') as string)?.trim()
  const periodLabel = (data.get('periodLabel') as string)?.trim() || null
  const date        = new Date(data.get('date') as string)
  const dueDateRaw  = (data.get('dueDate') as string)?.trim()
  const dueDate     = dueDateRaw ? new Date(dueDateRaw) : null
  const totalAmount = parseFloat(data.get('totalAmount') as string)
  const amountPaid  = parseFloat((data.get('amountPaid') as string) || '0')
  const notes       = (data.get('notes') as string)?.trim() || null

  if (!clientName || !concept || isNaN(totalAmount)) return { error: 'Completa los campos requeridos' }

  const balance = totalAmount - amountPaid
  const status  = balance <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING'

  await prisma.cuentaPorCobrar.create({
    data: { clientName, concept, periodLabel, date, dueDate, totalAmount, amountPaid, balance, status: status as 'PAID' | 'PARTIAL' | 'PENDING', notes },
  })
  revalidatePath('/cuentas-por-cobrar')
  return {}
}

export async function updateCuenta(id: string, data: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const clientName  = (data.get('clientName') as string)?.trim()
  const concept     = (data.get('concept') as string)?.trim()
  const periodLabel = (data.get('periodLabel') as string)?.trim() || null
  const date        = new Date(data.get('date') as string)
  const dueDateRaw  = (data.get('dueDate') as string)?.trim()
  const dueDate     = dueDateRaw ? new Date(dueDateRaw) : null
  const totalAmount = parseFloat(data.get('totalAmount') as string)
  const amountPaid  = parseFloat((data.get('amountPaid') as string) || '0')
  const notes       = (data.get('notes') as string)?.trim() || null

  if (!clientName || !concept || isNaN(totalAmount)) return { error: 'Completa los campos requeridos' }

  const balance = totalAmount - amountPaid
  const status  = balance <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING'

  await prisma.cuentaPorCobrar.update({
    where: { id },
    data: { clientName, concept, periodLabel, date, dueDate, totalAmount, amountPaid, balance, status: status as 'PAID' | 'PARTIAL' | 'PENDING', notes },
  })
  revalidatePath('/cuentas-por-cobrar')
  return {}
}

export async function addPayment(cxcId: string, data: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const date  = new Date(data.get('date') as string)
  const notes = (data.get('notes') as string)?.trim() || null

  let lines: { method: string; amount: number }[]
  try {
    lines = (JSON.parse((data.get('lines') as string) || '[]') as { method: string; amount: number }[])
      .filter(l => typeof l.amount === 'number' && l.amount > 0)
  } catch {
    return { error: 'Datos de pago inválidos' }
  }
  if (!lines.length) return { error: 'Agrega al menos un monto' }

  const totalAmount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100

  const cxc = await prisma.cuentaPorCobrar.findUnique({ where: { id: cxcId } })
  if (!cxc) return { error: 'Cuenta no encontrada' }

  const newPaid    = Math.round((cxc.amountPaid + totalAmount) * 100) / 100
  const newBalance = Math.max(0, Math.round((cxc.totalAmount - newPaid) * 100) / 100)
  const status      = newBalance <= 0 ? 'PAID' : 'PARTIAL'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []
  for (const line of lines) {
    const currency = line.method.toUpperCase().includes('USDT') ? 'USDT' : 'EFECTIVO'
    ops.push(
      prisma.cxCPayment.create({ data: { cxcId, amount: line.amount, date, method: line.method, notes } }),
      // Registrar automáticamente en Caja
      prisma.cashEntry.create({
        data: {
          type: 'INGRESO',
          currency: currency as 'EFECTIVO' | 'USDT',
          amount: line.amount,
          concept: `Cobro ${cxc.clientName} — ${cxc.concept}`,
          source: cxc.clientName,
          notes: notes || null,
          date,
        },
      }),
    )
  }
  ops.push(
    prisma.cuentaPorCobrar.update({
      where: { id: cxcId },
      data: { amountPaid: newPaid, balance: newBalance, status: status as 'PAID' | 'PARTIAL' },
    }),
  )

  await prisma.$transaction(ops)
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/caja')
  return {}
}

export async function deleteCuenta(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.cuentaPorCobrar.delete({ where: { id } })
  revalidatePath('/cuentas-por-cobrar')
}

export async function addGlobalPayment(
  clientName: string,
  totalAmount: number,
  date: string,
  lines: { method: string; amount: number }[],
  notes: string,
  distribution: { cxcId: string; amount: number }[],
) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const activeItems = distribution.filter(d => d.amount > 0)
  const sum = activeItems.reduce((s, d) => s + d.amount, 0)
  if (Math.abs(sum - totalAmount) > 0.05) return { error: `La distribución suma $${sum.toFixed(2)} pero el total es $${totalAmount.toFixed(2)}` }

  const activeLines = lines.filter(l => l.amount > 0)
  const linesSum = Math.round(activeLines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  if (!activeLines.length || Math.abs(linesSum - totalAmount) > 0.05) {
    return { error: `Los métodos de pago suman $${linesSum.toFixed(2)} pero el total es $${totalAmount.toFixed(2)}` }
  }

  const paymentDate = new Date(date)
  const methodLabel = activeLines.map(l => l.method).join(' + ')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []

  for (const { cxcId, amount } of activeItems) {
    const cxc = await prisma.cuentaPorCobrar.findUnique({ where: { id: cxcId } })
    if (!cxc) continue
    const newPaid    = Math.round((cxc.amountPaid + amount) * 100) / 100
    const newBalance = Math.max(0, Math.round((cxc.totalAmount - newPaid) * 100) / 100)
    const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'
    ops.push(
      prisma.cxCPayment.create({ data: { cxcId, amount, date: paymentDate, method: methodLabel, notes: notes || null } }),
      prisma.cuentaPorCobrar.update({
        where: { id: cxcId },
        data:  { amountPaid: newPaid, balance: newBalance, status: status as 'PAID' | 'PARTIAL' },
      }),
    )
  }

  for (const line of activeLines) {
    const currency = line.method.toUpperCase().includes('USDT') ? 'USDT' : 'EFECTIVO'
    ops.push(
      prisma.cashEntry.create({
        data: {
          type:     'INGRESO',
          currency: currency as 'EFECTIVO' | 'USDT',
          amount:   line.amount,
          concept:  `Cobro ${clientName} — abono global`,
          source:   clientName,
          notes:    notes || null,
          date:     paymentDate,
        },
      }),
    )
  }

  await prisma.$transaction(ops)
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/caja')
  return {}
}
