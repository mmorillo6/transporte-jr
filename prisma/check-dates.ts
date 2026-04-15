import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  // Check date range for all NUEVO CALLAO trips
  const oldest = await prisma.trip.findFirst({
    where: { route: { name: 'NUEVO CALLAO' } },
    orderBy: { date: 'asc' },
    select: { date: true, amount: true }
  })
  const newest = await prisma.trip.findFirst({
    where: { route: { name: 'NUEVO CALLAO' } },
    orderBy: { date: 'desc' },
    select: { date: true, amount: true }
  })
  console.log('Oldest NUEVO CALLAO:', oldest?.date, 'amount:', oldest?.amount)
  console.log('Newest NUEVO CALLAO:', newest?.date, 'amount:', newest?.amount)
  
  // Count before and after march 16 2026
  const before = await prisma.trip.count({
    where: { route: { name: 'NUEVO CALLAO' }, date: { lt: new Date('2026-03-16') } }
  })
  const after = await prisma.trip.count({
    where: { route: { name: 'NUEVO CALLAO' }, date: { gte: new Date('2026-03-16') } }
  })
  console.log(`\nNUEVO CALLAO antes de 16/03/2026: ${before} viajes`)
  console.log(`NUEVO CALLAO desde 16/03/2026: ${after} viajes`)
  
  await prisma.$disconnect()
}
main()
