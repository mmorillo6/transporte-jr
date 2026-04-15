'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createCashEntry(fd: FormData) {
  const type = fd.get('type') as string
  const currency = fd.get('currency') as string
  const amount = parseFloat(fd.get('amount') as string)
  const concept = (fd.get('concept') as string).trim()
  const source = (fd.get('source') as string | null)?.trim() || null
  const notes = (fd.get('notes') as string | null)?.trim() || null
  const dateStr = fd.get('date') as string

  if (!concept || isNaN(amount) || amount <= 0) return { error: 'Concepto y monto requeridos' }
  if (!['INGRESO', 'EGRESO'].includes(type)) return { error: 'Tipo inválido' }
  if (!['EFECTIVO', 'USDT'].includes(currency)) return { error: 'Moneda inválida' }

  await prisma.cashEntry.create({
    data: {
      type: type as any,
      currency: currency as any,
      amount,
      concept,
      source,
      notes,
      date: dateStr ? new Date(dateStr) : new Date(),
    },
  })

  revalidatePath('/caja')
  return { ok: true }
}

export async function deleteCashEntry(id: string) {
  await prisma.cashEntry.delete({ where: { id } })
  revalidatePath('/caja')
  return { ok: true }
}

export async function getCashBalances() {
  const entries = await prisma.cashEntry.findMany()
  let efectivo = 0
  let usdt = 0
  for (const e of entries) {
    const sign = e.type === 'INGRESO' ? 1 : -1
    if (e.currency === 'EFECTIVO') efectivo += sign * e.amount
    else usdt += sign * e.amount
  }
  return { efectivo, usdt }
}
