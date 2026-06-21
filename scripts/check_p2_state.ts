import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

async function main() {
  const P2 = 'cmppy0k0e0000tdsn288mjrq1'

  const [period, entries, expenses, mechFeeBase] = await Promise.all([
    prisma.period.findUnique({ where: { id: P2 }, select: { startDate: true, endDate: true, status: true, adminFeeBase: true, mechanicFeeBase: true } }),
    prisma.payrollEntry.findMany({
      where: { periodId: P2 },
      include: { truck: { select: { plate: true, owner: { select: { name: true, type: true } } } } },
      orderBy: { grossAmount: 'desc' }
    }),
    prisma.expense.findMany({
      where: { periodId: P2, truckId: { not: null } },
      select: { id: true, date: true, description: true, amount: true, category: true, truck: { select: { plate: true } } },
      orderBy: [{ truck: { plate: 'asc' } }, { date: 'asc' }]
    }),
    prisma.period.findUnique({ where: { id: P2 }, select: { mechanicFeeBase: true } })
  ])

  console.log('=== P2 ESTADO ACTUAL ===')
  console.log(`Período: ${new Date(period!.startDate).toISOString().slice(0,10)} → ${new Date(period!.endDate).toISOString().slice(0,10)} [${period!.status}]`)
  console.log(`Admin: $${period!.adminFeeBase} | Mecánicos total: $${period!.mechanicFeeBase}`)
  console.log(`Nómina generada: ${entries.length} camiones`)
  console.log(`Gastos registrados: ${expenses.length}`)

  console.log('\n--- NÓMINA ---')
  entries.forEach(e => {
    const t = e.truck as any
    console.log(`  ${t?.plate?.padEnd(12)} bruto=$${e.grossAmount.toFixed(2).padStart(9)}  gastos=$${(e as any).commissionFee?.toFixed(2).padStart(7)}  neto=$${e.netAmount.toFixed(2).padStart(9)}  [${t?.owner?.name}]`)
  })

  if (expenses.length > 0) {
    console.log('\n--- GASTOS POR CAMIÓN ---')
    expenses.forEach(e => {
      const t = (e as any).truck
      console.log(`  ${t?.plate?.padEnd(12)} ${new Date(e.date).toISOString().slice(5,10)} ${e.category.padEnd(10)} ${e.description.slice(0,30).padEnd(30)} $${e.amount.toFixed(2)}`)
    })
  } else {
    console.log('\n⚠ Sin gastos registrados en P2')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })
