import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PrintButton from '../../truck/[truckId]/PrintButton'

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date | string) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CATEGORY_LABEL: Record<string, string> = {
  REPUESTO: 'Repuesto', MECANICA: 'Mecánica', ACEITE: 'Aceite', CAUCHO: 'Caucho',
  OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Administrativo', NPR: 'NPR',
  NOMINA: 'Nómina', VIATICO: 'Viático', OTRO: 'Otro',
}

export default async function OwnerRelacionPage({
  params,
}: {
  params: Promise<{ periodId: string; ownerId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { periodId, ownerId } = await params

  // AFILIADOs solo pueden ver sus propios datos
  if (session.role === 'AFILIADO') {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { ownerId: true } })
    if (user?.ownerId !== ownerId) redirect(`/nomina/${periodId}`)
  }

  const [period, owner] = await Promise.all([
    prisma.period.findUnique({ where: { id: periodId } }),
    prisma.owner.findUnique({ where: { id: ownerId } }),
  ])
  if (!period || !owner) notFound()

  // Todos los camiones de este dueño activos en este período
  const [entries, expenses, tireDebts] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId, truck: { ownerId } },
      include: {
        truck: {
          include: {
            driver: { select: { name: true } },
            trips: {
              where: { periodId },
              include: { route: { select: { name: true, clientName: true } } },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
      orderBy: { truck: { plate: 'asc' } },
    }),
    prisma.expense.findMany({
      where: { periodId, truck: { ownerId } },
      include: { truck: { select: { plate: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.tireDebt.findMany({
      where: { ownerName: { contains: owner.name, mode: 'insensitive' }, status: { not: 'PAID' } },
      include: { payments: { select: { amount: true, date: true }, orderBy: { date: 'asc' } } },
      orderBy: { date: 'asc' },
    }),
  ])

  if (entries.length === 0) notFound()

  const e = entries as any[]

  // Totales consolidados
  const totalGross     = e.reduce((s, x) => s + x.grossAmount, 0)
  const totalGastos    = e.reduce((s, x) => s + x.commissionFee, 0)
  const totalChofer    = e.reduce((s, x) => s + x.driverWage, 0)
  const totalMecanicos = e.reduce((s, x) => s + (x.mechanicFee ?? 0), 0)
  const totalAdmin     = e.reduce((s, x) => s + (x.adminFee ?? 0), 0)
  const totalNpr       = e.reduce((s, x) => s + (x.nprFee ?? 0), 0)
  const totalDeductions= e.reduce((s, x) => s + x.deductions, 0)
  const totalSaldoIni  = e.reduce((s, x) => s + (x.saldoInicial ?? 0), 0)
  const totalAbono     = e.reduce((s, x) => s + (x.abono ?? 0), 0)
  const totalNet       = e.reduce((s, x) => s + x.netAmount, 0)
  const totalTireDebt  = tireDebts.reduce((s, d) => s + d.balance, 0)

  // Gastos por camión
  const gastosByTruck = new Map<string, typeof expenses>()
  for (const exp of expenses) {
    const key = exp.truck?.plate ?? '?'
    gastosByTruck.set(key, [...(gastosByTruck.get(key) ?? []), exp])
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Toolbar */}
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:bg-white print:border-0 print:rounded-none">

        {/* Cabecera */}
        <div className="px-6 py-5 border-b border-zinc-800 print:border-zinc-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Empresa</p>
              <p className="text-white font-bold text-lg print:text-black">Acarreos José Rodríguez</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs print:text-zinc-400">Período</p>
              <p className="text-white font-semibold print:text-black">
                {fmtDate(period.startDate)} — {fmtDate(period.endDate)}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 print:border-zinc-200 flex items-center gap-3">
            <div>
              <p className="text-zinc-500 text-xs print:text-zinc-400">Propietario</p>
              <p className="text-white font-bold text-base print:text-black">{owner.name}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              owner.type === 'AFILIADO'
                ? 'bg-violet-500/10 text-violet-400 print:text-violet-700'
                : 'bg-zinc-700 text-zinc-300 print:text-zinc-600'
            }`}>
              {owner.type === 'AFILIADO' ? `Afiliado · ${owner.nprPercent}%` : 'Propio'}
            </span>
            <span className="text-zinc-500 text-xs">{entries.length} camión{entries.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>

        {/* Detalle por camión */}
        {e.map((entry: any) => {
          const truck  = entry.truck
          const trips  = truck.trips as any[]
          const gTrips = trips.filter((t: any) => t.route?.clientName !== 'LUIS PEÑA')
          const lpTrips= trips.filter((t: any) => t.route?.clientName === 'LUIS PEÑA')
          const gGross = gTrips.reduce((s: number, t: any) => s + t.amount, 0)
          const lpGross= lpTrips.reduce((s: number, t: any) => s + t.amount, 0)
          const truckGastos = gastosByTruck.get(truck.plate) ?? []

          return (
            <div key={entry.id} className="border-b border-zinc-800 print:border-zinc-200">
              {/* Cabecera del camión */}
              <div className="px-6 py-3 bg-zinc-800/30 print:bg-zinc-50 flex items-center justify-between">
                <div>
                  <span className="text-white font-semibold font-mono print:text-black">{truck.plate}</span>
                  <span className="text-zinc-400 text-sm ml-2 print:text-zinc-600">{truck.driver?.name}</span>
                </div>
                <span className={`text-sm font-bold font-mono ${entry.netAmount < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                  {entry.netAmount < 0 ? '-' : ''}${fmt(Math.abs(entry.netAmount))}
                </span>
              </div>

              {/* Desglose */}
              <div className="px-6 py-3 space-y-1.5 text-sm">
                {/* Facturación por cliente */}
                {gGross > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400 print:text-zinc-600">Facturación Aurumin</span>
                    <span className="text-white font-mono print:text-black">${fmt(gGross)}</span>
                  </div>
                )}
                {lpGross > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400 print:text-zinc-600">Facturación Luis Peña</span>
                    <span className="text-blue-400 font-mono print:text-blue-700">${fmt(lpGross)}</span>
                  </div>
                )}
                {gGross > 0 && lpGross > 0 && (
                  <div className="flex justify-between font-medium">
                    <span className="text-zinc-300 print:text-zinc-700">Total bruto</span>
                    <span className="text-white font-mono print:text-black">${fmt(entry.grossAmount)}</span>
                  </div>
                )}

                {/* Deducciones */}
                {entry.commissionFee > 0 && (
                  <div className="flex justify-between text-red-400 print:text-red-700">
                    <span>Gastos operativos</span>
                    <span className="font-mono">-${fmt(entry.commissionFee)}</span>
                  </div>
                )}
                {entry.driverWage > 0 && (
                  <div className="flex justify-between text-orange-400 print:text-orange-700">
                    <span>Nómina chofer</span>
                    <span className="font-mono">-${fmt(entry.driverWage)}</span>
                  </div>
                )}
                {(entry.mechanicFee ?? 0) > 0 && (
                  <div className="flex justify-between text-purple-400 print:text-purple-700">
                    <span>Nómina mecánicos</span>
                    <span className="font-mono">-${fmt(entry.mechanicFee)}</span>
                  </div>
                )}
                {(entry.adminFee ?? 0) > 0 && (
                  <div className="flex justify-between text-zinc-400 print:text-zinc-600">
                    <span>Administrativo</span>
                    <span className="font-mono">-${fmt(entry.adminFee)}</span>
                  </div>
                )}
                {(entry.nprFee ?? 0) > 0 && (
                  <div className="flex justify-between text-red-400 print:text-red-700">
                    <span>{owner.type === 'AFILIADO' ? `${owner.nprPercent}% NPR` : '5% NPR'}</span>
                    <span className="font-mono">-${fmt(entry.nprFee)}</span>
                  </div>
                )}
                {entry.deductions > 0 && (
                  <div className="flex justify-between text-red-400 print:text-red-700">
                    <span>Otras deducciones</span>
                    <span className="font-mono">-${fmt(entry.deductions)}</span>
                  </div>
                )}
                {entry.saldoInicial !== 0 && (
                  <div className={`flex justify-between ${entry.saldoInicial < 0 ? 'text-red-400 print:text-red-700' : 'text-emerald-400 print:text-emerald-700'}`}>
                    <span>Saldo anterior</span>
                    <span className="font-mono">
                      {entry.saldoInicial < 0 ? '-' : '+'}${fmt(Math.abs(entry.saldoInicial))}
                    </span>
                  </div>
                )}
                {entry.abono > 0 && (
                  <div className="flex justify-between text-emerald-400 print:text-emerald-700">
                    <span>Abono recibido</span>
                    <span className="font-mono">-${fmt(entry.abono)}</span>
                  </div>
                )}

                {/* Gastos del período por camión */}
                {truckGastos.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-zinc-500 text-xs cursor-pointer hover:text-zinc-300 transition-colors print:hidden">
                      Ver {truckGastos.length} gasto{truckGastos.length !== 1 ? 's' : ''} operativos
                    </summary>
                    <div className="mt-1.5 space-y-0.5 pl-2 border-l border-zinc-700 print:block">
                      {truckGastos.map(g => (
                        <div key={g.id} className="flex justify-between text-xs">
                          <span className="text-zinc-500 print:text-zinc-500">
                            {fmtDate(g.date)} · {g.description}
                          </span>
                          <span className="text-zinc-400 font-mono print:text-zinc-600">${fmt(g.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )
        })}

        {/* Resumen consolidado del dueño */}
        <div className="px-6 py-5 border-b border-zinc-800 print:border-zinc-200">
          <h2 className="text-white font-semibold text-sm mb-3 print:text-black">Resumen consolidado</h2>
          <div className="space-y-1.5 text-sm">
            <SumRow label="Facturación bruta total"  value={totalGross}      color="text-white" />
            {totalGastos > 0    && <SumRow label="Gastos operativos"   value={-totalGastos}    color="text-red-400" />}
            {totalChofer > 0    && <SumRow label="Nómina choferes"     value={-totalChofer}    color="text-orange-400" />}
            {totalMecanicos > 0 && <SumRow label="Nómina mecánicos"    value={-totalMecanicos} color="text-purple-400" />}
            {totalAdmin > 0     && <SumRow label="Administrativo"      value={-totalAdmin}     color="text-zinc-400" />}
            {totalNpr > 0       && <SumRow label="NPR"                 value={-totalNpr}       color="text-red-400" />}
            {totalDeductions > 0&& <SumRow label="Otras deducciones"   value={-totalDeductions}color="text-red-400" />}
            {totalSaldoIni !== 0&& <SumRow label="Saldo anterior"      value={totalSaldoIni}   color={totalSaldoIni < 0 ? 'text-red-400' : 'text-emerald-400'} />}
            {totalAbono > 0     && <SumRow label="Abono recibido"      value={-totalAbono}     color="text-emerald-400" />}

            <div className="border-t border-zinc-700 print:border-zinc-300 pt-3 mt-2 flex items-center justify-between">
              <span className="text-white font-bold print:text-black">Saldo final del período</span>
              <span className={`text-xl font-bold font-mono ${totalNet < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                {totalNet < 0 ? '-' : ''}${fmt(Math.abs(totalNet))}
              </span>
            </div>
          </div>
        </div>

        {/* Deudas de cauchos */}
        {tireDebts.length > 0 && (
          <div className="px-6 py-4 border-b border-zinc-800 print:border-zinc-200">
            <h2 className="text-white font-semibold text-sm mb-3 print:text-black">Deuda de cauchos</h2>
            <div className="space-y-2">
              {tireDebts.map(debt => (
                <div key={debt.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-zinc-300 print:text-zinc-700">{debt.quantity} {debt.tireType.toUpperCase()}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                      debt.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 print:text-amber-700' : 'bg-red-500/10 text-red-400 print:text-red-700'
                    }`}>{debt.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-zinc-500 print:text-zinc-500 text-xs">${fmt(debt.totalAmount)} total · </span>
                    <span className="text-red-400 print:text-red-700 font-semibold">${fmt(debt.balance)} debe</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-zinc-700 print:border-zinc-300 pt-2 flex justify-between font-semibold text-sm">
                <span className="text-zinc-400 print:text-zinc-600">Total deuda cauchos</span>
                <span className="text-red-400 font-mono print:text-red-700">${fmt(totalTireDebt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer impresión */}
        <div className="hidden print:block px-6 py-4 text-center border-t border-zinc-200">
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
          details { display: block !important; }
          details summary { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function SumRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400 print:text-zinc-600">{label}</span>
      <span className={`font-mono ${color}`}>
        {value < 0 ? '-' : ''}${fmt(Math.abs(value))}
      </span>
    </div>
  )
}
