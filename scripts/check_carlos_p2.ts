import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const truck = await prisma.truck.findFirst({ where: { plate: 'A31AA2L' }, select: { id: true } })
  if (!truck) return

  const entry = await prisma.payrollEntry.findFirst({
    where: { truckId: truck.id, periodId: P2_ID },
    select: { id: true, grossAmount: true, commissionFee: true, driverWage: true, mechanicFee: true, adminFee: true, nprFee: true, deductions: true, saldoInicial: true, abono: true, netAmount: true }
  })
  console.log('PayrollEntry A31AA2L:', JSON.stringify(entry, null, 2))

  // Expenses for this truck in P2
  const expenses = await prisma.expense.findMany({
    where: { truckId: truck.id, periodId: P2_ID, category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] } },
    select: { description: true, category: true, amount: true, date: true }
  })
  console.log('\nExpenses (excl. NOMINA/ADMIN/NPR/MECANICA):')
  let total = 0
  for (const e of expenses) {
    console.log(`  ${e.date.toISOString().slice(0,10)} ${e.category.padEnd(12)} ${e.description.padEnd(30)} $${e.amount}`)
    total += e.amount
  }
  console.log(`  TOTAL: $${total}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
