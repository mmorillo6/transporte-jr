import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardCharts from './DashboardCharts'
import AfiliadoDashboard from './AfiliadoDashboard'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

async function getStats() {
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  // ── Datos básicos ─────────────────────────────────────────────────────────
  const [totalTrucks, activeTrucks, openAlerts, truckStatuses, openPeriod, cashEntries, loans, cuentasPorCobrar, recentClosedPeriods, pendingTasksConfig] = await Promise.all([
    prisma.truck.count(),
    prisma.truck.count({ where: { active: true } }),
    prisma.maintenanceAlert.count({ where: { status: 'PENDING' } }),
    prisma.truckStatus.findMany({
      include: { truck: { select: { plate: true, driver: { select: { name: true } } } } },
    }),
    prisma.period.findFirst({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } }),
    prisma.cashEntry.findMany({ orderBy: { date: 'desc' }, take: 200 }),
    prisma.loan.findMany({ where: { balance: { gt: 0 } } }),
    prisma.cuentaPorCobrar.findMany({
      where: { status: { not: 'PAID' } },
      orderBy: { date: 'desc' },
    }),
    prisma.period.findMany({
      where: { status: 'CLOSED' },
      orderBy: { endDate: 'desc' },
      take: 6,
      select: { id: true, startDate: true, endDate: true },
    }),
    prisma.systemConfig.findUnique({ where: { key: 'pendingTasks' } }),
  ])

  type PendingTask = { id: string; truck: string; label: string; detail: string }
  const pendingTasks: PendingTask[] = pendingTasksConfig
    ? (() => { try { return JSON.parse(pendingTasksConfig.value) } catch { return [] } })()
    : []

  // ── Caja ─────────────────────────────────────────────────────────────────
  let balanceEfectivo = 0, balanceUsdt = 0
  for (const e of cashEntries) {
    const sign = e.type === 'INGRESO' ? 1 : -1
    if (e.currency === 'EFECTIVO') balanceEfectivo += sign * e.amount
    else balanceUsdt += sign * e.amount
  }

  // ── Préstamos pendientes ──────────────────────────────────────────────────
  const totalLoans = loans.reduce((s, l) => s + l.balance, 0)

  // ── Período actual: nómina generada ──────────────────────────────────────
  let periodPayroll: {
    grossAmount: number; driverWage: number; nprFee: number
    mechanicFee: number; adminFee: number; commissionFee: number
    deductions: number; netAmount: number; totalTons: number
    paidCount: number; totalCount: number
  } | null = null

  let periodTrips: { route: { name: string; clientName?: string }; amount: number; netWeightKg: number | null }[] = []
  let recentTrips: {
    id: string; date: Date; amount: number; netWeightKg: number | null
    truck: { plate: string; driver: { name: string } | null }
    route: { name: string; clientName?: string }
  }[] = []

  if (openPeriod) {
    const [entries, trips] = await Promise.all([
      prisma.payrollEntry.findMany({ where: { periodId: openPeriod.id } }),
      prisma.trip.findMany({
        where: { periodId: openPeriod.id },
        include: {
          truck: { select: { plate: true, driver: { select: { name: true } } } },
          route: { select: { name: true, clientName: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ])

    periodTrips = trips
    recentTrips = trips.slice(0, 6)

    if (entries.length > 0) {
      periodPayroll = {
        grossAmount:  entries.reduce((s, e) => s + e.grossAmount,  0),
        driverWage:   entries.reduce((s, e) => s + e.driverWage,   0),
        nprFee:       entries.reduce((s, e) => s + (e.nprFee ?? 0), 0),
        mechanicFee:  entries.reduce((s, e) => s + (e.mechanicFee ?? 0), 0),
        adminFee:     entries.reduce((s, e) => s + (e.adminFee ?? 0), 0),
        commissionFee:entries.reduce((s, e) => s + e.commissionFee, 0),
        deductions:   entries.reduce((s, e) => s + e.deductions,   0),
        netAmount:    entries.reduce((s, e) => s + e.netAmount,     0),
        totalTons:    entries.reduce((s, e) => s + e.totalTons,     0),
        paidCount:    entries.filter(e => e.paidAt).length,
        totalCount:   entries.length,
      }
    }
  } else {
    // sin período abierto: últimos viajes globales
    recentTrips = await prisma.trip.findMany({
      take: 6,
      orderBy: { date: 'desc' },
      include: {
        truck: { select: { plate: true, driver: { select: { name: true } } } },
        route: { select: { name: true } },
      },
    })
  }

  // ── Toneladas por ruta (período actual) ───────────────────────────────────
  const tonsByRoute = new Map<string, number>()
  for (const t of periodTrips) {
    const key = t.route.name
    tonsByRoute.set(key, (tonsByRoute.get(key) ?? 0) + (t.netWeightKg ?? 0) / 1000)
  }
  const routeData = Array.from(tonsByRoute.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, tons]) => ({ name: name.split(' ')[0], tons: Math.round(tons * 100) / 100 }))

  // ── Facturación del período por cliente (Aurumin / Chino Peña) ───────────────
  const clientPeriodStats = new Map<string, { trips: number; tons: number; amount: number }>()
  for (const t of periodTrips) {
    const client = t.route.clientName || 'AURUMIN'
    const ex = clientPeriodStats.get(client) ?? { trips: 0, tons: 0, amount: 0 }
    clientPeriodStats.set(client, {
      trips:  ex.trips + 1,
      tons:   ex.tons + (t.netWeightKg ?? 0) / 1000,
      amount: ex.amount + t.amount,
    })
  }

  // Sumar DiasInternosEntry al total de Aurumin (no están en trip.amount)
  if (openPeriod) {
    const [diasRoute, diasEntries] = await Promise.all([
      prisma.route.findFirst({ where: { name: { contains: 'DIAS INTERNOS' }, clientName: 'AURUMIN' }, select: { rate: true } }),
      prisma.diasInternosEntry.findMany({
        where: { fecha: { gte: openPeriod.startDate, lte: openPeriod.endDate } },
        select: { totalHoras: true },
      }),
    ])
    const diasRate  = diasRoute?.rate ?? 20
    const diasTotal = Math.round(diasEntries.reduce((s, e) => s + e.totalHoras, 0) * diasRate * 100) / 100
    if (diasTotal > 0) {
      const ex = clientPeriodStats.get('AURUMIN') ?? { trips: 0, tons: 0, amount: 0 }
      clientPeriodStats.set('AURUMIN', { ...ex, amount: ex.amount + diasTotal })
    }
  }

  // ── Tendencia últimos 6 meses (por período) ────────────────────────────────
  const allPeriods = await prisma.period.findMany({
    where: { startDate: { gte: sixMonthsAgo } },
    include: { payroll: true },
    orderBy: { startDate: 'asc' },
  })
  const monthlyData = allPeriods.map(p => {
    const gross = p.payroll.reduce((s, e) => s + e.grossAmount, 0)
    const net   = p.payroll.reduce((s, e) => s + e.netAmount, 0)
    const label = `${new Date(p.startDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}`
    return { month: label, revenue: Math.round(gross * 100) / 100, net: Math.round(net * 100) / 100, trips: p.payroll.length }
  })

  // ── Top camiones por viajes (período actual) ─────────────────────────────
  let topTrucks: { plate: string; driver: string; trips: number; tons: number }[] = []
  if (openPeriod) {
    const grouped = await prisma.trip.groupBy({
      by: ['truckId'],
      where: { periodId: openPeriod.id },
      _count: { id: true },
      _sum: { netWeightKg: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })
    const topIds = grouped.map(g => g.truckId)
    const topTruckData = await prisma.truck.findMany({
      where: { id: { in: topIds } },
      select: { id: true, plate: true, driver: { select: { name: true } } },
    })
    const truckById = new Map(topTruckData.map(t => [t.id, t]))
    topTrucks = grouped.map(g => ({
      plate:  truckById.get(g.truckId)?.plate ?? '—',
      driver: truckById.get(g.truckId)?.driver?.name ?? '—',
      trips:  g._count.id,
      tons:   (g._sum.netWeightKg ?? 0) / 1000,
    }))
  }

  // Fleet status counts
  const fleetCounts = {
    operational:  truckStatuses.filter(t => t.status === 'OPERATIONAL').length,
    inShop:       truckStatuses.filter(t => t.status === 'IN_SHOP').length,
    outOfService: truckStatuses.filter(t => t.status === 'OUT_OF_SERVICE').length,
  }
  const nonOperational = truckStatuses.filter(t => t.status !== 'OPERATIONAL')

  // Cuentas por cobrar por empresa
  const cxcByClient = new Map<string, number>()
  for (const c of cuentasPorCobrar) {
    cxcByClient.set(c.clientName, (cxcByClient.get(c.clientName) ?? 0) + c.balance)
  }
  const totalPorCobrar = Array.from(cxcByClient.values()).reduce((s, v) => s + v, 0)

  // Períodos cerrados sin CxC registrada — alerta para Fernando
  // Un período "sin CxC" es aquel que tiene viajes pero ninguna CxC con fecha dentro de su rango
  const allCxcDates = (await prisma.cuentaPorCobrar.findMany({ select: { date: true } })).map(c => c.date)
  const periodsSinCxC = recentClosedPeriods.filter(p => {
    const start = new Date(p.startDate).getTime()
    const end   = new Date(p.endDate).getTime()
    return !allCxcDates.some(d => d.getTime() >= start && d.getTime() <= end)
  })

  // Camiones de José en el período actual (para su cuenta personal)
  const joseOwner = await prisma.owner.findFirst({ where: { id: 'owner-jose' } })
  let joseTrucksPayroll: {
    plate: string; driverName: string; grossAmount: number; netAmount: number; nprFee: number
  }[] = []
  if (openPeriod && joseOwner) {
    const entries = await prisma.payrollEntry.findMany({
      where: { periodId: openPeriod.id, truck: { ownerId: joseOwner.id } },
      include: { truck: { include: { driver: { select: { name: true } } } } },
    })
    joseTrucksPayroll = entries.map(e => ({
      plate:       e.truck.plate,
      driverName:  e.truck.driver?.name ?? '—',
      grossAmount: e.grossAmount,
      netAmount:   e.netAmount,
      nprFee:      e.nprFee,
    }))
  }

  // Alerta: sin período abierto hace más de 2 días
  let lastClosedEndDate: Date | null = null
  if (!openPeriod) {
    const last = await prisma.period.findFirst({
      where: { status: 'CLOSED' },
      orderBy: { endDate: 'desc' },
      select: { endDate: true },
    })
    lastClosedEndDate = last?.endDate ?? null
  }
  const needsNewPeriod = !openPeriod && lastClosedEndDate !== null &&
    (Date.now() - new Date(lastClosedEndDate).getTime()) > 2 * 24 * 60 * 60 * 1000

  return {
    totalTrucks, activeTrucks, openAlerts, openPeriod,
    balanceEfectivo, balanceUsdt, totalLoans,
    periodPayroll, routeData, monthlyData,
    recentTrips, nonOperational, fleetCounts,
    periodTripCount: periodTrips.length,
    topTrucks,
    cxcByClient, totalPorCobrar,
    joseTrucksPayroll,
    clientPeriodStats,
    periodsSinCxC,
    needsNewPeriod,
    lastClosedEndDate,
    pendingTasks,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  if (session.role === 'AFILIADO') {
    return <AfiliadoDashboard userId={session.userId} name={session.name} />
  }

  const stats = await getStats()
  const showFinancials = ['DUENO', 'ENCARGADO'].includes(session.role)
  const p = stats.periodPayroll

  // Ganancia empresa = lo que queda después de pagar a todos
  // grossAmount - lo que pagamos directo - neto a propietarios
  // = nprFee (NPR que queda en la empresa)
  // Para el dashboard usamos una aproximación útil:
  // gross - driverWage - mechanicFee - adminFee - commissionFee - netAmount_propietarios
  const gananciaEmpresa = p
    ? p.grossAmount - p.driverWage - p.mechanicFee - p.adminFee - p.commissionFee - p.deductions - Math.max(0, p.netAmount)
    : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {session.name.split(' ')[0]}</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {stats.openPeriod && (
          <Link href="/nomina"
            className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl px-3 py-2 hover:bg-amber-500/20 transition-colors">
            Período {new Date(stats.openPeriod.startDate).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',timeZone:'UTC'})}
            {' — '}
            {new Date(stats.openPeriod.endDate).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'})}
            {' → Ver nómina'}
          </Link>
        )}
      </div>

      {/* ── Alerta: períodos cerrados sin CxC ───────────────────────────────── */}
      {showFinancials && stats.periodsSinCxC.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-red-400 font-semibold text-sm">
              {stats.periodsSinCxC.length === 1
                ? 'Hay 1 período cerrado sin Cuenta por Cobrar registrada'
                : `Hay ${stats.periodsSinCxC.length} períodos cerrados sin Cuenta por Cobrar registrada`}
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              {stats.periodsSinCxC.map(p =>
                `${new Date(p.startDate).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',timeZone:'UTC'})} al ${new Date(p.endDate).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'})}`
              ).join(' · ')}
            </p>
            <p className="text-zinc-600 text-xs mt-1">El "Por Cobrar" del dashboard no refleja estos períodos hasta que se registren en Cuentas por Cobrar.</p>
          </div>
          <Link href="/cuentas-por-cobrar"
            className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-medium rounded-xl px-3 py-2 transition-colors flex-shrink-0 whitespace-nowrap">
            Registrar CxC →
          </Link>
        </div>
      )}

      {/* ── Alerta: no hay período abierto ─────────────────────────────────── */}
      {showFinancials && stats.needsNewPeriod && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-amber-400 font-semibold text-sm">No hay período abierto</p>
            <p className="text-zinc-500 text-xs mt-1">
              El último período cerró el{' '}
              {new Date(stats.lastClosedEndDate!).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}{' '}
              y no se ha abierto uno nuevo.
            </p>
          </div>
          <Link
            href="/nomina"
            className="text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-medium rounded-xl px-3 py-2 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            Abrir período →
          </Link>
        </div>
      )}

      {/* ── Alerta: tareas pendientes de datos ──────────────────────────────── */}
      {showFinancials && stats.pendingTasks.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-blue-400 text-lg flex-shrink-0">📋</span>
          <div className="flex-1">
            <p className="text-blue-400 font-semibold text-sm mb-2">
              {stats.pendingTasks.length === 1
                ? 'Hay 1 dato pendiente de ingresar'
                : `Hay ${stats.pendingTasks.length} datos pendientes de ingresar`}
            </p>
            <ul className="space-y-2">
              {stats.pendingTasks.map(task => (
                <li key={task.id} className="flex items-start gap-2">
                  <span className="text-blue-500 text-xs mt-0.5 flex-shrink-0">•</span>
                  <div>
                    <p className="text-zinc-300 text-xs font-medium">{task.label}</p>
                    <p className="text-zinc-500 text-xs">{task.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/caja"
            className="text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 font-medium rounded-xl px-3 py-2 transition-colors flex-shrink-0 whitespace-nowrap">
            Ir a Finanzas →
          </Link>
        </div>
      )}

      {/* ── Por cobrar — banner destacado ───────────────────────────────────── */}
      {showFinancials && stats.totalPorCobrar > 0 && (
        <div className="bg-zinc-900 border border-amber-500/25 rounded-2xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-1">Por cobrar</p>
              <p className="text-3xl font-extrabold text-amber-400">${stats.totalPorCobrar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="flex gap-4 mt-2 flex-wrap">
                {Array.from(stats.cxcByClient.entries()).map(([client, balance]) => (
                  <span key={client} className="text-xs text-zinc-400">
                    <span className="text-zinc-500">{client === 'AURUMIN' ? 'Aurumin' : 'Chino Peña'}: </span>
                    <span className="text-white font-semibold">${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </span>
                ))}
              </div>
            </div>
            <Link href="/cuentas-por-cobrar"
              className="flex items-center gap-2 text-sm bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-medium rounded-xl px-4 py-2.5 transition-colors flex-shrink-0">
              Ver detalle →
            </Link>
          </div>
        </div>
      )}

      {/* ── Por empresa: Aurumin vs Chino Peña ─────────────────────────────── */}
      {showFinancials && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(['AURUMIN', 'LUIS PEÑA'] as const).map(client => {
            const period = stats.clientPeriodStats.get(client) ?? { trips: 0, tons: 0, amount: 0 }
            // cuentas por cobrar pueden estar guardadas con el nombre largo
            const cobrar = stats.cxcByClient.get(client)
              ?? stats.cxcByClient.get('CHINO PEÑA (LUIS PEÑA)')
              ?? 0
            const label  = client === 'AURUMIN' ? 'Aurumin' : 'Chino Peña (Luis Peña)'
            const isAurumin = client === 'AURUMIN'
            return (
              <div key={client} className={`bg-zinc-900 border rounded-2xl p-5 ${isAurumin ? 'border-amber-500/25' : 'border-blue-500/20'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${isAurumin ? 'text-amber-500' : 'text-blue-400'}`}>
                  {label}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Facturado este período</p>
                    <p className={`text-2xl font-bold ${isAurumin ? 'text-amber-400' : 'text-blue-400'}`}>
                      ${period.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-zinc-600 text-xs mt-1">{period.trips} viajes · {period.tons.toFixed(1)} ton</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Pendiente por cobrar</p>
                    <p className="text-2xl font-bold text-white">
                      ${cobrar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <Link href="/cuentas-por-cobrar" className="text-xs text-zinc-600 hover:text-zinc-400 mt-1 block transition-colors">
                      Ver estado de cuenta →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Fila 1: KPIs principales ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Flota */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs font-medium mb-2">Flota activa</p>
          <p className="text-3xl font-bold text-amber-400">{stats.activeTrucks}</p>
          <div className="flex gap-2 mt-2">
            {stats.fleetCounts.inShop > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                {stats.fleetCounts.inShop} taller
              </span>
            )}
            {stats.fleetCounts.outOfService > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                {stats.fleetCounts.outOfService} f.servicio
              </span>
            )}
            {stats.fleetCounts.inShop === 0 && stats.fleetCounts.outOfService === 0 && (
              <span className="text-[10px] text-zinc-600">de {stats.totalTrucks} total</span>
            )}
          </div>
        </div>

        {/* Viajes período */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs font-medium mb-2">Viajes este período</p>
          <p className="text-3xl font-bold text-blue-400">{stats.periodTripCount}</p>
          <p className="text-zinc-600 text-xs mt-2">{p ? `${p.totalTons.toFixed(1)} ton` : 'sin nómina aún'}</p>
        </div>

        {showFinancials && (
          <>
            {/* Facturación período */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs font-medium mb-2">Facturación período</p>
              <p className="text-3xl font-bold text-emerald-400">
                ${p ? p.grossAmount.toFixed(0) : '0'}
              </p>
              <p className="text-zinc-600 text-xs mt-2">
                {p ? `${p.paidCount}/${p.totalCount} camiones pagados` : 'genera la nómina'}
              </p>
            </div>

            {/* Ganancia empresa */}
            <div className={`rounded-2xl p-4 border ${gananciaEmpresa >= 0 ? 'bg-zinc-900 border-zinc-800' : 'bg-red-500/5 border-red-500/20'}`}>
              <p className="text-zinc-500 text-xs font-medium mb-2">Ganancia empresa</p>
              <p className={`text-3xl font-bold ${gananciaEmpresa >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                ${p ? Math.abs(gananciaEmpresa).toFixed(0) : '0'}
              </p>
              <p className="text-zinc-600 text-xs mt-2">después de pagar flota</p>
            </div>
          </>
        )}
      </div>

      {/* ── Fila 2: Caja + Préstamos + Alertas ─────────────────────────────── */}
      {showFinancials && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs font-medium mb-2">Caja — Efectivo</p>
            <p className={`text-2xl font-bold ${stats.balanceEfectivo >= 0 ? 'text-white' : 'text-red-400'}`}>
              ${stats.balanceEfectivo.toFixed(2)}
            </p>
            <Link href="/caja" className="text-zinc-600 hover:text-amber-400 text-xs mt-1 block transition-colors">Ver caja →</Link>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs font-medium mb-2">Caja — USDT</p>
            <p className="text-2xl font-bold text-teal-400">${stats.balanceUsdt.toFixed(2)}</p>
            <Link href="/caja" className="text-zinc-600 hover:text-amber-400 text-xs mt-1 block transition-colors">Ver caja →</Link>
          </div>
          <div className={`rounded-2xl p-4 border ${stats.totalLoans > 0 ? 'bg-orange-500/5 border-orange-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
            <p className="text-zinc-500 text-xs font-medium mb-2">Préstamos pendientes</p>
            <p className={`text-2xl font-bold ${stats.totalLoans > 0 ? 'text-orange-400' : 'text-zinc-400'}`}>
              ${stats.totalLoans.toFixed(2)}
            </p>
            <Link href="/prestamos" className="text-zinc-600 hover:text-amber-400 text-xs mt-1 block transition-colors">Ver préstamos →</Link>
          </div>
          <div className={`rounded-2xl p-4 border ${stats.openAlerts > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
            <p className="text-zinc-500 text-xs font-medium mb-2">Alertas mantenimiento</p>
            <p className={`text-2xl font-bold ${stats.openAlerts > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {stats.openAlerts}
            </p>
            <Link href="/mantenimiento" className="text-zinc-600 hover:text-amber-400 text-xs mt-1 block transition-colors">Ver alertas →</Link>
          </div>
        </div>
      )}

      {/* ── Fila 3: Desglose período + Toneladas por ruta ───────────────────── */}
      {showFinancials && p && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Desglose costos período */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-white font-semibold text-sm mb-4">Desglose del período actual</h2>
            <div className="space-y-2.5">
              {[
                { label: 'Facturación bruta',    value: p.grossAmount,   color: 'text-emerald-400', sign: '+' },
                { label: 'Sueldos choferes',      value: p.driverWage,    color: 'text-orange-400',  sign: '−' },
                { label: 'Mecánicos',             value: p.mechanicFee,   color: 'text-purple-400',  sign: '−' },
                { label: 'Administrativo',        value: p.adminFee,      color: 'text-zinc-400',    sign: '−' },
                { label: 'Gastos operativos',     value: p.commissionFee, color: 'text-red-400',     sign: '−' },
                { label: 'Neto a propietarios',   value: Math.max(0, p.netAmount), color: 'text-amber-400', sign: '−' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold w-4 text-right ${row.color}`}>{row.sign}</span>
                    <span className="text-zinc-400 text-sm">{row.label}</span>
                  </div>
                  <span className={`font-semibold text-sm ${row.color}`}>${row.value.toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-zinc-700 pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold text-sm">Ganancia empresa</span>
                  <span className={`font-bold text-lg ${gananciaEmpresa >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                    ${gananciaEmpresa.toFixed(2)}
                  </span>
                </div>
                <p className="text-zinc-600 text-xs mt-0.5">incl. {p.nprFee.toFixed(2)} NPR retenido</p>
              </div>
            </div>
          </div>

          {/* Toneladas por ruta */}
          {stats.routeData.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold text-sm mb-4">Toneladas por ruta — período actual</h2>
              <DashboardCharts data={[]} showFinancials={false} routeData={stats.routeData} mode="routes" />
            </div>
          )}
        </div>
      )}

      {/* ── Cuenta de José (sus camiones este período) ──────────────────────── */}
      {showFinancials && stats.joseTrucksPayroll.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold text-sm">Cuenta — José Rodríguez</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Sus camiones en el período actual · neto = lo que le queda a él</p>
            </div>
            <Link href="/reportes"
              className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-lg px-3 py-1.5 transition-colors">
              Descargar completo →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/30">
                  <th className="text-left text-zinc-500 font-medium px-4 py-2.5 text-xs">Placa</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-2.5 text-xs">Chofer</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Bruto</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">5% NPR</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Neto</th>
                </tr>
              </thead>
              <tbody>
                {stats.joseTrucksPayroll.map((e, i) => (
                  <tr key={e.plate} className={`border-b border-zinc-800/40 ${i % 2 === 1 ? 'bg-zinc-800/10' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-white font-medium text-sm">{e.plate}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{e.driverName}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 text-xs">${e.grossAmount.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">${e.nprFee.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold text-sm ${e.netAmount < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      ${e.netAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-800/30">
                  <td colSpan={2} className="px-4 py-2.5 text-white font-semibold text-xs">Total</td>
                  <td className="px-4 py-2.5 text-right text-zinc-300 font-semibold text-xs">
                    ${stats.joseTrucksPayroll.reduce((s, e) => s + e.grossAmount, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 font-semibold text-xs">
                    ${stats.joseTrucksPayroll.reduce((s, e) => s + e.nprFee, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-400">
                    ${stats.joseTrucksPayroll.reduce((s, e) => s + e.netAmount, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Tendencia por período ────────────────────────────────────────────── */}
      {stats.monthlyData.length > 0 && showFinancials && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Tendencia — últimos períodos</h2>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Facturado al cliente
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="w-3 h-3 rounded-sm bg-violet-500 inline-block" /> Neto propietarios
              </span>
            </div>
          </div>
          <DashboardCharts data={stats.monthlyData} showFinancials={showFinancials} mode="periods" />
          <p className="text-zinc-600 text-xs mt-2 text-center">
            La diferencia entre ambas barras es la ganancia de la empresa (NPR + margen)
          </p>
        </div>
      )}

      {/* ── Fila final: Últimos viajes + Top camiones + Estado flota ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Últimos viajes */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Últimos viajes</h2>
            <Link href="/viajes" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">Ver todos →</Link>
          </div>
          {stats.recentTrips.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No hay viajes registrados</p>
          ) : (
            <div className="space-y-0">
              {stats.recentTrips.map(trip => (
                <div key={trip.id} className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
                  <div>
                    <p className="text-white text-sm font-mono font-medium">{trip.truck.plate}</p>
                    <p className="text-zinc-500 text-xs">
                      {trip.route.name} · {new Date(trip.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    {showFinancials && <p className="text-amber-400 text-sm font-semibold">${trip.amount.toFixed(2)}</p>}
                    {trip.netWeightKg && (
                      <p className="text-zinc-500 text-xs">{(trip.netWeightKg / 1000).toFixed(2)} ton</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top camiones este período */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Más activos este período</h2>
            <Link href="/camiones" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">Ver flota →</Link>
          </div>
          {stats.topTrucks.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Sin viajes en el período</p>
          ) : (
            <div className="space-y-2">
              {stats.topTrucks.map((t, i) => (
                <div key={t.plate} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-amber-500 text-zinc-950' :
                    i === 1 ? 'bg-zinc-600 text-white' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm font-mono font-medium">{t.plate}</p>
                      <p className="text-amber-400 text-xs font-semibold">{t.trips} viajes</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-zinc-500 text-xs truncate">{t.driver}</p>
                      <p className="text-zinc-600 text-xs">{t.tons.toFixed(1)} t</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado de la flota */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Estado de la flota</h2>
            <Link href="/mantenimiento" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">Mantenimiento →</Link>
          </div>
          {stats.nonOperational.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-emerald-400 text-sm font-medium">Toda la flota operativa</p>
              <p className="text-zinc-600 text-xs">{stats.activeTrucks} camiones activos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.nonOperational.map(ts => (
                <div key={ts.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${
                  ts.status === 'IN_SHOP'
                    ? 'bg-amber-500/5 border-amber-500/15'
                    : 'bg-red-500/5 border-red-500/15'
                }`}>
                  <div>
                    <p className="text-white text-sm font-mono font-medium">{ts.truck.plate}</p>
                    {ts.truck.driver && <p className="text-zinc-500 text-xs">{ts.truck.driver.name}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    ts.status === 'IN_SHOP' ? 'text-amber-400 bg-amber-400/10' : 'text-red-400 bg-red-400/10'
                  }`}>
                    {ts.status === 'IN_SHOP' ? 'En taller' : 'Fuera de servicio'}
                  </span>
                </div>
              ))}
              <p className="text-zinc-600 text-xs pt-1">
                {stats.activeTrucks - stats.nonOperational.length} operativos de {stats.activeTrucks}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
