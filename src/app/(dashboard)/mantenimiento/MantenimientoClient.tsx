'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateTruckStatus, createAlert, resolveAlert, createLog, deleteLog } from '@/app/actions/maintenance'
import { createPart, markPartUsed, deletePart } from '@/app/actions/parts'
import { createMechanicWork, deleteMechanicWork } from '@/app/actions/mechanicWork'
import CauchosClient from '../cauchos/CauchosClient'

const STATUS_STYLE: Record<string, string> = {
  OPERATIONAL: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  IN_SHOP: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  OUT_OF_SERVICE: 'text-red-400 bg-red-400/10 border-red-400/20',
}
const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operativo',
  IN_SHOP: 'En taller',
  OUT_OF_SERVICE: 'Fuera de servicio',
}
const MAINT_LABEL: Record<string, string> = {
  OIL_CHANGE: 'Cambio aceite',
  AIR_FILTER: 'Filtro aire',
  GREASE: 'Engrase',
  REPAIR: 'Reparación',
  INSPECTION: 'Inspección',
  OTHER: 'Otro',
}
const MAINT_TYPES = Object.entries(MAINT_LABEL)

type Truck = {
  id: string; plate: string
  driver: { name: string } | null
  status: { status: string; notes: string | null } | null
}
type Alert = {
  id: string; type: string; dueDate: string; status: string
  truck: { plate: string }
}
type Log = {
  id: string; date: string; type: string; description: string | null; cost: number
  truck: { plate: string }
  mechanic: { name: string } | null
}
type Mechanic = { id: string; name: string }
type Part = {
  id: string; name: string; quantity: number; cost: number; status: string
  purchasedAt: string; usedAt: string | null; notes: string | null
  truck: { plate: string } | null
}
type MechanicWork = {
  id: string; description: string; cost: number; workshopCut: number; mechanicCut: number; date: string
  truck: { plate: string }
  mechanic: { name: string }
}

export default function MantenimientoClient({
  trucks, alerts, logs, mechanics, parts, mechanicWorks, tireRepairs, truckTotals, tireDebts, canManage, initialTab,
}: {
  trucks: Truck[]
  alerts: Alert[]
  logs: Log[]
  mechanics: Mechanic[]
  parts: Part[]
  mechanicWorks: MechanicWork[]
  tireRepairs: any[]
  truckTotals: Record<string, { count: number; cost: number }>
  tireDebts: any[]
  canManage: boolean
  initialTab?: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'flota' | 'alertas' | 'historial' | 'piezas' | 'trabajos' | 'cauchos'>(
    (initialTab as any) ?? 'flota'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)
  const [showPartForm, setShowPartForm] = useState(false)
  const [showWorkForm, setShowWorkForm] = useState(false)
  const [partFilter, setPartFilter] = useState<'all' | 'IN_STOCK' | 'USED'>('IN_STOCK')
  // Inline status editing
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [statusValue, setStatusValue] = useState('')
  const [statusNotes, setStatusNotes] = useState('')

  function openStatusEdit(truck: Truck) {
    setEditingStatusId(truck.id)
    setStatusValue(truck.status?.status ?? 'OPERATIONAL')
    setStatusNotes(truck.status?.notes ?? '')
  }

  async function handleStatusSave(truckId: string) {
    setLoading(true)
    await updateTruckStatus(truckId, statusValue, statusNotes)
    setEditingStatusId(null)
    router.refresh()
    setLoading(false)
  }

  async function handleAlertSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = await createAlert(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowAlertForm(false); router.refresh(); setLoading(false) }
  }

  async function handleResolve(id: string) {
    await resolveAlert(id)
    router.refresh()
  }

  async function handleLogSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = await createLog(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowLogForm(false); router.refresh(); setLoading(false) }
  }

  async function handleDeleteLog(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteLog(id)
    router.refresh()
  }

  async function handlePartSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await createPart(new FormData(e.currentTarget))
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowPartForm(false); router.refresh(); setLoading(false) }
  }

  async function handleMarkUsed(id: string) {
    await markPartUsed(id, null)
    router.refresh()
  }

  async function handleDeletePart(id: string) {
    if (!confirm('¿Eliminar esta pieza?')) return
    await deletePart(id)
    router.refresh()
  }

  async function handleWorkSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await createMechanicWork(new FormData(e.currentTarget))
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowWorkForm(false); router.refresh(); setLoading(false) }
  }

  async function handleDeleteWork(id: string) {
    if (!confirm('¿Eliminar este trabajo?')) return
    await deleteMechanicWork(id)
    router.refresh()
  }

  // Alert urgency color
  function alertUrgency(dueDateStr: string) {
    const diff = Math.ceil((new Date(dueDateStr).getTime() - Date.now()) / 86400000)
    if (diff < 0) return 'text-red-400 bg-red-400/10 border border-red-400/20'
    if (diff <= 7) return 'text-amber-400 bg-amber-400/10 border border-amber-400/20'
    return 'text-zinc-400 bg-zinc-400/10 border border-zinc-400/20'
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {([
          ['flota', 'Estado de flota'],
          ['alertas', `Alertas (${alerts.length})`],
          ['historial', 'Historial'],
          ['piezas', `Repuestos (${parts.filter(p => p.status === 'IN_STOCK').length})`],
          ['trabajos', 'Trabajos mecánico'],
          ['cauchos', 'Cauchos'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setError('') }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: ESTADO DE FLOTA ── */}
      {tab === 'flota' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {trucks.map(truck => (
            <div key={truck.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-white font-bold font-mono truncate">{truck.plate}</p>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">{truck.driver?.name ?? 'Sin chofer'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${STATUS_STYLE[truck.status?.status ?? 'OPERATIONAL']}`}>
                  {STATUS_LABEL[truck.status?.status ?? 'OPERATIONAL']}
                </span>
              </div>

              {truck.status?.notes && (
                <p className="text-zinc-500 text-xs italic">{truck.status.notes}</p>
              )}

              {editingStatusId === truck.id ? (
                <div className="space-y-2">
                  <select
                    value={statusValue}
                    onChange={e => setStatusValue(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500">
                    <option value="OPERATIONAL">Operativo</option>
                    <option value="IN_SHOP">En taller</option>
                    <option value="OUT_OF_SERVICE">Fuera de servicio</option>
                  </select>
                  <input
                    placeholder="Notas (opcional)"
                    value={statusNotes}
                    onChange={e => setStatusNotes(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  <div className="flex gap-2">
                    <button onClick={() => handleStatusSave(truck.id)} disabled={loading}
                      className="flex-1 text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg py-1.5 transition-colors">
                      Guardar
                    </button>
                    <button onClick={() => setEditingStatusId(null)}
                      className="text-xs text-zinc-500 hover:text-white px-2 py-1.5 rounded-lg transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openStatusEdit(truck)}
                  className="w-full text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg py-1.5 transition-colors">
                  Cambiar estado
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: ALERTAS ── */}
      {tab === 'alertas' && (
        <div className="space-y-4">
          {/* New alert form */}
          {showAlertForm && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Nueva alerta</h3>
              <form onSubmit={handleAlertSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                    <select name="truckId" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Tipo *</label>
                    <select name="type" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {MAINT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Fecha límite *</label>
                    <input name="dueDate" type="date" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Crear alerta'}
                  </button>
                  <button type="button" onClick={() => setShowAlertForm(false)}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex justify-between items-center">
            <p className="text-zinc-400 text-sm">{alerts.length} alertas pendientes</p>
            <button onClick={() => { setShowAlertForm(true); setError('') }}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
              + Nueva alerta
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
              <p className="text-emerald-400 text-sm font-medium">Sin alertas pendientes</p>
              <p className="text-zinc-600 text-xs mt-1">La flota está al día</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => {
                const diff = Math.ceil((new Date(alert.dueDate).getTime() - Date.now()) / 86400000)
                return (
                  <div key={alert.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${alertUrgency(alert.dueDate)}`}>
                        {MAINT_LABEL[alert.type] ?? alert.type}
                      </span>
                      <div>
                        <p className="text-white text-sm font-mono font-medium">{alert.truck.plate}</p>
                        <p className="text-zinc-500 text-xs">
                          {diff < 0
                            ? `Vencida hace ${Math.abs(diff)} días`
                            : diff === 0
                            ? 'Vence hoy'
                            : `Vence en ${diff} días`}
                          {' · '}
                          {new Date(alert.dueDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleResolve(alert.id)}
                      className="text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      ✓ Resolver
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTORIAL ── */}
      {tab === 'historial' && (
        <div className="space-y-4">
          {/* New log form */}
          {showLogForm && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Registrar trabajo</h3>
              <form onSubmit={handleLogSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                    <select name="truckId" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}{t.driver ? ` — ${t.driver.name}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Tipo *</label>
                    <select name="type" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {MAINT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                    <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  {canManage && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Costo $</label>
                      <input name="cost" type="number" step="0.01" min="0" defaultValue="0" placeholder="0.00"
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Descripción</label>
                  <input name="description" placeholder="Detalle del trabajo realizado..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                </div>
                {mechanics.length > 0 && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Mecánico</label>
                    <select name="mechanicId"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Sin asignar</option>
                      {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Registrar'}
                  </button>
                  <button type="button" onClick={() => setShowLogForm(false)}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => { setShowLogForm(true); setError('') }}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
              + Registrar trabajo
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {logs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-zinc-500 text-sm">No hay registros de mantenimiento</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Tipo</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descripción</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Mecánico</th>
                      {canManage && <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Costo</th>}
                      {canManage && <th className="px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                          {new Date(log.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-white font-mono font-medium">{log.truck.plate}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            {MAINT_LABEL[log.type] ?? log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs truncate">{log.description ?? '—'}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">{log.mechanic?.name ?? '—'}</td>
                        {canManage && (
                          <td className="px-4 py-3 text-right text-zinc-300 font-semibold">
                            {log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}
                          </td>
                        )}
                        {canManage && (
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteLog(log.id)}
                              className="text-zinc-600 hover:text-red-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: REPUESTOS ── */}
      {tab === 'piezas' && (
        <div className="space-y-4">
          {showPartForm && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Registrar pieza / repuesto</h3>
              <form onSubmit={handlePartSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Nombre *</label>
                    <input name="name" required placeholder="Filtro de aire, correa..."
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Costo $ *</label>
                    <input name="cost" type="number" step="0.01" min="0" required placeholder="0.00"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Cantidad</label>
                    <input name="quantity" type="number" min="1" defaultValue="1"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Fecha compra</label>
                    <input name="purchasedAt" type="date" defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camión (opcional)</label>
                    <select name="truckId"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Sin asignar</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
                  <input name="notes" placeholder="Referencia, proveedor..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Registrar pieza'}
                  </button>
                  <button type="button" onClick={() => setShowPartForm(false)}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {([['all', 'Todas'], ['IN_STOCK', 'En stock'], ['USED', 'Usadas']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setPartFilter(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${partFilter === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {l}
                </button>
              ))}
            </div>
            {canManage && (
              <button onClick={() => { setShowPartForm(true); setError('') }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
                + Registrar pieza
              </button>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {(() => {
              const filtered = parts.filter(p => partFilter === 'all' || p.status === partFilter)
              if (filtered.length === 0) return (
                <div className="py-12 text-center"><p className="text-zinc-500 text-sm">Sin repuestos registrados</p></div>
              )
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Pieza</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Cant.</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Costo</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Comprada</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(part => (
                        <tr key={part.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                          <td className="px-4 py-3 text-white font-medium">
                            {part.name}
                            {part.notes && <span className="ml-2 text-zinc-600 text-xs">({part.notes})</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-400">{part.quantity}</td>
                          <td className="px-4 py-3 text-right text-zinc-300 font-semibold">${part.cost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{part.truck?.plate ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">
                            {new Date(part.purchasedAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${part.status === 'IN_STOCK' ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 bg-zinc-500/10'}`}>
                              {part.status === 'IN_STOCK' ? 'En stock' : 'Usada'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {canManage && (
                              <div className="flex items-center gap-2">
                                {part.status === 'IN_STOCK' && (
                                  <button onClick={() => handleMarkUsed(part.id)}
                                    className="text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap">
                                    Marcar usada
                                  </button>
                                )}
                                <button onClick={() => handleDeletePart(part.id)}
                                  className="text-zinc-600 hover:text-red-400 transition-colors">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── TAB: TRABAJOS MECÁNICO ── */}
      {tab === 'trabajos' && (
        <div className="space-y-4">
          {showWorkForm && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Registrar trabajo de mecánico</h3>
              <form onSubmit={handleWorkSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                    <select name="truckId" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Mecánico *</label>
                    <select name="mechanicId" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                    <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Descripción *</label>
                  <input name="description" required placeholder="Trabajo realizado..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Costo total $</label>
                    <input name="cost" type="number" step="0.01" min="0" defaultValue="0" placeholder="0.00"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Parte taller $</label>
                    <input name="workshopCut" type="number" step="0.01" min="0" defaultValue="0" placeholder="0.00"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Parte mecánico $</label>
                    <input name="mechanicCut" type="number" step="0.01" min="0" defaultValue="0" placeholder="0.00"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Registrar trabajo'}
                  </button>
                  <button type="button" onClick={() => setShowWorkForm(false)}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex justify-end">
            {canManage && (
              <button onClick={() => { setShowWorkForm(true); setError('') }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
                + Registrar trabajo
              </button>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {mechanicWorks.length === 0 ? (
              <div className="py-12 text-center"><p className="text-zinc-500 text-sm">Sin trabajos registrados</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Mecánico</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descripción</th>
                      {canManage && <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Costo</th>}
                      {canManage && <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Taller</th>}
                      {canManage && <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Mecánico</th>}
                      {canManage && <th className="px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {mechanicWorks.map(work => (
                      <tr key={work.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                          {new Date(work.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-white font-mono font-medium">{work.truck.plate}</td>
                        <td className="px-4 py-3 text-zinc-300">{work.mechanic.name}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs truncate">{work.description}</td>
                        {canManage && <td className="px-4 py-3 text-right text-zinc-300 font-semibold">{work.cost > 0 ? `$${work.cost.toFixed(2)}` : '—'}</td>}
                        {canManage && <td className="px-4 py-3 text-right text-zinc-500">{work.workshopCut > 0 ? `$${work.workshopCut.toFixed(2)}` : '—'}</td>}
                        {canManage && <td className="px-4 py-3 text-right text-amber-400">{work.mechanicCut > 0 ? `$${work.mechanicCut.toFixed(2)}` : '—'}</td>}
                        {canManage && (
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteWork(work.id)}
                              className="text-zinc-600 hover:text-red-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'cauchos' && (
        <CauchosClient
          repairs={tireRepairs}
          trucks={trucks.map(t => ({ id: t.id, plate: t.plate, driver: t.driver }))}
          truckTotals={truckTotals}
          tireDebts={tireDebts}
        />
      )}
    </div>
  )
}
