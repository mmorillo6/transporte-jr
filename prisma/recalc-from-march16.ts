/**
 * Recalculate amounts only for trips FROM March 16, 2026 onwards
 * LA FE: $14/ton (PER_TON), NUEVO CALLAO: $8/trip (PER_TRIP)
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

const CUTOFF = new Date('2026-03-16T00:00:00.000Z')

async function main() {
  const routes = await prisma.route.findMany({
    where: { name: { in: ['LA FE', 'NUEVO CALLAO'] } },
    select: { id: true, name: true, rateType: true, rate: true },
  })

  let updated = 0

  for (const route of routes) {
    const trips = await prisma.trip.findMany({
      where: { routeId: route.id, date: { gte: CUTOFF } },
      select: { id: true, netWeightKg: true, amount: true, date: true },
    })

    console.log(`${route.name}: ${trips.length} viajes desde 16/03/2026`)

    for (const trip of trips) {
      const newAmount = route.rateType === 'PER_TON'
        ? ((trip.netWeightKg ?? 0) / 1000) * route.rate
        : route.rate

      if (Math.abs(newAmount - trip.amount) > 0.001) {
        await prisma.trip.update({ where: { id: trip.id }, data: { amount: newAmount } })
        updated++
      }
    }
  }

  console.log(`\n✓ ${updated} viajes actualizados con nuevas tarifas`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
