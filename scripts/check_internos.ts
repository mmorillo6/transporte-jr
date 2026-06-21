import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://${DIRECT_URL}"
const pool = new Pool({ connectionString: DIRECT })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

async function main() {
  // Routes with "interno" or "interno" in name
  const routes = await prisma.route.findMany({
    where: { name: { contains: 'intern', mode: 'insensitive' } },
    select: { id: true, name: true, rate: true, rateType: true, clientName: true }
  })
  console.log('Rutas días internos:', routes)

  // Trips for June 2026 with those routes
  if (routes.length > 0) {
    const trips = await prisma.trip.findMany({
      where: {
        routeId: { in: routes.map(r => r.id) },
        date: { gte: new Date('2026-06-01'), lte: new Date('2026-06-15') }
      },
      select: { id: true, date: true, amount: true, truck: { select: { plate: true } }, periodId: true }
    })
    console.log('Viajes días internos junio:', trips.length, trips)
  }

  // Check period for June 1-15
  const openPeriod = await prisma.period.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startDate: 'desc' }
  })
  console.log('Open period:', openPeriod?.id, openPeriod?.startDate?.toISOString()?.split('T')[0], openPeriod?.endDate?.toISOString()?.split('T')[0])
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
