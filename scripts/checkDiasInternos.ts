import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const entries = await prisma.diasInternosEntry.findMany({
    include: { truck: { select: { plate: true } } },
    orderBy: { fecha: 'asc' },
  })

  console.log(`Total DiasInternosEntry en DB: ${entries.length}`)
  entries.forEach(e => {
    console.log(`  ${e.fecha.toISOString().slice(0,10)} | ${e.truck.plate} | ${e.conductor} | ${e.horaInicio}→${e.horaFin} | ${e.totalHoras}h | $${(e.totalHoras * 20).toFixed(2)}`)
  })

  const total = entries.reduce((s, e) => s + e.totalHoras, 0)
  console.log(`\nTotal horas: ${total}h | Total $: $${(total * 20).toFixed(2)}`)

  // Simular la query de generarRelacion para el período 16-30 abr
  const start = new Date('2026-04-16T00:00:00')
  const end   = new Date('2026-04-30T00:00:00')
  end.setHours(23, 59, 59, 999)

  console.log(`\nQuery rango: ${start.toISOString()} → ${end.toISOString()}`)

  const inRange = await prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: start, lte: end } },
    include: { truck: { select: { plate: true } } },
  })
  console.log(`En rango 16-30 abr: ${inRange.length} registros`)
  inRange.forEach(e => {
    console.log(`  ${e.fecha.toISOString()} | ${e.truck.plate} | ${e.totalHoras}h`)
  })

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
