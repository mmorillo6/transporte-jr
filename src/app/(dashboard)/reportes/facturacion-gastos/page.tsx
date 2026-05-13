import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PrintButton from './PrintButton'

function fmt(n: number) {
  if (n === 0) return '—'
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPeriod(start: Date, end: Date) {
  const d = (d: Date) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  return `${d(start)} al ${d(end)}`
}

export default async function FacuracionVsGastosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  // Períodos cerrados con nómina generada
  const periods = await prisma.period.findMany({
    where: { status: 'CLOSED', payroll: { some: {} } },
    include: {
      payroll: {
        include: {
          truck: {
            select: { plate: true, owner: { select: { name: true, type: true } } },
          },
        },
        orderBy: { truck: { plate: 'asc' } },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  // Recopilar todos los trucks que aparecen en algún período
  const allTruckKeys = new Map<string, { plate: string; owner: string; type: string }>()
  for (const period of periods) {
    for (const entry of period.payroll) {
      const plate = entry.truck.plate
      if (!allTruckKeys.has(plate)) {
        allTruckKeys.set(plate, {
          plate,
          owner: entry.truck.owner?.name ?? '—',
          type:  entry.truck.owner?.type ?? '—',
        })
      }
    }
  }
  const trucks = Array.from(allTruckKeys.values()).sort((a, b) => a.plate.localeCompare(b.plate))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/reportes" className="text-zinc-500 hover:text-white transition-colors text-sm">
              ← Reportes
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">Facturación vs Gastos</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Rentabilidad por camión en cada período cerrado
          </p>
        </div>
        <PrintButton />
      </div>

      {periods.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
          <p className="text-zinc-500">No hay períodos cerrados con nómina generada</p>
        </div>
      ) : (
        <>
          {/* Una tabla por período */}
          {periods.map(period => {
            const byTruck = new Map(period.payroll.map(e => [e.truck.plate, e as any]))

            const totals = {
              gross:    period.payroll.reduce((s, e) => s + (e as any).grossAmount, 0),
              mec:      period.payroll.reduce((s, e) => s + ((e as any).mechanicFee ?? 0), 0),
              admin:    period.payroll.reduce((s, e) => s + ((e as any).adminFee ?? 0), 0),
              nomina:   period.payroll.reduce((s, e) => s + (e as any).driverWage, 0),
              npr:      period.payroll.reduce((s, e) => s + ((e as any).nprFee ?? 0), 0),
              gastosOp: period.payroll.reduce((s, e) => s + (e as any).commissionFee, 0),
              net:      period.payroll.reduce((s, e) => s + (e as any).netAmount, 0),
            }

            return (
              <div key={period.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300 print:rounded-none print:mb-6">
                {/* Cabecera del período */}
                <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800 print:bg-zinc-100 print:border-zinc-300 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/nomina/${period.id}`}
                      className="text-white font-semibold text-sm hover:text-amber-400 transition-colors print:text-black print:no-underline"
                    >
                      {fmtPeriod(period.startDate, period.endDate)}
                    </Link>
                    <span className="text-zinc-500 text-xs">{period.payroll.length} camiones</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {totals.npr > 0 && (
                      <span className="text-zinc-500 text-xs font-mono print:text-zinc-600">
                        NPR {fmt(totals.npr)}
                        <span className="text-amber-400 ml-1">enc. {fmt(totals.npr * 0.10)}</span>
                        <span className="text-emerald-400 ml-1">emp. {fmt(totals.npr * 0.90)}</span>
                      </span>
                    )}
                    <span className="text-amber-400 font-bold font-mono text-sm print:text-black">
                      Neto total: {fmt(totals.net)}
                    </span>
                  </div>
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 print:border-zinc-300">
                        <th className="text-left text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Vehículo</th>
                        <th className="text-left text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Dueño</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Facturación</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Mec.</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Admin</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Nómina</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">NPR</th>
                        <th className="text-right text-zinc-500 font-medium px-3 py-2 whitespace-nowrap print:text-zinc-600">Gastos Op.</th>
                        <th className="text-right text-zinc-500 font-semibold px-3 py-2 whitespace-nowrap print:text-zinc-800">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trucks.map(truck => {
                        const e = byTruck.get(truck.plate)
                        if (!e) return (
                          <tr key={truck.plate} className="border-b border-zinc-800/30 print:border-zinc-100">
                            <td className="px-3 py-2 font-mono text-zinc-600 print:text-zinc-400">{truck.plate}</td>
                            <td className="px-3 py-2 text-zinc-600 print:text-zinc-400">{truck.owner}</td>
                            <td colSpan={7} className="px-3 py-2 text-zinc-700 text-center text-xs print:text-zinc-400">sin actividad</td>
                          </tr>
                        )

                        const net = e.netAmount
                        const netColor = net < 0 ? 'text-red-400 print:text-red-700' : net > 0 ? 'text-emerald-400 print:text-emerald-700' : 'text-zinc-400 print:text-zinc-500'

                        return (
                          <tr key={truck.plate} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors print:border-zinc-100">
                            <td className="px-3 py-2 font-mono text-zinc-200 whitespace-nowrap print:text-black">{truck.plate}</td>
                            <td className="px-3 py-2 text-zinc-400 whitespace-nowrap print:text-zinc-600">
                              {truck.owner}
                              {truck.type === 'AFILIADO' && (
                                <span className="ml-1 text-violet-500 text-[10px] print:text-violet-700">A</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-white font-mono whitespace-nowrap print:text-black">{fmt(e.grossAmount)}</td>
                            <td className="px-3 py-2 text-right text-purple-400 font-mono whitespace-nowrap print:text-purple-700">{fmt(e.mechanicFee ?? 0)}</td>
                            <td className="px-3 py-2 text-right text-zinc-400 font-mono whitespace-nowrap print:text-zinc-600">{fmt(e.adminFee ?? 0)}</td>
                            <td className="px-3 py-2 text-right text-orange-400 font-mono whitespace-nowrap print:text-orange-700">{fmt(e.driverWage)}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap print:text-red-700">{fmt(e.nprFee ?? 0)}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap print:text-red-700">{fmt(e.commissionFee)}</td>
                            <td className={`px-3 py-2 text-right font-bold font-mono whitespace-nowrap ${netColor}`}>
                              {net < 0 ? `-$${Math.abs(net).toLocaleString('es-VE',{minimumFractionDigits:2})}` : fmt(net)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-zinc-800/50 border-t border-zinc-700 print:bg-zinc-50 print:border-zinc-400">
                        <td colSpan={2} className="px-3 py-2 text-zinc-400 font-semibold uppercase tracking-wide text-xs print:text-zinc-600">TOTAL</td>
                        <td className="px-3 py-2 text-right text-white font-bold font-mono print:text-black">{fmt(totals.gross)}</td>
                        <td className="px-3 py-2 text-right text-purple-400 font-bold font-mono print:text-purple-700">{fmt(totals.mec)}</td>
                        <td className="px-3 py-2 text-right text-zinc-400 font-bold font-mono print:text-zinc-600">{fmt(totals.admin)}</td>
                        <td className="px-3 py-2 text-right text-orange-400 font-bold font-mono print:text-orange-700">{fmt(totals.nomina)}</td>
                        <td className="px-3 py-2 text-right text-red-400 font-bold font-mono print:text-red-700">{fmt(totals.npr)}</td>
                        <td className="px-3 py-2 text-right text-red-400 font-bold font-mono print:text-red-700">{fmt(totals.gastosOp)}</td>
                        <td className={`px-3 py-2 text-right font-bold font-mono text-sm ${totals.net < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                          {totals.net < 0 ? `-$${Math.abs(totals.net).toLocaleString('es-VE',{minimumFractionDigits:2})}` : fmt(totals.net)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Resumen global por camión (totales de todos los períodos) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300">
            <div className="px-4 py-3 border-b border-zinc-800 print:border-zinc-300 print:bg-zinc-100">
              <p className="text-white font-semibold text-sm print:text-black">
                Resumen acumulado — todos los períodos
              </p>
              <p className="text-zinc-500 text-xs">{periods.length} períodos cerrados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 print:border-zinc-300">
                    <th className="text-left text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Vehículo</th>
                    <th className="text-left text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Dueño</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Facturación</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Total costos</th>
                    <th className="text-right text-zinc-500 font-semibold px-3 py-2 print:text-zinc-800">Neto total</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Períodos activos</th>
                  </tr>
                </thead>
                <tbody>
                  {trucks.map(truck => {
                    let gross = 0, costs = 0, net = 0, activePeriods = 0
                    for (const period of periods) {
                      const e = period.payroll.find(x => x.truck.plate === truck.plate) as any
                      if (e && e.grossAmount > 0) {
                        gross += e.grossAmount
                        costs += (e.mechanicFee ?? 0) + (e.adminFee ?? 0) + e.driverWage + (e.nprFee ?? 0) + e.commissionFee + e.deductions
                        net   += e.netAmount
                        activePeriods++
                      }
                    }
                    if (gross === 0 && activePeriods === 0) return null
                    const netColor = net < 0 ? 'text-red-400 print:text-red-700' : 'text-emerald-400 print:text-emerald-700'
                    return (
                      <tr key={truck.plate} className="border-b border-zinc-800/50 print:border-zinc-100">
                        <td className="px-3 py-2 font-mono text-zinc-200 print:text-black">{truck.plate}</td>
                        <td className="px-3 py-2 text-zinc-400 print:text-zinc-600">{truck.owner}</td>
                        <td className="px-3 py-2 text-right text-white font-mono print:text-black">{fmt(gross)}</td>
                        <td className="px-3 py-2 text-right text-red-400 font-mono print:text-red-700">{fmt(costs)}</td>
                        <td className={`px-3 py-2 text-right font-bold font-mono ${netColor}`}>
                          {net < 0 ? `-$${Math.abs(net).toLocaleString('es-VE',{minimumFractionDigits:2})}` : fmt(net)}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-500 print:text-zinc-500">{activePeriods}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen NPR acumulado */}
          {(() => {
            const totalNpr = periods.reduce((s, p) =>
              s + p.payroll.reduce((ps, e) => ps + ((e as any).nprFee ?? 0), 0), 0)
            if (totalNpr === 0) return null
            return (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 print:border-zinc-300">
                <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3 print:text-zinc-600">
                  Distribución NPR acumulada — {periods.length} períodos
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-zinc-500 text-xs">Total recaudado</p>
                    <p className="text-white font-bold text-lg font-mono mt-0.5 print:text-black">{fmt(totalNpr)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Encargado (10%)</p>
                    <p className="text-amber-400 font-bold text-lg font-mono mt-0.5 print:text-amber-700">{fmt(totalNpr * 0.10)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Empresa (90%)</p>
                    <p className="text-emerald-400 font-bold text-lg font-mono mt-0.5 print:text-emerald-700">{fmt(totalNpr * 0.90)}</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm 1.5cm; }
          body { background: white !important; }
          nav, header, aside, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
