import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const PASSWORD = 'Transporte2026'
  const hash = await bcrypt.hash(PASSWORD, 12)

  // Buscar owners por nombre
  const owners = await prisma.owner.findMany({ orderBy: { name: 'asc' } })
  const byName = (name: string) => owners.find(o => o.name === name)

  const toCreate = [
    { name: 'Carlos Rodríguez', email: 'carlos@transportejr.com',    phone: '04149405557', owner: 'Carlos Rodríguez'    },
    { name: 'Gregorio de Freitas', email: 'gregorio@transportejr.com', phone: '04241469445', owner: 'Gregorio de Freitas'  },
    { name: 'Joaquín',           email: 'joaquin@transportejr.com',  phone: '04249066028', owner: 'Joaquín'              },
    { name: 'Luis Rivas',        email: 'luis@transportejr.com',     phone: '04241597611', owner: 'Luis Alejandro Rivas'  },
    { name: 'Mauro',             email: 'mauro@transportejr.com',    phone: '04123259643', owner: 'Mauro'                 },
  ]

  for (const u of toCreate) {
    const owner = byName(u.owner)
    if (!owner) { console.log(`❌ Owner no encontrado: ${u.owner}`); continue }

    const existing = await prisma.user.findFirst({ where: { email: u.email } })
    if (existing) { console.log(`⚠️  Ya existe: ${u.email}`); continue }

    const created = await prisma.user.create({
      data: {
        name:     u.name,
        email:    u.email,
        phone:    u.phone,
        password: hash,
        role:     'AFILIADO',
        active:   true,
        ownerId:  owner.id,
      }
    })
    console.log(`✅ Creado: ${created.name} | ${created.email} | owner: ${owner.name}`)
  }

  // Verificar que Mauro sea PROPIO con 5%
  const mauro = byName('Mauro')
  if (mauro) {
    if (mauro.type !== 'PROPIO' || mauro.nprPercent !== 5) {
      await prisma.owner.update({ where: { id: mauro.id }, data: { type: 'PROPIO', nprPercent: 5 } })
      console.log(`🔧 Mauro actualizado → PROPIO, 5% NPR`)
    } else {
      console.log(`✓ Mauro ya es PROPIO con 5% NPR`)
    }
  }

  await pool.end()
}
main().catch(console.error)
