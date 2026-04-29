'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAlmacenItem,
  asignarAlmacenItem,
  devolverAlmacenItem,
  deleteAlmacenItem,
} from '@/app/actions/almacen'

type Item = {
  id: string
  name: string
  amount: number
  notes: string | null
  usedByTruckId: string | null
  usedByTruck: { id: string; plate: string } | null
  usedDate: string | null
  createdAt: string
}
type Truck = { id: string; plate: string }

export default function AlmacenClient({
  items,
  trucks,
}: {
  items: Item[]
  trucks: Truck[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignTruckId, setAssignTruckId] = useState('')
  const [filter, setFilter] = useState<'all' | 'pendiente' | 'asignado'>('all')

  const pendiente = items.filter(i => !i.usedByTruckId)
  const asignados = items.filter(i => i.usedByTruckId)
  const totalPendiente = pendiente.reduce((s, i) => s + i.amount, 0)
  const totalAsignado = asignados.reduce((s, i) => s + i.amount, 0)

  const filtered =
    filter === 'pendiente' ? pendiente
    : filter === 'asignado' ? asignados
    : items

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await addAlmacenItem(new FormData(e.currentTarget))
    if (res?.error) { setError(res.error); setLoading(false) }
    else { setShowForm(false); router.refresh(); setLoading(false) }
  }

  async function handleAsignar(id: string) {
    if (!assignTruckId) return
    setLoading(true)
    await asignarAlmacenItem(id, assignTruckId)
    setAssigningId(null); setAssignTruckId('')
    router.refresh(); setLoading(false)
  }

  async function handleDevolver(id: string) {
    if (!confirm('¿Devolver este ítem al almacén?')) return
    await devolverAlmacenItem(id)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este ítem del almacén?')) return
    await deleteAlmacenItem(id)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Total ítems</p>
          <p className="text-white text-2xl font-bold">{items.length}</p>
        </div>
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Sin asignar (resta a Aurumin)</p>
          <p className="text-amber-400 text-2xl font-bold">${totalPendiente.toFixed(2)}</p>
          <p className="text-zinc-600 text-xs mt-0.5">{pendiente.length} ítem{pendiente.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Asignado a camiones</p>
          <p className="text-emerald-400 text-2xl font-bold">${totalAsignado.toFixed(2)}</p>
          <p className="text-zinc-600 text-xs mt-0.5">{asignados.length} ítem{asignados.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([['all', 'Todos'], ['pendiente', 'Sin asignar'], ['asignado', 'Asignados']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowForm(true); setError('') }}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Agregar ítem
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Agregar ítem al almacén</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Descripción *</label>
                <input name="name" required placeholder="Ej: Filtro de aceite..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto $ *</label>
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
              <input name="notes" placeholder="Detalles adicionales..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : 'Agregar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError('') }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Items table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay ítems{filter !== 'all' ? ' en esta categoría' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descripción</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha uso</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Notas</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={item.usedByTruckId ? 'text-zinc-300' : 'text-amber-400'}>
                        ${item.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.usedByTruck ? (
                        <span className="bg-emerald-500/10 text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-full">
                          {item.usedByTruck.plate}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">En almacén</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {item.usedDate
                        ? new Date(item.usedDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">{item.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Asignar a camión */}
                        {!item.usedByTruckId && (
                          assigningId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={assignTruckId}
                                onChange={e => setAssignTruckId(e.target.value)}
                                className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500">
                                <option value="">Camión...</option>
                                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                              </select>
                              <button
                                onClick={() => handleAsignar(item.id)}
                                disabled={!assignTruckId || loading}
                                className="text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 disabled:opacity-40 rounded-lg px-2 py-1 transition-colors">
                                OK
                              </button>
                              <button
                                onClick={() => { setAssigningId(null); setAssignTruckId('') }}
                                className="text-xs text-zinc-500 hover:text-white rounded-lg px-2 py-1 transition-colors">
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAssigningId(item.id); setAssignTruckId('') }}
                              className="text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
                              Asignar
                            </button>
                          )
                        )}

                        {/* Devolver al almacén */}
                        {item.usedByTruckId && (
                          <button
                            onClick={() => handleDevolver(item.id)}
                            className="text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
                            Devolver
                          </button>
                        )}

                        {/* Eliminar */}
                        <button onClick={() => handleDelete(item.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors">
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
    </div>
  )
}
