import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  // Get current defaults
  const config = await prisma.systemConfig.findUnique({ where: { key: 'gastosComunes_defaults' } })
  const current = config ? JSON.parse(config.value) : []
  console.log('Actuales:', JSON.stringify(current))

  // Update NOMINA MECANICOS to $175 ($1,050 / 6 carros activos esta quincena)
  const updated = [
    { description: 'NOMINA MECANICOS', amount: 175 },
    { description: 'STARLINK',          amount: 10.91 },
    { description: 'GASTOS COMUNES',    amount: 3.80 },
  ]

  await prisma.systemConfig.upsert({
    where:  { key: 'gastosComunes_defaults' },
    create: { key: 'gastosComunes_defaults', label: 'Gastos comunes - valores predeterminados', value: JSON.stringify(updated) },
    update: { value: JSON.stringify(updated) },
  })
  console.log('✅ Default NOMINA MECANICOS actualizado a $175/carro')

  // Get all users with owner info
  const users = await prisma.user.findMany({
    where: { active: true },
    include: { owner: { select: { name: true, nprPercent: true, type: true } } },
    orderBy: { name: 'asc' },
  })

  console.log('\n=== CUENTAS ===')
  for (const u of users) {
    const npm = u.owner ? `${u.owner.nprPercent}% NPR` : 'N/A'
    const tipo = u.owner ? u.owner.type : u.role
    console.log(`${u.name} | ${u.email} | ${u.role} | ${npm} | owner:${u.owner?.name ?? '—'}`)
  }

  await pool.end()
}
main().catch(console.error)
