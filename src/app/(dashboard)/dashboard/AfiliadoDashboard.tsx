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
  // Fecha desde la que se cuentan sus viajes (para dueños con camión transferido)
  const activeSince = (owner as any)?.activeSince ? new Date((owner as any).activeSince) : null

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

  // Si activeSince está definido, contar viajes solo desde esa fecha
  const truckTripCounts = activeSince
    ? await prisma.trip.groupBy({
        by: ['truckId'],
        where: { truckId: { in: truckIds }, date: { gte: activeSince } },
        _count: { id: true },
      }).then(rows => Object.fromEntries(rows.map(r => [r.truckId, r._count.id])))
    : null

  // Período abierto
  const openPeriod = await prisma.period.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startDate: 'desc' },
  })

  // Despacho de hoy — qué camiones del dueño están en ruta hoy
  const todayVE  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }))
  const todayStr = `${todayVE.getFullYear()}-${String(todayVE.getMonth() + 1).padStart(2, '0')}-${String(todayVE.getDate()).padStart(2, '0')}`
  // Dispatch.date se guarda como DateTime a medianoche Venezuela (T04:00Z en UTC).
  // Usamos rango completo del día UTC para capturar cualquier despacho de hoy.
  const dayStart = new Date(todayStr + 'T00:00:00Z')
  const dayEnd   = new Date(todayStr + 'T23:59:59Z')
  const todayDispatch = truckIds.length > 0
    ? await prisma.dispatchEntry.findMany({
        where: {
          truckId:  { in: truckIds },
          dispatch: { date: { gte: dayStart, lte: dayEnd } },
        },
        select: {
          truckId:      true,
          plannedTrips: true,
          route:        { select: { name: true } },
          truck:        { select: { plate: true, driver: { select: { name: true } } } },
        },
      })
    : []

  // Historial de despacho del período abierto (excluyendo hoy, que ya está en Estado hoy)
  const periodDispatch = openPeriod && truckIds.length > 0
    ? await prisma.dispatchEntry.findMany({
        where: {
          truckId:  { in: truckIds },
          dispatch: {
            date: {
              gte: new Date(openPeriod.startDate.toISOString().split('T')[0] + 'T00:00:00Z'),
              lt:  dayStart,
            },
          },
        },
        select: {
          truckId:      true,
          plannedTrips: true,
          route:        { select: { name: true } },
          truck:        { select: { plate: true, driver: { select: { name: true } } } },
          dispatch:     { select: { date: true } },
        },
        orderBy: { dispatch: { date: 'desc' } },
      })
    : []

  // Agrupar historial por fecha
  const dispatchByDate = periodDispatch.reduce((acc, entry) => {
    const dateKey = entry.dispatch.date.toISOString().split('T')[0]
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(entry)
    return acc
  }, {} as Record<string, typeof periodDispatch>)
  const dispatchDates = Object.keys(dispatchByDate).sort((a, b) => b.localeCompare(a))

  // Drivers for loan lookup
  const driverNames = owner.trucks.map(t => (t as any).driver?.name).filter(Boolean)

  // Viajes del período actual para estos camiones
  const [periodTrips, recentTrips, payrollHistory, maintenanceAlerts, driverLoans, ownerLoans, mecExpenses, periodOpExpenses, periodAllExpenses] = await Promise.all([
    openPeriod && truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds }, periodId: openPeriod.id },
          select: { truckId: true, netWeightKg: true, amount: true, route: { select: { clientName: true } } },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.trip.findMany({
          where: { truckId: { in: truckIds }, ...(activeSince ? { date: { gte: activeSince } } : {}) },
          orderBy: { date: 'desc' },
          take: 20,
          include: { route: { select: { name: true, clientName: true } }, truck: { select: { plate: true } } },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.payrollEntry.findMany({
          where: { truckId: { in: truckIds }, ...(activeSince ? { period: { startDate: { gte: activeSince } } } : {}) },
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

    // Préstamos del dueño a descontar del pago de Luis Peña
    prisma.loan.findMany({
      where: { balance: { gt: 0 }, driverName: owner.name },
    }),

    // Gastos mecánica del período abierto
    openPeriod && truckIds.length > 0
      ? prisma.expense.findMany({
          where: { truckId: { in: truckIds }, periodId: openPeriod.id, category: 'MECANICA' },
          select: { id: true, description: true, amount: true, truck: { select: { plate: true } } },
          orderBy: { truck: { plate: 'asc' } },
        })
      : Promise.resolve([]),

    // Gastos operativos del período (excluye overhead: nómina, admin, NPR, mecánica)
    openPeriod && truckIds.length > 0
      ? prisma.expense.findMany({
          where: {
            truckId: { in: truckIds },
            periodId: openPeriod.id,
            category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] },
          },
          select: {
            id: true, description: true, amount: true, category: true,
            truck: { select: { plate: true } },
          },
          orderBy: { truck: { plate: 'asc' } },
        })
      : Promise.resolve([]),

    // Todos los gastos del período para el desglose completo por camión
    openPeriod && truckIds.length > 0
      ? prisma.expense.findMany({
          where: {
            truckId: { in: truckIds },
            periodId: openPeriod.id,
            category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR'] },
          },
          select: {
            id: true, date: true, description: true, amount: true, category: true,
            truck: { select: { id: true, plate: true } },
          },
          orderBy: [{ truck: { plate: 'asc' } }, { date: 'asc' }],
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
            {owner.name} · Dueño {owner.nprPercent}% NPR · {owner.trucks.length} camión{owner.trucks.length !== 1 ? 'es' : ''}
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

      {/* ── Estado hoy ─────────────────────────────────────────────────────── */}
      {(() => {
        const dayLabel = todayVE.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: '2-digit' })
        const dispatched    = todayDispatch.length
        const notDispatched = owner.trucks.filter(t => !todayDispatch.some(d => d.truckId === t.id))

        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">Estado hoy</span>
                <span className="text-zinc-500 text-xs capitalize">{dayLabel}</span>
              </div>
              {dispatched > 0
                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                    {dispatched} en ruta
                  </span>
                : <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold">
                    Sin despacho registrado
                  </span>
              }
            </div>

            <div className="divide-y divide-zinc-800/60">
              {/* Camiones con despacho registrado hoy */}
              {todayDispatch.map(entry => (
                <div key={entry.truckId} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-white font-mono font-bold text-sm w-20 flex-shrink-0">
                    {entry.truck?.plate}
                  </span>
                  <span className="text-zinc-400 text-sm flex-1 truncate">
                    {entry.truck?.driver?.name?.split(' ')[0] ?? '—'}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-amber-400 text-xs font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      {entry.route?.name}
                    </span>
                    {entry.plannedTrips > 0 && (
                      <span className="text-zinc-500 text-xs">
                        {entry.plannedTrips}v
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Camiones sin despacho hoy */}
              {notDispatched.map(truck => {
                const statusKey = truck.status?.status ?? 'OPERATIONAL'
                const isShop   = statusKey === 'IN_SHOP'
                const isOut    = statusKey === 'OUT_OF_SERVICE'
                return (
                  <div key={truck.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isShop ? 'bg-amber-400' : isOut ? 'bg-red-400' : 'bg-zinc-600'}`} />
                    <span className="text-zinc-400 font-mono text-sm w-20 flex-shrink-0">
                      {truck.plate}
                    </span>
                    <span className="text-zinc-600 text-sm flex-1 truncate">
                      {truck.driver?.name?.split(' ')[0] ?? '—'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      isShop  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      isOut   ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                'bg-zinc-800 text-zinc-500'
                    }`}>
                      {isShop ? 'En taller' : isOut ? 'Fuera de servicio' : 'Sin salida hoy'}
                    </span>
                  </div>
                )
              })}
            </div>

            {dispatched === 0 && (
              <p className="text-zinc-600 text-xs px-4 pb-3 pt-1">
                El encargado aún no registró el despacho de hoy.
              </p>
            )}
          </div>
        )
      })()}

      {/* ── Historial de despacho del período ──────────────────────────────── */}
      {dispatchDates.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">Historial de despacho</span>
            <span className="text-zinc-500 text-xs">{openPeriod ? `${fmt(openPeriod.startDate)} — hoy` : ''}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {dispatchDates.map(dateKey => {
              const entries = dispatchByDate[dateKey]
              const label = new Date(dateKey + 'T12:00:00Z').toLocaleDateString('es-VE', {
                weekday: 'short', day: '2-digit', month: '2-digit',
              })
              return (
                <div key={dateKey}>
                  <div className="px-4 py-2 bg-zinc-800/30">
                    <span className="text-zinc-400 text-xs font-semibold capitalize">{label}</span>
                  </div>
                  {entries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                      <span className="text-zinc-300 font-mono text-sm w-20 flex-shrink-0">
                        {entry.truck?.plate}
                      </span>
                      <span className="text-zinc-500 text-sm flex-1 truncate">
                        {entry.truck?.driver?.name?.split(' ')[0] ?? '—'}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-zinc-400 text-xs bg-zinc-800 px-2 py-0.5 rounded-full">
                          {entry.route?.name}
                        </span>
                        <span className="text-zinc-600 text-xs w-6 text-right">
                          {entry.plannedTrips}v
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Relación del período actual — formato igual al Excel de Fernando */}
      {openPeriod && (() => {
        const openEntries = payrollHistory.filter(e => e.period.id === openPeriod.id)
        if (openEntries.length === 0) return (
          <div>
            <h2 className="text-white font-semibold text-sm mb-3">Relación del período</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {owner.trucks.map(truck => {
                const statusKey = truck.status?.status ?? 'OPERATIONAL'
                const isInShop = statusKey === 'IN_SHOP'
                const isOutOfService = statusKey === 'OUT_OF_SERVICE'
                const msg = isInShop
                  ? 'El camión no trabajó este período (en taller)'
                  : isOutOfService
                  ? 'El camión no trabajó este período (fuera de servicio)'
                  : 'Nómina no generada aún para este período'
                const borderColor = isInShop
                  ? 'border-amber-500/20'
                  : isOutOfService
                  ? 'border-red-500/20'
                  : 'border-zinc-800'
                const textColor = isInShop
                  ? 'text-amber-400'
                  : isOutOfService
                  ? 'text-red-400'
                  : 'text-zinc-500'
                return (
                  <div key={truck.id} className={`bg-zinc-900 border ${borderColor} rounded-2xl p-4`}>
                    <p className="font-mono font-bold text-sm text-white mb-1">{truck.plate}</p>
                    <p className={`text-sm ${textColor}`}>{msg}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )

        // Desglose por camión — AFILIADO: driverWage es informativo, NO se descuenta
        const nprPct      = owner.nprPercent / 100
        const mecItems    = mecExpenses as { id: string; description: string; amount: number; truck: { plate: string } | null }[]
        const mecRepuesto = mecItems
          .filter(e => !e.description?.toLowerCase().includes('nómina') && !e.description?.toLowerCase().includes('nomina'))
          .reduce((s, e) => s + e.amount, 0)
        const prestamosLP = ownerLoans.reduce((s, l) => s + l.balance, 0)

        const truckBreakdowns = openEntries.map(entry => {
          const plate    = (entry as any).truck?.plate ?? ''
          const tAurumin = periodTrips.filter(t => t.truckId === entry.truckId && (t as any).route?.clientName !== 'LUIS PEÑA')
          const tLP      = periodTrips.filter(t => t.truckId === entry.truckId && (t as any).route?.clientName === 'LUIS PEÑA')
          const gAurumin = tAurumin.reduce((s, t) => s + (t.amount ?? 0), 0)
          const gLP      = tLP.reduce((s, t)      => s + (t.amount ?? 0), 0)
          const nprA     = Math.round(gAurumin * nprPct * 100) / 100
          const nprL     = Math.round(gLP      * nprPct * 100) / 100
          // Sin driverWage — AFILIADO paga sus choferes directo
          const saldoA   = Math.round((
            (entry.saldoInicial ?? 0) + gAurumin
            - (entry.commissionFee ?? 0) - (entry.mechanicFee ?? 0) - (entry.adminFee ?? 0)
            - nprA - (entry.deductions ?? 0) - (entry.abono ?? 0)
          ) * 100) / 100
          const saldoL   = Math.round((gLP - nprL) * 100) / 100
          const opExp    = (periodOpExpenses as any[]).filter((e: any) => e.truck?.plate === plate)
          const opTotal  = opExp.reduce((s: number, e: any) => s + e.amount, 0)
          const viaticos = Math.max(0, Math.round(((entry.commissionFee ?? 0) - opTotal) * 100) / 100)
          return {
            truckId: entry.truckId, plate,
            driverWage:   entry.driverWage,
            saldoInicial: entry.saldoInicial ?? 0,
            gAurumin, gLP, nprA, nprL,
            commFee:    entry.commissionFee ?? 0,
            mechFee:    entry.mechanicFee   ?? 0,
            adminFee:   entry.adminFee      ?? 0,
            deductions: entry.deductions    ?? 0,
            abono:      entry.abono         ?? 0,
            saldoA, saldoL, opExp, viaticos,
          }
        })

        const hasLP        = truckBreakdowns.some(t => t.gLP > 0)
        const totalACobrar = Math.round((
          truckBreakdowns.reduce((s, t) => s + t.saldoA, 0)
          + truckBreakdowns.reduce((s, t) => s + t.saldoL, 0)
          - (hasLP ? prestamosLP + mecRepuesto : 0)
        ) * 100) / 100

        const money = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const Row = ({ label, value, highlight, informativo }: { label: string; value: number; highlight?: boolean; informativo?: boolean }) => (
          <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/50 last:border-0">
            <span className="text-zinc-400 text-sm">{label}</span>
            <span className={`font-mono text-sm ${
              informativo ? 'text-zinc-500'
              : highlight ? 'text-white font-semibold'
              : value < 0 ? 'text-red-400' : value === 0 ? 'text-zinc-600' : 'text-zinc-300'
            }`}>
              {informativo
                ? `$${money(Math.abs(value))}`
                : value < 0 ? `− $${money(Math.abs(value))}` : `$${money(value)}`}
            </span>
          </div>
        )

        return (
          <div>
            <h2 className="text-white font-semibold text-sm mb-3">Relación del período</h2>
            <div className="space-y-3">
              {truckBreakdowns.map(tb => (
                <div key={tb.truckId} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  {/* Encabezado del camión */}
                  <div className="px-4 py-3 bg-zinc-800/40 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-white font-mono font-bold text-sm">{tb.plate}</span>
                    <span className={`font-mono font-bold text-sm ${(tb.saldoA + tb.saldoL) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(tb.saldoA + tb.saldoL) < 0
                        ? `− $${money(Math.abs(tb.saldoA + tb.saldoL))}`
                        : `$${money(tb.saldoA + tb.saldoL)}`}
                    </span>
                  </div>

                  <div className={`p-4 ${tb.gAurumin > 0 && tb.gLP > 0 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}`}>
                    {/* Aurumin */}
                    {tb.gAurumin > 0 && (
                      <div>
                        <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3">Aurumin</p>
                        {tb.saldoInicial !== 0 && <Row label="Saldo anterior" value={tb.saldoInicial} />}
                        <Row label="Facturación" value={tb.gAurumin} highlight />
                        {tb.commFee > 0 && (
                          tb.opExp.length > 0 || tb.viaticos > 0.005 ? (
                            <details className="border-b border-zinc-800/50 last:border-0">
                              <summary className="flex justify-between items-center py-1.5 cursor-pointer list-none">
                                <span className="text-zinc-400 text-sm">Gastos operativos ▾</span>
                                <span className="font-mono text-sm text-red-400">− ${money(tb.commFee)}</span>
                              </summary>
                              <div className="pl-3 pb-2 pt-0.5 space-y-1">
                                {tb.viaticos > 0.005 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-zinc-500">Viáticos</span>
                                    <span className="font-mono text-zinc-500">− ${money(tb.viaticos)}</span>
                                  </div>
                                )}
                                {tb.opExp.map((e: any) => (
                                  <div key={e.id} className="flex justify-between text-xs">
                                    <span className="text-zinc-500">{e.description}</span>
                                    <span className="font-mono text-zinc-500">− ${money(e.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : (
                            <Row label="Gastos operativos" value={-tb.commFee} />
                          )
                        )}
                        {tb.driverWage > 0 && <Row label="Nómina chofer (directo)" value={tb.driverWage} informativo />}
                        {tb.mechFee > 0 && <Row label="Mecánica" value={-tb.mechFee} />}
                        {tb.adminFee > 0 && <Row label="Administrativo" value={-tb.adminFee} />}
                        <Row label={`${owner.nprPercent}% NPR`} value={-tb.nprA} />
                        {tb.deductions > 0 && <Row label="Préstamos" value={-tb.deductions} />}
                        {tb.abono > 0 && <Row label="Abono recibido" value={-tb.abono} />}
                        <div className="flex justify-between items-center pt-2 mt-1 border-t border-zinc-700">
                          <span className="text-white font-semibold text-sm">Saldo Aurumin</span>
                          <span className={`font-mono font-bold text-lg ${tb.saldoA >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                            {tb.saldoA < 0 ? `− $${money(Math.abs(tb.saldoA))}` : `$${money(tb.saldoA)}`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Luis Peña */}
                    {tb.gLP > 0 && (
                      <div>
                        <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-3">Luis Peña (Chino Peña)</p>
                        <Row label="Facturación" value={tb.gLP} highlight />
                        <Row label={`${owner.nprPercent}% NPR`} value={-tb.nprL} />
                        <div className="flex justify-between items-center pt-2 mt-1 border-t border-zinc-700">
                          <span className="text-white font-semibold text-sm">Saldo LP</span>
                          <span className="font-mono font-bold text-lg text-blue-400">${money(tb.saldoL)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Total a cobrar */}
            <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 flex justify-between items-center">
              <span className="text-emerald-300 font-semibold text-sm">Total a cobrar este período</span>
              <span className="text-emerald-400 font-bold text-xl font-mono">${money(totalACobrar)}</span>
            </div>
          </div>
        )
      })()}

      {/* ── Desglose de gastos del período por camión ─────────────────────── */}
      {openPeriod && (() => {
        const allExp = periodAllExpenses as { id: string; date: Date; description: string; amount: number; category: string; truck: { id: string; plate: string } | null }[]
        const byTruck = new Map<string, typeof allExp>()
        for (const e of allExp) {
          if (!e.truck) continue
          const key = e.truck.plate
          if (!byTruck.has(key)) byTruck.set(key, [])
          byTruck.get(key)!.push(e)
        }

        const catLabel: Record<string, string> = {
          MECANICA: 'Mecánica', REPUESTO: 'Repuesto', ACEITE: 'Aceite',
          CAUCHO: 'Caucho', VIATICO: 'Viático', OPERATIVO: 'Operativo', OTRO: 'Otro',
        }
        const catStyle: Record<string, string> = {
          MECANICA:  'bg-orange-500/10 text-orange-400',
          REPUESTO:  'bg-blue-500/10 text-blue-400',
          ACEITE:    'bg-yellow-500/10 text-yellow-400',
          CAUCHO:    'bg-cyan-500/10 text-cyan-400',
          VIATICO:   'bg-purple-500/10 text-purple-400',
          OPERATIVO: 'bg-zinc-700 text-zinc-400',
          OTRO:      'bg-zinc-700 text-zinc-400',
        }
        const money = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

        return (
          <div>
            <h2 className="text-white font-semibold text-sm mb-3">Gastos del período por camión</h2>
            {byTruck.size === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center gap-3">
                <span className="text-zinc-600 text-2xl">📋</span>
                <div>
                  <p className="text-zinc-400 text-sm font-medium">Gastos pendientes de ingresar</p>
                  <p className="text-zinc-600 text-xs mt-0.5">El encargado aún no ha registrado los gastos de tus camiones para este período.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from(byTruck.entries()).map(([plate, expenses]) => {
                  const total = expenses.reduce((s, e) => s + e.amount, 0)
                  return (
                    <div key={plate} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-white font-mono font-bold text-sm">{plate}</span>
                        <span className="text-red-400 font-semibold text-sm font-mono">− ${money(total)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="text-left text-zinc-500 font-medium px-4 py-2">Fecha</th>
                              <th className="text-left text-zinc-500 font-medium px-4 py-2">Categoría</th>
                              <th className="text-left text-zinc-500 font-medium px-4 py-2">Descripción</th>
                              <th className="text-right text-zinc-500 font-medium px-4 py-2">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expenses.map(e => (
                              <tr key={e.id} className="border-b border-zinc-800/40 last:border-0">
                                <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">{fmt(e.date)}</td>
                                <td className="px-4 py-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${catStyle[e.category] ?? 'bg-zinc-700 text-zinc-400'}`}>
                                    {catLabel[e.category] ?? e.category}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-zinc-300">{e.description}</td>
                                <td className="px-4 py-2 text-right text-zinc-400 font-mono">${money(e.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-zinc-700">
                              <td colSpan={3} className="px-4 py-2.5 text-zinc-500 font-medium">Total gastos</td>
                              <td className="px-4 py-2.5 text-right text-red-400 font-bold font-mono">${money(total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

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
                      <p className="text-white font-semibold">
                        {truckTripCounts ? (truckTripCounts[truck.id] ?? 0) : truck._count.trips}
                      </p>
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
