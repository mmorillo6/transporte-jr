import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  // Todos los períodos
  const periods = await prisma.period.findMany({ orderBy: { startDate: 'desc' }, take: 5 })
  console.log('Períodos:')
  periods.forEach(p => console.log(` ${p.id} | ${p.startDate.toISOString().slice(0,10)} → ${p.endDate.toISOString().slice(0,10)} | ${p.status}`))

  // Nómina del período 1 (abr2026-1)
  const period1 = periods.find(p => p.id === 'period-abr2026-1')
  if (period1) {
    const entries1 = await prisma.payrollEntry.findMany({
      where: { periodId: period1.id },
      include: { truck: { select: { plate: true, owner: { select: { name: true } } } } },
      orderBy: { grossAmount: 'desc' }
    })
    console.log('\nNómina período 1 (1-15 abr):')
    entries1.forEach(e => {
      const paid = e.paidAt ? `PAGADO ${e.paidAt.toISOString().slice(0,10)}` : 'SIN PAGAR'
      console.log(`  ${e.truck.plate} (${e.truck.owner.name}) | neto: $${e.netAmount.toFixed(2)} | ${paid}`)
    })
  }

  // Período 2 - saldoIniciales
  const period2 = await prisma.period.findFirst({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } })
  if (period2) {
    const entries2 = await prisma.payrollEntry.findMany({
      where: { periodId: period2.id },
      include: { truck: { select: { plate: true, owner: { select: { name: true } } } } },
      orderBy: { grossAmount: 'desc' }
    })
    console.log('\nNómina período 2 (16-30 abr) — saldoInicial y abono:')
    entries2.forEach(e => {
      console.log(`  ${e.truck.plate} | bruto: $${e.grossAmount.toFixed(2)} | saldoInicial: $${(e.saldoInicial||0).toFixed(2)} | abono: $${(e.abono||0).toFixed(2)} | neto: $${e.netAmount.toFixed(2)}`)
    })
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
