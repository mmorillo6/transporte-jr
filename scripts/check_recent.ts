import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://${DIRECT_URL}"
const pool = new Pool({ connectionString: DIRECT })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

async function main() {
  const since = new Date('2026-06-20T00:00:00Z')

  // PayrollEntries recientes
  const payroll = await prisma.payrollEntry.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, createdAt: true, updatedAt: true, grossAmount: true, netAmount: true, mechanicFee: true, truck: { select: { plate: true } }, period: { select: { startDate: true, endDate: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  console.log(`\n=== PayrollEntries actualizados (${payroll.length}) ===`)
  payroll.forEach(e => console.log(e.updatedAt.toISOString().slice(0,16), e.truck?.plate, `bruto=$${e.grossAmount}`, `neto=$${e.netAmount}`, `mec=$${e.mechanicFee}`))

  // Gastos recientes
  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, createdAt: true, description: true, category: true, amount: true, truck: { select: { plate: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  console.log(`\n=== Gastos creados (${expenses.length}) ===`)
  expenses.forEach(e => console.log(e.createdAt.toISOString().slice(0,16), e.truck?.plate ?? 'sin camión', e.category, e.description, `$${e.amount}`))

  // Trips recientes
  const trips = await prisma.trip.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, createdAt: true, date: true, amount: true, truck: { select: { plate: true } }, route: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  console.log(`\n=== Viajes creados (${trips.length}) ===`)
  trips.forEach(t => console.log(t.createdAt.toISOString().slice(0,16), t.date.toISOString().slice(0,10), t.truck?.plate, t.route?.name, `$${t.amount}`))

  // Period changes
  const periods = await prisma.period.findMany({
    where: { updatedAt: { gte: since } },
    select: { id: true, updatedAt: true, startDate: true, endDate: true, status: true, mechanicFeeBase: true, adminFeeBase: true },
    orderBy: { updatedAt: 'desc' },
  })
  console.log(`\n=== Períodos actualizados (${periods.length}) ===`)
  periods.forEach(p => console.log(p.updatedAt.toISOString().slice(0,16), p.startDate.toISOString().slice(0,10), '→', p.endDate.toISOString().slice(0,10), p.status, `mec=${p.mechanicFeeBase}`, `admin=${p.adminFeeBase}`))

  // CxC recientes
  const cxc = await prisma.cuentaPorCobrar.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, createdAt: true, clientName: true, concept: true, totalAmount: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  console.log(`\n=== CxC creadas (${cxc.length}) ===`)
  cxc.forEach(c => console.log(c.createdAt.toISOString().slice(0,16), c.clientName, c.concept, `$${c.totalAmount}`, c.status))
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
