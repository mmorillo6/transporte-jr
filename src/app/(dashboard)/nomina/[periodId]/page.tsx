import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PeriodActions from './PeriodActions'
import PayrollTableClient from './PayrollTableClient'

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
          route: { select: { name: true, rateType: true, driverWage: true } },
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

  const period = await getPeriodData(periodId, session.role, ownerId)
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/nomina" className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Relación {formatDate(period.startDate)} — {formatDate(period.endDate)}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
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
          <PeriodActions periodId={periodId} periodStatus={period.status} role={session.role} />
        )}
      </div>

      {payroll.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
          <p className="text-zinc-500 text-sm">Nómina no generada aún</p>
          <p className="text-zinc-600 text-xs mt-1">Ve a Nómina y presiona "Generar nómina" para este período</p>
        </div>
      ) : (
        <>
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
