import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const existing = await prisma.loan.findFirst({
    where: { driverName: 'Mary Morillo', balance: { gt: 0 } }
  })

  if (existing) {
    console.log('Ya existe:', JSON.stringify(existing))
  } else {
    const loan = await prisma.loan.create({
      data: {
        driverName:   'Mary Morillo',
        amount:       200,
        balance:      200,
        deductAmount: 0,
        date:         new Date('2026-05-01'),
        notes:        'Préstamo Fernando - repuestos motor - descontar de pago Luis Peña',
      }
    })
    console.log('Creado:', JSON.stringify(loan))
  }

  await pool.end()
}
main().catch(console.error)
