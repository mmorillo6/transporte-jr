import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import AfiliadoChart from './AfiliadoChart'

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
              driver: { select: { id: true, name: true } },
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

  // Drivers for loan lookup
  const driverNames = owner.trucks.map(t => (t as any).driver?.name).filter(Boolean)

  // Viajes del período actual para estos camiones
  const [periodTrips, recentTrips, payrollHistory, maintenanceAlerts, driverLoans] = await Promise.all([
    openPeriod && truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds }, periodId: openPeriod.id },
          select: { truckId: true, netWeightKg: true, amount: true, route: { select: { clientName: true } } },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds } },
          orderBy: { date: 'desc' },
          take: 20,
          include: { route: { select: { name: true, clientName: true } }, truck: { select: { plate: true } } },
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

    // Alertas de mantenimiento de sus camiones
    truckIds.length > 0
      ? prisma.maintenanceAlert.findMany({
          where: { truckId: { in: truckIds }, status: 'PENDING' },
          include: { truck: { select: { plate: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),

    // Préstamos pendientes de sus choferes
    driverNames.length > 0
      ? prisma.loan.findMany({
          where: { balance: { gt: 0 }, driverName: { in: driverNames } },
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

  // Comparativo por camión: período actual vs anterior
  const currentPeriodId  = periodHistory[0]?.period.id
  const previousPeriodId = periodHistory[1]?.period.id
  const truckComparison = owner.trucks.map(truck => {
    const curr = payrollHistory.find(e => e.truckId === truck.id && e.periodId === currentPeriodId)
    const prev = payrollHistory.find(e => e.truckId === truck.id && e.periodId === previousPeriodId)
    return { truck, curr, prev }
  })

  // Desglose por cliente en el período actual
  const byClient = new Map<string, { trips: number; tons: number; amount: number }>()
  for (const t of periodTrips) {
    const client = (t as any).route?.clientName ?? 'AURUMIN'
    const ex = byClient.get(client) ?? { trips: 0, tons: 0, amount: 0 }
    byClient.set(client, {
      trips:  ex.trips + 1,
      tons:   ex.tons + (t.netWeightKg ?? 0) / 1000,
      amount: ex.amount + (t.amount ?? 0),
    })
  }
  const clientBreakdown = Array.from(byClient.entries()).sort((a, b) => b[1].amount - a[1].amount)

  // Datos para la gráfica (orden cronológico)
  const chartData = [...periodHistory]
    .reverse()
    .map(pg => ({
      label: new Date(pg.period.startDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }),
      bruto: pg.grossAmount,
      neto:  pg.netAmount,
    }))

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

      {/* Desglose por cliente — Aurumin vs Chino Peña */}
      {clientBreakdown.length > 0 && (
        <div>
          <h2 className="text-white font-semibold text-sm mb-3">Facturación por cliente — período actual</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clientBreakdown.map(([cn, d]) => {
              const isAurumin = cn === 'AURUMIN'
              const nprFee    = Math.round(d.amount * (owner.nprPercent / 100) * 100) / 100
              const base      = Math.round((d.amount - nprFee) * 100) / 100
              const pago      = Math.round(base * 0.20 * 100) / 100
              const label     = isAurumin ? 'Aurumin' : 'Chino Peña (Luis Peña)'
              return (
                <div key={cn}
                  className={`border rounded-2xl p-4 ${isAurumin ? 'border-amber-500/25 bg-amber-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isAurumin ? 'text-amber-500' : 'text-blue-400'}`}>
                    {label}
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Facturado</span>
                      <span className={`font-bold text-base ${isAurumin ? 'text-amber-400' : 'text-blue-400'}`}>
                        ${d.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>{d.trips} viajes · {(d.tons / 1000).toFixed(1)} ton</span>
                    </div>
                    <div className="border-t border-zinc-700 pt-1.5 mt-1.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">− {owner.nprPercent}% NPR (José)</span>
                        <span className="text-red-400">− ${nprFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Base × 20%</span>
                        <span className="text-zinc-400">${base.toFixed(2)} × 20%</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span className="text-white">Su pago</span>
                        <span className="text-emerald-400 text-base">${pago.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

      {/* 1. Gráfica de ingresos por período */}
      {chartData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Ingresos por período</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Bruto vs neto — últimos {chartData.length} períodos</p>
          </div>
          <div className="px-4 py-4">
            <AfiliadoChart data={chartData} />
          </div>
        </div>
      )}

      {/* 2. Comparativo por camión */}
      {truckComparison.some(tc => tc.curr || tc.prev) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Comparativo por camión</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Período actual vs anterior</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Placa</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Chofer</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Neto actual</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Neto anterior</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {truckComparison.map(({ truck, curr, prev }) => {
                  const diff = (curr?.netAmount ?? 0) - (prev?.netAmount ?? 0)
                  return (
                    <tr key={truck.id} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-4 py-3 text-white font-mono font-semibold text-xs">{truck.plate}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{truck.driver?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold text-xs">
                        {curr ? `$${curr.netAmount.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400 text-xs">
                        {prev ? `$${prev.netAmount.toFixed(0)}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold text-xs ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {curr && prev ? `${diff > 0 ? '+' : ''}$${diff.toFixed(0)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Alertas de mantenimiento */}
      {maintenanceAlerts.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-red-500/20 flex items-center gap-2">
            <span className="text-red-400 text-base">⚠</span>
            <h2 className="text-white font-semibold text-sm">Alertas de mantenimiento</h2>
            <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{maintenanceAlerts.length}</span>
          </div>
          <div className="divide-y divide-red-500/10">
            {maintenanceAlerts.map(alert => (
              <div key={alert.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-sm font-semibold">{alert.truck.plate}</span>
                    <span className="text-red-300 text-xs">{alert.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-0.5">Vence: {new Date(alert.dueDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</p>
                </div>
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {new Date(alert.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Préstamos pendientes de choferes */}
      {driverLoans.length > 0 && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-500/20 flex items-center gap-2">
            <h2 className="text-white font-semibold text-sm">Préstamos activos — choferes</h2>
            <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
              ${driverLoans.reduce((s, l) => s + l.balance, 0).toFixed(0)} pendiente
            </span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {driverLoans.map(loan => (
              <div key={loan.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-white text-sm font-medium">{loan.driverName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">Descuento: ${loan.deductAmount}/período</p>
                </div>
                <p className="text-amber-400 font-semibold text-sm">${loan.balance.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desglose por cliente — período actual */}
      {clientBreakdown.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Viajes por cliente — período actual</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Montos separados por empresa contratante</p>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {clientBreakdown.map(([client, data]) => (
              <div key={client} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-white font-semibold text-sm">{client}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{data.trips} viajes · {data.tons.toFixed(1)} ton</p>
                </div>
                <p className="text-amber-400 font-bold text-lg">${data.amount.toFixed(2)}</p>
              </div>
            ))}
            {clientBreakdown.length > 1 && (
              <div className="px-5 py-3 flex items-center justify-between bg-zinc-800/30">
                <p className="text-zinc-400 text-sm font-medium">Total combinado</p>
                <p className="text-white font-bold">${clientBreakdown.reduce((s, [, d]) => s + d.amount, 0).toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historial de nómina + Últimos viajes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 5. Historial de nómina con enlace a relación completa */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Historial de pagos</h2>
            <Link href="/nomina" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">Ver todos →</Link>
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
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Neto</th>
                    <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                    <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {periodHistory.map(pg => (
                    <tr key={pg.period.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">
                        {fmt(pg.period.startDate)} — {fmt(pg.period.endDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400 text-xs">{pg.tons.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold text-xs">${pg.netAmount.toFixed(0)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          pg.period.status === 'CLOSED' ? 'text-emerald-400 bg-emerald-400/10' : 'text-amber-400 bg-amber-400/10'
                        }`}>{pg.period.status === 'CLOSED' ? 'Pagado' : 'En curso'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/nomina/${pg.period.id}`}
                          className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">→</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6. Historial completo de viajes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Últimos viajes</h2>
            <span className="text-zinc-600 text-xs">{recentTrips.length} más recientes</span>
          </div>
          {recentTrips.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Sin viajes registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-500 font-medium px-4 py-2 text-xs">Fecha</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-2 text-xs">Placa</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-2 text-xs">Ruta</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-2 text-xs">Ton</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-2 text-xs">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map(trip => (
                    <tr key={trip.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{fmt(trip.date)}</td>
                      <td className="px-4 py-2 text-white font-mono font-semibold text-xs">{trip.truck.plate}</td>
                      <td className="px-4 py-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-400 truncate max-w-[100px]">{trip.route.name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0 ${
                            trip.route.clientName === 'LUIS PEÑA' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>{trip.route.clientName === 'LUIS PEÑA' ? 'LP' : 'AU'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-400 text-xs">
                        {trip.netWeightKg ? (trip.netWeightKg / 1000).toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-amber-400 font-semibold text-xs">
                        ${trip.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-3 border-t border-zinc-800">
            <Link href="/nomina" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">
              Ver relación completa en Nómina →
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
