import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PeriodActions from './PeriodActions'
import NotifyButton from './NotifyButton'
import PayrollTableClient from './PayrollTableClient'
import { getTotalAlmacenPendiente } from '@/app/actions/almacen'
import GastosMasivosClient from './GastosMasivosClient'
import GastosComunesClient from './GastosComunesClient'
import GastosGeneralesClient from './GastosGeneralesClient'

async function getPeriodData(periodId: string, role: string, ownerId: string | null) {
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: {
      trips: {
        include: {
          truck: {
            include: {
              driver: { select: { name: true } },
              owner: { select: { id: true, name: true, type: true, nprPercent: true } },
            },
          },
          route: { select: { name: true, rateType: true, driverWage: true, clientName: true } },
        },
        orderBy: { date: 'asc' },
      },
      payroll: true,
    },
  })

  if (!period) return null

  // Fetch truck details for payroll entries (truckId is a plain string, no FK)
  const truckIds = [...new Set(period.payroll.map(e => e.truckId))]
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: {
      driver: { select: { name: true } },
      owner: { select: { id: true, name: true, type: true, nprPercent: true } },
    },
  })
  const truckMap = Object.fromEntries(trucks.map(t => [t.id, t]))

  // Attach truck to each payroll entry
  const payrollWithTruck = period.payroll.map(e => ({
    ...e,
    truck: truckMap[e.truckId] ?? null,
  }))

  // For AFILIADO: filter to only show their trucks
  let filteredPayroll = payrollWithTruck
  let filteredTrips = period.trips
  if (role === 'AFILIADO' && ownerId) {
    filteredPayroll = payrollWithTruck.filter(e => e.truck?.owner?.id === ownerId)
    filteredTrips = period.trips.filter(t => t.truck?.owner?.id === ownerId)
  }

  return { ...period, payroll: filteredPayroll, trips: filteredTrips }
}

function formatDate(d: Date | string) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { periodId } = await params

  // For AFILIADO: resolve their owner ID so data is filtered to their trucks
  let ownerId: string | null = null
  if (session.role === 'AFILIADO') {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { ownerId: true },
    })
    ownerId = user?.ownerId ?? null
  }

  const [period, totalAlmacenPendiente, loansData, cxcAurumin, cxcLuisPena, mecanicoExpensesCount, gastosGeneralesCount, gastosComunesCount] = await Promise.all([
    getPeriodData(periodId, session.role, ownerId),
    getTotalAlmacenPendiente(),
    prisma.loan.findMany({ where: { balance: { gt: 0 } }, select: { balance: true } }),
    // CxC abiertas de Aurumin (deuda acumulada entre períodos)
    prisma.cuentaPorCobrar.findMany({
      where: { clientName: 'AURUMIN', status: { not: 'PAID' } },
      include: { payments: { select: { amount: true, date: true }, orderBy: { date: 'desc' } } },
      orderBy: { date: 'asc' },
    }),
    // CxC abiertas de Luis Peña (ambos nombres posibles)
    prisma.cuentaPorCobrar.findMany({
      where: { clientName: { in: ['LUIS PEÑA', 'CHINO PEÑA (LUIS PEÑA)'] }, status: { not: 'PAID' } },
      include: { payments: { select: { amount: true, date: true }, orderBy: { date: 'desc' } } },
      orderBy: { date: 'asc' },
    }),
    // Gastos de mecánicos ingresados para este período
    prisma.expense.count({ where: { periodId, category: 'MECANICA' } }),
    // Gastos generales (sin camión) del período
    prisma.expense.count({ where: { periodId, truckId: null } }),
    // Gastos comunes aplicados a camiones (Starlink, etc.)
    prisma.expense.count({ where: { periodId, truckId: { not: null } } }),
  ])
  if (!period) notFound()

  const payroll = period.payroll as any[]
  const trips = period.trips

  // Summary totals
  const totalGross = payroll.reduce((s, e) => s + e.grossAmount, 0)
  const totalViaticos = payroll.reduce((s, e) => s + e.viaticos, 0)
  const totalDriverWage = payroll.reduce((s, e) => s + e.driverWage, 0)
  const totalCommission = payroll.reduce((s, e) => s + e.commissionFee, 0)
  const totalNprFee = payroll.reduce((s, e) => s + (e.nprFee ?? 0), 0)
  const totalMechanicFee = payroll.reduce((s, e) => s + (e.mechanicFee ?? 0), 0)
  const totalAdminFee = payroll.reduce((s, e) => s + (e.adminFee ?? 0), 0)
  const totalDeductions = payroll.reduce((s, e) => s + e.deductions, 0)
  const totalSaldoInicial = payroll.reduce((s, e) => s + (e.saldoInicial ?? 0), 0)
  const totalAbono = payroll.reduce((s, e) => s + (e.abono ?? 0), 0)
  const totalNet = payroll.reduce((s, e) => s + e.netAmount, 0)
  const totalTons = payroll.reduce((s, e) => s + e.totalTons, 0)

  // Facturación bruta separada por cliente (desde los viajes, con route.clientName)
  const tripsAurumin  = trips.filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
  const tripsLuisPena = trips.filter(t => (t.route as any)?.clientName === 'LUIS PEÑA')
  const grossAurumin  = tripsAurumin.reduce((s, t) => s + t.amount, 0)
  const grossLuisPena = tripsLuisPena.reduce((s, t) => s + t.amount, 0)
  const tonsAurumin   = tripsAurumin.reduce((s, t)  => s + (t.netWeightKg ?? 0), 0) / 1000
  const tonsLuisPena  = tripsLuisPena.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000

  // ── CxC: separar "este período" de "acumulado" ──────────────────────────────
  // Una CxC pertenece "a este período" si su date cae dentro de [startDate, endDate]
  const isThisPeriod = (c: { date: Date }) =>
    c.date >= period.startDate && c.date <= period.endDate

  const cxcAuruminThisPeriod = cxcAurumin.filter(isThisPeriod)
  const cxcAuruminPrev       = cxcAurumin.filter(c => !isThisPeriod(c))
  const cxcLuisPenaThisPeriod= cxcLuisPena.filter(isThisPeriod)
  const cxcLuisPenaPrev      = cxcLuisPena.filter(c => !isThisPeriod(c))

  // Saldo acumulado = suma de balances de CxC de períodos anteriores
  const acumuladoAurumin   = cxcAuruminPrev.reduce((s, c) => s + c.balance, 0)
  const acumuladoLuisPena  = cxcLuisPenaPrev.reduce((s, c) => s + c.balance, 0)

  // CxC de este período (si ya fue registrada)
  const cxcActualAurumin   = cxcAuruminThisPeriod[0] ?? null
  const cxcActualLuisPena  = cxcLuisPenaThisPeriod[0] ?? null

  // Subtotales (facturado + acumulado)
  const subtotalAurumin  = grossAurumin  + acumuladoAurumin
  const subtotalLuisPena = grossLuisPena + acumuladoLuisPena

  // Abonos recibidos en la CxC de este período
  const abonosAurumin  = cxcActualAurumin  ? cxcActualAurumin.amountPaid  : 0
  const abonosLuisPena = cxcActualLuisPena ? cxcActualLuisPena.amountPaid : 0

  // Saldo total: todo lo pendiente de cobrar (incluye previos)
  const saldoTotalAurumin  = cxcAurumin.reduce((s, c)  => s + c.balance, 0)
  const saldoTotalLuisPena = cxcLuisPena.reduce((s, c) => s + c.balance, 0)

  // Cálculo Aurumin — neto a cobrar (carros positivos menos préstamos y almacén)
  const totalLoansPendientes = loansData.reduce((s, l) => s + l.balance, 0)
  const sumPositivos = payroll.filter(e => e.netAmount > 0).reduce((s, e) => s + e.netAmount, 0)
  const sumNegativos = payroll.filter(e => e.netAmount < 0).reduce((s, e) => s + e.netAmount, 0)
  const auruminDebe = sumPositivos - totalLoansPendientes - totalAlmacenPendiente

  // Group trips by truck for detail view
  const tripsByTruck = new Map<string, typeof trips>()
  for (const trip of trips) {
    const existing = tripsByTruck.get(trip.truckId) ?? []
    existing.push(trip)
    tripsByTruck.set(trip.truckId, existing)
  }

  // Nómina de choferes: agrupar por conductor, calcular sueldo y desglose por camión
  type ConductorEntry = {
    conductor: string
    totalTrips: number
    totalWage: number
    byTruck: { plate: string; trips: number; wage: number }[]
  }
  const conductorMap = new Map<string, { totalTrips: number; totalWage: number; byTruck: Map<string, { plate: string; trips: number; wage: number }> }>()
  for (const trip of trips) {
    const name = (trip as any).conductor?.trim() || trip.truck?.driver?.name || '—'
    if (!conductorMap.has(name)) conductorMap.set(name, { totalTrips: 0, totalWage: 0, byTruck: new Map() })
    const ce = conductorMap.get(name)!
    const wage = (trip.route as any).driverWage ?? 0
    ce.totalTrips++
    ce.totalWage += wage
    const plate = trip.truck?.plate ?? '—'
    if (!ce.byTruck.has(plate)) ce.byTruck.set(plate, { plate, trips: 0, wage: 0 })
    const bt = ce.byTruck.get(plate)!
    bt.trips++
    bt.wage += wage
  }
  const nominaChoferes: ConductorEntry[] = Array.from(conductorMap.entries())
    .map(([conductor, data]) => ({
      conductor,
      totalTrips: data.totalTrips,
      totalWage: Math.round(data.totalWage * 100) / 100,
      byTruck: Array.from(data.byTruck.values()).map(bt => ({ ...bt, wage: Math.round(bt.wage * 100) / 100 })),
    }))
    .sort((a, b) => b.totalWage - a.totalWage)

  const trucksForGastos = payroll
    .map((e: any) => ({
      id: e.truckId,
      plate: e.truck?.plate ?? '',
      driverName: e.truck?.driver?.name ?? '',
    }))
    .filter((t: { id: string; plate: string; driverName: string }) => t.plate)

  const periodStartISO = new Date(period.startDate).toISOString().slice(0, 10)
  const periodEndISO   = new Date(period.endDate).toISOString().slice(0, 10)

  const checklistData = {
    payrollCount:         payroll.length,
    tripsWithoutTicket:   trips.filter((t: any) => !t.ticketNo).length,
    unpaidEntries:        payroll.filter((e: any) => !e.paidAt && e.netAmount > 0).length,
    negativoEntries:      payroll.filter((e: any) => e.netAmount < 0).length,
    totalAlmacenPendiente,
    totalLoansPendientes,
    mecanicoExpensesCount,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/nomina" className="text-zinc-500 hover:text-white transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              Relación {formatDate(period.startDate)} — {formatDate(period.endDate)}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                period.status === 'OPEN'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-zinc-700 text-zinc-400'
              }`}>
                {period.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
              </span>
              <span className="text-zinc-500 text-sm">{trips.length} viajes · {payroll.length} camiones</span>
            </div>
          </div>
        </div>

        {['DUENO', 'ENCARGADO'].includes(session.role) && (
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            {period.status === 'CLOSED' && (
              <NotifyButton periodId={periodId} />
            )}
            <PeriodActions periodId={periodId} periodStatus={period.status} role={session.role} checklistData={checklistData} />
          </div>
        )}
      </div>

      {/* ── Wizard de cierre — solo período abierto para encargado/dueño ── */}
      {period.status === 'OPEN' && ['DUENO', 'ENCARGADO'].includes(session.role) && (() => {
        const tripsWithoutTicket = trips.filter((t: any) => !t.ticketNo).length
        const steps = [
          {
            label: 'Viajes importados',
            done: trips.length > 0,
            detail: trips.length > 0 ? `${trips.length} viajes` : 'Sin viajes aún',
            href: '/romana',
            action: 'Importar romana',
          },
          {
            label: 'Nómina generada',
            done: payroll.length > 0,
            detail: payroll.length > 0 ? `${payroll.length} camiones` : 'Sin nómina',
            href: null,
            action: null,
          },
          {
            label: 'Gastos aplicados',
            done: gastosComunesCount > 0,
            detail: gastosComunesCount > 0 ? `${gastosComunesCount} gastos` : 'Sin gastos en camiones',
            href: null,
            action: 'Usar panel ↓',
          },
          {
            label: 'Mecánicos',
            done: mecanicoExpensesCount > 0,
            detail: mecanicoExpensesCount > 0 ? 'Ingresados' : 'Sin gastos MECANICA',
            href: '/mantenimiento?tab=trabajos',
            action: 'Registrar trabajos',
          },
          {
            label: 'Tickets completos',
            done: tripsWithoutTicket === 0,
            detail: tripsWithoutTicket === 0 ? 'Todos completos' : `${tripsWithoutTicket} sin ticket`,
            href: '/viajes',
            action: 'Revisar viajes',
          },
        ]
        const doneCount = steps.filter(s => s.done).length
        const allDone   = doneCount === steps.length

        return (
          <div className={`rounded-2xl border p-4 ${allDone ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Progreso de cierre</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                {doneCount}/{steps.length} pasos
              </span>
            </div>
            {/* Barra de progreso */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            {/* Pasos */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {steps.map((step, i) => (
                <div key={i} className={`rounded-xl p-3 text-xs ${step.done ? 'bg-emerald-500/10' : 'bg-zinc-800/60'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-base leading-none ${step.done ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {step.done ? '✓' : '○'}
                    </span>
                    <span className={`font-semibold ${step.done ? 'text-emerald-300' : 'text-zinc-400'}`}>
                      {step.label}
                    </span>
                  </div>
                  <p className={`text-[11px] ${step.done ? 'text-emerald-500/80' : 'text-zinc-600'}`}>
                    {step.detail}
                  </p>
                  {!step.done && step.href && (
                    <Link href={step.href} className="text-[11px] text-amber-400 hover:text-amber-300 mt-1 block transition-colors">
                      {step.action} →
                    </Link>
                  )}
                  {!step.done && !step.href && step.action && (
                    <span className="text-[11px] text-zinc-500 mt-1 block">{step.action}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {payroll.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
          <p className="text-zinc-500 text-sm">Nómina no generada aún</p>
          <p className="text-zinc-600 text-xs mt-1">Ve a Nómina y presiona "Generar nómina" para este período</p>
        </div>
      ) : (
        <>
          {/* Cuentas de cobro por cliente — Aurumin y Luis Peña separados */}
          {session.role !== 'AFILIADO' && payroll.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Aurumin */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">Aurumin</p>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{tonsAurumin.toFixed(2)} ton</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <CxCRow label="Este período" value={grossAurumin} color="text-white" />
                  {acumuladoAurumin > 0 && (
                    <CxCRow label="Saldo acumulado (períodos prev.)" value={acumuladoAurumin} color="text-zinc-400" />
                  )}
                  {(grossAurumin > 0 || acumuladoAurumin > 0) && (
                    <CxCRow label="Subtotal" value={subtotalAurumin} color="text-zinc-300" bold />
                  )}
                  {abonosAurumin > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Abonos recibidos</span>
                      <span className="font-mono">-${abonosAurumin.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {sumNegativos < 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500 text-xs">Carros negativos (caja chica)</span>
                      <span className="text-zinc-500 font-mono text-xs">${sumNegativos.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-red-400">
                    <span>Préstamos pendientes</span>
                    <span className="font-mono">-${totalLoansPendientes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>Almacén pendiente</span>
                    <span className="font-mono">-${totalAlmacenPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t border-zinc-700 pt-2 flex justify-between">
                    <span className="text-amber-300 font-semibold">
                      {saldoTotalAurumin > 0 ? 'Aurumin nos debe' : 'Cuenta al día'}
                    </span>
                    <span className="text-amber-400 font-bold font-mono text-base">
                      ${(saldoTotalAurumin > 0 ? saldoTotalAurumin : auruminDebe).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {!cxcActualAurumin && grossAurumin > 0 && (
                    <Link href="/caja?tab=cobrar" className="text-xs text-zinc-500 hover:text-amber-400 transition-colors">
                      + Registrar CxC para este período →
                    </Link>
                  )}
                </div>
              </div>

              {/* Luis Peña (Chino Peña) */}
              <div className={`rounded-2xl p-4 space-y-3 border ${grossLuisPena > 0 || acumuladoLuisPena > 0 ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-900/50 border-zinc-800/50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">Luis Peña (Chino Peña)</p>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{tonsLuisPena.toFixed(2)} ton</span>
                </div>
                {grossLuisPena > 0 || acumuladoLuisPena > 0 ? (
                  <div className="space-y-1.5 text-sm">
                    {grossLuisPena > 0 && <CxCRow label="Este período" value={grossLuisPena} color="text-white" />}
                    {acumuladoLuisPena > 0 && (
                      <CxCRow label="Saldo acumulado (períodos prev.)" value={acumuladoLuisPena} color="text-zinc-400" />
                    )}
                    {grossLuisPena > 0 && acumuladoLuisPena > 0 && (
                      <CxCRow label="Subtotal" value={subtotalLuisPena} color="text-zinc-300" bold />
                    )}
                    {abonosLuisPena > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Abonos recibidos</span>
                        <span className="font-mono">-${abonosLuisPena.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="border-t border-zinc-700 pt-2 flex justify-between">
                      <span className="text-blue-300 font-semibold">
                        {saldoTotalLuisPena > 0 ? 'Luis Peña nos debe' : 'Cuenta al día'}
                      </span>
                      <span className="text-blue-400 font-bold font-mono text-base">
                        ${(saldoTotalLuisPena > 0 ? saldoTotalLuisPena : grossLuisPena).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {!cxcActualLuisPena && grossLuisPena > 0 && (
                      <Link href="/caja?tab=cobrar" className="text-xs text-zinc-500 hover:text-blue-400 transition-colors">
                        + Registrar CxC para este período →
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs">Sin viajes a La Fe / Nuevo Callao este período</p>
                )}
              </div>

            </div>
          )}

          {/* Summary KPIs */}
          {(() => {
            const totalPending = payroll.reduce((s: number, e: any) => s + (e.paidAt ? 0 : e.netAmount), 0)
            const totalPaid = payroll.reduce((s: number, e: any) => s + (e.paidAt ? e.netAmount : 0), 0)
            return (
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Total toneladas</p>
                  <p className="text-white font-bold text-xl mt-1">{totalTons.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Monto bruto</p>
                  <p className="text-white font-bold text-xl mt-1">${totalGross.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Viáticos</p>
                  <p className="text-blue-400 font-bold text-xl mt-1">${totalViaticos.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Nóm. Choferes</p>
                  <p className="text-orange-400 font-bold text-xl mt-1">${totalDriverWage.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">5% NPR</p>
                  <p className="text-red-400 font-bold text-xl mt-1">${totalNprFee.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Mecánicos</p>
                  <p className="text-purple-400 font-bold text-xl mt-1">${totalMechanicFee.toFixed(2)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Gastos Op. + Ded.</p>
                  <p className="text-red-400 font-bold text-xl mt-1">${(totalCommission + totalDeductions).toFixed(2)}</p>
                </div>
                {totalSaldoInicial !== 0 && (
                  <div className={`rounded-xl p-3 border ${totalSaldoInicial < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <p className={`text-xs ${totalSaldoInicial < 0 ? 'text-red-300' : 'text-emerald-300'}`}>Saldo anterior</p>
                    <p className={`font-bold text-xl mt-1 ${totalSaldoInicial < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${totalSaldoInicial.toFixed(2)}</p>
                  </div>
                )}
                <div className={`rounded-xl p-3 border ${totalPending > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
                  <p className={`text-xs ${totalPending > 0 ? 'text-red-300' : 'text-zinc-500'}`}>Pendiente de cobro</p>
                  <p className={`font-bold text-xl mt-1 ${totalPending > 0 ? 'text-red-400' : 'text-zinc-400'}`}>${totalPending.toFixed(2)}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-amber-300 text-xs">Total a pagar</p>
                  <p className="text-amber-400 font-bold text-xl mt-1">${totalNet.toFixed(2)}</p>
                </div>
              </div>
            )
          })()}

          {/* NPR — distribución encargado / empresa */}
          {totalNprFee > 0 && ['DUENO', 'ENCARGADO'].includes(session.role) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
              <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Distribución NPR</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-zinc-500 text-xs">Total recaudado</p>
                  <p className="text-white font-bold text-lg font-mono mt-0.5">
                    ${totalNprFee.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Encargado (10%)</p>
                  <p className="text-amber-400 font-bold text-lg font-mono mt-0.5">
                    ${(totalNprFee * 0.10).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Empresa (90%)</p>
                  <p className="text-emerald-400 font-bold text-lg font-mono mt-0.5">
                    ${(totalNprFee * 0.90).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payroll table — client component with payment tracking */}
          <PayrollTableClient
            entries={payroll as any}
            periodId={periodId}
            periodStatus={period.status}
            role={session.role}
            totalTons={totalTons}
            totalGross={totalGross}
            totalViaticos={totalViaticos}
            totalDriverWage={totalDriverWage}
            totalCommission={totalCommission}
            totalNprFee={totalNprFee}
            totalMechanicFee={totalMechanicFee}
            totalAdminFee={totalAdminFee}
            totalDeductions={totalDeductions}
            totalSaldoInicial={totalSaldoInicial}
            totalAbono={totalAbono}
            totalNet={totalNet}
          />

          {/* Acceso rápido a trabajos de mecánico */}
          {['DUENO', 'ENCARGADO'].includes(session.role) && (
            <Link
              href="/mantenimiento?tab=trabajos"
              className="flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 hover:border-amber-500/30 rounded-2xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-sm group-hover:text-amber-400 transition-colors">
                  Trabajos de mecánico
                </span>
                <span className="text-zinc-500 text-xs">Registra trabajo por camión con split 40/60 automático</span>
              </div>
              <span className="text-zinc-600 group-hover:text-amber-400 transition-colors text-sm">→</span>
            </Link>
          )}

          {/* Gastos comunes — divididos entre todos los camiones */}
          {['DUENO', 'ENCARGADO'].includes(session.role) && (
            <GastosComunesClient
              periodId={periodId}
              periodEnd={periodEndISO}
              truckCount={trucksForGastos.length}
            />
          )}

          {/* Gastos operativos por camión */}
          {['DUENO', 'ENCARGADO'].includes(session.role) && (
            <GastosMasivosClient
              trucks={trucksForGastos}
              periodId={periodId}
              periodStart={periodStartISO}
              periodEnd={periodEndISO}
            />
          )}

          {/* Gastos generales de caja chica (sin camión) */}
          {['DUENO', 'ENCARGADO'].includes(session.role) && (
            <GastosGeneralesClient
              periodId={periodId}
              periodEnd={periodEndISO}
              existingCount={gastosGeneralesCount}
            />
          )}

          {/* Nómina de choferes */}
          {nominaChoferes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm">Nómina de choferes</h2>
                <span className="text-zinc-500 text-xs">Sueldo total por conductor · desglosado por camión</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 font-medium px-4 py-3">Conductor</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3">Camión(es)</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-3">Viajes</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-3">Sueldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nominaChoferes.map((ce, i) => (
                      <tr key={ce.conductor} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-800/20'}`}>
                        <td className="px-4 py-3 text-white font-medium">{ce.conductor}</td>
                        <td className="px-4 py-3">
                          {ce.byTruck.length === 1 ? (
                            <span className="text-zinc-400 font-mono text-xs">{ce.byTruck[0].plate}</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {ce.byTruck.map(bt => (
                                <span key={bt.plate} className="inline-flex items-center gap-1 bg-zinc-800 rounded-md px-2 py-0.5 text-xs">
                                  <span className="text-zinc-300 font-mono">{bt.plate}</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-zinc-400">{bt.trips}v</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-amber-400">${bt.wage.toFixed(2)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400">{ce.totalTrips}</td>
                        <td className="px-4 py-3 text-right text-amber-400 font-semibold">${ce.totalWage.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700">
                      <td className="px-4 py-3 text-zinc-500 font-medium" colSpan={2}>Total nómina choferes</td>
                      <td className="px-4 py-3 text-right text-zinc-400 font-medium">{nominaChoferes.reduce((s, c) => s + c.totalTrips, 0)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold">
                        ${nominaChoferes.reduce((s, c) => s + c.totalWage, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Trip details per truck */}
          <div className="space-y-3">
            <h2 className="text-white font-semibold text-sm">Detalle de viajes por camión</h2>
            {payroll.map((entry: any) => {
              const truckTrips = tripsByTruck.get(entry.truckId) ?? []
              if (truckTrips.length === 0) return null
              return (
                <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <span className="text-white font-semibold font-mono">{entry.truck?.plate}</span>
                      <span className="text-zinc-500 text-sm ml-2">{entry.truck?.driver?.name}</span>
                    </div>
                    <span className="text-amber-400 font-semibold text-sm">${entry.grossAmount.toFixed(2)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left text-zinc-500 font-medium px-4 py-2">Fecha</th>
                          <th className="text-left text-zinc-500 font-medium px-4 py-2">Ticket</th>
                          <th className="text-left text-zinc-500 font-medium px-4 py-2">Ruta</th>
                          <th className="text-right text-zinc-500 font-medium px-4 py-2">Ton</th>
                          <th className="text-right text-zinc-500 font-medium px-4 py-2">Monto</th>
                          <th className="text-right text-zinc-500 font-medium px-4 py-2">Viático</th>
                        </tr>
                      </thead>
                      <tbody>
                        {truckTrips.map(trip => (
                          <tr key={trip.id} className="border-b border-zinc-800/40">
                            <td className="px-4 py-2 text-zinc-400">{formatDate(trip.date)}</td>
                            <td className="px-4 py-2 text-zinc-500 font-mono">{trip.ticketNo ?? '—'}</td>
                            <td className="px-4 py-2 text-zinc-400">{trip.route.name}</td>
                            <td className="px-4 py-2 text-right text-zinc-300">
                              {trip.netWeightKg ? (trip.netWeightKg / 1000).toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-2 text-right text-white">${trip.amount.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-blue-400">
                              {trip.viatico > 0 ? `$${trip.viatico.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CxCRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono ${color}`}>
        ${value.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}
