import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: { truckId: true, commissionFee: true, truck: { select: { plate: true } } }
  })

  console.log('plate      commFee(DB)  gastos(DB)  diff')
  for (const e of entries) {
    const gastos = await prisma.expense.aggregate({
      where: { truckId: e.truckId, periodId: P2_ID, category: { notIn: ['NOMINA','ADMINISTRATIVO','NPR','MECANICA'] } },
      _sum: { amount: true }
    })
    const total = gastos._sum.amount ?? 0
    const diff = Math.round((e.commissionFee - total) * 100) / 100
    const flag = diff !== 0 ? ' ← DIFF' : ''
    console.log(`${e.truck.plate.padEnd(10)} ${String(e.commissionFee).padStart(10)}  ${String(total).padStart(10)}  ${diff}${flag}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
