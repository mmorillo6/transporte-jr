import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import ViajesClient from './ViajesClient'

async function getTrips(filters: {
  truckId?: string
  routeId?: string
  from?: string
  to?: string
  page: number
}) {
  const PAGE_SIZE = 50
  const skip = (filters.page - 1) * PAGE_SIZE

  const where: any = {}
  if (filters.truckId) where.truckId = filters.truckId
  if (filters.routeId) where.routeId = filters.routeId
  if (filters.from || filters.to) {
    where.date = {}
    if (filters.from) where.date.gte = new Date(filters.from)
    if (filters.to) {
      const toDate = new Date(filters.to)
      toDate.setHours(23, 59, 59, 999)
      where.date.lte = toDate
    }
  }

  const [trips, total, totals] = await Promise.all([
    prisma.trip.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        truck: {
          select: {
            plate: true,
            driver: { select: { name: true } },
            owner: { select: { name: true } },
          },
        },
        route: { select: { name: true, rateType: true } },
      },
    }),
    prisma.trip.count({ where }),
    prisma.trip.aggregate({
      where,
      _sum: { amount: true, viatico: true, netWeightKg: true },
    }),
  ])

  return { trips, total, totals, pageSize: PAGE_SIZE }
}

async function getFilterOptions() {
  const [trucks, routes] = await Promise.all([
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true, driver: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
    prisma.route.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { trucks, routes }
}

export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ truckId?: string; routeId?: string; from?: string; to?: string; page?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const page = parseInt(params.page ?? '1')

  const [{ trips, total, totals, pageSize }, filterOptions] = await Promise.all([
    getTrips({
      truckId: params.truckId,
      routeId: params.routeId,
      from: params.from,
      to: params.to,
      page,
    }),
    getFilterOptions(),
  ])

  const totalPages = Math.ceil(total / pageSize)
  const totalAmount = totals._sum.amount ?? 0
  const totalTons = (totals._sum.netWeightKg ?? 0) / 1000

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Viajes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total} viajes registrados</p>
        </div>
        <Link
          href="/viajes/nuevo"
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
        >
          + Nuevo viaje
        </Link>
      </div>

      {/* Pass data to client component for interactivity (filters + import modal) */}
      <ViajesClient
        trips={trips as any}
        filterOptions={filterOptions}
        params={params}
        page={page}
        totalPages={totalPages}
        totalAmount={totalAmount}
        totalTons={totalTons}
        total={total}
      />
    </div>
  )
}
