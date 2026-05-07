import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  // 1. Período abierto
  const openPeriod = await prisma.period.findFirst({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } })
  console.log('OpenPeriod:', openPeriod ? `${openPeriod.startDate.toISOString()} → ${openPeriod.endDate.toISOString()}` : 'null')

  if (!openPeriod) { await prisma.$disconnect(); await pool.end(); return }

  // 2. DiasInternosEntry en el rango del período
  const diasEntries = await prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: openPeriod.startDate, lte: openPeriod.endDate } },
    select: { totalHoras: true, fecha: true },
  })
  console.log(`\nDiasInternosEntry en el rango: ${diasEntries.length}`)
  diasEntries.forEach(e => console.log(`  fecha=${e.fecha.toISOString()} | horas=${e.totalHoras}`))

  const totalHoras = diasEntries.reduce((s, e) => s + e.totalHoras, 0)

  // 3. Ruta DIAS INTERNOS
  const diasRoute = await prisma.route.findFirst({ where: { name: { contains: 'DIAS INTERNOS' }, clientName: 'AURUMIN' }, select: { rate: true, name: true } })
  console.log('\nRuta DIAS INTERNOS:', diasRoute ? `${diasRoute.name} rate=$${diasRoute.rate}` : 'NO ENCONTRADA (usará $20 default)')

  const diasRate  = diasRoute?.rate ?? 20
  const diasTotal = Math.round(totalHoras * diasRate * 100) / 100
  console.log(`\nTotal horas: ${totalHoras}h × $${diasRate} = $${diasTotal}`)

  // 4. clientPeriodStats actual (solo de trips)
  const trips = await prisma.trip.findMany({
    where: { periodId: openPeriod.id },
    include: { route: { select: { clientName: true } } },
  })
  let aurumin = 0
  for (const t of trips) {
    const client = t.route.clientName || 'AURUMIN'
    if (client === 'AURUMIN') aurumin += t.amount
  }
  console.log(`\nAurumin de trips: $${aurumin.toFixed(2)}`)
  console.log(`Aurumin + DiasInternos debería ser: $${(aurumin + diasTotal).toFixed(2)}`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
