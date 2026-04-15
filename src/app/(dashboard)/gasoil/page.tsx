import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import GasoilClient from './GasoilClient'

export default async function GasoilPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; truckId?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]

  // Fuel tanks with their intake totals
  const tanks = await prisma.fuelTank.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      intakes: { select: { liters: true } },
    },
  })

  // Total liters given out per tank — for now FuelEntry doesn't have tankId so we compute global exits
  const totalExits = await prisma.fuelEntry.aggregate({ _sum: { liters: true } })
  const globalExitLiters = totalExits._sum.liters ?? 0
  const totalIntakes = tanks.reduce((s, t) => s + t.intakes.reduce((si, i) => si + i.liters, 0), 0)
  // Distribute exits proportionally across tanks (simplification — no tankId on FuelEntry)

  // Today's dispatches for supply order
  const todayDispatches = await prisma.dispatchEntry.findMany({
    where: {
      dispatch: { date: { gte: new Date(today + 'T00:00:00'), lte: new Date(today + 'T23:59:59') } },
    },
    include: {
      truck: { select: { id: true, plate: true, driver: { select: { name: true } } } },
      route: { select: { id: true, name: true, fuelLitersPerTrip: true } },
    },
  })

  // History filters
  const histWhere: any = {}
  if (params.from || params.to) {
    histWhere.date = {}
    if (params.from) histWhere.date.gte = new Date(params.from)
    if (params.to) histWhere.date.lte = new Date(params.to + 'T23:59:59')
  }
  if (params.truckId) histWhere.truckId = params.truckId

  const [fuelEntries, trucks, routes] = await Promise.all([
    prisma.fuelEntry.findMany({
      where: histWhere,
      orderBy: { date: 'desc' },
      take: 150,
      include: {
        truck: { select: { plate: true, driver: { select: { name: true } } } },
      },
    }),
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true, driver: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
    prisma.route.findMany({
      where: { active: true },
      select: { id: true, name: true, fuelLitersPerTrip: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Gasoil</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Control de combustible — tanques e inventario</p>
      </div>
      <GasoilClient
        tanks={tanks.map(t => ({
          ...t,
          totalIntake: t.intakes.reduce((s, i) => s + i.liters, 0),
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }))}
        todayDispatches={todayDispatches.map(d => ({
          truckId: d.truck.id,
          plate: d.truck.plate,
          driverName: d.truck.driver?.name ?? '—',
          routeId: d.route.id,
          routeName: d.route.name,
          plannedTrips: d.plannedTrips,
          fuelLitersPerTrip: d.route.fuelLitersPerTrip,
          totalLiters: d.route.fuelLitersPerTrip * d.plannedTrips,
        }))}
        fuelEntries={fuelEntries as any}
        trucks={trucks}
        routes={routes}
        params={params}
        today={today}
        globalExitLiters={globalExitLiters}
        totalIntakeLiters={totalIntakes}
      />
    </div>
  )
}
