'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwner, createOwner, deleteOwner } from '@/app/actions/config'
import { toast } from 'sonner'

type TruckSummary = {
  id: string
  plate: string
  driver: { name: string } | null
  status: { status: string } | null
}

type Owner = {
  id: string; name: string; type: string; nprPercent: number; isNPROwner: boolean
  phone: string | null; active: boolean
  trucks: TruckSummary[]
  _count: { trucks: number }
}

type PeriodGroup = {
  period: { id: string; startDate: string; endDate: string; status: string }
  grossAmount: number; commissionFee: number; netAmount: number; truckCount: number
}

type TruckPayroll = {
  grossAmount: number; netAmount: number
  periodLabel: string; status: string; paidAt: string | null
}

const TYPE_STYLE: Record<string, string> = {
  PROPIO:   'text-emerald-400 bg-emerald-400/10',
  AFILIADO: 'text-violet-400 bg-violet-400/10',
}
const STATUS_STYLE: Record<string, { label: string; style: string }> = {
  OPERATIONAL:    { label: 'Operativo',        style: 'text-emerald-400 bg-emerald-400/10' },
  IN_SHOP:        { label: 'En taller',        style: 'text-amber-400 bg-amber-400/10' },
  OUT_OF_SERVICE: { label: 'Fuera de servicio', style: 'text-red-400 bg-red-400/10' },
}

export default function DuenosClient({
  owners,
  payrollByOwner,
  latestPayrollByTruck,
}: {
  owners: Owner[]
  payrollByOwner: Record<string, PeriodGroup[]>
  latestPayrollByTruck: Record<string, TruckPayroll>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Owner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null)

  function formatPeriod(start: string, end: string) {
    const fmt = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    return `${fmt(start)} — ${fmt(end)}`
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar al dueño "${name}"? Esta acción no se puede deshacer.`)) return
    const res = await deleteOwner(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = editing ? await updateOwner(editing.id, fd) : await createOwner(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setEditing(null); setShowForm(false); router.refresh(); setLoading(false) }
  }

  const formOpen = showForm || !!editing

  return (
    <div className="space-y-4">
      <button onClick={() => { setShowForm(true); setEditing(null); setError('') }}
        className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
        + Nuevo dueño
      </button>

      {formOpen && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{editing ? 'Editar dueño' : 'Nuevo dueño'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Nombre *</label>
                <input name="name" required defaultValue={editing?.name ?? ''}
                  placeholder="Jose Rodríguez"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo *</label>
                <select name="type" required defaultValue={editing?.type ?? 'PROPIO'}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="PROPIO">Propio (empresa)</option>
                  <option value="AFILIADO">Afiliado (externo)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">% NPR</label>
                <input name="nprPercent" type="number" step="0.1" min="0" max="100"
                  defaultValue={editing?.nprPercent ?? 5}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                <p className="text-zinc-600 text-xs mt-1">5% propio · 10% afiliado</p>
              </div>
              <div className="flex flex-col justify-center">
                <label className="block text-xs text-zinc-400 mb-1.5">Es dueño del NPR</label>
                <select name="isNPROwner" defaultValue={editing?.isNPROwner ? 'true' : 'false'}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="false">No</option>
                  <option value="true">Sí (exento)</option>
                </select>
                <p className="text-zinc-600 text-xs mt-1">Su NPR no se descuenta</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Teléfono</label>
                <input name="phone" type="tel" defaultValue={editing?.phone ?? ''} placeholder="04141234567" maxLength={15}
                  onKeyDown={e => { if (!/[\d+\-\s()]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear dueño'}
              </button>
              <button type="button" onClick={() => { setEditing(null); setShowForm(false) }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {owners.map(owner => {
          const isExpanded = expandedOwner === owner.id
          const periods = payrollByOwner[owner.id] ?? []
          const totalNet = periods.reduce((s, p) => s + p.netAmount, 0)

          return (
            <div key={owner.id}
              className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${
                isExpanded ? 'border-zinc-700' : 'border-zinc-800'
              } ${!owner.active ? 'opacity-50' : ''}`}>

              {/* ── Fila principal del propietario ── */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                onClick={() => setExpandedOwner(prev => prev === owner.id ? null : owner.id)}
              >
                {/* Chevron */}
                <span className={`text-zinc-500 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>

                {/* Nombre + tipo */}
                <div className="flex items-center gap-2 min-w-[160px]">
                  <span className="text-white font-semibold text-sm">{owner.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_STYLE[owner.type]}`}>
                    {owner.type === 'PROPIO' ? 'Propio' : 'Afiliado'}
                  </span>
                </div>

                {/* NPR */}
                <div className="w-28 text-sm">
                  {owner.isNPROwner ? (
                    <span className="text-amber-400 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20">
                      Dueño NPR
                    </span>
                  ) : (
                    <span className="text-zinc-400">{owner.nprPercent}% NPR</span>
                  )}
                </div>

                {/* Teléfono */}
                <span className="text-zinc-500 text-xs w-32">{owner.phone ?? '—'}</span>

                {/* Camiones */}
                <div className="flex flex-wrap gap-1 flex-1">
                  {owner.trucks.length === 0
                    ? <span className="text-zinc-600 text-xs">Sin camiones</span>
                    : owner.trucks.map(t => {
                        const st = t.status?.status ?? 'OPERATIONAL'
                        const isOk = st === 'OPERATIONAL'
                        return (
                          <span key={t.plate}
                            className={`text-xs font-mono px-2 py-0.5 rounded border ${
                              isOk
                                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                : st === 'IN_SHOP'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                            {t.plate}
                          </span>
                        )
                      })
                  }
                </div>

                {/* Balance rápido */}
                {periods.length > 0 && (
                  <span className={`text-xs font-semibold whitespace-nowrap ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${Math.abs(totalNet).toFixed(0)} {totalNet < 0 ? 'debe' : 'acum.'}
                  </span>
                )}

                {/* Acciones */}
                <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditing(owner); setShowForm(false); setError('') }}
                    className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(owner.id, owner.name)}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1.5" title="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Ficha expandida ── */}
              {isExpanded && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">

                  {/* Fichas de camiones */}
                  {owner.trucks.length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-2">Flota</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {owner.trucks.map(truck => {
                          const st = truck.status?.status ?? 'OPERATIONAL'
                          const stInfo = STATUS_STYLE[st] ?? STATUS_STYLE.OPERATIONAL
                          const payroll = latestPayrollByTruck[truck.id] ?? null
                          return (
                            <div key={truck.id}
                              className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-white font-semibold text-sm">{truck.plate}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${stInfo.style}`}>
                                  {stInfo.label}
                                </span>
                              </div>
                              <p className="text-zinc-400 text-xs">{truck.driver?.name ?? 'Sin chofer'}</p>
                              {payroll ? (
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-700/50">
                                  <div>
                                    <p className="text-zinc-600 text-[10px]">Bruto — {payroll.periodLabel}</p>
                                    <p className="text-zinc-300 text-xs font-medium">${payroll.grossAmount.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-zinc-600 text-[10px]">Saldo final</p>
                                    <p className={`text-xs font-semibold ${payroll.netAmount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                      {payroll.netAmount < 0 ? '-' : ''}${Math.abs(payroll.netAmount).toFixed(2)}
                                      {payroll.paidAt && <span className="text-zinc-500 font-normal ml-1">✓ pagado</span>}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-zinc-600 text-[10px] pt-1 border-t border-zinc-700/50">Sin nóminas</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Historial de períodos */}
                  {periods.length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-2">Historial de períodos</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-700">
                              <th className="text-left text-zinc-500 font-medium py-2">Período</th>
                              <th className="text-right text-zinc-500 font-medium py-2">Carros</th>
                              <th className="text-right text-zinc-500 font-medium py-2">Bruto</th>
                              <th className="text-right text-zinc-500 font-medium py-2">Gastos Op.</th>
                              <th className="text-right text-zinc-500 font-medium py-2">Neto</th>
                              <th className="text-left text-zinc-500 font-medium py-2 pl-3">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {periods.map(pg => (
                              <tr key={pg.period.id} className="border-b border-zinc-700/40">
                                <td className="py-2 text-zinc-300">{formatPeriod(pg.period.startDate, pg.period.endDate)}</td>
                                <td className="py-2 text-right text-zinc-400">{pg.truckCount}</td>
                                <td className="py-2 text-right text-white">${pg.grossAmount.toFixed(2)}</td>
                                <td className="py-2 text-right text-zinc-400">${pg.commissionFee.toFixed(2)}</td>
                                <td className={`py-2 text-right font-semibold ${pg.netAmount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {pg.netAmount < 0 ? '-' : ''}${Math.abs(pg.netAmount).toFixed(2)}
                                </td>
                                <td className="py-2 pl-3">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                                    pg.period.status === 'CLOSED'
                                      ? 'text-zinc-400 bg-zinc-700'
                                      : 'text-emerald-400 bg-emerald-400/10'
                                  }`}>
                                    {pg.period.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {owner.trucks.length === 0 && periods.length === 0 && (
                    <p className="text-zinc-500 text-sm">Sin actividad registrada</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
