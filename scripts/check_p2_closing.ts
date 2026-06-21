import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'

  const [period, tripsTotal, tripsNoTicket, payroll, gastosComunes, mecanicoExpenses, gastosGenerales, abonosAurumin, negativos, pendingMechanicCharges, loans, almacenItems] = await Promise.all([
    prisma.period.findUnique({ where: { id: P2_ID }, select: { status: true, startDate: true, endDate: true } }),
    prisma.trip.count({ where: { periodId: P2_ID } }),
    prisma.trip.count({ where: { periodId: P2_ID, ticketNo: null } }),
    prisma.payrollEntry.findMany({
      where: { periodId: P2_ID },
      select: { netAmount: true, paidAt: true, abono: true, saldoInicial: true, truck: { select: { plate: true, owner: { select: { name: true } } } } }
    }),
    prisma.expense.count({ where: { periodId: P2_ID, truckId: { not: null } } }),
    prisma.expense.count({ where: { periodId: P2_ID, category: 'MECANICA' } }),
    prisma.expense.count({ where: { periodId: P2_ID, truckId: null } }),
    prisma.payrollEntry.aggregate({ where: { periodId: P2_ID }, _sum: { abono: true } }),
    prisma.payrollEntry.findMany({
      where: { periodId: P2_ID, netAmount: { lt: 0 } },
      select: { netAmount: true, truck: { select: { plate: true, owner: { select: { name: true } } } } }
    }),
    prisma.pendingMechanicCharge.count({ where: { targetPeriodId: P2_ID, appliedAt: null } }),
    prisma.loan.findMany({ where: { balance: { gt: 0 } }, select: { driverName: true, balance: true } }),
    prisma.almacenItem.findMany({ where: { usedByTruckId: null }, select: { name: true, amount: true } }),
  ])

  const unpaid = payroll.filter(e => !e.paidAt && e.netAmount > 0)
  const totalAbono = abonosAurumin._sum.abono ?? 0
  const almacenTotal = almacenItems.reduce((s, i) => s + i.amount, 0)

  console.log(`P2: ${new Date(period!.startDate).toISOString().slice(0,10)} → ${new Date(period!.endDate).toISOString().slice(0,10)} [${period!.status}]\n`)

  const ok  = (label: string, detail = '') => console.log(`  ✓  ${label}${detail ? `  (${detail})` : ''}`)
  const bad = (label: string, detail = '') => console.log(`  ✗  ${label}${detail ? `  → ${detail}` : ''}`)
  const inf = (label: string, detail = '') => console.log(`  ℹ  ${label}${detail ? `  → ${detail}` : ''}`)

  tripsTotal > 0       ? ok('Romana importada', `${tripsTotal} viajes`) : bad('Romana NO importada')
  tripsNoTicket === 0  ? ok('Todos los viajes con ticket') : bad('Viajes sin ticket', `${tripsNoTicket} faltan`)
  payroll.length > 0   ? ok('Relación generada', `${payroll.length} camiones`) : bad('Relación NO generada')
  gastosComunes > 0    ? ok('Gastos por camión', `${gastosComunes} registros`) : bad('Sin gastos operativos por camión')
  mecanicoExpenses > 0 ? ok('Gastos mecánicos', `${mecanicoExpenses} registros`) : bad('Sin gastos de mecánicos')
  gastosGenerales > 0  ? ok('Gastos generales', `${gastosGenerales} registros`) : inf('Sin gastos generales (puede estar ok)')
  totalAbono > 0       ? ok('Cobros Aurumin', `$${totalAbono.toFixed(2)} abonado`) : bad('Sin cobros Aurumin registrados')
  pendingMechanicCharges === 0 ? ok('Sin cargos mecánica pendientes') : bad('Cargos mecánica sin aplicar', `${pendingMechanicCharges}`)

  console.log('')
  if (negativos.length > 0) {
    console.log(`  ⚠  Camiones en negativo (${negativos.length}):`)
    for (const e of negativos) console.log(`       ${e.truck.plate.padEnd(10)} ${(e.truck.owner?.name ?? '').padEnd(22)} $${e.netAmount.toFixed(2)}`)
  }
  if (unpaid.length > 0) {
    console.log(`  ⚠  Dueños con net > 0 sin marcar pagados (${unpaid.length}):`)
    for (const e of unpaid) console.log(`       ${e.truck.plate.padEnd(10)} ${(e.truck.owner?.name ?? '').padEnd(22)} net=$${e.netAmount.toFixed(2)}`)
  } else {
    ok('Pagos — todos marcados o en negativo')
  }
  if (loans.length > 0) {
    inf(`Préstamos activos (${loans.length}):`)
    for (const l of loans) console.log(`       ${l.driverName.padEnd(25)} saldo=$${l.balance}`)
  }
  if (almacenTotal > 0) inf(`Almacén pendiente: $${almacenTotal.toFixed(2)} (${almacenItems.length} ítems)`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
