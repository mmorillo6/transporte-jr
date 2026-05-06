'use client'
import { useState } from 'react'
import { getOwnerAnalysis } from '@/app/actions/analisis'
import type { OwnerAnalysis } from '@/app/actions/analisis'

type Owner  = { id: string; name: string; type: string; nprPercent: number }
type Period = { id: string; startDate: Date; endDate: Date; status: string }

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const CLIENT_COLOR: Record<string, string> = {
  'AURUMIN':    'text-amber-400 border-amber-500/30 bg-amber-500/5',
  'LUIS PEÑA':  'text-blue-400 border-blue-500/30 bg-blue-500/5',
}
const CLIENT_LABEL: Record<string, string> = {
  'AURUMIN':   'Aurumin',
  'LUIS PEÑA': 'Chino Peña (Luis Peña)',
}

export default function AnalisisClient({ owners, periods }: { owners: Owner[]; periods: Period[] }) {
  const [ownerId,  setOwnerId]  = useState('')
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '')
  const [data,     setData]     = useState<OwnerAnalysis | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLoad() {
    if (!ownerId || !periodId) return
    setLoading(true)
    const res = await getOwnerAnalysis(ownerId, periodId)
    setData(res)
    setLoading(false)
  }

  const isAfiliado = data?.owner.type === 'AFILIADO'

  return (
    <div className="space-y-4">

      {/* Selectores */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Propietario</label>
          <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-48">
            <option value="">Seleccionar...</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.name} — {o.type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Período</label>
          <select value={periodId} onChange={e => setPeriodId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {fmtDate(p.startDate)} – {fmtDate(p.endDate)}{p.status === 'OPEN' ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>
        <button onClick={handleLoad} disabled={!ownerId || loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors">
          {loading ? 'Calculando…' : 'Ver análisis'}
        </button>
      </div>

      {data && (
        <div className="space-y-4">

          {/* Header dueño */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wide">Propietario</p>
                <p className="text-white font-bold text-lg mt-0.5">{data.owner.name}</p>
                <p className="text-zinc-500 text-sm">{data.owner.type} · {data.owner.nprPercent}% NPR · {data.periodLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-500 text-xs">Facturación total</p>
                <p className="text-2xl font-bold text-amber-400">{fmt$(data.totalBilling)}</p>
                {!isAfiliado && (
                  <p className="text-sm text-emerald-400 font-semibold mt-1">Neto: {fmt$(data.totalNet)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Resumen por cliente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.totalByClient.map(c => {
              const color = CLIENT_COLOR[c.clientName] ?? 'text-zinc-300 border-zinc-700 bg-zinc-900'
              const label = CLIENT_LABEL[c.clientName] ?? c.clientName
              return (
                <div key={c.clientName} className={`border rounded-2xl p-4 ${color}`}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3 opacity-80">{label}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-zinc-500 text-xs mb-0.5">Facturado</p>
                      <p className="text-xl font-bold">{fmt$(c.billing)}</p>
                      <p className="text-zinc-600 text-xs mt-1">{c.trips} viajes · {c.tons.toFixed(1)} ton</p>
                    </div>
                    {isAfiliado ? (
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">Su pago ({data.owner.nprPercent}% + 20%)</p>
                        <p className="text-zinc-500 text-xs">− {fmt$(c.nprFee)} NPR</p>
                        <p className="text-xs text-zinc-500">= {fmt$(c.billing - c.nprFee)} × 20%</p>
                        <p className="text-xl font-bold text-emerald-400 mt-1">{fmt$(c.driverShare)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">NPR {data.owner.nprPercent}%</p>
                        <p className="text-lg font-semibold text-red-400">− {fmt$(c.nprFee)}</p>
                        <p className="text-zinc-500 text-xs mt-1">Base: {fmt$(c.billing - c.nprFee)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detalle por camión */}
          {data.trucks.filter(t => t.totalBilling > 0 || t.netAmount !== 0).map(truck => (
            <div key={truck.truckId} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Header camión */}
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-white font-bold font-mono">{truck.plate}</span>
                  <span className="text-zinc-500 text-sm ml-2">— {truck.driverName}</span>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-semibold">{fmt$(truck.totalBilling)}</p>
                  {!isAfiliado && truck.netAmount !== 0 && (
                    <p className={`text-xs font-semibold ${truck.netAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      Neto: {fmt$(truck.netAmount)}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Por cliente */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {truck.byClient.map(c => (
                    <div key={c.clientName}
                      className={`rounded-xl p-3 border text-sm ${CLIENT_COLOR[c.clientName] ?? 'border-zinc-700 bg-zinc-800/50'}`}>
                      <p className="text-xs font-semibold uppercase opacity-70 mb-1">
                        {CLIENT_LABEL[c.clientName] ?? c.clientName}
                      </p>
                      <p className="font-bold text-base">{fmt$(c.billing)}</p>
                      <p className="text-zinc-500 text-xs">{c.trips} v · {c.tons.toFixed(1)} t</p>
                      {isAfiliado && (
                        <p className="text-emerald-400 text-xs font-semibold mt-1">
                          Su pago: {fmt$(c.driverShare)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Deducciones (solo propios) */}
                {!isAfiliado && (truck.driverWage > 0 || truck.nprFee > 0 || truck.mechanicFee > 0 || truck.deductions > 0) && (
                  <div className="border-t border-zinc-800 pt-3 space-y-1.5">
                    <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Deducciones</p>
                    {truck.driverWage > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Sueldo chofer</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.driverWage)}</span>
                      </div>
                    )}
                    {truck.nprFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">NPR {data.owner.nprPercent}%</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.nprFee)}</span>
                      </div>
                    )}
                    {truck.mechanicFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Mecánica</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.mechanicFee)}</span>
                      </div>
                    )}
                    {truck.adminFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Gastos adm.</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.adminFee)}</span>
                      </div>
                    )}
                    {truck.deductions > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Otras deducciones</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.deductions)}</span>
                      </div>
                    )}
                    {truck.loans > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Préstamo pendiente</span>
                        <span className="text-red-400 font-mono">− {fmt$(truck.loans)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t border-zinc-700 pt-2 mt-2">
                      <span className="text-white font-semibold">Neto</span>
                      <span className={`font-bold font-mono ${truck.netAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt$(truck.netAmount)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Totales afiliado */}
                {isAfiliado && (
                  <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm">
                    <span className="text-white font-semibold">Total a cobrar</span>
                    <span className="text-emerald-400 font-bold font-mono">
                      {fmt$(truck.byClient.reduce((s, c) => s + c.driverShare, 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Total final afiliado */}
          {isAfiliado && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-emerald-400 font-semibold">Total a cobrar — {data.owner.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{data.periodLabel}</p>
              </div>
              <p className="text-2xl font-bold text-emerald-400">
                {fmt$(data.totalByClient.reduce((s, c) => s + c.driverShare, 0))}
              </p>
            </div>
          )}

          {/* Saldo final propios */}
          {!isAfiliado && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">Saldo final — {data.owner.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{data.periodLabel}</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${data.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt$(data.totalNet)}
                </p>
                {data.totalLoans > 0 && (
                  <p className="text-red-400 text-xs mt-0.5">Préstamos: − {fmt$(data.totalLoans)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
          <p className="text-zinc-500 text-sm">Selecciona un propietario y período para ver el análisis</p>
        </div>
      )}
    </div>
  )
}
