import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  // NUEVO CALLAO is PER_TRIP — trips before 2026-03-16 should be $7 (old rate)
  // All 68 NUEVO CALLAO trips are from Feb 2026, none from ≥ 2026-03-16
  const result = await prisma.trip.updateMany({
    where: {
      route: { name: 'NUEVO CALLAO' },
      date: { lt: new Date('2026-03-16') },
    },
    data: { amount: 7 },
  })
  console.log(`Revertidos ${result.count} viajes NUEVO CALLAO a $7`)
  await prisma.$disconnect()
}
main()
