import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const loans = await prisma.loan.findMany({ orderBy: { createdAt: 'desc' } })
  console.log('Préstamos actuales:')
  loans.forEach(l => console.log(
    ` ${l.driverName.padEnd(25)} | monto: $${l.amount} | balance: $${l.balance} | deducción: $${l.deductAmount}/${l.deductType}`
  ))

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
