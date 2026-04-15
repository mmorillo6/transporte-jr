/**
 * Recalculate trip.amount for LA FE and NUEVO CALLAO trips from March 16, 2025 onwards
 * LA FE: $14/ton, NUEVO CALLAO: $8/ton (both PER_TON)
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const cutoff = new Date('2025-03-16T00:00:00.000Z')

  const routes = await prisma.route.findMany({
    where: { name: { in: ['LA FE', 'NUEVO CALLAO'] } },
    select: { id: true, name: true, rateType: true, rate: true },
  })

  console.log('Rutas encontradas:', routes)

  let updated = 0

  for (const route of routes) {
    const trips = await prisma.trip.findMany({
      where: { routeId: route.id, date: { gte: cutoff } },
      select: { id: true, netWeightKg: true, amount: true, date: true },
    })

    console.log(`\n${route.name} (${route.rateType} @ $${route.rate}): ${trips.length} viajes desde 16/03`)

    for (const trip of trips) {
      let newAmount: number
      if (route.rateType === 'PER_TON') {
        newAmount = ((trip.netWeightKg ?? 0) / 1000) * route.rate
      } else {
        newAmount = route.rate
      }

      if (Math.abs(newAmount - trip.amount) > 0.001) {
        await prisma.trip.update({
          where: { id: trip.id },
          data: { amount: newAmount },
        })
        updated++
      }
    }
  }

  console.log(`\n✓ ${updated} viajes actualizados`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
