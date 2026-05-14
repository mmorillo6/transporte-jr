'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createMaterialEsterilEntries, getMaterialEsterilEntries, deleteMaterialEsterilTrip } from '@/app/actions/materialEsteril'

type Truck   = { id: string; plate: string; driver: { name: string } | null }
type Period  = { id: string; startDate: string; endDate: string }
type Entry   = {
  id: string; date: string; amount: number; viatico: number
  truck: { plate: string; driver: { name: string } | null }
  route: { name: string; clientName: string }
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

const CLIENTS = [
  { value: 'AURUMIN',   label: 'Aurumin' },
  { value: 'LUIS PEÑA', label: 'Chino (Luis Peña)' },
] as const

export default function MaterialEsterilClient({
  trucks,
  openPeriod,
}: {
  trucks:      Truck[]
  openPeriod:  Period | null
}) {
  const router = useRouter()
  const [entries, setEntries]       = useState<Entry[]>([])
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  // Bulk form state
  const [fecha, setFecha]           = useState(todayStr())
  const [client, setClient]         = useState<'AURUMIN' | 'LUIS PEÑA'>('AURUMIN')
  const [nViajes, setNViajes]       = useState(1)
  const [selected, setSelected]     = useState<Record<string, boolean>>({})  // truckId → checked

  const cargar = useCallback(async () => {
    if (!openPeriod) return
    setLoading(true)
    const data = await getMaterialEsterilEntries(openPeriod.id)
    setEntries(data as unknown as Entry[])
    setLoading(false)
  }, [openPeriod])

  useEffect(() => { cargar() }, [cargar])

  function toggleTruck(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }
  function selectAll()  { setSelected(Object.fromEntries(trucks.map(t => [t.id, true]))) }
  function clearAll()   { setSelected({}) }

  async function handleSave() {
    if (!openPeriod) { toast.error('No hay período abierto'); return }
    const chosen = trucks.filter(t => selected[t.id])
    if (chosen.length === 0) { toast.error('Selecciona al menos un camión'); return }
    if (nViajes < 1) { toast.error('El número de viajes debe ser ≥ 1'); return }

    setSaving(true)
    const res = await createMaterialEsterilEntries(
      chosen.map(t => ({
        truckId:    t.id,
        fecha,
        nViajes,
        clientName: client,
        periodId:   openPeriod.id,
      }))
    )
    setSaving(false)

    if (res.error) { toast.error(res.error); return }
    toast.success(`${res.created} viaje(s) registrado(s) — ${chosen.length} camión(es) × ${nViajes} viaje(s) × $100`)
    setSelected({})
    setNViajes(1)
    await cargar()
    router.refresh()
  }

  async function handleDelete(tripId: string) {
    if (!confirm('¿Eliminar este viaje?')) return
    await deleteMaterialEsterilTrip(tripId)
    await cargar()
    router.refresh()
  }

  // Group entries by date
  const byDate = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    const d = new Date(e.date).toISOString().slice(0, 10)
    acc[d] = [...(acc[d] ?? []), e]
    return acc
  }, {})

  const totalViajes = entries.length
  const totalMonto  = entries.reduce((s, e) => s + e.amount, 0)
  const totalSueldo = entries.reduce((s, e) => s + e.viatico, 0)
  const selectedCount = trucks.filter(t => selected[t.id]).length

  if (!openPeriod) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
        <p className="text-zinc-500">No hay período abierto. Abre un período para registrar material estéril.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-zinc-500 text-xs">Viajes registrados</p>
          <p className="text-white font-bold text-xl mt-0.5">{totalViajes}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-zinc-500 text-xs">Facturación ($100/viaje)</p>
          <p className="text-amber-400 font-bold text-xl mt-0.5">${totalMonto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-zinc-500 text-xs">Sueldo choferes ($10/viaje)</p>
          <p className="text-orange-400 font-bold text-xl mt-0.5">${totalSueldo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Formulario de registro masivo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm">Registrar viajes de material estéril</h3>

        {/* Fecha, cliente, N viajes */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Cliente *</label>
            <select value={client} onChange={e => setClient(e.target.value as any)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
              {CLIENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">N° viajes por camión *</label>
            <input type="number" min={1} step={1} value={nViajes} onChange={e => setNViajes(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
          </div>
        </div>

        {/* Preview */}
        {selectedCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-sm">
            <span className="text-amber-400 font-semibold">
              {selectedCount} camión(es) × {nViajes} viaje(s) × $100 = <strong>${(selectedCount * nViajes * 100).toLocaleString('es-VE')}</strong>
            </span>
            <span className="text-zinc-400 ml-3">· Sueldo choferes: ${(selectedCount * nViajes * 10).toLocaleString('es-VE')}</span>
          </div>
        )}

        {/* Selección de camiones */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-400">Camiones que hicieron estéril ese día (omite Frank Cobi):</p>
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={selectAll} className="text-amber-400 hover:text-amber-300 transition-colors">Todos</button>
              <button type="button" onClick={clearAll} className="text-zinc-500 hover:text-zinc-300 transition-colors">Limpiar</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {trucks.map(truck => (
              <label key={truck.id}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border cursor-pointer transition-colors ${
                  selected[truck.id]
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                }`}>
                <input type="checkbox" checked={!!selected[truck.id]} onChange={() => toggleTruck(truck.id)}
                  className="accent-amber-500 w-4 h-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-mono text-xs font-medium truncate">{truck.plate}</p>
                  <p className="text-zinc-500 text-xs truncate">{truck.driver?.name ?? '—'}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || selectedCount === 0}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors"
        >
          {saving ? 'Guardando...' : `Registrar ${selectedCount > 0 ? `${selectedCount} camión(es)` : 'viajes'}`}
        </button>
      </div>

      {/* Historial del período */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-white font-semibold text-sm">Registros del período</p>
          <p className="text-zinc-500 text-xs">{new Date(openPeriod.startDate).toLocaleDateString('es-VE', {day:'2-digit',month:'2-digit',timeZone:'UTC'})} al {new Date(openPeriod.endDate).toLocaleDateString('es-VE', {day:'2-digit',month:'2-digit',timeZone:'UTC'})}</p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-zinc-500 text-sm">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-sm">Sin registros en este período</div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {Object.entries(byDate).sort().map(([date, dayEntries]) => (
              <div key={date}>
                <div className="px-4 py-2 bg-zinc-800/30">
                  <p className="text-zinc-400 text-xs font-semibold">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    <span className="ml-2 text-zinc-600">· {dayEntries.length} viaje(s) · ${dayEntries.reduce((s,e)=>s+e.amount,0).toLocaleString('es-VE')}</span>
                  </p>
                </div>
                {dayEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/20 transition-colors">
                    <div>
                      <span className="text-white font-mono text-sm">{e.truck.plate}</span>
                      <span className="text-zinc-500 text-xs ml-2">{e.truck.driver?.name ?? '—'}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${e.route.clientName === 'LUIS PEÑA' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {e.route.clientName === 'LUIS PEÑA' ? 'Chino' : 'Aurumin'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-mono text-sm">${e.amount.toFixed(2)}</span>
                      <span className="text-orange-400 text-xs">+${e.viatico.toFixed(2)} chofer</span>
                      <button onClick={() => handleDelete(e.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
