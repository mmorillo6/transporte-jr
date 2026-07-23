import { prisma } from '@/lib/prisma'

// Umbrales — ajustables aquí si cambian las necesidades del negocio
const SOCIO_LOAN_THRESHOLD_DAYS = 30
const CASH_LOW_THRESHOLD = { EFECTIVO: 500, USDT: 500 }
// Nota: las deudas de caucho se arrastran normalmente durante meses como
// práctica habitual del negocio, así que deliberadamente NO generan alerta aquí.

const MAINTENANCE_LABEL: Record<string, string> = {
  OIL_CHANGE: 'Cambio de aceite',
  AIR_FILTER: 'Filtro de aire',
  GREASE: 'Engrase',
  REPAIR: 'Reparación',
  INSPECTION: 'Inspección',
  OTHER: 'Otro',
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Cadencia: dispara apenas se cruza el umbral y luego cada 3 días mientras siga pendiente
function dueForAlert(daysIntoWindow: number) {
  return daysIntoWindow >= 0 && daysIntoWindow % 3 === 0
}

/**
 * Revisa CxC vencidas, mantenimiento, préstamos de socios y saldo de caja.
 * Devuelve un mensaje formal ya formateado, o null si no hay nada que reportar hoy.
 */
export async function buildOperationalAlertsMessage(todayMid: Date, veDay: number): Promise<string | null> {
  const sections: string[] = []

  // 1. Cuentas por cobrar vencidas
  const overdueCxc = await prisma.cuentaPorCobrar.findMany({
    where: { status: { not: 'PAID' }, dueDate: { lt: todayMid } },
    select: { clientName: true, balance: true, dueDate: true },
  })
  const cxcLines: string[] = []
  for (const c of overdueCxc) {
    const dias = Math.floor((todayMid.getTime() - new Date(c.dueDate!).getTime()) / 86400000)
    if (dueForAlert(dias)) {
      cxcLines.push(`• ${c.clientName}: $${c.balance.toFixed(2)} — vencida hace ${plural(dias, 'día')}`)
    }
  }
  if (cxcLines.length) sections.push(`🔴 *Cuentas por cobrar vencidas:*\n${cxcLines.join('\n')}`)

  // 2. Mantenimiento próximo a vencer o vencido
  const maintenance = await prisma.maintenanceAlert.findMany({
    where: { status: 'PENDING' },
    include: { truck: { select: { plate: true } } },
  })
  const maintLines: string[] = []
  for (const m of maintenance) {
    const diasParaVencer = Math.floor((new Date(m.dueDate).getTime() - todayMid.getTime()) / 86400000)
    const daysIntoWindow = 3 - diasParaVencer // entra a ventana de aviso 3 días antes de vencer
    if (dueForAlert(daysIntoWindow)) {
      const label = MAINTENANCE_LABEL[m.type] ?? m.type
      const estado = diasParaVencer < 0
        ? `vencida hace ${plural(Math.abs(diasParaVencer), 'día')}`
        : diasParaVencer === 0 ? 'vence hoy' : `vence en ${plural(diasParaVencer, 'día')}`
      maintLines.push(`• ${m.truck.plate} — ${label} (${estado})`)
    }
  }
  if (maintLines.length) sections.push(`🔧 *Mantenimiento pendiente:*\n${maintLines.join('\n')}`)

  // 3. Préstamos de socios pendientes por más de 30 días
  const socioLoans = await prisma.socioLoan.findMany({
    where: { status: 'PENDIENTE' },
    select: { creditor: true, amount: true, currency: true, date: true },
  })
  const loanLines: string[] = []
  for (const l of socioLoans) {
    const dias = Math.floor((todayMid.getTime() - new Date(l.date).getTime()) / 86400000)
    if (dueForAlert(dias - SOCIO_LOAN_THRESHOLD_DAYS)) {
      loanLines.push(`• ${l.creditor}: $${l.amount.toFixed(2)} ${l.currency} — pendiente desde hace ${plural(dias, 'día')}`)
    }
  }
  if (loanLines.length) sections.push(`💰 *Préstamos de socios pendientes:*\n${loanLines.join('\n')}`)

  // 4. Caja con saldo bajo (incluye negativo) — se revisa cada 3 días para no ser repetitivo
  if (veDay % 3 === 0) {
    const sums = await prisma.cashEntry.groupBy({ by: ['type', 'currency'], _sum: { amount: true } })
    let balEfectivo = 0, balUsdt = 0
    for (const s of sums) {
      const sign = s.type === 'INGRESO' ? 1 : -1
      const amt = sign * (s._sum.amount ?? 0)
      if (s.currency === 'EFECTIVO') balEfectivo += amt
      else balUsdt += amt
    }
    const cajaLines: string[] = []
    if (balEfectivo < CASH_LOW_THRESHOLD.EFECTIVO) cajaLines.push(`• Efectivo: $${balEfectivo.toFixed(2)}`)
    if (balUsdt < CASH_LOW_THRESHOLD.USDT) cajaLines.push(`• USDT: $${balUsdt.toFixed(2)}`)
    if (cajaLines.length) sections.push(`💵 *Caja con saldo bajo:*\n${cajaLines.join('\n')}`)
  }

  if (!sections.length) return null

  return `📋 *Transporte JR*\nEstimado(a), se comparte un resumen de pendientes que requieren atención:\n\n${sections.join('\n\n')}\n\nAgradecemos su atención y quedamos atentos.`
}
