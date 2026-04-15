'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { clockIn, clockOut, deleteClockEntry } from '@/app/actions/clockEntries'

const ROLE_LABEL: Record<string, string> = { CHOFER: 'Chofer', MECANICO: 'Mecánico' }

type Entry = {
  id: string
  clockIn: string
  clockOut: string | null
  notes: string | null
  user: { name: string; role: string }
  truck: { plate: string } | null
}

function toLocalDatetimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type SummaryRow = { name: string; role: string; days: number; totalHours: number; avgHours: number }

export default function AsistenciaClient({
  entries, users, trucks, summaryData, selectedMonth,
}: {
  entries: Entry[]
  users: { id: string; name: string; role: string }[]
  trucks: { id: string; plate: string }[]
  summaryData: SummaryRow[]
  selectedMonth: string
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [clockOutId, setClockOutId] = useState<string | null>(null)
  const [clockOutTime, setClockOutTime] = useState(toLocalDatetimeValue(new Date()))
  const [filterOpen, setFilterOpen] = useState<'all' | 'open' | 'closed' | 'resumen'>('all')

  async function handleClockIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const res = await clockIn(new FormData(e.currentTarget))
    if (res.error) toast.error(res.error)
    else { setShowForm(false); toast.success('Entrada registrada'); router.refresh() }
    setLoading(false)
  }

  async function handleClockOut(id: string) {
    setLoading(true)
    const res = await clockOut(id, clockOutTime)
    if (res.error) toast.error(res.error)
    else { setClockOutId(null); toast.success('Salida registrada'); router.refresh() }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteClockEntry(id)
    router.refresh()
  }

  function duration(clockIn: string, clockOut: string | null) {
    const end = clockOut ? new Date(clockOut) : new Date()
    const mins = Math.round((end.getTime() - new Date(clockIn).getTime()) / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const filtered = entries.filter(e => {
    if (filterOpen === 'open') return !e.clockOut
    if (filterOpen === 'closed') return !!e.clockOut
    if (filterOpen === 'resumen') return false
    return true
  })

  const openEntries = entries.filter(e => !e.clockOut)

  return (
    <div className="space-y-4">
      {/* Open shifts banner */}
      {openEntries.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-amber-400 text-sm font-semibold mb-2">Turnos abiertos ahora</p>
          <div className="flex flex-wrap gap-2">
            {openEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2 bg-zinc-900 rounded-xl px-3 py-2">
                <span className="text-white text-sm font-medium">{e.user.name}</span>
                {e.truck && <span className="text-zinc-500 text-xs font-mono">{e.truck.plate}</span>}
                <span className="text-amber-400 text-xs">{duration(e.clockIn, null)}</span>
                <button onClick={() => { setClockOutId(e.id); setClockOutTime(toLocalDatetimeValue(new Date())) }}
                  className="text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-lg px-2 py-0.5 transition-colors">
                  Registrar salida
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clock out modal */}
      {clockOutId && (
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Registrar salida</h3>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Hora de salida</label>
              <input type="datetime-local" value={clockOutTime} onChange={e => setClockOutTime(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <button onClick={() => handleClockOut(clockOutId)} disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
              {loading ? 'Guardando...' : 'Confirmar salida'}
            </button>
            <button onClick={() => setClockOutId(null)}
              className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([['all', 'Todos'], ['open', 'Abiertos'], ['closed', 'Cerrados'], ['resumen', 'Resumen']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterOpen === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Registrar entrada
        </button>
      </div>

      {/* New entry form */}
      {showForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Registrar entrada</h3>
          <form onSubmit={handleClockIn} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Persona *</label>
                <select name="userId" required
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Seleccionar...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role] ?? u.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Hora de entrada *</label>
                <input name="clockIn" type="datetime-local" required
                  defaultValue={toLocalDatetimeValue(new Date())}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Camión (opcional)</label>
                <select name="truckId"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Sin asignar</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
                <input name="notes" placeholder="Observaciones..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : 'Registrar entrada'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary tab */}
      {filterOpen === 'resumen' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-zinc-400 text-xs">Mes:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => router.push(`/despacho?tab=asistencia&month=${e.target.value}`)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {summaryData.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-zinc-500 text-sm">Sin registros cerrados en este mes</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/40">
                    <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Persona</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Rol</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Días</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Horas totales</th>
                    <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Promedio/día</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.map(row => (
                    <tr key={row.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{row.role}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{row.days}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold">{row.totalHours}h</td>
                      <td className="px-4 py-3 text-right text-zinc-400">{row.avgHours}h</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-800/60 border-t border-zinc-700">
                    <td colSpan={3} className="px-4 py-3 text-zinc-400 font-semibold text-xs uppercase">Total</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-bold">
                      {summaryData.reduce((s, r) => s + r.totalHours, 0).toFixed(1)}h
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {filterOpen !== 'resumen' && (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center"><p className="text-zinc-500 text-sm">Sin registros</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Persona</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Rol</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Entrada</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Salida</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Duración</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{entry.user.name}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{ROLE_LABEL[entry.user.role] ?? entry.user.role}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{entry.truck?.plate ?? '—'}</td>
                    <td suppressHydrationWarning className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">
                      {new Date(entry.clockIn).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {entry.clockOut ? (
                        <span suppressHydrationWarning className="text-zinc-300">
                          {new Date(entry.clockOut).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <button onClick={() => { setClockOutId(entry.id); setClockOutTime(toLocalDatetimeValue(new Date())) }}
                          className="text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-lg px-2 py-0.5 transition-colors">
                          Registrar salida
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 text-xs">
                      {entry.clockOut
                        ? <span className="text-zinc-300">{duration(entry.clockIn, entry.clockOut)}</span>
                        : <span className="text-amber-400">{duration(entry.clockIn, null)} ↑</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(entry.id)}
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
      )}
    </div>
  )
}
