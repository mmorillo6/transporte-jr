import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const loan = await prisma.loan.findFirst({
    where: { driverName: 'Mary Morillo', balance: { gt: 0 } }
  })

  if (!loan) { console.log('No hay préstamo pendiente'); await pool.end(); return }

  const updated = await prisma.loan.update({
    where: { id: loan.id },
    data: { balance: 0 }
  })
  console.log('Préstamo saldado:', JSON.stringify(updated))
  await pool.end()
}
main().catch(console.error)
