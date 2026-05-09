import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  // Check if already exists
  const existingUser = await prisma.user.findUnique({ where: { email: 'morillocmary@gmail.com' } })
  if (existingUser) {
    console.log('Usuario ya existe:', existingUser.id, existingUser.name)
    const truck = await prisma.truck.findFirst({ where: { plate: 'DM688SX' } })
    console.log('Camión DM688SX:', truck ? `ownerId=${truck.ownerId}` : 'NO EXISTE')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // Create Owner record for Mary
  const owner = await prisma.owner.create({
    data: {
      id:             'owner-mary',
      name:           'Mary Morillo',
      type:           'AFILIADO',
      commissionRate: 0,
      nprPercent:     0,
      isNPROwner:     false,
    },
  })
  console.log('Owner creado:', owner.id, owner.name)

  // Create User
  const hashed = await bcrypt.hash('mary2026', 10)
  const user = await prisma.user.create({
    data: {
      name:     'MARY MORILLO',
      email:    'morillocmary@gmail.com',
      password: hashed,
      role:     'AFILIADO',
      ownerId:  'owner-mary',
    },
  })
  console.log('Usuario creado:', user.id, user.name, user.role)

  // Create Truck DM688SX — effective from 2026-05-01
  const truck = await prisma.truck.create({
    data: {
      plate:     'DM688SX',
      ownerId:   'owner-mary',
      active:    true,
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
  })
  console.log('Camión creado:', truck.plate, '→ owner:', truck.ownerId)

  console.log('\n✅ Credenciales AFILIADO — Mary Morillo')
  console.log('  Email:    morillocmary@gmail.com')
  console.log('  Password: mary2026')
  console.log('  Camión:   DM688SX')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
