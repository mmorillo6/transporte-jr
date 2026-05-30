import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const mauroOwner = await prisma.owner.findFirst({ where: { name: 'Mauro' } })
  console.log('Owner Mauro:', mauroOwner?.id, mauroOwner?.type, mauroOwner?.nprPercent)

  const mauroUser = await prisma.user.findFirst({
    where: { email: 'mauro@transportejr.com' },
    include: { owner: true }
  })
  console.log('User Mauro:', mauroUser?.name, '| ownerId:', mauroUser?.ownerId, '| owner:', mauroUser?.owner?.name)

  if (mauroUser && !mauroUser.ownerId && mauroOwner) {
    // Link to owner and set correct password
    const hash = await bcrypt.hash('Transporte2026', 12)
    await prisma.user.update({
      where: { id: mauroUser.id },
      data: { ownerId: mauroOwner.id, password: hash, role: 'AFILIADO', active: true }
    })
    console.log('✅ Mauro vinculado a owner y contraseña actualizada')
  } else if (!mauroUser && mauroOwner) {
    const hash = await bcrypt.hash('Transporte2026', 12)
    const created = await prisma.user.create({
      data: {
        name: 'Mauro', email: 'mauro@transportejr.com', phone: '04123259643',
        password: hash, role: 'AFILIADO', active: true, ownerId: mauroOwner.id,
      }
    })
    console.log('✅ Creado Mauro:', created.email)
  } else {
    console.log('Estado actual OK o ya vinculado')
  }

  await pool.end()
}
main().catch(console.error)
