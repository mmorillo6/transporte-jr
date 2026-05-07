import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  const startDate = '2026-04-16'
  const endDate   = '2026-04-30'
  const clientName = 'AURUMIN'

  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  end.setHours(23, 59, 59, 999)

  console.log('Rango:', start.toISOString(), '→', end.toISOString())

  // 1. Trips de la romana
  const trips = await prisma.trip.findMany({
    where: { date: { gte: start, lte: end }, route: { clientName } },
    include: { route: true, truck: { include: { driver: { select: { name: true } } } } },
    orderBy: [{ route: { name: 'asc' } }, { date: 'asc' }],
  })

  console.log(`\nTrips encontrados: ${trips.length}`)

  // 2. Build routeMap
  const routeMap = new Map<string, { routeName: string; rate: number; quantity: number; amount: number; unit: string }>()
  for (const trip of trips) {
    const key = trip.route.name
    if (!routeMap.has(key)) {
      routeMap.set(key, { routeName: key, rate: trip.route.rate, quantity: 0, amount: 0, unit: trip.route.rateType === 'PER_TON' ? 'Ton' : 'Viaje' })
    }
    const entry = routeMap.get(key)!
    const qty = trip.route.rateType === 'PER_TON' ? (trip.netWeightKg ?? 0) / 1000 : 1
    entry.quantity += qty
    entry.amount   += trip.amount
  }

  console.log('\nRouteMap ANTES de override DIAS INTERNOS:')
  for (const [k, v] of routeMap.entries()) {
    console.log(`  ${k}: qty=${v.quantity.toFixed(3)} | amount=$${v.amount.toFixed(2)} | rate=$${v.rate}`)
  }

  // 3. DiasInternosEntries
  const diasInternosEntries = await prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: start, lte: end } },
    include: { truck: { select: { plate: true, driver: { select: { name: true } } } } },
  })
  const totalHorasManual = diasInternosEntries.reduce((s, e) => s + e.totalHoras, 0)
  console.log(`\nDiasInternosEntries encontrados: ${diasInternosEntries.length} | totalHoras: ${totalHorasManual}`)

  // 4. Override DIAS INTERNOS
  for (const entry of routeMap.values()) {
    if (entry.routeName.toUpperCase().includes('DIAS INTERNOS')) {
      entry.quantity = totalHorasManual
      entry.amount   = Math.round(totalHorasManual * entry.rate * 100) / 100
      entry.unit     = 'Hora'
      console.log(`  → Overriding ${entry.routeName}: ${totalHorasManual}h × $${entry.rate} = $${entry.amount}`)
    }
  }

  // 5. Fallback si no hay trips de romana para DIAS INTERNOS
  const hasDiasInternos = Array.from(routeMap.keys()).some(k => k.toUpperCase().includes('DIAS INTERNOS'))
  if (totalHorasManual > 0 && !hasDiasInternos) {
    console.log('\n  Fallback: buscando ruta DIAS INTERNOS...')
    const diasRoute = await prisma.route.findFirst({ where: { name: { contains: 'DIAS INTERNOS' }, clientName } })
    if (diasRoute) {
      console.log(`  → Creando entrada desde ruta: ${diasRoute.name}, rate=$${diasRoute.rate}`)
      routeMap.set(diasRoute.name, {
        routeName: diasRoute.name, rate: diasRoute.rate,
        quantity: totalHorasManual,
        amount: Math.round(totalHorasManual * diasRoute.rate * 100) / 100,
        unit: 'Hora',
      })
    } else {
      console.log('  ❌ No se encontró ruta DIAS INTERNOS en DB')
    }
  }

  console.log('\nRouteMap FINAL:')
  let total = 0
  for (const [k, v] of routeMap.entries()) {
    console.log(`  ${k}: ${v.quantity.toFixed(3)} ${v.unit} × $${v.rate} = $${v.amount.toFixed(2)}`)
    total += v.amount
  }
  console.log(`\nTOTAL FACTURADO: $${total.toFixed(2)}`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
