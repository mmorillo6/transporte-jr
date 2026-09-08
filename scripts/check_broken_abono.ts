import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  const plates = ['A02BK4F', '43HLAC', '72HLAC']
  for (const plate of plates) {
    const truck = await prisma.truck.findFirst({ where: { plate }, include: { owner: true } })
    if (!truck) { console.log(plate, 'NOT FOUND'); continue }
    const entries = await prisma.payrollEntry.findMany({
      where: { truckId: truck.id },
      include: { period: true, abonos: true },
      orderBy: { period: { startDate: 'desc' } },
      take: 3,
    })
    console.log(`\n=== ${plate} (${truck.owner?.name}) ===`)
    for (const e of entries) {
      console.log(`  período ${e.period.startDate.toISOString().slice(0,10)}–${e.period.endDate.toISOString().slice(0,10)} [${e.period.status}]`)
      console.log(`    abono total=${e.abono} netAmount=${e.netAmount} paidAt=${e.paidAt} abonos-rows=${e.abonos.length}`)
    }
  }
  await prisma.$disconnect()
}
main()
