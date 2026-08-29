import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import NominaActions from './NominaActions'
import CrearPeriodoBtn from './CrearPeriodoBtn'
import DeletePeriodButton from './DeletePeriodButton'

async function getPeriods() {
  const periods = await prisma.period.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { trips: true } },
      payroll: { select: { netAmount: true, grossAmount: true } },
    },
  })
  return periods
}

async function getActivePeriodDetails(periodId: string) {
  const [activeTrucks, tripsInPeriod, lastTrip] = await Promise.all([
    prisma.truck.findMany({ where: { active: true }, select: { id: true, plate: true } }),
    prisma.trip.groupBy({ by: ['truckId'], where: { periodId } }),
    prisma.trip.findFirst({ where: { periodId }, orderBy: { date: 'desc' }, select: { date: true } }),
  ])
  const withTrips = new Set(tripsInPeriod.map(t => t.truckId))
  return {
    activeTrucks,
    trucksWithoutTrips: activeTrucks.filter(t => !withTrips.has(t.id)),
    lastTrip,
  }
}

async function getPendingCxC() {
  const result = await prisma.cuentaPorCobrar.aggregate({
    where: { status: { not: 'PAID' } },
    _sum: { balance: true },
    _count: true,
  })
  return { total: result._sum.balance ?? 0, count: result._count }
}

function formatDate(d: Date) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatShort(d: Date) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
}

export default async function NominaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const periods = await getPeriods()
  const activePeriod = periods.find(p => p.status === 'OPEN') ?? null

  const details = activePeriod && ['DUENO', 'ENCARGADO'].includes(session.role)
    ? await getActivePeriodDetails(activePeriod.id)
    : null

  const pendingCxC = session.role === 'DUENO' && activePeriod
    ? await getPendingCxC()
    : null

  // Period progress calculations
  let daysRemaining = 0, daysElapsed = 0, totalDays = 1, progressPct = 0
  if (activePeriod) {
    const today = new Date()
    const start = new Date(activePeriod.startDate)
    const end = new Date(activePeriod.endDate)
    totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    daysElapsed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000))
    daysRemaining = Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000))
    progressPct = Math.min(100, Math.round((daysElapsed / totalDays) * 100))
  }

  const hasPayroll = activePeriod ? activePeriod.payroll.length > 0 : false
  const hasTrips = activePeriod ? activePeriod._count.trips > 0 : false

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Nómina</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Calcula el pago quincenal por camión: facturación, viáticos, comisiones, NPR y deducciones. También muestra la nómina de choferes por período.</p>
        </div>
        {!activePeriod && ['DUENO', 'ENCARGADO'].includes(session.role) && (
          <CrearPeriodoBtn />
        )}
      </div>

      {/* ── Período activo: guía de estado ── */}
      {activePeriod && details && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Período activo</p>
              <p className="text-white font-semibold mt-0.5">
                {formatShort(activePeriod.startDate)} — {formatShort(activePeriod.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/nomina/${activePeriod.id}`}
                className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                Abrir período →
              </Link>
              {['DUENO', 'ENCARGADO'].includes(session.role) && (
                <DeletePeriodButton periodId={activePeriod.id} />
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-500">Días transcurridos: {Math.min(daysElapsed, totalDays)}/{totalDays}</span>
              <span className={
                daysRemaining === 0 ? 'text-red-400 font-semibold' :
                daysRemaining <= 2 ? 'text-red-400' :
                daysRemaining <= 4 ? 'text-amber-400' : 'text-zinc-400'
              }>
                {daysRemaining === 0 ? '¡Cierra hoy!' : `${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} restante${daysRemaining !== 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  daysRemaining === 0 ? 'bg-red-500' :
                  daysRemaining <= 2 ? 'bg-red-500' :
                  daysRemaining <= 4 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* KPIs */}
          <div className={`grid gap-2 ${session.role === 'DUENO' ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
              <p className="text-zinc-500 text-xs mb-1">Viajes</p>
              <p className="text-white font-semibold text-lg">{activePeriod._count.trips}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
              <p className="text-zinc-500 text-xs mb-1">Camiones</p>
              <p className="text-white font-semibold text-lg">{details.activeTrucks.length}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
              <p className="text-zinc-500 text-xs mb-1">Nómina</p>
              <p className={`font-semibold text-sm ${hasPayroll ? 'text-emerald-400' : 'text-amber-400'}`}>
                {hasPayroll ? '✓ Lista' : 'Pendiente'}
              </p>
            </div>
            {session.role === 'DUENO' && pendingCxC && (
              <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                <p className="text-zinc-500 text-xs mb-1">Por cobrar</p>
                <p className={`font-semibold text-sm ${pendingCxC.total > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {pendingCxC.total > 0 ? `$${pendingCxC.total.toFixed(0)}` : '✓ Al día'}
                </p>
              </div>
            )}
          </div>

          {/* Alert: trucks without trips */}
          {details.trucksWithoutTrips.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <span className="text-amber-400 text-base flex-shrink-0">⚠</span>
              <div>
                <p className="text-amber-400 text-sm font-medium">
                  {details.trucksWithoutTrips.length} camión{details.trucksWithoutTrips.length > 1 ? 'es' : ''} sin viajes esta quincena
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {details.trucksWithoutTrips.map(t => t.plate).join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Lista de pasos</p>
            {session.role === 'DUENO' ? (
              <>
                <CheckStep
                  done={hasTrips}
                  label="Romana cargada"
                  sublabel={details.lastTrip
                    ? `Último viaje: ${formatShort(details.lastTrip.date)}`
                    : 'Sin viajes registrados en este período'}
                  href="/romana"
                />
                <CheckStep
                  done={hasPayroll}
                  label="Nómina generada"
                  sublabel={hasPayroll ? 'Cálculos aplicados correctamente' : 'Pendiente — pídele al encargado que la genere'}
                  href={`/nomina/${activePeriod.id}`}
                />
                <CheckStep
                  done={false}
                  label="Revisar saldos de cada dueño"
                  sublabel={pendingCxC && pendingCxC.count > 0
                    ? `${pendingCxC.count} cuenta${pendingCxC.count !== 1 ? 's' : ''} pendiente${pendingCxC.count !== 1 ? 's' : ''} · $${pendingCxC.total.toFixed(2)} por cobrar`
                    : 'Verifica que cada propietario reciba lo correcto'}
                  href="/nomina/duenos"
                  cta={hasPayroll ? 'Ver saldos →' : undefined}
                />
                <CheckStep
                  done={pendingCxC ? pendingCxC.total === 0 : false}
                  label="Cobros pendientes (Aurumin / LP)"
                  sublabel={pendingCxC && pendingCxC.total > 0
                    ? `$${pendingCxC.total.toFixed(2)} sin cobrar`
                    : 'Sin cobros pendientes'}
                  href="/caja"
                  cta={pendingCxC && pendingCxC.total > 0 ? 'Ver cuentas →' : undefined}
                />
                <CheckStep
                  done={false}
                  label="Cerrar período"
                  sublabel="Solo cuando todo esté revisado y confirmado"
                  href={`/nomina/${activePeriod.id}`}
                />
              </>
            ) : (
              <>
                <CheckStep
                  done={hasTrips}
                  label="Cargar romana del período"
                  sublabel={details.lastTrip
                    ? `Último viaje: ${formatShort(details.lastTrip.date)}`
                    : 'Sin viajes aún — ve a Romana e importa el archivo'}
                  href="/romana"
                  cta={!hasTrips ? 'Ir a Romana →' : undefined}
                />
                <CheckStep
                  done={hasPayroll}
                  label="Generar nómina"
                  sublabel={hasPayroll ? 'Nómina calculada correctamente' : 'Entra al período y presiona «Generar nómina»'}
                  href={`/nomina/${activePeriod.id}`}
                  cta={!hasPayroll && hasTrips ? 'Generar →' : undefined}
                />
                <CheckStep
                  done={false}
                  label="Revisar gastos y deducciones"
                  sublabel="Nómina mecánicos, gastos op., préstamos, abonos"
                  href={`/nomina/${activePeriod.id}`}
                />
                <CheckStep
                  done={false}
                  label="Cerrar período y notificar dueños"
                  sublabel="Solo cuando todo esté revisado y pagado"
                  href={`/nomina/${activePeriod.id}`}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Periods list */}
      {periods.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
          <p className="text-zinc-500 text-sm">No hay períodos aún</p>
          <p className="text-zinc-600 text-xs mt-1">Los períodos se crean automáticamente al registrar viajes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map(period => {
            const totalNet = period.payroll.reduce((s, e) => s + e.netAmount, 0)
            const totalGross = period.payroll.reduce((s, e) => s + e.grossAmount, 0)
            const hasPayroll = period.payroll.length > 0

            return (
              <div key={period.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="text-white font-semibold">
                        {formatDate(period.startDate)} — {formatDate(period.endDate)}
                      </h2>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        period.status === 'OPEN'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-zinc-700 text-zinc-400'
                      }`}>
                        {period.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </div>

                    <div className="flex gap-5 mt-2">
                      <div>
                        <span className="text-zinc-500 text-xs">Viajes</span>
                        <p className="text-white font-medium">{period._count.trips}</p>
                      </div>
                      {hasPayroll && (
                        <>
                          <div>
                            <span className="text-zinc-500 text-xs">Bruto total</span>
                            <p className="text-white font-medium">${totalGross.toFixed(2)}</p>
                          </div>
                          <div>
                            <span className="text-zinc-500 text-xs">Neto total</span>
                            <p className="text-amber-400 font-semibold">${totalNet.toFixed(2)}</p>
                          </div>
                          <div>
                            <span className="text-zinc-500 text-xs">Camiones</span>
                            <p className="text-white font-medium">{period.payroll.length}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    {['DUENO', 'ENCARGADO'].includes(session.role) && (
                      <NominaActions periodId={period.id} status={period.status} hasPayroll={hasPayroll} />
                    )}
                    <Link
                      href={`/nomina/${period.id}`}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Ver relación →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CheckStep({ done, label, sublabel, href, cta }: {
  done: boolean
  label: string
  sublabel: string
  href: string
  cta?: string
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-800/60 transition-colors group">
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
        done ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-700 text-transparent'
      }`}>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-zinc-400 line-through' : 'text-white'}`}>{label}</p>
        <p className="text-zinc-500 text-xs mt-0.5">{sublabel}</p>
      </div>
      {cta && (
        <span className="text-xs text-amber-400 group-hover:text-amber-300 whitespace-nowrap self-center font-medium">{cta}</span>
      )}
      {!cta && !done && (
        <span className="text-zinc-600 group-hover:text-zinc-400 self-center">›</span>
      )}
    </Link>
  )
}
