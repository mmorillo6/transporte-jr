import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const updated = await prisma.route.updateMany({
    where: { clientName: 'AURIM' },
    data:  { clientName: 'AURUMIN' },
  })
  console.log('Rutas corregidas:', updated.count)

  const all = await prisma.route.findMany({ select: { name: true, clientName: true } })
  console.log('\nEstado actual de rutas:')
  all.forEach(r => console.log(` ${r.clientName.padEnd(25)} | ${r.name}`))

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
