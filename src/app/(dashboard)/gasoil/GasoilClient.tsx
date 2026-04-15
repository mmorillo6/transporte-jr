'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createFuelEntry, deleteFuelEntry,
  createFuelTank, updateFuelTank, deleteFuelTank,
  createFuelIntake, deleteFuelIntake,
  createFuelSupplyBatch,
} from '@/app/actions/fuel'
import { toast } from 'sonner'

type Tank = {
  id: string
  name: string
  capacityL: number
  totalIntake: number
  notes: string | null
}

type DispatchRow = {
  truckId: string
  plate: string
  driverName: string
  routeId: string
  routeName: string
  plannedTrips: number
  fuelLitersPerTrip: number
  totalLiters: number
}

type FuelEntry = {
  id: string
  date: string
  liters: number
  routeId: string | null
  source: string | null
  notes: string | null
  truckId: string
  truck: { plate: string; driver: { name: string } | null }
}

type Truck = { id: string; plate: string; driver: { name: string } | null }
type Route = { id: string; name: string; fuelLitersPerTrip: number }

const SUPPLY_SOURCES = ['PDVSA', 'Compra directa', 'Gandola cisterna', 'Otro']

export default function GasoilClient({
  tanks,
  todayDispatches,
  fuelEntries,
  trucks,
  routes,
  params,
  today,
  globalExitLiters,
  totalIntakeLiters,
}: {
  tanks: Tank[]
  todayDispatches: DispatchRow[]
  fuelEntries: FuelEntry[]
  trucks: Truck[]
  routes: Route[]
  params: Record<string, string | undefined>
  today: string
  globalExitLiters: number
  totalIntakeLiters: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'tanques' | 'suministro' | 'historial'>('suministro')
  const [loading, setLoading] = useState(false)

  // ── Tanques state ──────────────────────────────────────────────────────────
  const [showTankForm, setShowTankForm] = useState(false)
  const [editingTank, setEditingTank] = useState<Tank | null>(null)
  const [showIntakeForm, setShowIntakeForm] = useState<string | null>(null) // tankId

  // ── Suministro state ───────────────────────────────────────────────────────
  // Each row: truckId → custom liters override
  const [supplyOverrides, setSupplyOverrides] = useState<Record<string, string>>({})
  const [supplyDate, setSupplyDate] = useState(today)
  const [supplyNotes, setSupplyNotes] = useState('')
  // Manual rows (if no dispatch for today)
  const [manualRows, setManualRows] = useState<{ truckId: string; routeId: string; trips: string }[]>([])

  // ── Historial state ────────────────────────────────────────────────────────
  const [showEntryForm, setShowEntryForm] = useState(false)

  function applyFilter(key: string, value: string) {
    const p = new URLSearchParams(params as any)
    if (value) p.set(key, value); else p.delete(key)
    router.push(`/gasoil?${p.toString()}`)
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

  // ── Tanques handlers ──────────────────────────────────────────────────────
  async function handleTankSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true)
    const fd = new FormData(e.currentTarget)
    const res = editingTank ? await updateFuelTank(editingTank.id, fd) : await createFuelTank(fd)
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(editingTank ? 'Tanque actualizado' : 'Tanque creado')
    setShowTankForm(false); setEditingTank(null); router.refresh()
  }

  async function handleDeleteTank(id: string, name: string) {
    if (!confirm(`¿Eliminar el tanque "${name}"?`)) return
    const res = await deleteFuelTank(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  async function handleIntakeSubmit(e: React.FormEvent<HTMLFormElement>, tankId: string) {
    e.preventDefault(); setLoading(true)
    const fd = new FormData(e.currentTarget)
    fd.set('tankId', tankId)
    const res = await createFuelIntake(fd)
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Entrada registrada')
    setShowIntakeForm(null); router.refresh()
  }

  async function handleDeleteIntake(id: string) {
    const res = await deleteFuelIntake(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  // ── Suministro handlers ───────────────────────────────────────────────────
  function getSupplyLiters(row: DispatchRow): number {
    const override = supplyOverrides[row.truckId]
    if (override !== undefined) return parseFloat(override) || 0
    return row.totalLiters
  }

  function addManualRow() {
    setManualRows(r => [...r, { truckId: '', routeId: '', trips: '1' }])
  }

  function updateManualRow(i: number, field: string, value: string) {
    setManualRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function removeManualRow(i: number) {
    setManualRows(rows => rows.filter((_, idx) => idx !== i))
  }

  const effectiveRows: { truckId: string; plate: string; driverName: string; routeId: string; routeName: string; liters: number }[] =
    todayDispatches.length > 0
      ? todayDispatches.map(row => ({
          truckId: row.truckId,
          plate: row.plate,
          driverName: row.driverName,
          routeId: row.routeId,
          routeName: row.routeName,
          liters: getSupplyLiters(row),
        }))
      : manualRows.map(r => {
          const truck = trucks.find(t => t.id === r.truckId)
          const route = routes.find(ro => ro.id === r.routeId)
          const trips = parseInt(r.trips) || 1
          return {
            truckId: r.truckId,
            plate: truck?.plate ?? '',
            driverName: truck?.driver?.name ?? '—',
            routeId: r.routeId,
            routeName: route?.name ?? '—',
            liters: (route?.fuelLitersPerTrip ?? 0) * trips,
          }
        }).filter(r => r.truckId && r.routeId)

  async function handleSaveSupply() {
    const orders = effectiveRows.filter(r => r.liters > 0)
    if (!orders.length) { toast.error('No hay litros asignados'); return }
    setLoading(true)
    const res = await createFuelSupplyBatch(
      orders.map(r => ({ truckId: r.truckId, liters: r.liters, routeId: r.routeId })),
      supplyDate,
      supplyNotes || undefined,
    )
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`Suministro registrado — ${res.count} camiones`)
    setSupplyOverrides({})
    setManualRows([])
    router.refresh()
  }

  // ── Historial handlers ────────────────────────────────────────────────────
  async function handleEntrySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true)
    const res = await createFuelEntry(new FormData(e.currentTarget))
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Registro guardado')
    setShowEntryForm(false); router.refresh()
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteFuelEntry(id)
    router.refresh()
  }

  const totalLiters = fuelEntries.reduce((s, e) => s + e.liters, 0)
  const netInventory = totalIntakeLiters - globalExitLiters

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs">Entradas totales</p>
          <p className="text-white font-bold text-2xl mt-1">{totalIntakeLiters.toLocaleString()} <span className="text-zinc-500 text-sm font-normal">L</span></p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs">Total surtido</p>
          <p className="text-amber-400 font-bold text-2xl mt-1">{globalExitLiters.toLocaleString()} <span className="text-zinc-500 text-sm font-normal">L</span></p>
        </div>
        <div className={`bg-zinc-900 border rounded-2xl p-4 ${netInventory < 0 ? 'border-red-500/30' : 'border-emerald-500/20'}`}>
          <p className="text-zinc-500 text-xs">Inventario neto</p>
          <p className={`font-bold text-2xl mt-1 ${netInventory < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{netInventory.toLocaleString()} <span className="text-zinc-500 text-sm font-normal">L</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {([
          { id: 'suministro', label: 'Orden de suministro' },
          { id: 'tanques', label: 'Tanques' },
          { id: 'historial', label: 'Historial surtidas' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUMINISTRO ─────────────────────────────────────────────────────── */}
      {tab === 'suministro' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold">Orden de suministro</h2>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {todayDispatches.length > 0
                    ? `${todayDispatches.length} camiones despachados hoy — litros calculados por ruta`
                    : 'Sin despacho para hoy — agrega camiones manualmente'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Fecha</label>
                  <input type="date" value={supplyDate} onChange={e => setSupplyDate(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500" />
                </div>
              </div>
            </div>

            {/* Dispatch rows */}
            {todayDispatches.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Placa</th>
                      <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Chofer</th>
                      <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Ruta / Mina</th>
                      <th className="text-right text-zinc-500 font-medium px-3 py-2 text-xs">Viajes</th>
                      <th className="text-right text-zinc-500 font-medium px-3 py-2 text-xs">L/viaje</th>
                      <th className="text-right text-zinc-500 font-medium px-3 py-2 text-xs">Litros a surtir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayDispatches.map(row => (
                      <tr key={row.truckId} className="border-b border-zinc-800/50">
                        <td className="px-3 py-2.5 font-mono text-white font-semibold">{row.plate}</td>
                        <td className="px-3 py-2.5 text-zinc-300">{row.driverName}</td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs">{row.routeName}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-300">{row.plannedTrips}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-500 text-xs">
                          {row.fuelLitersPerTrip > 0 ? `${row.fuelLitersPerTrip} L` : <span className="text-red-400/70">No config.</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={supplyOverrides[row.truckId] ?? row.totalLiters}
                            onChange={e => setSupplyOverrides(ov => ({ ...ov, [row.truckId]: e.target.value }))}
                            className="w-24 bg-zinc-800 border border-zinc-700 text-amber-400 font-semibold rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-zinc-500 text-xs ml-1">L</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-800/40 border-t border-zinc-700">
                      <td colSpan={5} className="px-3 py-2 text-zinc-400 text-xs font-semibold">TOTAL</td>
                      <td className="px-3 py-2 text-right text-amber-400 font-bold">
                        {effectiveRows.reduce((s, r) => s + r.liters, 0).toFixed(0)} L
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* Manual rows when no dispatch */
              <div className="space-y-2 mb-4">
                {manualRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-center">
                    <select value={row.truckId} onChange={e => updateManualRow(i, 'truckId', e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Camión...</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
                    </select>
                    <select value={row.routeId} onChange={e => updateManualRow(i, 'routeId', e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Ruta/Mina...</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.fuelLitersPerTrip} L)</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-xs">Viajes:</span>
                      <input type="number" min="1" value={row.trips} onChange={e => updateManualRow(i, 'trips', e.target.value)}
                        className="w-16 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-amber-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-semibold text-sm">
                        {((routes.find(r => r.id === row.routeId)?.fuelLitersPerTrip ?? 0) * (parseInt(row.trips) || 1)).toFixed(0)} L
                      </span>
                      <button onClick={() => removeManualRow(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={addManualRow}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 transition-colors">
                  + Agregar camión
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
              <input
                type="text"
                placeholder="Notas (opcional)..."
                value={supplyNotes}
                onChange={e => setSupplyNotes(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
              />
              <button onClick={handleSaveSupply} disabled={loading || effectiveRows.length === 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors whitespace-nowrap">
                {loading ? 'Guardando...' : `Registrar suministro (${effectiveRows.filter(r => r.liters > 0).length} camiones)`}
              </button>
            </div>
          </div>

          {/* Hint about route config */}
          {todayDispatches.some(d => d.fuelLitersPerTrip === 0) && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400/80">
              Algunas rutas no tienen litros/viaje configurados.{' '}
              <a href="/rutas" className="underline hover:text-amber-300">Configúralos en Rutas →</a>
            </div>
          )}
        </div>
      )}

      {/* ── TANQUES ────────────────────────────────────────────────────────── */}
      {tab === 'tanques' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowTankForm(true); setEditingTank(null) }}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
              + Nuevo tanque
            </button>
          </div>

          {/* Tank form */}
          {(showTankForm || editingTank) && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">{editingTank ? 'Editar tanque' : 'Nuevo tanque'}</h3>
              <form onSubmit={handleTankSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Nombre *</label>
                    <input name="name" required defaultValue={editingTank?.name ?? ''}
                      placeholder="Tanque 1 (90k L)"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Capacidad (litros) *</label>
                    <input name="capacityL" type="number" step="1" min="1" required
                      defaultValue={editingTank?.capacityL ?? ''}
                      placeholder="90000"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
                  <input name="notes" type="text" defaultValue={editingTank?.notes ?? ''} placeholder="Opcional..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => { setShowTankForm(false); setEditingTank(null) }}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {tanks.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <p className="text-zinc-500 text-sm">No hay tanques registrados.</p>
              <p className="text-zinc-600 text-xs mt-1">Registra los tanques de la empresa (3 × 90k L, 1 × 30k L, gandola cisterna)</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {tanks.map(tank => {
                const pct = Math.min(100, tank.capacityL > 0 ? (tank.totalIntake / tank.capacityL) * 100 : 0)
                return (
                  <div key={tank.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold">{tank.name}</h3>
                        {tank.notes && <p className="text-zinc-500 text-xs mt-0.5">{tank.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingTank(tank); setShowTankForm(false) }}
                          className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-2.5 py-1.5 transition-colors">
                          Editar
                        </button>
                        <button onClick={() => setShowIntakeForm(showIntakeForm === tank.id ? null : tank.id)}
                          className="text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 transition-colors">
                          + Entrada
                        </button>
                        <button onClick={() => handleDeleteTank(tank.id, tank.name)}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1.5">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Level bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-zinc-500 mb-1">
                        <span>Entradas acumuladas</span>
                        <span className="text-white font-medium">{tank.totalIntake.toLocaleString()} / {tank.capacityL.toLocaleString()} L</span>
                      </div>
                      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-amber-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Intake form */}
                    {showIntakeForm === tank.id && (
                      <form onSubmit={e => handleIntakeSubmit(e, tank.id)} className="bg-zinc-800/60 rounded-xl p-3 space-y-3 mt-3">
                        <p className="text-zinc-400 text-xs font-medium">Registrar entrada de gasoil</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Fecha</label>
                            <input name="date" type="date" required defaultValue={today}
                              className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Litros recibidos</label>
                            <input name="liters" type="number" step="1" min="1" required placeholder="0"
                              className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-500" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Fuente</label>
                            <select name="source"
                              className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-500">
                              <option value="">—</option>
                              {SUPPLY_SOURCES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Notas</label>
                            <input name="notes" type="text" placeholder="Opcional"
                              className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-500" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" disabled={loading}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg px-3 py-1.5 transition-colors">
                            {loading ? 'Guardando...' : 'Guardar entrada'}
                          </button>
                          <button type="button" onClick={() => setShowIntakeForm(null)}
                            className="text-xs text-zinc-400 hover:text-white rounded-lg px-3 py-1.5 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORIAL ──────────────────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Desde</label>
                <input type="date" defaultValue={params.from ?? ''} onChange={e => applyFilter('from', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Hasta</label>
                <input type="date" defaultValue={params.to ?? ''} onChange={e => applyFilter('to', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Camión</label>
                <select defaultValue={params.truckId ?? ''} onChange={e => applyFilter('truckId', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Todos</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => setShowEntryForm(v => !v)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
                  + Registrar surtida
                </button>
              </div>
            </div>
          </div>

          {/* Manual entry form */}
          {showEntryForm && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Registrar surtida individual</h3>
              <form onSubmit={handleEntrySubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                    <input name="date" type="date" required defaultValue={today}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                    <select name="truckId" required
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Litros *</label>
                    <input name="liters" type="number" step="0.1" min="0.1" required placeholder="0.0"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Ruta / Mina</label>
                    <select name="routeId"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">—</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setShowEntryForm(false)}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Fuel entries table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-zinc-400 text-sm">{fuelEntries.length} registros · {totalLiters.toFixed(0)} L total (filtro activo)</p>
            </div>
            {fuelEntries.length === 0 ? (
              <div className="py-12 text-center"><p className="text-zinc-500 text-sm">Sin registros</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Placa</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Chofer</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Litros</th>
                      <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Notas</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelEntries.map(e => (
                      <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 font-mono text-white">{e.truck.plate}</td>
                        <td className="px-4 py-3 text-zinc-300">{e.truck.driver?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-amber-400 font-semibold">{e.liters.toFixed(0)} L</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">{e.notes ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDeleteEntry(e.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
