'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDiasInternosEntries, createDiasInternosEntry, updateDiasInternosEntry, deleteDiasInternosEntry } from '@/app/actions/diasInternos'

type Truck = { id: string; plate: string; driver: { name: string } | null }
type Entry = {
  id: string; fecha: Date; truckId: string; conductor: string
  descripcion: string; actividad: string; horaInicio: string; horaFin: string
  totalHoras: number; truck: { plate: string }
}

function fmt(d: Date) {
  return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function DiasInternosClient({ trucks }: { trucks: Truck[] }) {
  const router = useRouter()
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate]     = useState(todayStr())
  const [entries, setEntries]     = useState<Entry[]>([])
  const [loading, setLoading]     = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Entry | null>(null)
  const [error, setError]         = useState('')

  // Formulario
  const [truckId, setTruckId]         = useState('')
  const [conductor, setConductor]     = useState('')
  const [fecha, setFecha]             = useState(todayStr())
  const [horaInicio, setHoraInicio]   = useState('07:30')
  const [horaFin, setHoraFin]         = useState('17:00')
  const [descripcion, setDescripcion] = useState('INTERNO TRONCAL A PLANTA')
  const [actividad, setActividad]     = useState('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
  const [saving, setSaving]           = useState(false)

  const totalHoras = (() => {
    if (!horaInicio || !horaFin) return 0
    const [hi, mi] = horaInicio.split(':').map(Number)
    const [hf, mf] = horaFin.split(':').map(Number)
    const h = ((hf * 60 + mf) - (hi * 60 + mi)) / 60
    return h > 0 ? Math.round(h * 100) / 100 : 0
  })()

  const totalHorasEntries = entries.reduce((s, e) => s + e.totalHoras, 0)
  const montoTotal = Math.round(totalHorasEntries * 20 * 100) / 100

  async function cargar() {
    setLoading(true)
    const data = await getDiasInternosEntries(startDate, endDate)
    setEntries(data as Entry[])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [startDate, endDate])

  function autoFillConductor(tid: string) {
    const truck = trucks.find(t => t.id === tid)
    if (truck?.driver?.name) setConductor(truck.driver.name)
  }

  function openNew() {
    setEditing(null)
    setTruckId(''); setConductor(''); setFecha(todayStr())
    setHoraInicio('07:30'); setHoraFin('17:00')
    setDescripcion('INTERNO TRONCAL A PLANTA')
    setActividad('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
    setError(''); setShowForm(true)
  }

  function openEdit(e: Entry) {
    setEditing(e)
    setTruckId(e.truckId); setConductor(e.conductor); setFecha(new Date(e.fecha).toISOString().slice(0, 10))
    setHoraInicio(e.horaInicio); setHoraFin(e.horaFin)
    setDescripcion(e.descripcion); setActividad(e.actividad)
    setError(''); setShowForm(true)
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setSaving(true); setError('')
    const fd = new FormData()
    fd.append('truckId', truckId); fd.append('conductor', conductor)
    fd.append('fecha', fecha); fd.append('horaInicio', horaInicio)
    fd.append('horaFin', horaFin); fd.append('descripcion', descripcion)
    fd.append('actividad', actividad)
    const res = editing
      ? await updateDiasInternosEntry(editing.id, fd)
      : await createDiasInternosEntry(fd)
    if (res?.error) { setError(res.error); setSaving(false); return }
    setShowForm(false); setEditing(null)
    await cargar(); router.refresh()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteDiasInternosEntry(id)
    await cargar(); router.refresh()
  }

  return (
    <div className="space-y-4">

      {/* Filtro de período */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
        </div>
        <button onClick={openNew}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors ml-auto">
          + Agregar registro
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Total horas registradas</p>
          <p className="text-2xl font-bold text-amber-400">{totalHorasEntries.toFixed(1)} h</p>
          <p className="text-zinc-600 text-xs mt-1">{entries.length} registros</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Monto a cobrar a Aurumin</p>
          <p className="text-2xl font-bold text-emerald-400">${montoTotal.toFixed(2)}</p>
          <p className="text-zinc-600 text-xs mt-1">{totalHorasEntries.toFixed(1)}h × $20.00</p>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{editing ? 'Editar registro' : 'Nuevo registro de día interno'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Camión *</label>
                <select value={truckId} required onChange={e => { setTruckId(e.target.value); autoFillConductor(e.target.value) }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Seleccionar...</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.plate}{t.driver ? ` — ${t.driver.name}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Conductor *</label>
                <input value={conductor} onChange={e => setConductor(e.target.value)} required
                  placeholder="Nombre del conductor"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                <input type="date" value={fecha} required onChange={e => setFecha(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Hora inicio *</label>
                <input type="time" value={horaInicio} required onChange={e => setHoraInicio(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Hora fin *</label>
                <input type="time" value={horaFin} required onChange={e => setHoraFin(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>

            {totalHoras > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-amber-400 text-sm font-medium">Total: {totalHoras}h × $20 = <span className="font-bold">${(totalHoras * 20).toFixed(2)}</span></span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Descripción</label>
                <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Actividad</label>
                <input value={actividad} onChange={e => setActividad(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving || totalHoras <= 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar registro'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-zinc-500 text-sm">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay registros en este período</p>
            <button onClick={openNew} className="mt-3 text-amber-400 hover:text-amber-300 text-sm transition-colors">
              + Agregar el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Placa</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Conductor</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descripción</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Inicio</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-3 text-xs">Fin</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Horas</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-zinc-400 text-xs">{fmt(e.fecha)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{e.truck.plate}</td>
                    <td className="px-4 py-3 text-white text-sm">{e.conductor}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">{e.descripcion}</td>
                    <td className="px-4 py-3 text-center text-xs text-zinc-400">{e.horaInicio}</td>
                    <td className="px-4 py-3 text-center text-xs text-zinc-400">{e.horaFin}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-400">{e.totalHoras}h</td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-300">${(e.totalHoras * 20).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(e)} className="text-zinc-600 hover:text-amber-400 transition-colors" title="Editar">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(e.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-800/30">
                  <td colSpan={6} className="px-4 py-3 text-zinc-500 text-xs font-medium">TOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-amber-400">{totalHorasEntries.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400">${montoTotal.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
