'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoute, updateRoute, deleteRoute, toggleRouteActive } from '@/app/actions/config'
import { toast } from 'sonner'

type Route = {
  id: string
  name: string
  rateType: string
  rate: number
  driverWage: number
  fuelLitersPerTrip: number
  hasViatico: boolean
  viaticoSingle: number
  viaticoDouble: number
  bidirectional: boolean
  active: boolean
  _count: { trips: number }
}

export default function RutasClient({
  routes, canEdit,
}: { routes: Route[]; canEdit: boolean }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Route | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasViatico, setHasViatico] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggle(id: string, currentActive: boolean) {
    setTogglingId(id)
    const res = await toggleRouteActive(id, !currentActive)
    if (res.error) toast.error(res.error)
    else router.refresh()
    setTogglingId(null)
  }

  function openNew() {
    setEditing(null)
    setHasViatico(false)
    setIsBidirectional(false)
    setShowForm(true)
    setError('')
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar la ruta "${name}"? Esta acción no se puede deshacer.`)) return
    const res = await deleteRoute(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  const [isBidirectional, setIsBidirectional] = useState(false)

  function openEdit(route: Route) {
    setEditing(route)
    setHasViatico(route.hasViatico)
    setIsBidirectional(route.bidirectional)
    setShowForm(false)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = editing ? await updateRoute(editing.id, fd) : await createRoute(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowForm(false); setEditing(null); router.refresh(); setLoading(false) }
  }

  const formOpen = showForm || !!editing

  return (
    <div className="space-y-4">
      {canEdit && (
        <button onClick={openNew}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Nueva ruta / mina
        </button>
      )}

      {/* Form */}
      {formOpen && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{editing ? 'Editar ruta' : 'Nueva ruta / mina'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Nombre / Mina *</label>
                <input name="name" required defaultValue={editing?.name ?? ''} placeholder="MINA LAS MATAS"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm uppercase focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo de tarifa *</label>
                <select name="rateType" required defaultValue={editing?.rateType ?? 'PER_TON'}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="PER_TON">Por tonelada</option>
                  <option value="PER_TRIP">Por viaje (fijo)</option>
                  <option value="PER_HOUR">Por hora</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tarifa $ *</label>
                <input name="rate" type="number" step="0.01" min="0" required
                  defaultValue={editing?.rate ?? ''}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Sueldo chofer $/unidad</label>
                <input name="driverWage" type="number" step="0.01" min="0"
                  defaultValue={editing?.driverWage ?? '0'}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Litros gasoil/viaje</label>
                <input name="fuelLitersPerTrip" type="number" step="1" min="0"
                  defaultValue={editing?.fuelLitersPerTrip ?? '0'}
                  placeholder="0"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  name="hasViatico"
                  type="checkbox"
                  value="true"
                  checked={hasViatico}
                  onChange={e => setHasViatico(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4" />
                <span className="text-zinc-300 text-sm">Incluye viático</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  name="bidirectional"
                  type="checkbox"
                  value="true"
                  checked={isBidirectional}
                  onChange={e => setIsBidirectional(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4" />
                <span className="text-zinc-300 text-sm">Viaje bidireccional</span>
              </label>
              {isBidirectional && (
                <span className="text-zinc-500 text-xs">Van cargados y regresan cargados — $100 c/leg</span>
              )}
            </div>

            {hasViatico && (
              <div className="grid grid-cols-2 gap-4 bg-zinc-800/50 rounded-xl p-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Viático sencillo $</label>
                  <input name="viaticoSingle" type="number" step="0.01" min="0"
                    defaultValue={editing?.viaticoSingle ?? '0'}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  <p className="text-zinc-600 text-xs mt-1">Primer viaje del día</p>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Viático doble $</label>
                  <input name="viaticoDouble" type="number" step="0.01" min="0"
                    defaultValue={editing?.viaticoDouble ?? '0'}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  <p className="text-zinc-600 text-xs mt-1">Segundo viaje en adelante</p>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Routes table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {routes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay rutas registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Nombre / Mina</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Tipo</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Tarifa</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Sueldo/viaje</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">L/viaje</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Viático</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Bidirec.</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Viajes</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Activa</th>
                  {canEdit && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {routes.map(route => (
                  <tr key={route.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${!route.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-white font-mono font-medium">{route.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        route.rateType === 'PER_TON'  ? 'text-blue-400 bg-blue-400/10' :
                        route.rateType === 'PER_HOUR' ? 'text-violet-400 bg-violet-400/10' :
                                                        'text-purple-400 bg-purple-400/10'
                      }`}>
                        {route.rateType === 'PER_TON' ? 'Por ton' : route.rateType === 'PER_HOUR' ? 'Por hora' : 'Por viaje'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400 font-semibold">
                      ${route.rate.toFixed(2)}
                      <span className="text-zinc-600 font-normal text-xs ml-1">
                        {route.rateType === 'PER_TON' ? '/ton' : route.rateType === 'PER_HOUR' ? '/h' : '/viaje'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-orange-400 font-semibold">
                      {route.driverWage > 0
                        ? <span>${route.driverWage.toFixed(2)}<span className="text-zinc-600 font-normal text-xs ml-0.5">{route.rateType === 'PER_HOUR' ? '/h' : ''}</span></span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-semibold">
                      {route.fuelLitersPerTrip > 0 ? `${route.fuelLitersPerTrip} L` : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {route.hasViatico ? (
                        <div className="text-xs">
                          <span className="text-cyan-400">${route.viaticoSingle.toFixed(2)}</span>
                          <span className="text-zinc-600"> / </span>
                          <span className="text-cyan-300">${route.viaticoDouble.toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {route.bidirectional
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full text-amber-400 bg-amber-400/10">↕ Sí</span>
                        : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-semibold">{route._count.trips}</td>
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => handleToggle(route.id, route.active)}
                          disabled={togglingId === route.id}
                          title={route.active ? 'Desactivar mina' : 'Activar mina'}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                            route.active ? 'bg-emerald-500' : 'bg-zinc-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            route.active ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          route.active ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 bg-zinc-500/10'
                        }`}>
                          {route.active ? 'Activa' : 'Inactiva'}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(route)}
                            className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                            Editar
                          </button>
                          <button onClick={() => handleDelete(route.id, route.name)}
                            className="text-zinc-600 hover:text-red-400 transition-colors" title="Eliminar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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
  )
}
