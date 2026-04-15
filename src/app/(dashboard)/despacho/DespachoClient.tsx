'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrUpdateDispatch } from '@/app/actions/dispatch'
import { toast } from 'sonner'
import AsistenciaClient from '../asistencia/AsistenciaClient'

type Truck = { id: string; plate: string; driver: { name: string } | null; owner: { name: string }; status: { status: string } | null }
type Route = { id: string; name: string; rate: number; rateType: string; fuelLitersPerTrip: number; bidirectional: boolean }
type DispatchEntry = { truck: { plate: string; driver: { name: string } | null }; route: { name: string }; plannedTrips: number }
type Dispatch = { id: string; date: string; entries: DispatchEntry[] }
type SosaEntry = { id: string; plate: string; driver: { name: string } | null; owner: { name: string }; lastSosa: string | null }

type Assignment = { truckId: string; routeId: string; plannedTrips: number }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
function fmtDateShort(d: string | null) {
  if (!d) return 'Nunca'
  return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type SummaryRow = { name: string; role: string; days: number; totalHours: number; avgHours: number }
type ClockEntry = { id: string; clockIn: string; clockOut: string | null; notes: string | null; user: { name: string; role: string }; truck: { plate: string } | null }

export default function DespachoClient({
  trucks, routes, selectedDate, existingDispatch, recentDispatches, sosaQueue,
  initialTab, clockEntries, asistenciaUsers, summaryData, selectedMonth,
}: {
  trucks: Truck[]
  routes: Route[]
  selectedDate: string
  existingDispatch: Dispatch | null
  recentDispatches: Dispatch[]
  sosaQueue: SosaEntry[]
  initialTab?: string
  clockEntries: ClockEntry[]
  asistenciaUsers: { id: string; name: string; role: string }[]
  summaryData: SummaryRow[]
  selectedMonth: string
}) {
  const router = useRouter()
  const [outerTab, setOuterTab] = useState<'despacho' | 'asistencia'>(
    initialTab === 'asistencia' ? 'asistencia' : 'despacho'
  )
  const [loading, setLoading] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    if (existingDispatch) {
      return existingDispatch.entries.map((e: any) => ({
        truckId: e.truck?.id ?? '',
        routeId: e.route?.id ?? '',
        plannedTrips: e.plannedTrips,
      }))
    }
    return []
  })
  const [activeTrucks, setActiveTrucks] = useState<Set<string>>(() => {
    if (existingDispatch) return new Set(existingDispatch.entries.map((e: any) => e.truck?.id ?? ''))
    return new Set()
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showSosa, setShowSosa] = useState(true)

  function toggleTruck(truckId: string) {
    setActiveTrucks(prev => {
      const next = new Set(prev)
      if (next.has(truckId)) {
        next.delete(truckId)
        setAssignments(a => a.filter(x => x.truckId !== truckId))
      } else {
        next.add(truckId)
        setAssignments(a => [...a, { truckId, routeId: routes[0]?.id ?? '', plannedTrips: 0 }])
      }
      return next
    })
  }

  function updateAssignment(truckId: string, field: 'routeId' | 'plannedTrips', value: string | number) {
    setAssignments(prev => prev.map(a => a.truckId === truckId ? { ...a, [field]: value } : a))
  }

  async function handleSave() {
    const valid = assignments.filter(a => a.truckId && a.routeId)
    if (valid.length === 0) { toast.error('Asigna al menos un camión'); return }
    setLoading(true)
    const res = await createOrUpdateDispatch(selectedDate, valid)
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    const totalL = fuelSummary.reduce((s, f) => s + f.liters, 0)
    toast.success(`Despacho guardado — ${totalL.toLocaleString()}L de gasoil asignados`)
    router.refresh()
  }

  function generateMessage() {
    if (assignments.length === 0) { toast.error('Sin asignaciones'); return }
    const byRoute = new Map<string, { routeName: string; drivers: string[]; trips: number }>()
    for (const a of assignments) {
      const truck = trucks.find(t => t.id === a.truckId)
      const route = routes.find(r => r.id === a.routeId)
      if (!truck || !route) continue
      const driverName = truck.driver?.name.split(' ')[0] ?? truck.plate
      if (!byRoute.has(a.routeId)) {
        byRoute.set(a.routeId, { routeName: route.name, drivers: [], trips: a.plannedTrips })
      }
      byRoute.get(a.routeId)!.drivers.push(driverName)
    }
    const lines: string[] = ['Buen dia muchachos.']
    let first = true
    for (const [, group] of byRoute) {
      if (!first) lines.push('')
      lines.push(group.trips > 0
        ? `${group.routeName} — ${group.trips} viaje${group.trips !== 1 ? 's' : ''} c/u`
        : `Activos para ${group.routeName}`)
      lines.push('')
      group.drivers.forEach((d, i) => lines.push(`${i + 1}. ${d}`))
      first = false
    }
    const text = lines.join('\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Mensaje copiado'))
      .catch(() => toast.error('No se pudo copiar'))
  }

  const assignmentForTruck = (truckId: string) => assignments.find(a => a.truckId === truckId)

  // Calcular gasoil total del despacho
  const fuelSummary = assignments
    .filter(a => a.plannedTrips > 0)
    .map(a => {
      const route = routes.find(r => r.id === a.routeId)
      const truck = trucks.find(t => t.id === a.truckId)
      if (!route || !truck || route.fuelLitersPerTrip === 0) return null
      const liters = a.plannedTrips * route.fuelLitersPerTrip
      return { plate: truck.plate, routeName: route.name, trips: a.plannedTrips, lpv: route.fuelLitersPerTrip, liters }
    })
    .filter(Boolean) as { plate: string; routeName: string; trips: number; lpv: number; liters: number }[]

  const totalFuel = fuelSummary.reduce((s, f) => s + f.liters, 0)

  const openCount = clockEntries.filter(e => !e.clockOut).length

  return (
    <div className="space-y-4">

      {/* ── Tab switcher principal ────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        <button onClick={() => setOuterTab('despacho')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${outerTab === 'despacho' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Despacho
        </button>
        <button onClick={() => setOuterTab('asistencia')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${outerTab === 'asistencia' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Asistencia
          {openCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">
              {openCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Asistencia ───────────────────────────────────────────────────── */}
      {outerTab === 'asistencia' && (
        <AsistenciaClient
          entries={clockEntries}
          users={asistenciaUsers}
          trucks={trucks.map(t => ({ id: t.id, plate: t.plate }))}
          summaryData={summaryData}
          selectedMonth={selectedMonth}
        />
      )}

      {outerTab === 'despacho' && <>

      {/* ── Cola de Sosa Mendez ───────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowSosa(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-sm font-semibold">Cola — Sosa Mendez</span>
            <span className="text-zinc-500 text-xs">quién va primero</span>
          </div>
          <span className="text-zinc-500 text-xs">{showSosa ? '▲' : '▼'}</span>
        </button>

        {showSosa && (
          <div className="px-4 pb-4 space-y-1.5 border-t border-zinc-800 pt-3">
            {sosaQueue.length === 0 ? (
              <p className="text-zinc-500 text-sm">No hay camiones activos</p>
            ) : (
              sosaQueue.map((t, i) => {
                const isFirst = i === 0
                const isDispatched = assignments.some(a => a.truckId === t.id && routes.find(r => r.id === a.routeId)?.name === 'SOSA MENDEZ')
                return (
                  <div key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                    isFirst ? 'bg-amber-500/10 border border-amber-500/20' :
                    isDispatched ? 'bg-emerald-500/5 border border-emerald-500/10' :
                    'bg-zinc-800/40'
                  }`}>
                    <span className={`text-xs font-bold w-5 text-center ${isFirst ? 'text-amber-400' : 'text-zinc-500'}`}>
                      {i + 1}
                    </span>
                    <span className="font-mono text-sm text-white">{t.plate}</span>
                    <span className="text-zinc-400 text-sm flex-1">{t.driver?.name.split(' ')[0] ?? '—'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      !t.lastSosa ? 'text-red-400 bg-red-400/10' :
                      isDispatched ? 'text-emerald-400 bg-emerald-400/10' :
                      'text-zinc-500 bg-zinc-800'
                    }`}>
                      {isDispatched ? 'Asignado hoy' : !t.lastSosa ? 'Nunca ha ido' : `Último: ${fmtDateShort(t.lastSosa)}`}
                    </span>
                  </div>
                )
              })
            )}
            <p className="text-zinc-600 text-xs pt-1">El que fue hace más tiempo va primero. Se actualiza al registrar viajes.</p>
          </div>
        )}
      </div>

      {/* ── Controles de fecha y acciones ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={selectedDate}
          onChange={e => router.push(`/despacho?date=${e.target.value}`)}
          className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
        <span className="text-zinc-500 text-sm flex-1">
          {activeTrucks.size} camión{activeTrucks.size !== 1 ? 'es' : ''} activo{activeTrucks.size !== 1 ? 's' : ''}
          {existingDispatch ? ' · guardado' : ''}
        </span>
        <button
          onClick={() => setShowHistory(v => !v)}
          className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${showHistory ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
          Historial
        </button>
        <button
          onClick={generateMessage}
          disabled={assignments.length === 0}
          className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copiar msg WS
        </button>
        <button
          onClick={handleSave}
          disabled={loading || assignments.length === 0}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          {loading ? 'Guardando...' : 'Guardar despacho'}
        </button>
      </div>

      {/* ── Historial ─────────────────────────────────────────────────────────── */}
      {showHistory && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Últimos 7 días</h3>
          {recentDispatches.length === 0 ? (
            <p className="text-zinc-500 text-sm">Sin despachos anteriores</p>
          ) : (
            <div className="space-y-2">
              {recentDispatches.map((d: any) => (
                <div key={d.id} className="border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
                  <p className="text-zinc-400 text-xs font-medium mb-1">{fmtDate(d.date)} — {d.entries.length} camiones</p>
                  <div className="flex flex-wrap gap-1">
                    {d.entries.map((e: any, i: number) => (
                      <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                        {e.truck?.driver?.name?.split(' ')[0] ?? e.truck?.plate} → {e.route?.name}
                        {e.plannedTrips > 0 ? ` (${e.plannedTrips}v)` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lista de camiones ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2">
        {trucks.map(truck => {
          const isActive = activeTrucks.has(truck.id)
          const assignment = assignmentForTruck(truck.id)
          const route = assignment ? routes.find(r => r.id === assignment.routeId) : null
          const fuelL = (route && assignment && assignment.plannedTrips > 0)
            ? assignment.plannedTrips * route.fuelLitersPerTrip
            : 0
          const driverFirstName = truck.driver?.name.split(' ')[0] ?? '—'

          return (
            <div key={truck.id}
              className={`bg-zinc-900 border rounded-xl transition-colors ${isActive ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800'}`}>
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => toggleTruck(truck.id)}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isActive ? 'bg-amber-500 border-amber-500' : 'border-zinc-600 hover:border-zinc-400'
                  }`}>
                  {isActive && (
                    <svg className="w-3 h-3 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono text-sm font-semibold">{truck.plate}</span>
                    <span className="text-zinc-400 text-sm">{driverFirstName}</span>
                    <span className="text-zinc-600 text-xs">{truck.owner.name}</span>
                    {truck.status?.status === 'IN_SHOP' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                        En taller
                      </span>
                    )}
                    {truck.status?.status === 'OUT_OF_SERVICE' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-medium">
                        Fuera de servicio
                      </span>
                    )}
                  </div>
                </div>

                {isActive && assignment && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <select
                        value={assignment.routeId}
                        onChange={e => updateAssignment(truck.id, 'routeId', e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500">
                        {routes.map(r => (
                          <option key={r.id} value={r.id}>{r.name}{r.fuelLitersPerTrip > 0 ? ` · ${r.fuelLitersPerTrip}L/v` : ''}</option>
                        ))}
                      </select>
                      {/* Gasoil de referencia por mina */}
                      {route && route.fuelLitersPerTrip > 0 && (
                        <span className="text-[10px] text-sky-400/70 pl-1">
                          ⛽ {route.fuelLitersPerTrip}L por viaje — {route.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateAssignment(truck.id, 'plannedTrips', Math.max(0, (assignment.plannedTrips ?? 0) - 1))}
                        className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-sm flex items-center justify-center">−</button>
                      <span className="w-8 text-center text-white text-sm font-semibold">{assignment.plannedTrips}</span>
                      <button onClick={() => updateAssignment(truck.id, 'plannedTrips', (assignment.plannedTrips ?? 0) + 1)}
                        className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-sm flex items-center justify-center">+</button>
                      <span className="text-zinc-500 text-xs ml-1">v</span>
                    </div>
                    {/* Total gasoil cuando hay viajes confirmados */}
                    {fuelL > 0 && (
                      <span className="text-xs text-sky-400 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-full whitespace-nowrap font-semibold">
                        ⛽ {fuelL}L
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Resumen gasoil ────────────────────────────────────────────────────── */}
      {fuelSummary.length > 0 && (
        <div className="bg-sky-950/30 border border-sky-800/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sky-300 font-semibold text-sm">Gasoil a surtir hoy</h3>
            <span className="text-sky-400 font-bold text-lg">{totalFuel.toLocaleString()}L</span>
          </div>
          <div className="space-y-1">
            {fuelSummary.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono text-white">{f.plate}</span>
                <span>→ {f.routeName}</span>
                <span className="text-zinc-600">({f.trips}v × {f.lpv}L)</span>
                <span className="ml-auto text-sky-400 font-medium">{f.liters}L</span>
              </div>
            ))}
          </div>
          <p className="text-zinc-600 text-xs mt-2">Litros por viaje configurados en Minas &amp; Rutas. Surtir antes de salida.</p>
        </div>
      )}

      </> /* fin tab despacho */}
    </div>
  )
}
