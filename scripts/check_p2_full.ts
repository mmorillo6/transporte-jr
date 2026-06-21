import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      id: true,
      netAmount: true,
      saldoInicial: true,
      truck: {
        select: {
          plate: true,
          owner: { select: { name: true, type: true } }
        }
      }
    },
    orderBy: { truck: { owner: { name: 'asc' } } }
  })
  for (const e of entries) {
    console.log(`${e.truck.plate.padEnd(10)} ${(e.truck.owner?.name ?? '?').padEnd(25)} net=${String(e.netAmount).padStart(10)} saldo=${String(e.saldoInicial).padStart(10)}  id=${e.id}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
