'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

/**
 * Registra los pagos de Aurumin que estaban en el Excel (CONTROL DE PAGO)
 * y no fueron cargados al implementar la funcionalidad de CxC.
 *
 * Estado actual en DB:
 *  - CxC Histórico 2025: $24,033.85 con $20,000 pagado → saldo $4,033.85
 *  - CxC 01-15 Abr: NO EXISTE (período cerrado antes de auto-CxC)
 *  - CxC 16-30 Abr: $20,043.46 con $0 pagado → saldo $20,043.46
 *  - Total visible: $24,077.31
 *
 * Del Excel CONTROL DE PAGO:
 *  - 01-15 Abr: Aurumin pagó $25,000 (cubre histórico $24,033.85 + $966.15 del 01-15 Abr)
 *  - 16-30 Abr: Aurumin pagó $20,000
 *
 * Estado objetivo:
 *  - Histórico: $0 (saldado)
 *  - 01-15 Abr: $18,022.48 (creado y pagado parcialmente)
 *  - 16-30 Abr: $43.46
 *  - Total: $18,065.94
 */
export async function fixAuruminCxCPayments() {
  const session = await getSession()
  if (!session || session.role !== 'DUENO') return { error: 'Solo el dueño puede ejecutar esto' }

  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    include: { payments: true },
    orderBy: { date: 'asc' },
  })

  const results: string[] = []

  // ── 1. Encontrar CxC histórico (el que tiene el mayor totalAmount sin periodLabel de Abr) ──
  const historical = cxcs.find(c =>
    c.totalAmount >= 20000 && c.totalAmount <= 25000 &&
    (!c.periodLabel || !c.periodLabel.includes('04'))
  )

  if (historical && historical.balance > 0) {
    const payment = historical.balance  // pagar el saldo restante ($4,033.85)
    await prisma.$transaction([
      prisma.cxCPayment.create({
        data: {
          cxcId:  historical.id,
          amount: payment,
          date:   new Date('2026-04-15'),
          method: 'Transferencia',
          notes:  'Saldo restante pago Aurumin — del $25,000 del Excel 01-15 Abr',
        },
      }),
      prisma.cuentaPorCobrar.update({
        where: { id: historical.id },
        data: { amountPaid: historical.totalAmount, balance: 0, status: 'PAID' },
      }),
    ])
    results.push(`Histórico 2025 saldado: -$${payment.toFixed(2)}`)
  } else {
    results.push('Histórico: ya estaba saldado o no encontrado')
  }

  // ── 2. Crear CxC 01-15 Abr si no existe ──
  const existing0115 = cxcs.find(c =>
    c.periodLabel?.includes('01/04') || c.periodLabel?.includes('15/04')
  )

  if (!existing0115) {
    // Buscar el período 01-15 Abr
    const period0115 = await prisma.period.findFirst({
      where: {
        startDate: { gte: new Date('2026-04-01'), lte: new Date('2026-04-02') },
        endDate:   { gte: new Date('2026-04-14'), lte: new Date('2026-04-16') },
      },
    })

    const BILLING_0115 = 18988.63
    const PAYMENT_0115 = 966.15  // = $25,000 - $24,033.85 (ya aplicado al histórico)
    const balance0115  = Math.round((BILLING_0115 - PAYMENT_0115) * 100) / 100  // 18,022.48

    const new0115 = await prisma.cuentaPorCobrar.create({
      data: {
        clientName:  'AURUMIN',
        concept:     'Facturación 01/04 al 15/04',
        periodLabel: '01/04 al 15/04',
        date:        period0115?.endDate ?? new Date('2026-04-15'),
        totalAmount: BILLING_0115,
        amountPaid:  PAYMENT_0115,
        balance:     balance0115,
        status:      'PARTIAL',
      },
    })
    await prisma.cxCPayment.create({
      data: {
        cxcId:  new0115.id,
        amount: PAYMENT_0115,
        date:   new Date('2026-04-15'),
        method: 'Transferencia',
        notes:  'Excedente del pago $25,000 de Aurumin — Excel CONTROL DE PAGO 01-15 Abr',
      },
    })
    results.push(`CxC 01-15 Abr creada: $${BILLING_0115} con abono $${PAYMENT_0115} → saldo $${balance0115}`)
  } else {
    results.push('CxC 01-15 Abr: ya existía')
  }

  // ── 3. Registrar $20,000 contra CxC 16-30 Abr ──
  const cxc1630 = cxcs.find(c =>
    c.totalAmount >= 19000 && c.totalAmount <= 21000 &&
    (c.periodLabel?.includes('16/04') || c.periodLabel?.includes('30/04'))
  )

  if (cxc1630 && cxc1630.amountPaid < 20000) {
    const abono   = Math.min(20000, cxc1630.balance)
    const newPaid    = cxc1630.amountPaid + abono
    const newBalance = Math.max(0, Math.round((cxc1630.totalAmount - newPaid) * 100) / 100)
    const status     = newBalance <= 0 ? 'PAID' : 'PARTIAL'

    await prisma.$transaction([
      prisma.cxCPayment.create({
        data: {
          cxcId:  cxc1630.id,
          amount: abono,
          date:   new Date('2026-04-30'),
          method: 'Transferencia',
          notes:  'Pago Aurumin — Excel CONTROL DE PAGO 16-30 Abr',
        },
      }),
      prisma.cuentaPorCobrar.update({
        where: { id: cxc1630.id },
        data: { amountPaid: newPaid, balance: newBalance, status: status as any },
      }),
    ])
    results.push(`CxC 16-30 Abr: abono $${abono} → saldo $${newBalance.toFixed(2)}`)
  } else if (cxc1630) {
    results.push('CxC 16-30 Abr: pago ya registrado')
  } else {
    results.push('CxC 16-30 Abr: no encontrada')
  }

  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/reportes/deuda')
  revalidatePath('/caja')
  revalidatePath('/dashboard')
  return { ok: true, results }
}
