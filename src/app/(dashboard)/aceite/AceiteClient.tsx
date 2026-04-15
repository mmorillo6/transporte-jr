'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOilBatch, deleteOilBatch, createOilUsage, deleteOilUsage } from '@/app/actions/oil'
import { toast } from 'sonner'

const OIL_TYPES: Record<string, string> = {
  MOTOR: 'Motor', HIDRAULICO: 'Hidráulico', TRANSMISION: 'Transmisión',
  CAJA: 'Caja', DIFERENCIAL: 'Diferencial', OTRO: 'Otro',
}
const OIL_COLORS: Record<string, string> = {
  MOTOR: 'text-yellow-400 bg-yellow-400/10',
  HIDRAULICO: 'text-blue-400 bg-blue-400/10',
  TRANSMISION: 'text-purple-400 bg-purple-400/10',
  CAJA: 'text-orange-400 bg-orange-400/10',
  DIFERENCIAL: 'text-red-400 bg-red-400/10',
  OTRO: 'text-zinc-400 bg-zinc-700',
}

type Usage = { id: string; truckId: string; liters: number; date: string; truck: { plate: string; driver: { name: string } | null } }
type Batch = { id: string; date: string; type: string; liters: number; cost: number; notes: string | null; usages: Usage[] }
type Truck = { id: string; plate: string; driver: { name: string } | null }

export default function AceiteClient({
  batches, trucks, truckCosts,
}: { batches: Batch[]; trucks: Truck[]; truckCosts: Record<string, number> }) {
  const router = useRouter()
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [usageFormBatch, setUsageFormBatch] = useState<string | null>(null)
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [view, setView] = useState<'batches' | 'trucks'>('batches')

  async function handleBatchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoadingBatch(true)
    const res = await createOilBatch(new FormData(e.currentTarget))
    setLoadingBatch(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Paila registrada'); setShowBatchForm(false); router.refresh()
  }

  async function handleUsageSubmit(e: React.FormEvent<HTMLFormElement>, batchId: string) {
    e.preventDefault(); setLoadingUsage(true)
    const fd = new FormData(e.currentTarget)
    fd.set('batchId', batchId)
    const res = await createOilUsage(fd)
    setLoadingUsage(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Uso registrado'); setUsageFormBatch(null); router.refresh()
  }

  async function handleDeleteBatch(id: string) {
    if (!confirm('¿Eliminar paila y todos sus registros de uso?')) return
    const res = await deleteOilBatch(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  async function handleDeleteUsage(id: string) {
    const res = await deleteOilUsage(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

  // Per-truck summary
  const truckSummary = trucks
    .filter(t => truckCosts[t.id] > 0)
    .map(t => ({ ...t, totalCost: truckCosts[t.id] ?? 0 }))
    .sort((a, b) => b.totalCost - a.totalCost)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['batches', 'trucks'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${view === v ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
              {v === 'batches' ? 'Pailas' : 'Por camión'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowBatchForm(v => !v)}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Nueva paila
        </button>
      </div>

      {/* New batch form */}
      {showBatchForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Registrar paila de aceite</h3>
          <form onSubmit={handleBatchSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo de aceite *</label>
                <select name="type" required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  {Object.entries(OIL_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Litros en paila *</label>
                <input name="liters" type="number" step="0.1" min="0.1" required placeholder="18"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Costo total $ *</label>
                <input name="cost" type="number" step="0.01" min="0.01" required placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
              <input name="notes" type="text" placeholder="Opcional..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loadingBatch}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loadingBatch ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setShowBatchForm(false)}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Batches view */}
      {view === 'batches' && (
        <div className="space-y-3">
          {batches.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
              <p className="text-zinc-500 text-sm">Sin pailas registradas</p>
            </div>
          ) : batches.map(batch => {
            const used = batch.usages.reduce((s, u) => s + u.liters, 0)
            const remaining = batch.liters - used
            const costPerLiter = batch.cost / batch.liters
            const pct = (used / batch.liters) * 100
            const isExpanded = expandedBatch === batch.id

            return (
              <div key={batch.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${OIL_COLORS[batch.type]}`}>
                    {OIL_TYPES[batch.type]}
                  </span>
                  <span className="text-zinc-400 text-xs">{fmtDate(batch.date)}</span>
                  <span className="text-white font-semibold">{batch.liters}L</span>
                  <span className="text-zinc-500 text-xs">·</span>
                  <span className="text-amber-400 font-semibold">${batch.cost.toFixed(2)}</span>
                  <span className="text-zinc-600 text-xs">${costPerLiter.toFixed(2)}/L</span>
                  <div className="flex-1" />
                  {/* Progress bar */}
                  <div className="w-24 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className={`text-xs font-medium ${remaining <= 0 ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {remaining <= 0 ? 'Vacía' : `${remaining.toFixed(1)}L restantes`}
                  </span>
                  <button onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                    className={`text-xs rounded-lg px-2.5 py-1 transition-colors ${isExpanded ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                    {isExpanded ? 'Ocultar' : 'Ver usos'}
                  </button>
                  {remaining > 0 && (
                    <button onClick={() => setUsageFormBatch(usageFormBatch === batch.id ? null : batch.id)}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg px-2.5 py-1 transition-colors">
                      + Uso
                    </button>
                  )}
                  <button onClick={() => handleDeleteBatch(batch.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Usage form */}
                {usageFormBatch === batch.id && (
                  <div className="px-4 pb-3 pt-0 border-t border-zinc-800">
                    <form onSubmit={e => handleUsageSubmit(e, batch.id)} className="flex items-end gap-3 pt-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Camión *</label>
                        <select name="truckId" required className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-amber-500">
                          <option value="">Seleccionar...</option>
                          {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Litros *</label>
                        <input name="liters" type="number" step="0.1" min="0.1" max={remaining} required placeholder="0.0"
                          className="w-24 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Fecha</label>
                        <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                          className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-amber-500" />
                      </div>
                      <button type="submit" disabled={loadingUsage}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-3 py-2 text-xs transition-colors">
                        {loadingUsage ? '...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setUsageFormBatch(null)}
                        className="text-zinc-500 hover:text-white text-xs px-2 py-2">✕</button>
                    </form>
                  </div>
                )}

                {/* Usages list */}
                {isExpanded && batch.usages.length > 0 && (
                  <div className="border-t border-zinc-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-800/30">
                          <th className="text-left text-zinc-500 font-medium px-4 py-2">Fecha</th>
                          <th className="text-left text-zinc-500 font-medium px-4 py-2">Camión</th>
                          <th className="text-right text-zinc-500 font-medium px-4 py-2">Litros</th>
                          <th className="text-right text-zinc-500 font-medium px-4 py-2">Costo</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.usages.map(u => (
                          <tr key={u.id} className="border-b border-zinc-800/40">
                            <td className="px-4 py-2 text-zinc-400">{fmtDate(u.date)}</td>
                            <td className="px-4 py-2">
                              <span className="font-mono text-white">{u.truck.plate}</span>
                              <span className="text-zinc-500 ml-1.5">{u.truck.driver?.name ?? ''}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-amber-400 font-semibold">{u.liters.toFixed(1)}L</td>
                            <td className="px-4 py-2 text-right text-zinc-300">${(u.liters * costPerLiter).toFixed(2)}</td>
                            <td className="px-4 py-2">
                              <button onClick={() => handleDeleteUsage(u.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isExpanded && batch.usages.length === 0 && (
                  <div className="border-t border-zinc-800 px-4 py-3">
                    <p className="text-zinc-600 text-xs">Sin usos registrados aún</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Per-truck view */}
      {view === 'trucks' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {truckSummary.length === 0 ? (
            <div className="py-12 text-center"><p className="text-zinc-500 text-sm">Sin consumos registrados</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Placa</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Chofer</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Costo aceite total</th>
                </tr>
              </thead>
              <tbody>
                {truckSummary.map(t => (
                  <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-white font-semibold">{t.plate}</td>
                    <td className="px-4 py-3 text-zinc-300">{t.driver?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-bold">${t.totalCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
