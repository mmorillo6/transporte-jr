import { prisma } from '../src/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      id: true,
      saldoInicial: true,
      netAmount: true,
      grossAmount: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { plate: 'asc' } }
  })
  console.log(`\nP2 — ${entries.length} entries\n`)
  for (const e of entries) {
    console.log(`${e.truck?.plate?.padEnd(10)} ${(e.truck?.owner?.name ?? '').padEnd(18)} saldoInicial=${String(e.saldoInicial).padStart(10)}  netAmount=${String(e.netAmount).padStart(10)}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
