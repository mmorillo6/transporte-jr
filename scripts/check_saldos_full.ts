import { prisma } from '../src/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      id: true, saldoInicial: true, netAmount: true, grossAmount: true,
      commissionFee: true, driverWage: true, nprFee: true, mechanicFee: true, adminFee: true, deductions: true, abono: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { plate: 'asc' } }
  })
  console.log(`\nP2 — ${entries.length} entries\n`)
  for (const e of entries) {
    const expected = {
      '43HLAC': 0, '72HLAC': 0, '731XJP': 0,
      'A02BK4F': 0, 'A11AG8U': 0.98, 'A17BZ9K': 38.68,
      'A18AZ6C': -2292.60, 'A31AA2L': 148.78, 'A31CX2A': 0.61,
      'A36AA2T': 30.77, 'A42AD7G': 44.67, 'A55BH6D': 19715,
      'A58DR3A': 63.40, 'A70AI7C': 48.88,
    } as Record<string,number>
    const plate = e.truck?.plate ?? ''
    const exp = expected[plate]
    const ok = exp !== undefined && Math.abs(e.saldoInicial - exp) < 0.01 ? '✓' : '✗ WRONG'
    console.log(`${ok} ${plate.padEnd(10)} ${(e.truck?.owner?.name ?? '').padEnd(22)} saldoInicial=${String(e.saldoInicial).padStart(10)}  expected=${String(exp ?? '?').padStart(10)}  netAmount=${String(e.netAmount).padStart(10)}  id=${e.id}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
