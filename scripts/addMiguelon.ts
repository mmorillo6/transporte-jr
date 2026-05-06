import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const loan = await prisma.loan.create({
    data: {
      driverName:   'MIGUEL GONZALEZ',
      amount:       550,
      balance:      450,
      deductType:   'QUINCENAL',
      deductAmount: 0,
      date:         new Date('2026-05-05'),
      notes:        'Monto original $550 — pagó $100 — saldo $450. Descuento varía cada quincena.',
    },
  })

  console.log('Préstamo creado:', loan.id)
  console.log(`  ${loan.driverName} | monto: $${loan.amount} | balance: $${loan.balance}`)
  console.log('  El encargado puede editar el monto de descuento desde Préstamos → ✏️ editar')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
