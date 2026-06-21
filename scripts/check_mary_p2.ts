import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  
  const truck = await prisma.truck.findFirst({
    where: { plate: 'A31CX2A' },
    select: { id: true, plate: true }
  })
  if (!truck) { console.log('Truck A31CX2A not found'); return }
  
  const trips = await prisma.trip.findMany({
    where: { truckId: truck.id, periodId: P2_ID },
    select: { id: true, date: true, amount: true }
  })
  console.log(`A31CX2A trips in P2: ${trips.length}`)
  trips.forEach(t => console.log(`  ${t.date.toISOString().slice(0,10)} $${t.amount}`))
  
  const entry = await prisma.payrollEntry.findFirst({
    where: { truckId: truck.id, periodId: P2_ID }
  })
  console.log(`\nA31CX2A payroll entry in P2: ${entry ? JSON.stringify({id:entry.id, net:entry.netAmount, saldo:entry.saldoInicial}) : 'NONE'}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
