import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
const pool = new Pool({ connectionString: DIRECT })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)
const PERIOD_ID = 'cmqn41pg2003804kwj7yqtgni'

async function setOverride(plate: string, wage: number) {
  const entry = await prisma.payrollEntry.findFirst({
    where: { periodId: PERIOD_ID, truck: { plate } },
    include: { truck: { include: { owner: true } } }
  })
  if (!entry) { console.log(`No encontrado: ${plate}`); return }
  const isAfiliado = entry.truck.owner.type === 'AFILIADO'
  const isNPROwner = entry.truck.owner.isNPROwner
  const net = Math.round((
    entry.grossAmount - entry.commissionFee - (isAfiliado ? 0 : wage)
    + (isNPROwner ? (entry.nprFee ?? 0) : -(entry.nprFee ?? 0))
    - (entry.mechanicFee ?? 0) - (entry.adminFee ?? 0) - entry.deductions
    + (entry.saldoInicial ?? 0) - (entry.abono ?? 0)
  ) * 100) / 100
  await prisma.payrollEntry.update({
    where: { id: entry.id },
    data: { driverWageOverride: wage, driverWage: wage, netAmount: net }
  })
  console.log(`${plate}: driverWageOverride=${wage}  net=${net.toFixed(2)}`)
}

async function main() {
  // José — overrides previos
  await setOverride('A55BH6D', 150)
  await setOverride('A02BK4F', 70)

  // Leo y Mauro — para igualar Excel Fernando
  await setOverride('731XJP', 150)
  await setOverride('A18AZ6C', 60)

  // Verificar totales
  const jose = await prisma.payrollEntry.findMany({
    where: { periodId: PERIOD_ID, truck: { owner: { name: { contains: 'José' } } } },
    select: { netAmount: true, truck: { select: { plate: true } }, driverWageOverride: true }
  })
  const total = jose.reduce((s, e) => s + e.netAmount, 0)
  console.log(`\nJosé total: $${total.toFixed(2)}  (target $19,903.88, diff $${(total-19903.88).toFixed(2)})`)
  for (const e of jose) console.log(`  ${e.truck.plate}: $${e.netAmount.toFixed(2)}${e.driverWageOverride !== null ? '  [override='+e.driverWageOverride+']' : ''}`)

  const leoMauro = await prisma.payrollEntry.findMany({
    where: { periodId: PERIOD_ID, truck: { plate: { in: ['731XJP', 'A18AZ6C', 'A97AV4H'] } } },
    select: { netAmount: true, truck: { select: { plate: true, owner: { select: { name: true } } } }, driverWageOverride: true }
  })
  const leoEntries = leoMauro.filter(e => e.truck.owner.name.includes('Leo'))
  const leoTotal = leoEntries.reduce((s, e) => s + e.netAmount, 0)
  const mauroEntry = leoMauro.find(e => e.truck.plate === 'A18AZ6C')
  console.log(`\nLeo total: $${leoTotal.toFixed(2)}  (Fernando: -$1,586.39)`)
  for (const e of leoEntries) console.log(`  ${e.truck.plate}: $${e.netAmount.toFixed(2)}${e.driverWageOverride !== null ? '  [override='+e.driverWageOverride+']' : ''}`)
  console.log(`\nMauro (A18AZ6C): $${mauroEntry?.netAmount.toFixed(2)}  (Fernando: -$2,019.32)`)
}

main().catch(console.error).finally(() => pool.end())
