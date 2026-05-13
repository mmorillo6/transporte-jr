import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PrintButton from './PrintButton'
import AbonoClient from './AbonoClient'
import TripAmountClient from './TripAmountClient'

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date | string) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CATEGORY_LABEL: Record<string, string> = {
  REPUESTO:       'Repuesto',
  MECANICA:       'Mecánica',
  ACEITE:         'Aceite',
  CAUCHO:         'Caucho',
  OPERATIVO:      'Operativo',
  ADMINISTRATIVO: 'Administrativo',
  NPR:            'NPR',
  NOMINA:         'Nómina',
  VIATICO:        'Viático',
  OTRO:           'Otro',
}

export default async function TruckRelacionPage({
  params,
}: {
  params: Promise<{ periodId: string; truckId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { periodId, truckId } = await params

  const [period, entry, trips, expenses] = await Promise.all([
    prisma.period.findUnique({ where: { id: periodId } }),
    prisma.payrollEntry.findFirst({
      where: { periodId, truckId },
      include: {
        truck: {
          include: {
            driver: { select: { name: true } },
            owner:  { select: { name: true, type: true, nprPercent: true } },
          },
        },
      },
    }),
    prisma.trip.findMany({
      where: { periodId, truckId },
      include: { route: { select: { name: true, clientName: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.expense.findMany({
      where: { periodId, truckId },
      orderBy: { date: 'asc' },
    }),
  ])

  if (!period || !entry) notFound()

  const truck   = entry.truck
  const e       = entry as any

  // Deudas de cauchos del dueño de este camión (todas las abiertas)
  const tireDebts = truck?.owner?.name
    ? await prisma.tireDebt.findMany({
        where: {
          ownerName: { equals: truck.owner.name, mode: 'insensitive' },
          status: { not: 'PAID' },
        },
        include: {
          payments: { select: { amount: true, date: true }, orderBy: { date: 'asc' } },
        },
        orderBy: { date: 'asc' },
      })
    : []
  const totalExpenses    = expenses.reduce((s, x) => s + x.amount, 0)
  const tripsAurumin     = trips.filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
  const tripsLuisPena    = trips.filter(t => (t.route as any)?.clientName === 'LUIS PEÑA')
  const grossTripAurumin = tripsAurumin.reduce((s, t) => s + t.amount, 0)
  const grossTripLuisPena= tripsLuisPena.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Toolbar — oculto al imprimir */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/nomina/${periodId}`}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver al período
        </Link>
        <PrintButton />
      </div>

      {/* Documento */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:bg-white print:border-0 print:rounded-none print:shadow-none">

        {/* Cabecera */}
        <div className="px-6 py-5 border-b border-zinc-800 print:border-zinc-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Empresa</p>
              <p className="text-white font-bold text-lg print:text-black">Acarreos José Rodríguez</p>
              <p className="text-zinc-400 text-xs print:text-zinc-500">RIF: J-XXXXXXXXX-X</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs print:text-zinc-400">Período</p>
              <p className="text-white font-semibold print:text-black">
                {fmtDate(period.startDate)} — {fmtDate(period.endDate)}
              </p>
              <p className={`text-xs mt-0.5 ${period.status === 'OPEN' ? 'text-emerald-400' : 'text-zinc-500'} print:text-zinc-400`}>
                {period.status === 'OPEN' ? 'Período abierto' : 'Período cerrado'}
              </p>
            </div>
          </div>

          {/* Info del camión */}
          <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800 print:border-zinc-200">
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Placa</p>
              <p className="text-white font-bold font-mono text-base print:text-black">{truck?.plate ?? '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Conductor</p>
              <p className="text-white font-medium print:text-black">{truck?.driver?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Dueño</p>
              <p className="text-white font-medium print:text-black">{truck?.owner?.name ?? '—'}</p>
              {truck?.owner?.type === 'AFILIADO' && (
                <p className="text-violet-400 text-xs print:text-zinc-500">Afiliado · {truck.owner.nprPercent ?? 10}% NPR</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabla de viajes — separada por cliente */}
        {trips.length > 0 && (
          <>
            {[
              { label: 'Aurumin', rows: tripsAurumin,  gross: grossTripAurumin,  color: 'text-amber-400 print:text-amber-600' },
              { label: 'Luis Peña (Chino Peña)', rows: tripsLuisPena, gross: grossTripLuisPena, color: 'text-blue-400 print:text-blue-700' },
            ].filter(g => g.rows.length > 0).map(group => (
              <div key={group.label} className="px-6 py-4 border-b border-zinc-800 print:border-zinc-200">
                <h2 className="text-white font-semibold text-sm mb-3 print:text-black">
                  Viajes — <span className={group.color}>{group.label}</span>
                </h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700 print:border-zinc-300">
                      <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Fecha</th>
                      <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Ticket</th>
                      <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Ruta</th>
                      <th className="text-right text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Ton</th>
                      <th className="text-right text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Monto</th>
                      <th className="text-right text-zinc-500 font-medium py-2 print:text-zinc-500">Viático</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(trip => (
                      <tr key={trip.id} className="border-b border-zinc-800/50 print:border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-300 print:text-zinc-700">{fmtDate(trip.date)}</td>
                        <td className="py-2 pr-3 text-zinc-400 font-mono print:text-zinc-600">{trip.ticketNo ?? '—'}</td>
                        <td className="py-2 pr-3 text-zinc-300 print:text-zinc-700">{(trip as any).route?.name ?? '—'}</td>
                        <td className="py-2 pr-3 text-right text-zinc-300 print:text-zinc-700">
                          {trip.netWeightKg ? (trip.netWeightKg / 1000).toFixed(2) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right print:text-black">
                          <TripAmountClient
                            tripId={trip.id}
                            amount={trip.amount}
                            canEdit={['DUENO','ENCARGADO'].includes(session.role) && period?.status === 'OPEN'}
                          />
                        </td>
                        <td className="py-2 text-right text-blue-400 font-mono print:text-zinc-600">
                          {trip.viatico > 0 ? `$${fmt(trip.viatico)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700 print:border-zinc-300">
                      <td colSpan={3} className="py-2 pr-3 text-zinc-400 font-semibold print:text-zinc-500">
                        Total ({group.rows.length} viajes)
                      </td>
                      <td className="py-2 pr-3 text-right text-white font-bold print:text-black">
                        {(group.rows.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000).toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-right font-bold font-mono print:text-black">
                        <span className={group.color}>${fmt(group.gross)}</span>
                      </td>
                      <td className="py-2 text-right text-blue-400 font-bold font-mono print:text-zinc-600">
                        {group.rows.reduce((s, t) => s + t.viatico, 0) > 0
                          ? `$${fmt(group.rows.reduce((s, t) => s + t.viatico, 0))}`
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </>
        )}

        {/* Tabla de gastos */}
        {expenses.length > 0 && (
          <div className="px-6 py-4 border-b border-zinc-800 print:border-zinc-200">
            <h2 className="text-white font-semibold text-sm mb-3 print:text-black">Gastos del período</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700 print:border-zinc-300">
                  <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Fecha</th>
                  <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Categoría</th>
                  <th className="text-left text-zinc-500 font-medium py-2 pr-3 print:text-zinc-500">Descripción</th>
                  <th className="text-right text-zinc-500 font-medium py-2 print:text-zinc-500">Monto</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id} className="border-b border-zinc-800/50 print:border-zinc-100">
                    <td className="py-2 pr-3 text-zinc-300 print:text-zinc-700">{fmtDate(exp.date)}</td>
                    <td className="py-2 pr-3">
                      <span className="text-zinc-400 print:text-zinc-600">
                        {CATEGORY_LABEL[exp.category] ?? exp.category}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-zinc-300 print:text-zinc-700">{exp.description}</td>
                    <td className="py-2 text-right text-red-400 font-mono print:text-red-700">-${fmt(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 print:border-zinc-300">
                  <td colSpan={3} className="py-2 text-zinc-400 font-semibold print:text-zinc-500">
                    Total gastos
                  </td>
                  <td className="py-2 text-right text-red-400 font-bold font-mono print:text-red-700">
                    -${fmt(totalExpenses)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Resumen financiero */}
        <div className="px-6 py-5">
          <h2 className="text-white font-semibold text-sm mb-4 print:text-black">Resumen financiero</h2>
          <div className="space-y-2">
            <FinRow label="Facturación bruta"     value={`$${fmt(e.grossAmount)}`}           color="text-white print:text-black" />
            {e.viaticos > 0 && (
              <FinRow label="Viáticos"             value={`$${fmt(e.viaticos)}`}              color="text-blue-400 print:text-blue-700" />
            )}
            {e.driverWage > 0 && (
              <FinRow label="Nómina chofer"        value={`-$${fmt(e.driverWage)}`}           color="text-orange-400 print:text-orange-700" />
            )}
            {(e.nprFee ?? 0) > 0 && (
              <FinRow label={`NPR (${truck?.owner?.nprPercent ?? 5}%)`} value={`-$${fmt(e.nprFee)}`} color="text-red-400 print:text-red-700" />
            )}
            {(e.mechanicFee ?? 0) > 0 && (
              <FinRow label="Mecánicos"            value={`-$${fmt(e.mechanicFee)}`}          color="text-purple-400 print:text-purple-700" />
            )}
            {(e.adminFee ?? 0) > 0 && (
              <FinRow label="Admin"                value={`-$${fmt(e.adminFee)}`}             color="text-zinc-400 print:text-zinc-600" />
            )}
            {e.commissionFee > 0 && (
              <FinRow label="Gastos operativos"    value={`-$${fmt(e.commissionFee)}`}        color="text-red-400 print:text-red-700" />
            )}
            {e.deductions > 0 && (
              <FinRow label="Otras deducciones"    value={`-$${fmt(e.deductions)}`}           color="text-red-400 print:text-red-700" />
            )}
            {e.saldoInicial !== 0 && (
              <FinRow
                label="Saldo anterior"
                value={`${e.saldoInicial < 0 ? '-' : ''}$${fmt(Math.abs(e.saldoInicial))}`}
                color={e.saldoInicial < 0 ? 'text-red-400 print:text-red-700' : 'text-emerald-400 print:text-emerald-700'}
              />
            )}
            {e.abono > 0 && (
              <FinRow label="Abono recibido"       value={`-$${fmt(e.abono)}`}               color="text-emerald-400 print:text-emerald-700" />
            )}

            <div className="border-t border-zinc-700 print:border-zinc-300 pt-3 mt-3 flex items-center justify-between">
              <span className="text-white font-bold print:text-black">Saldo final</span>
              <span className={`text-xl font-bold font-mono ${e.netAmount < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                {e.netAmount < 0 ? `-$${fmt(Math.abs(e.netAmount))}` : `$${fmt(e.netAmount)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Deudas de cauchos */}
        {tireDebts.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-800 print:border-zinc-200">
            <h2 className="text-white font-semibold text-sm mb-3 print:text-black">Deuda de cauchos</h2>
            <div className="space-y-3">
              {tireDebts.map(debt => (
                <div key={debt.id} className="bg-zinc-800/40 rounded-xl p-3 print:bg-zinc-50 print:border print:border-zinc-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white text-sm font-medium print:text-black">
                        {debt.quantity} {debt.tireType.toUpperCase()}
                      </p>
                      {debt.notes && (
                        <p className="text-zinc-500 text-xs mt-0.5 print:text-zinc-600">{debt.notes}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      debt.status === 'PARTIAL'
                        ? 'bg-amber-500/10 text-amber-400 print:text-amber-700'
                        : 'bg-red-500/10 text-red-400 print:text-red-700'
                    }`}>
                      {debt.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-zinc-500 print:text-zinc-500">Total</p>
                      <p className="text-white font-mono print:text-black">${fmt(debt.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 print:text-zinc-500">Abonado</p>
                      <p className="text-emerald-400 font-mono print:text-emerald-700">${fmt(debt.amountPaid)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 print:text-zinc-500">Debe</p>
                      <p className="text-red-400 font-mono font-semibold print:text-red-700">${fmt(debt.balance)}</p>
                    </div>
                  </div>
                  {debt.payments.length > 0 && (
                    <div className="mt-2 border-t border-zinc-700/50 pt-2 space-y-1 print:border-zinc-200">
                      <p className="text-zinc-600 text-xs print:text-zinc-400">Historial de abonos:</p>
                      {debt.payments.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-zinc-500 print:text-zinc-500">
                            {new Date(p.date).toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'2-digit' })}
                          </span>
                          <span className="text-emerald-400 font-mono print:text-emerald-700">${fmt(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-1">
                <span className="text-zinc-400 print:text-zinc-600">Total deuda cauchos</span>
                <span className="text-red-400 font-mono print:text-red-700">
                  ${fmt(tireDebts.reduce((s, d) => s + d.balance, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Abono — visible solo en pantalla, no en impresión */}
        <AbonoClient
          entryId={entry.id}
          currentAbono={e.abono ?? 0}
          netAmount={e.netAmount}
          periodStatus={period.status}
        />

        {/* Footer — solo impresión */}
        <div className="hidden print:block px-6 py-4 border-t border-zinc-200 text-center">
          <p className="text-xs text-zinc-400">
            Generado el {new Date().toLocaleDateString('es-VE')} · Acarreos José Rodríguez
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm 2cm; }
          body { background: white !important; }
          nav, header, aside, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  )
}

function FinRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400 print:text-zinc-600">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
