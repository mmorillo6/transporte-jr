'use client'

type Props = {
  session: { name: string; role: string }
  truck: { id: string; plate: string; ownerName: string } | null
  todayDispatch: {
    plannedTrips: number
    routeName: string
    fuelLiters: number
    rate: number
    rateType: string
    dispatchNotes: string | null
  } | null
  payrollEntry: {
    grossAmount: number
    netAmount: number
    totalTons: number
    driverWage: number
    deductions: number
    paidAt: string | null
  } | null
  periodLabel: {
    start: string
    end: string
    tripCount: number
    tons: number
  } | null
  recentTrips: {
    id: string
    date: string
    ticketNo: string | null
    routeName: string
    netWeightKg: number | null
    amount: number
  }[]
  totalDebt: number
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })

export default function MiCuentaChofer({
  session, truck, todayDispatch, payrollEntry, periodLabel, recentTrips, totalDebt,
}: Props) {
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="pt-2">
        <p className="text-zinc-500 text-sm">{greeting},</p>
        <h1 className="text-2xl font-bold text-white">{session.name.split(' ')[0]}</h1>
        {truck && (
          <p className="text-zinc-500 text-xs mt-0.5">
            Placa <span className="text-white font-mono font-semibold">{truck.plate}</span>
            {' · '}{truck.ownerName}
          </p>
        )}
      </div>

      {/* No truck assigned */}
      {!truck && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 text-center">
          <p className="text-amber-400 font-medium">Sin camión asignado</p>
          <p className="text-zinc-500 text-sm mt-1">Consulta con el encargado.</p>
        </div>
      )}

      {/* Today's dispatch */}
      {truck && (
        <div className={`rounded-2xl p-5 border ${todayDispatch ? 'bg-zinc-900 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${todayDispatch ? 'bg-amber-400 animate-pulse' : 'bg-zinc-700'}`} />
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Hoy — {fmtDate(now.toISOString())}</p>
          </div>

          {todayDispatch ? (
            <div className="space-y-3">
              <div>
                <p className="text-white font-bold text-xl">{todayDispatch.routeName}</p>
                <p className="text-zinc-400 text-sm mt-0.5">
                  {todayDispatch.plannedTrips} {todayDispatch.plannedTrips === 1 ? 'viaje planeado' : 'viajes planeados'}
                </p>
              </div>

              {/* Gasoil box */}
              <div className="bg-zinc-800/60 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 text-xs">Gasoil a surtir</p>
                  <p className="text-amber-400 font-bold text-2xl mt-0.5">
                    {todayDispatch.fuelLiters > 0 ? `${todayDispatch.fuelLiters.toFixed(0)} L` : <span className="text-zinc-500 text-base font-normal">No configurado</span>}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h2l2 9h10l2-9h2M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2" />
                  </svg>
                </div>
              </div>

              {/* Estimated earnings for today */}
              {todayDispatch.rateType === 'PER_TRIP' && (
                <div className="bg-zinc-800/60 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">Facturación estimada hoy</p>
                  <p className="text-emerald-400 font-bold text-lg mt-0.5">
                    ${(todayDispatch.rate * todayDispatch.plannedTrips).toFixed(2)}
                  </p>
                  <p className="text-zinc-600 text-xs mt-0.5">${todayDispatch.rate} × {todayDispatch.plannedTrips} viajes</p>
                </div>
              )}

              {todayDispatch.dispatchNotes && (
                <div className="bg-zinc-800/60 rounded-xl p-3 border-l-2 border-amber-500">
                  <p className="text-zinc-400 text-xs font-medium mb-1">Nota del encargado</p>
                  <p className="text-zinc-300 text-sm">{todayDispatch.dispatchNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-zinc-500 text-sm">Sin despacho asignado para hoy</p>
              <p className="text-zinc-600 text-xs mt-1">Consulta con Fernando.</p>
            </div>
          )}
        </div>
      )}

      {/* Current period earnings */}
      {periodLabel && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Quincena actual</p>
            <p className="text-zinc-600 text-xs">{fmt(periodLabel.start)} — {fmt(periodLabel.end)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Viajes</p>
              <p className="text-white font-bold text-2xl mt-0.5">{periodLabel.tripCount}</p>
            </div>
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Toneladas</p>
              <p className="text-white font-bold text-2xl mt-0.5">{periodLabel.tons.toFixed(1)}</p>
            </div>
          </div>

          {payrollEntry ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Facturación bruta</span>
                <span className="text-white font-medium">${payrollEntry.grossAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Nómina chofer</span>
                <span className="text-orange-400">-${payrollEntry.driverWage.toFixed(2)}</span>
              </div>
              {payrollEntry.deductions > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Deducciones</span>
                  <span className="text-red-400">-${payrollEntry.deductions.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-800 flex justify-between">
                <span className="text-white font-semibold">Saldo estimado</span>
                <span className={`font-bold text-lg ${payrollEntry.paidAt ? 'text-emerald-400' : 'text-amber-400'}`}>
                  ${payrollEntry.netAmount.toFixed(2)}
                </span>
              </div>
              {payrollEntry.paidAt && (
                <p className="text-emerald-400 text-xs text-center">✓ Pagado el {fmt(payrollEntry.paidAt)}</p>
              )}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center">Nómina aún no generada para esta quincena</p>
          )}
        </div>
      )}

      {/* Loan / debt */}
      {totalDebt > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-400 text-xs font-medium uppercase tracking-wide">Préstamo pendiente</p>
              <p className="text-red-400 font-bold text-2xl mt-1">${totalDebt.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <p className="text-zinc-500 text-xs mt-2">Se descontará en las próximas quincenas.</p>
        </div>
      )}

      {/* Recent trips */}
      {recentTrips.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Últimos viajes registrados</p>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {recentTrips.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{t.routeName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {fmt(t.date)}
                    {t.ticketNo && <span className="ml-2 font-mono">#{t.ticketNo}</span>}
                    {t.netWeightKg && <span className="ml-2">{(t.netWeightKg / 1000).toFixed(2)} ton</span>}
                  </p>
                </div>
                <p className="text-amber-400 font-semibold text-sm">${t.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
