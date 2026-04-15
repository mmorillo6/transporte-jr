import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const trips = await prisma.trip.findMany({
    where: { 
      route: { name: 'LA FE' }, 
      date: { gte: new Date('2025-03-16') } 
    },
    select: { date: true, netWeightKg: true, amount: true },
    take: 5,
    orderBy: { date: 'asc' }
  })
  trips.forEach(t => {
    const at14 = ((t.netWeightKg ?? 0) / 1000) * 14
    const at12 = ((t.netWeightKg ?? 0) / 1000) * 12
    console.log(`${new Date(t.date).toLocaleDateString('es-VE')} | kg=${t.netWeightKg} | stored=${t.amount.toFixed(2)} | @$14=${at14.toFixed(2)} | @$12=${at12.toFixed(2)}`)
  })
  await prisma.$disconnect()
}
main()
