import Link from 'next/link'
import { prisma } from '@/lib/prisma'

const fmt = (d: Date) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operativo', IN_SHOP: 'En taller', OUT_OF_SERVICE: 'Fuera de servicio',
}
const STATUS_STYLE: Record<string, string> = {
  OPERATIONAL: 'text-emerald-400 bg-emerald-400/10',
  IN_SHOP: 'text-amber-400 bg-amber-400/10',
  OUT_OF_SERVICE: 'text-red-400 bg-red-400/10',
}

export default async function AfiliadoDashboard({ userId, name }: { userId: string; name: string }) {
  // Buscar el Owner del usuario afiliado
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      owner: {
        include: {
          trucks: {
            where: { active: true },
            include: {
              driver: { select: { name: true } },
              status: { select: { status: true } },
              _count: { select: { trips: true } },
            },
            orderBy: { plate: 'asc' },
          },
        },
      },
    },
  })

  const owner = user?.owner

  // Si no tiene Owner asociado, mostrar pantalla de ayuda
  if (!owner) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {name.split(' ')[0]}</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Tu cuenta aún no está vinculada a un propietario</p>
        </div>
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-8 text-center space-y-3">
          <p className="text-amber-400 text-sm font-semibold">Cuenta sin vincular</p>
          <p className="text-zinc-400 text-sm">
            El encargado debe vincular tu usuario al registro de propietario correspondiente en la sección Flota → Propietarios.
          </p>
        </div>
      </div>
    )
  }

  const truckIds = owner.trucks.map(t => t.id)

  // Período abierto
  const openPeriod = await prisma.period.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startDate: 'desc' },
  })

  // Viajes del período actual para estos camiones
  const [periodTrips, recentTrips, payrollHistory] = await Promise.all([
    openPeriod && truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds }, periodId: openPeriod.id },
          select: { truckId: true, netWeightKg: true, amount: true },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds } },
          orderBy: { date: 'desc' },
          take: 10,
          include: { route: { select: { name: true } }, truck: { select: { plate: true } } },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.payrollEntry.findMany({
          where: { truckId: { in: truckIds } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            period: { select: { id: true, startDate: true, endDate: true, status: true } },
            truck: { select: { plate: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // Agrupar nómina por período
  const byPeriod = new Map<string, {
    period: { id: string; startDate: Date; endDate: Date; status: string }
    grossAmount: number; netAmount: number; tons: number; truckCount: number
  }>()
  for (const e of payrollHistory) {
    if (!e.periodId) continue
    const ex = byPeriod.get(e.periodId)
    if (ex) {
      ex.grossAmount += e.grossAmount
      ex.netAmount   += e.netAmount
      ex.tons        += e.totalTons
      ex.truckCount  += 1
    } else {
      byPeriod.set(e.periodId, {
        period:      e.period as any,
        grossAmount: e.grossAmount,
        netAmount:   e.netAmount,
        tons:        e.totalTons,
        truckCount:  1,
      })
    }
  }
  const periodHistory = Array.from(byPeriod.values())
    .sort((a, b) => new Date(b.period.startDate).getTime() - new Date(a.period.startDate).getTime())
    .slice(0, 6)

  // KPIs del período actual
  const periodTripCount = periodTrips.length
  const periodTons      = periodTrips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000
  const lastPaidPeriod  = periodHistory.find(p => p.period.status === 'CLOSED')
  const pendingPeriod   = periodHistory.find(p => p.period.status === 'OPEN')

  // Viajes por camión en el período actual
  const tripsByTruck = new Map<string, number>()
  for (const t of periodTrips) {
    tripsByTruck.set(t.truckId, (tripsByTruck.get(t.truckId) ?? 0) + 1)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {name.split(' ')[0]}</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {owner.name} · Afiliado {owner.nprPercent}% NPR · {owner.trucks.length} camión{owner.trucks.length !== 1 ? 'es' : ''}
          </p>
        </div>
        {openPeriod && (
          <Link href="/nomina"
            className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl px-3 py-2 hover:bg-amber-500/20 transition-colors">
            Período {fmt(openPeriod.startDate)} — {fmt(openPeriod.endDate)} → Ver nómina
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs font-medium mb-2">Mis camiones</p>
          <p className="text-3xl font-bold text-amber-400">{owner.trucks.length}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {owner.trucks.filter(t => t.status?.status === 'IN_SHOP').length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                {owner.trucks.filter(t => t.status?.status === 'IN_SHOP').length} en taller
              </span>
            )}
            {owner.trucks.filter(t => t.status?.status === 'OUT_OF_SERVICE').length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                {owner.trucks.filter(t => t.status?.status === 'OUT_OF_SERVICE').length} f.servicio
              </span>
            )}
            {owner.trucks.every(t => !t.status || t.status.status === 'OPERATIONAL') && (
              <span className="text-[10px] text-zinc-600">todos operativos</span>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs font-medium mb-2">Viajes este período</p>
          <p className="text-3xl font-bold text-blue-400">{periodTripCount}</p>
          <p className="text-zinc-600 text-xs mt-2">{periodTons.toFixed(1)} ton</p>
        </div>

        <div className={`rounded-2xl p-4 border ${pendingPeriod ? 'bg-amber-500/5 border-amber-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs font-medium mb-2">Por cobrar (período abierto)</p>
          <p className={`text-3xl font-bold ${pendingPeriod ? 'text-amber-400' : 'text-zinc-500'}`}>
            ${pendingPeriod ? pendingPeriod.netAmount.toFixed(0) : '0'}
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            {pendingPeriod ? `${pendingPeriod.tons.toFixed(1)} ton · bruto $${pendingPeriod.grossAmount.toFixed(0)}` : 'sin nómina aún'}
          </p>
        </div>

        <div className={`rounded-2xl p-4 border ${lastPaidPeriod ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs font-medium mb-2">Último cobro recibido</p>
          <p className={`text-3xl font-bold ${lastPaidPeriod ? 'text-emerald-400' : 'text-zinc-500'}`}>
            ${lastPaidPeriod ? lastPaidPeriod.netAmount.toFixed(0) : '0'}
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            {lastPaidPeriod
              ? `${fmt(lastPaidPeriod.period.startDate)} — ${fmt(lastPaidPeriod.period.endDate)}`
              : 'sin períodos cerrados'}
          </p>
        </div>
      </div>

      {/* Mis camiones — tarjetas */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3">Mis unidades</h2>
        {owner.trucks.length === 0 ? (
          <p className="text-zinc-500 text-sm">No hay camiones activos registrados para tu cuenta.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {owner.trucks.map(truck => {
              const statusKey = truck.status?.status ?? 'OPERATIONAL'
              const tripsThisPeriod = tripsByTruck.get(truck.id) ?? 0
              return (
                <Link key={truck.id} href={`/camiones/${truck.id}`}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-colors block">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-bold text-xl font-mono">{truck.plate}</p>
                      <p className="text-zinc-400 text-sm mt-0.5">{truck.driver?.name ?? 'Sin chofer'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLE[statusKey]}`}>
                      {STATUS_LABEL[statusKey]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                    <div>
                      <p className="text-zinc-500 text-xs">Total viajes</p>
                      <p className="text-white font-semibold">{truck._count.trips}</p>
                    </div>
                    {openPeriod && (
                      <div className="text-right">
                        <p className="text-zinc-500 text-xs">Este período</p>
                        <p className="text-amber-400 font-semibold">{tripsThisPeriod} viajes</p>
                      </div>
                    )}
                    <span className="text-zinc-600 text-xs">Ver ficha →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Historial de nómina + Últimos viajes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Historial de nómina */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Historial de pagos</h2>
            <Link href="/nomina" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">
              Ver todos →
            </Link>
          </div>
          {periodHistory.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Sin nóminas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Período</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Ton</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Bruto</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Neto</th>
                    <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {periodHistory.map(pg => (
                    <tr key={pg.period.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">
                        {fmt(pg.period.startDate)} — {fmt(pg.period.endDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400 text-xs">{pg.tons.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-zinc-300 text-xs">${pg.grossAmount.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold text-xs">${pg.netAmount.toFixed(0)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          pg.period.status === 'CLOSED'
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-amber-400 bg-amber-400/10'
                        }`}>
                          {pg.period.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Últimos viajes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Últimos viajes</h2>
          </div>
          {recentTrips.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Sin viajes registrados</p>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {recentTrips.map(trip => (
                <div key={trip.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-mono font-semibold">{trip.truck.plate}</span>
                      <span className="text-zinc-500 text-xs truncate">{trip.route.name}</span>
                    </div>
                    <p className="text-zinc-600 text-xs mt-0.5">{fmt(trip.date)}</p>
                  </div>
                  {trip.netWeightKg && (
                    <p className="text-zinc-300 text-xs font-mono flex-shrink-0">
                      {(trip.netWeightKg / 1000).toFixed(3)} t
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
