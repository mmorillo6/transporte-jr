import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import DespachoClient from './DespachoClient'

const ROLE_LABEL: Record<string, string> = { CHOFER: 'Chofer', MECANICO: 'Mecánico' }

export default async function DespachoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string; month?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]
  const selectedDate = params.date ?? today
  const initialTab = params.tab === 'asistencia' ? 'asistencia' : 'despacho'

  const now = new Date()
  const selectedMonth = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = selectedMonth.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999)

  const dayStart = new Date(selectedDate + 'T00:00:00')
  const dayEnd   = new Date(selectedDate + 'T23:59:59')

  const [trucks, routes, existingDispatch, lastSosaTrips, clockEntries, asistenciaUsers, summaryEntries] = await Promise.all([
    prisma.truck.findMany({
      where: { active: true },
      select: {
        id: true,
        plate: true,
        driver: { select: { name: true } },
        owner: { select: { name: true } },
        status: { select: { status: true } },
      },
      orderBy: { plate: 'asc' },
    }),
    prisma.route.findMany({
      where: { active: true },
      select: { id: true, name: true, rate: true, rateType: true, fuelLitersPerTrip: true, bidirectional: true },
      orderBy: { name: 'asc' },
    }),
    prisma.dispatch.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd } },
      include: {
        entries: {
          include: {
            truck: { select: { id: true, plate: true, driver: { select: { name: true } } } },
            route: { select: { id: true, name: true } },
          },
        },
      },
    }),
    // Cola de Sosa: último viaje a SOSA MENDEZ por camión
    prisma.trip.findMany({
      where: { route: { name: 'SOSA MENDEZ' } },
      orderBy: { date: 'desc' },
      distinct: ['truckId'],
      select: { truckId: true, date: true },
    }),
    // Asistencia: últimas 100 entradas
    prisma.clockEntry.findMany({
      orderBy: { clockIn: 'desc' },
      take: 100,
      include: {
        user: { select: { name: true, role: true } },
        truck: { select: { plate: true } },
      },
    }),
    // Asistencia: usuarios activos
    prisma.user.findMany({
      where: { active: true, role: { in: ['CHOFER', 'MECANICO'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
    // Resumen mensual
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: monthStart, lte: monthEnd }, clockOut: { not: null } },
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
  ])

  // Cola de Sosa: ordenar camiones activos por último viaje a Sosa (el que fue hace más tiempo va primero)
  const sosaMap = new Map(lastSosaTrips.map(t => [t.truckId, t.date]))
  const activeTruckIds = new Set(trucks.map(t => t.id))
  const sosaQueue = trucks
    .map(t => ({ ...t, lastSosa: sosaMap.get(t.id) ?? null }))
    .sort((a, b) => {
      if (!a.lastSosa && !b.lastSosa) return 0
      if (!a.lastSosa) return -1   // nunca fue → va primero
      if (!b.lastSosa) return 1
      return a.lastSosa.getTime() - b.lastSosa.getTime() // más antiguo primero
    })

  // Resumen mensual de asistencia
  const byUser = new Map<string, { userId: string; name: string; role: string; totalMinutes: number; days: Set<string> }>()
  for (const e of summaryEntries) {
    if (!e.clockOut) continue
    const mins = Math.round((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000)
    const dayKey = new Date(e.clockIn).toISOString().split('T')[0]
    const ex = byUser.get(e.userId)
    if (ex) { ex.totalMinutes += mins; ex.days.add(dayKey) }
    else byUser.set(e.userId, { userId: e.userId, name: e.user.name, role: e.user.role, totalMinutes: mins, days: new Set([dayKey]) })
  }
  const summaryData = Array.from(byUser.values())
    .map(u => ({ name: u.name, role: ROLE_LABEL[u.role] ?? u.role, days: u.days.size, totalHours: Math.round(u.totalMinutes / 60 * 10) / 10, avgHours: u.days.size > 0 ? Math.round(u.totalMinutes / 60 / u.days.size * 10) / 10 : 0 }))
    .sort((a, b) => b.totalHours - a.totalHours)

  // Recent dispatches for history panel
  const recentDispatches = await prisma.dispatch.findMany({
    orderBy: { date: 'desc' },
    take: 7,
    include: {
      entries: {
        include: {
          truck: { select: { plate: true, driver: { select: { name: true } } } },
          route: { select: { name: true } },
        },
      },
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Despacho</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Planifica qué camiones salen cada día y a qué ruta. Sirve como hoja de ruta diaria para el encargado.</p>
      </div>
      <DespachoClient
        trucks={trucks as any}
        routes={routes as any}
        selectedDate={selectedDate}
        existingDispatch={existingDispatch as any}
        recentDispatches={recentDispatches as any}
        sosaQueue={sosaQueue as any}
        initialTab={initialTab}
        clockEntries={clockEntries as any}
        asistenciaUsers={asistenciaUsers}
        summaryData={summaryData}
        selectedMonth={selectedMonth}
      />
    </div>
  )
}
