import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const owners = await prisma.owner.findMany({
    include: {
      users: { select: { id: true, name: true, email: true, phone: true, role: true, active: true } },
      trucks: { where: { active: true }, select: { plate: true } },
    },
    orderBy: { name: 'asc' },
  })

  for (const o of owners) {
    const trucks = o.trucks.map((t: any) => t.plate).join(', ')
    console.log(`\n${o.name} (${o.type}) [${trucks || 'sin camiones activos'}]`)
    if (o.users.length === 0) {
      console.log('  SIN CUENTA')
    } else {
      for (const u of o.users as any[]) {
        console.log(`  CUENTA: ${u.name} | ${u.email || u.phone} | ${u.role} | activo:${u.active}`)
      }
    }
  }

  await pool.end()
}
main().catch(console.error)
