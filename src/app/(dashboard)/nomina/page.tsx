import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import NominaActions from './NominaActions'

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

function formatDate(d: Date) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function NominaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const periods = await getPeriods()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Nómina</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Calcula el pago quincenal por camión: facturación, viáticos, comisiones, NPR y deducciones. También muestra la nómina de choferes por período.</p>
      </div>

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
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
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

                  <div className="flex items-center gap-2 flex-shrink-0">
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
