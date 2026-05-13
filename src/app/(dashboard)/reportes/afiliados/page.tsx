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
  const d = (d: Date) =>
    new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  return `${d(start)} al ${d(end)}`
}

export default async function AfiliadosNPRPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const [affiliatedTrucks, periods] = await Promise.all([
    // Todos los camiones afiliados, ordenados por placa
    prisma.truck.findMany({
      where: { owner: { type: 'AFILIADO' } },
      select: { id: true, plate: true, owner: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
    // Períodos cerrados que tengan al menos una entrada de afiliado
    prisma.period.findMany({
      where: {
        status: 'CLOSED',
        payroll: { some: { truck: { owner: { type: 'AFILIADO' } } } },
      },
      include: {
        payroll: {
          where: { truck: { owner: { type: 'AFILIADO' } } },
          select: { truckId: true, nprFee: true, grossAmount: true },
        },
      },
      orderBy: { startDate: 'desc' },
    }),
  ])

  // Acumulados por camión (todas las quincenas)
  const accumByTruck: Record<string, { npr: number; gross: number }> = {}
  for (const truck of affiliatedTrucks) {
    accumByTruck[truck.id] = { npr: 0, gross: 0 }
  }
  for (const period of periods) {
    for (const entry of period.payroll) {
      if (accumByTruck[entry.truckId]) {
        accumByTruck[entry.truckId].npr   += entry.nprFee ?? 0
        accumByTruck[entry.truckId].gross += entry.grossAmount
      }
    }
  }

  const totalNprAll = Object.values(accumByTruck).reduce((s, v) => s + v.npr, 0)

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
          <h1 className="text-2xl font-bold text-white">% Afiliados — NPR</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            NPR por vehículo afiliado en cada período · distribución 10% encargado / 90% empresa
          </p>
        </div>
        <PrintButton />
      </div>

      {affiliatedTrucks.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
          <p className="text-zinc-500">No hay camiones afiliados registrados</p>
        </div>
      ) : periods.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
          <p className="text-zinc-500">No hay períodos cerrados con actividad de afiliados</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs">Afiliados activos</p>
              <p className="text-white font-bold text-2xl mt-1">{affiliatedTrucks.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs">Períodos con actividad</p>
              <p className="text-white font-bold text-2xl mt-1">{periods.length}</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-300 text-xs">Encargado (10% acumulado)</p>
              <p className="text-amber-400 font-bold text-2xl mt-1 font-mono">
                {fmt(totalNprAll * 0.10)}
              </p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-emerald-300 text-xs">Empresa (90% acumulado)</p>
              <p className="text-emerald-400 font-bold text-2xl mt-1 font-mono">
                {fmt(totalNprAll * 0.90)}
              </p>
            </div>
          </div>

          {/* Tabla histórica */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300 print:rounded-none">
            <div className="px-4 py-3 border-b border-zinc-800 print:border-zinc-300 print:bg-zinc-100">
              <p className="text-white font-semibold text-sm print:text-black">
                NPR por vehículo afiliado — histórico
              </p>
              <p className="text-zinc-500 text-xs">{periods.length} períodos cerrados</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: `${200 + affiliatedTrucks.length * 120 + 280}px` }}>
                <thead>
                  <tr className="border-b border-zinc-800 print:border-zinc-300 bg-zinc-800/30 print:bg-zinc-50">
                    <th className="text-left text-zinc-500 font-medium px-3 py-2.5 whitespace-nowrap print:text-zinc-600">
                      Período
                    </th>
                    {affiliatedTrucks.map(t => (
                      <th key={t.id} className="text-right text-zinc-500 font-medium px-3 py-2.5 whitespace-nowrap print:text-zinc-600">
                        <span className="font-mono">{t.plate}</span>
                        <span className="block text-zinc-600 font-normal text-[10px]">{t.owner.name}</span>
                      </th>
                    ))}
                    <th className="text-right text-zinc-500 font-semibold px-3 py-2.5 whitespace-nowrap print:text-zinc-800">
                      Total
                    </th>
                    <th className="text-right text-amber-500/70 font-medium px-3 py-2.5 whitespace-nowrap print:text-zinc-600">
                      Enc. 10%
                    </th>
                    <th className="text-right text-emerald-500/70 font-medium px-3 py-2.5 whitespace-nowrap print:text-zinc-600">
                      Emp. 90%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map(period => {
                    const byTruck: Record<string, number> = {}
                    for (const entry of period.payroll) {
                      byTruck[entry.truckId] = (byTruck[entry.truckId] ?? 0) + (entry.nprFee ?? 0)
                    }
                    const rowTotal = Object.values(byTruck).reduce((s, v) => s + v, 0)

                    return (
                      <tr key={period.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors print:border-zinc-100">
                        <td className="px-3 py-2 text-zinc-300 whitespace-nowrap print:text-zinc-700">
                          <Link
                            href={`/nomina/${period.id}`}
                            className="hover:text-amber-400 transition-colors print:text-zinc-700 print:no-underline"
                          >
                            {fmtPeriod(period.startDate, period.endDate)}
                          </Link>
                        </td>
                        {affiliatedTrucks.map(t => {
                          const val = byTruck[t.id] ?? 0
                          return (
                            <td key={t.id} className="px-3 py-2 text-right font-mono whitespace-nowrap">
                              {val > 0
                                ? <span className="text-violet-400 print:text-violet-700">{fmt(val)}</span>
                                : <span className="text-zinc-700">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-bold font-mono text-white whitespace-nowrap print:text-black">
                          {fmt(rowTotal)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-400 whitespace-nowrap print:text-amber-700">
                          {fmt(rowTotal * 0.10)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400 whitespace-nowrap print:text-emerald-700">
                          {fmt(rowTotal * 0.90)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-800/60 border-t border-zinc-700 print:bg-zinc-100 print:border-zinc-400">
                    <td className="px-3 py-2.5 text-zinc-400 font-semibold uppercase tracking-wide text-xs print:text-zinc-600">
                      TOTAL
                    </td>
                    {affiliatedTrucks.map(t => (
                      <td key={t.id} className="px-3 py-2.5 text-right font-bold font-mono text-violet-400 whitespace-nowrap print:text-violet-700">
                        {fmt(accumByTruck[t.id]?.npr ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-bold font-mono text-white text-sm whitespace-nowrap print:text-black">
                      {fmt(totalNprAll)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold font-mono text-amber-400 whitespace-nowrap print:text-amber-700">
                      {fmt(totalNprAll * 0.10)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold font-mono text-emerald-400 whitespace-nowrap print:text-emerald-700">
                      {fmt(totalNprAll * 0.90)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tabla de facturación bruta por afiliado */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300 print:rounded-none print:mt-6">
            <div className="px-4 py-3 border-b border-zinc-800 print:border-zinc-300 print:bg-zinc-100">
              <p className="text-white font-semibold text-sm print:text-black">Facturación bruta acumulada por afiliado</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[400px]">
                <thead>
                  <tr className="border-b border-zinc-800 print:border-zinc-300 bg-zinc-800/30 print:bg-zinc-50">
                    <th className="text-left text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Vehículo</th>
                    <th className="text-left text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Dueño</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Facturación total</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">NPR total (10%)</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Enc.</th>
                    <th className="text-right text-zinc-500 font-medium px-3 py-2 print:text-zinc-600">Períodos</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliatedTrucks.map(t => {
                    const data = accumByTruck[t.id] ?? { npr: 0, gross: 0 }
                    if (data.gross === 0) return null
                    return (
                      <tr key={t.id} className="border-b border-zinc-800/50 print:border-zinc-100">
                        <td className="px-3 py-2 font-mono text-zinc-200 print:text-black">{t.plate}</td>
                        <td className="px-3 py-2 text-zinc-400 print:text-zinc-600">{t.owner.name}</td>
                        <td className="px-3 py-2 text-right text-white font-mono print:text-black">{fmt(data.gross)}</td>
                        <td className="px-3 py-2 text-right text-violet-400 font-mono print:text-violet-700">{fmt(data.npr)}</td>
                        <td className="px-3 py-2 text-right text-amber-400 font-mono print:text-amber-700">{fmt(data.npr * 0.10)}</td>
                        <td className="px-3 py-2 text-right text-zinc-500 print:text-zinc-500">
                          {periods.filter(p => p.payroll.some(e => e.truckId === t.id && e.grossAmount > 0)).length}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
