'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ExcelImportModal from '@/components/ExcelImportModal'
import { deleteTrip, updateTrip } from '@/app/actions/trips'

type Trip = {
  id: string
  date: string
  ticketNo: string | null
  netWeightKg: number | null
  amount: number
  viatico: number
  material: string | null
  origin: string | null
  notes: string | null
  truckId: string
  routeId: string
  truck: { plate: string; driver: { name: string } | null; owner: { name: string } }
  route: { name: string; rateType: string }
}

type FilterOptions = {
  trucks: { id: string; plate: string; driver: { name: string } | null }[]
  routes: { id: string; name: string }[]
}

export default function ViajesClient({
  trips,
  filterOptions,
  params,
  page,
  totalPages,
  totalAmount,
  totalTons,
  total,
}: {
  trips: Trip[]
  filterOptions: FilterOptions
  params: Record<string, string | undefined>
  page: number
  totalPages: number
  totalAmount: number
  totalTons: number
  total: number
}) {
  const router = useRouter()
  const [showImport, setShowImport] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Trip | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editError, setEditError] = useState('')

  function applyFilter(key: string, value: string) {
    const p = new URLSearchParams(params as any)
    if (value) p.set(key, value)
    else p.delete(key)
    p.delete('page')
    router.push(`/viajes?${p.toString()}`)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este viaje?')) return
    setDeletingId(id)
    await deleteTrip(id)
    setDeletingId(null)
    router.refresh()
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setUpdating(true)
    setEditError('')
    const res = await updateTrip(editing.id, new FormData(e.currentTarget))
    if (res?.error) { setEditError(res.error); setUpdating(false) }
    else { setEditing(null); router.refresh(); setUpdating(false) }
  }

  return (
    <>
      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Desde</label>
            <input
              type="date"
              defaultValue={params.from ?? ''}
              onChange={e => applyFilter('from', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Hasta</label>
            <input
              type="date"
              defaultValue={params.to ?? ''}
              onChange={e => applyFilter('to', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Camión</label>
            <select
              defaultValue={params.truckId ?? ''}
              onChange={e => applyFilter('truckId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos</option>
              {filterOptions.trucks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.plate} — {t.driver?.name ?? ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Ruta</label>
            <select
              defaultValue={params.routeId ?? ''}
              onChange={e => applyFilter('routeId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">Todas</option>
              {filterOptions.routes.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
          {/* Totals */}
          <div className="flex gap-6">
            <div>
              <span className="text-zinc-500 text-xs">Total viajes</span>
              <p className="text-white font-semibold">{total}</p>
            </div>
            <div>
              <span className="text-zinc-500 text-xs">Total toneladas</span>
              <p className="text-white font-semibold">{totalTons.toFixed(2)} ton</p>
            </div>
            <div>
              <span className="text-zinc-500 text-xs">Total monto</span>
              <p className="text-amber-400 font-semibold">${totalAmount.toFixed(2)}</p>
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V4" />
            </svg>
            Importar Excel
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Editar viaje</h3>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                <input name="date" type="date" required
                  defaultValue={new Date(editing.date).toISOString().split('T')[0]}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                <select name="truckId" required defaultValue={editing.truckId}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  {filterOptions.trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Ruta *</label>
                <select name="routeId" required defaultValue={editing.routeId}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  {filterOptions.routes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Toneladas netas (kg)</label>
                <input name="netWeightKg" type="number" step="0.01" min="0"
                  defaultValue={editing.netWeightKg ?? ''}
                  placeholder="Ej: 25000"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">N° Ticket</label>
                <input name="ticketNo" type="text"
                  defaultValue={editing.ticketNo ?? ''}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo de material *</label>
                <select name="material" required defaultValue={editing.material ?? ''}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Seleccionar...</option>
                  <option value="ARENA">ARENA</option>
                  <option value="PRIMARIO">PRIMARIO</option>
                  <option value="CALIZA">CALIZA</option>
                  <option value="GRANZA">GRANZA</option>
                  <option value="BALASTO">BALASTO</option>
                  <option value="ARCILLA">ARCILLA</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Origen (mina / sector)</label>
                <input name="origin" type="text"
                  defaultValue={editing.origin ?? ''}
                  placeholder="LA FE, NUEVO CALLAO..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            {editError && <p className="text-red-400 text-sm">{editError}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={updating}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {updating ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => { setEditing(null); setEditError('') }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {trips.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-zinc-500 text-sm">No hay viajes registrados</p>
            <p className="text-zinc-600 text-xs mt-1">Registra un viaje o importa desde Excel</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Ticket</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Origen</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Material</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Transportista</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Conductor</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Placa</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Ruta</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Ton Netas</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Viático</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {trips.map(trip => (
                  <tr key={trip.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${editing?.id === trip.id ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                      {new Date(trip.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{trip.ticketNo ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{trip.origin ?? '—'}</td>
                    <td className="px-4 py-3">
                      {trip.material
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">{trip.material}</span>
                        : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{trip.truck.owner.name}</td>
                    <td className="px-4 py-3 text-zinc-400">{trip.truck.driver?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-white font-medium font-mono">{trip.truck.plate}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{trip.route.name}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {trip.netWeightKg ? (trip.netWeightKg / 1000).toFixed(3) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400 font-semibold">
                      ${trip.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400">
                      {trip.viatico > 0 ? `$${trip.viatico.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditing(trip); setEditError('') }}
                          className="text-zinc-600 hover:text-amber-400 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(trip.id)}
                          disabled={deletingId === trip.id}
                          className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {(() => {
            const pages: (number | '…')[] = []
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i)
            } else {
              pages.push(1)
              if (page > 3) pages.push('…')
              for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
              if (page < totalPages - 2) pages.push('…')
              pages.push(totalPages)
            }
            return pages.map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-zinc-600 text-sm">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => {
                    const sp = new URLSearchParams(params as any)
                    sp.set('page', String(p))
                    router.push(`/viajes?${sp.toString()}`)
                  }}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    p === page ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {p}
                </button>
              )
            )
          })()}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ExcelImportModal
          onClose={() => {
            setShowImport(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
