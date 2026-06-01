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
      where: { ownerName: { equals: owner.name, mode: 'insensitive' }, status: { not: 'PAID' } },
      include: { payments: { select: { amount: true, date: true }, orderBy: { date: 'asc' } } },
      orderBy: { date: 'asc' },
    }),
  ])

  if (entries.length === 0) notFound()

  const e = entries as any[]

  // Totales consolidados
  const totalGastos    = e.reduce((s: number, x: any) => s + (x.commissionFee ?? 0), 0)
  const totalChofer    = e.reduce((s: number, x: any) => s + x.driverWage, 0)
  const totalMecanicos = e.reduce((s: number, x: any) => s + (x.mechanicFee ?? 0), 0)
  const totalAdmin     = e.reduce((s: number, x: any) => s + (x.adminFee ?? 0), 0)
  const totalDeductions= e.reduce((s: number, x: any) => s + x.deductions, 0)
  const totalSaldoIni  = e.reduce((s: number, x: any) => s + (x.saldoInicial ?? 0), 0)
  const totalAbono     = e.reduce((s: number, x: any) => s + (x.abono ?? 0), 0)
  const totalNet       = e.reduce((s: number, x: any) => s + x.netAmount, 0)
  const totalTireDebt  = tireDebts.reduce((s, d) => s + d.balance, 0)

  // Gastos por camión
  const gastosByTruck = new Map<string, typeof expenses>()
  for (const exp of expenses) {
    const key = exp.truck?.plate ?? '?'
    gastosByTruck.set(key, [...(gastosByTruck.get(key) ?? []), exp])
  }

  // Splits Aurumin / Luis Peña por camión
  const nprPct = (owner.nprPercent ?? 10) / 100
  const truckSplits = e.map((entry: any) => {
    const trips  = entry.truck.trips as any[]
    const gTrips = trips.filter((t: any) => t.route?.clientName !== 'LUIS PEÑA')
    const lpTrips= trips.filter((t: any) => t.route?.clientName === 'LUIS PEÑA')
    const gGross = gTrips.reduce( (s: number, t: any) => s + t.amount, 0)
    const lpGross= lpTrips.reduce((s: number, t: any) => s + t.amount, 0)
    const nprA   = Math.round(gGross  * nprPct * 100) / 100
    const nprLP  = Math.round(lpGross * nprPct * 100) / 100
    const saldoA = Math.round(((entry.saldoInicial ?? 0) + gGross - (entry.commissionFee ?? 0) - entry.driverWage - (entry.mechanicFee ?? 0) - (entry.adminFee ?? 0) + (owner.isNPROwner ? nprA : -nprA) - entry.deductions - (entry.abono ?? 0)) * 100) / 100
    const saldoLP= Math.round((lpGross - nprLP) * 100) / 100
    return { entryId: entry.id, gGross, lpGross, nprA, nprLP, saldoA, saldoLP }
  })

  // Consolidados Aurumin / Luis Peña
  const totalGrossA  = truckSplits.reduce((s, x) => s + x.gGross,  0)
  const totalGrossLP = truckSplits.reduce((s, x) => s + x.lpGross, 0)
  const totalNprA    = Math.round(totalGrossA  * nprPct * 100) / 100
  const totalNprLP   = Math.round(totalGrossLP * nprPct * 100) / 100
  const consSaldoA   = Math.round((totalSaldoIni + totalGrossA - totalGastos - totalChofer - totalMecanicos - totalAdmin + (owner.isNPROwner ? totalNprA : -totalNprA) - totalDeductions - totalAbono) * 100) / 100
  const consSaldoLP  = Math.round((totalGrossLP - totalNprLP) * 100) / 100

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
              {`${owner.type === 'AFILIADO' ? 'Afiliado' : 'Propio'} · ${owner.nprPercent}% NPR`}
            </span>
            <span className="text-zinc-500 text-xs">{entries.length} camión{entries.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>

        {/* Detalle por camión */}
        {e.map((entry: any) => {
          const truck      = entry.truck
          const split      = truckSplits.find(s => s.entryId === entry.id)!
          const truckGastos= gastosByTruck.get(truck.plate) ?? []

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

              {/* Desglose Aurumin / Luis Peña */}
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Aurumin */}
                  {split.gGross > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-amber-400 text-xs font-bold uppercase tracking-widest print:text-amber-600">Aurumin</p>
                      {(entry.saldoInicial ?? 0) !== 0 && (
                        <FinRow
                          label="Saldo anterior"
                          value={`${(entry.saldoInicial ?? 0) < 0 ? '-' : ''}$${fmt(Math.abs(entry.saldoInicial ?? 0))}`}
                          color={(entry.saldoInicial ?? 0) < 0 ? 'text-red-400 print:text-red-700' : 'text-emerald-400 print:text-emerald-700'}
                        />
                      )}
                      <FinRow label="Facturación"       value={`$${fmt(split.gGross)}`}              color="text-white print:text-black" />
                      {(entry.commissionFee ?? 0) > 0 && <FinRow label="Gastos operativos"  value={`-$${fmt(entry.commissionFee)}`}    color="text-red-400 print:text-red-700" />}
                      {entry.driverWage > 0           && <FinRow label="Nómina chofer"       value={`-$${fmt(entry.driverWage)}`}       color="text-orange-400 print:text-orange-700" />}
                      {(entry.mechanicFee ?? 0) > 0   && <FinRow label="Nómina mecánicos"    value={`-$${fmt(entry.mechanicFee)}`}      color="text-purple-400 print:text-purple-700" />}
                      {(entry.adminFee ?? 0) > 0      && <FinRow label="Administrativo"      value={`-$${fmt(entry.adminFee)}`}         color="text-zinc-400 print:text-zinc-600" />}
                      {split.nprA > 0                 && <FinRow label={`${owner.nprPercent ?? 10}% NPR`} value={`${owner.isNPROwner ? '+' : '-'}$${fmt(split.nprA)}`} color={owner.isNPROwner ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'} />}
                      {entry.deductions > 0           && <FinRow label="Otras deducciones"   value={`-$${fmt(entry.deductions)}`}       color="text-red-400 print:text-red-700" />}
                      {(entry.abono ?? 0) > 0         && <FinRow label="Abono recibido"      value={`-$${fmt(entry.abono)}`}            color="text-emerald-400 print:text-emerald-700" />}
                      <div className="border-t border-zinc-700 print:border-zinc-300 pt-1.5 flex justify-between text-sm">
                        <span className="text-white font-bold print:text-black">Saldo final</span>
                        <span className={`font-mono font-bold ${split.saldoA < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                          {split.saldoA < 0 ? `-$${fmt(Math.abs(split.saldoA))}` : `$${fmt(split.saldoA)}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Luis Peña */}
                  {split.lpGross > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-blue-400 text-xs font-bold uppercase tracking-widest print:text-blue-700">Luis Peña (Chino Peña)</p>
                      <FinRow label="Saldo anterior"    value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      <FinRow label="Facturación"        value={`$${fmt(split.lpGross)}`}           color="text-white print:text-black" />
                      <FinRow label="Gastos operativos"  value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      <FinRow label="Nómina chofer"      value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      <FinRow label="Nómina mecánicos"   value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      <FinRow label="Administrativo"     value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      {split.nprLP > 0               && <FinRow label={`${owner.nprPercent ?? 10}% NPR`} value={`${owner.isNPROwner ? '+' : '-'}$${fmt(split.nprLP)}`} color={owner.isNPROwner ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'} />}
                      <FinRow label="Abono recibido"     value="$0.00"                              color="text-zinc-600 print:text-zinc-500" />
                      <div className="border-t border-zinc-700 print:border-zinc-300 pt-1.5 flex justify-between text-sm">
                        <span className="text-white font-bold print:text-black">Saldo final</span>
                        <span className="font-mono font-bold text-blue-400 print:text-blue-700">${fmt(split.saldoLP)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gastos del período */}
                {truckGastos.length > 0 && (
                  <details className="mt-3">
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

        {/* Resumen consolidado — mismo formato Excel Fernando */}
        <div className="px-6 py-5 border-b border-zinc-800 print:border-zinc-200">
          <h2 className="text-white font-semibold text-sm mb-4 print:text-black">Resumen consolidado</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Aurumin consolidado */}
            {totalGrossA > 0 && (
              <div className="space-y-1.5">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-widest print:text-amber-600">Aurumin</p>
                {totalSaldoIni !== 0 && (
                  <FinRow
                    label="Saldo anterior"
                    value={`${totalSaldoIni < 0 ? '-' : ''}$${fmt(Math.abs(totalSaldoIni))}`}
                    color={totalSaldoIni < 0 ? 'text-red-400 print:text-red-700' : 'text-emerald-400 print:text-emerald-700'}
                  />
                )}
                <FinRow label="Facturación"       value={`$${fmt(totalGrossA)}`}          color="text-white print:text-black" />
                {totalGastos > 0    && <FinRow label="Gastos operativos"  value={`-$${fmt(totalGastos)}`}    color="text-red-400 print:text-red-700" />}
                {totalChofer > 0    && <FinRow label="Nómina choferes"    value={`-$${fmt(totalChofer)}`}    color="text-orange-400 print:text-orange-700" />}
                {totalMecanicos > 0 && <FinRow label="Nómina mecánicos"   value={`-$${fmt(totalMecanicos)}`} color="text-purple-400 print:text-purple-700" />}
                {totalAdmin > 0     && <FinRow label="Administrativo"     value={`-$${fmt(totalAdmin)}`}     color="text-zinc-400 print:text-zinc-600" />}
                {totalNprA > 0      && <FinRow label={`${owner.nprPercent ?? 10}% NPR`} value={`${owner.isNPROwner ? '+' : '-'}$${fmt(totalNprA)}`} color={owner.isNPROwner ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'} />}
                {totalDeductions > 0&& <FinRow label="Otras deducciones"  value={`-$${fmt(totalDeductions)}`} color="text-red-400 print:text-red-700" />}
                {totalAbono > 0     && <FinRow label="Abono recibido"     value={`-$${fmt(totalAbono)}`}     color="text-emerald-400 print:text-emerald-700" />}
                <div className="border-t border-zinc-700 print:border-zinc-300 pt-2 mt-1 flex justify-between">
                  <span className="text-white font-bold print:text-black">Saldo final</span>
                  <span className={`text-base font-bold font-mono ${consSaldoA < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
                    {consSaldoA < 0 ? `-$${fmt(Math.abs(consSaldoA))}` : `$${fmt(consSaldoA)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Luis Peña consolidado */}
            {totalGrossLP > 0 && (
              <div className="space-y-1.5">
                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest print:text-blue-700">Luis Peña (Chino Peña)</p>
                <FinRow label="Saldo anterior"    value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                <FinRow label="Facturación"        value={`$${fmt(totalGrossLP)}`}         color="text-white print:text-black" />
                <FinRow label="Gastos operativos"  value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                <FinRow label="Nómina choferes"    value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                <FinRow label="Nómina mecánicos"   value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                <FinRow label="Administrativo"     value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                {totalNprLP > 0 && <FinRow label={`${owner.nprPercent ?? 10}% NPR`} value={`${owner.isNPROwner ? '+' : '-'}$${fmt(totalNprLP)}`} color={owner.isNPROwner ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'} />}
                <FinRow label="Abono recibido"     value="$0.00"                           color="text-zinc-600 print:text-zinc-500" />
                <div className="border-t border-zinc-700 print:border-zinc-300 pt-2 mt-1 flex justify-between">
                  <span className="text-white font-bold print:text-black">Saldo final</span>
                  <span className="text-base font-bold font-mono text-blue-400 print:text-blue-700">${fmt(consSaldoLP)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Total a cobrar */}
          <div className="mt-4 pt-3 border-t border-zinc-700 print:border-zinc-300 flex justify-between items-center">
            <span className="text-white font-bold print:text-black">Total a cobrar</span>
            <span className={`text-xl font-bold font-mono ${totalNet < 0 ? 'text-red-400 print:text-red-700' : 'text-amber-400 print:text-amber-600'}`}>
              {totalNet < 0 ? `-$${fmt(Math.abs(totalNet))}` : `$${fmt(totalNet)}`}
            </span>
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

function FinRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400 print:text-zinc-600">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
