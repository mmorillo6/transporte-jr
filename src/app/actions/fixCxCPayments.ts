'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

/**
 * Registra los pagos de Aurumin que estaban en el Excel (CONTROL DE PAGO)
 * y no fueron cargados al implementar la funcionalidad de CxC.
 *
 * Del Excel:
 *  - 01-15 Abr: Aurumin pagó $25,000 (cubre acumulado 2025 + billing 01-15 Abr)
 *  - 16-30 Abr: Aurumin pagó $20,000
 *
 * Este action aplica los pagos faltantes para que la deuda total refleje
 * $18,065.94 (el saldo real según el CONTROL DE PAGO de Fernando).
 */
export async function fixAuruminCxCPayments() {
  const session = await getSession()
  if (!session || session.role !== 'DUENO') return { error: 'Solo el dueño puede ejecutar esto' }

  // Obtener todos los CxC de Aurumin ordenados por fecha
  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    include: { payments: true },
    orderBy: { date: 'asc' },
  })

  const results: string[] = []

  // 1) Buscar el CxC de 16-30 Abr y registrar el pago de $20,000 si no está
  const cxc1630 = cxcs.find(c => c.periodLabel?.includes('16') && c.periodLabel?.includes('04') && c.totalAmount > 19000)
  if (cxc1630) {
    const paymentAlreadyDone = cxc1630.amountPaid >= 20000
    if (!paymentAlreadyDone) {
      const abono = Math.min(20000, cxc1630.balance)
      const newPaid    = cxc1630.amountPaid + abono
      const newBalance = Math.max(0, cxc1630.totalAmount - newPaid)
      const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'
      await prisma.$transaction([
        prisma.cxCPayment.create({
          data: {
            cxcId:  cxc1630.id,
            amount: abono,
            date:   new Date('2026-04-30'),
            method: 'Transferencia',
            notes:  'Pago Aurumin 16-30 Abr — cargado desde Excel CONTROL DE PAGO',
          },
        }),
        prisma.cuentaPorCobrar.update({
          where: { id: cxc1630.id },
          data: { amountPaid: newPaid, balance: newBalance, status: status as any },
        }),
      ])
      results.push(`CxC 16-30 Abr: registrado abono $${abono}`)
    } else {
      results.push('CxC 16-30 Abr: pago ya registrado')
    }
  } else {
    results.push('CxC 16-30 Abr: no encontrado')
  }

  // 2) Calcular balance total actual vs objetivo ($18,065.94)
  const cxcsUpdated = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN', status: { not: 'PAID' } },
  })
  const totalPendiente = cxcsUpdated.reduce((s, c) => s + c.balance, 0)
  const TARGET = 18065.94
  const diff = totalPendiente - TARGET

  if (diff > 0.1) {
    // Hay más deuda registrada que la real — aplicar el saldo restante al CxC más antiguo pendiente
    const oldest = cxcsUpdated[0]
    if (oldest) {
      const abono = Math.min(diff, oldest.balance)
      const newPaid    = oldest.amountPaid + abono
      const newBalance = Math.max(0, oldest.totalAmount - newPaid)
      const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'
      await prisma.$transaction([
        prisma.cxCPayment.create({
          data: {
            cxcId:  oldest.id,
            amount: abono,
            date:   new Date('2026-04-15'),
            method: 'Transferencia',
            notes:  'Ajuste pago Aurumin 01-15 Abr — cargado desde Excel CONTROL DE PAGO',
          },
        }),
        prisma.cuentaPorCobrar.update({
          where: { id: oldest.id },
          data: { amountPaid: newPaid, balance: newBalance, status: status as any },
        }),
      ])
      results.push(`CxC ajuste: registrado $${abono.toFixed(2)} contra ${oldest.periodLabel ?? oldest.concept}`)
    }
  }

  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/reportes/deuda')
  revalidatePath('/caja')
  return { ok: true, results }
}
