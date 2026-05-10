'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDiasInternosEntries, createDiasInternosEntry, updateDiasInternosEntry, deleteDiasInternosEntry, getDiasInternosDetections, createDiasInternosBulk } from '@/app/actions/diasInternos'

type Truck = { id: string; plate: string; driver: { name: string } | null }
type Entry = {
  id: string; fecha: Date; truckId: string; conductor: string
  descripcion: string; actividad: string; horaInicio: string; horaFin: string
  totalHoras: number; truck: { plate: string }
}
type Detection = { truckId: string; plate: string; conductor: string; date: string; tripCount: number }

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
  const [entries, setEntries]       = useState<Entry[]>([])
  const [detections, setDetections] = useState<Detection[]>([])
  const [loading, setLoading]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Entry | null>(null)
  const [error, setError]         = useState('')

  // Formulario
  const [truckId, setTruckId]         = useState('')
  const [conductor, setConductor]     = useState('')
  const [fecha, setFecha]             = useState(todayStr())
  const [horaInicio, setHoraInicio]   = useState('07:30')
  const [horaFin, setHoraFin]         = useState('17:00')
  const [descanso, setDescanso]       = useState(1)
  const [descripcion, setDescripcion] = useState('INTERNO TRONCAL A PLANTA')
  const [actividad, setActividad]     = useState('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
  const [saving, setSaving]           = useState(false)

  // Bulk state
  const [showBulk, setShowBulk]         = useState(false)
  const [bulkFecha, setBulkFecha]       = useState(todayStr())
  const [bulkInicio, setBulkInicio]     = useState('07:30')
  const [bulkFin, setBulkFin]           = useState('17:00')
  const [bulkDescanso, setBulkDescanso] = useState(1)
  const [bulkDescripcion, setBulkDescripcion] = useState('INTERNO TRONCAL A PLANTA')
  const [bulkActividad, setBulkActividad]     = useState('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
  const [bulkSelected, setBulkSelected] = useState<Record<string, string>>({}) // truckId → conductor
  const [bulkSaving, setBulkSaving]     = useState(false)
  const [bulkError, setBulkError]       = useState('')

  const bulkHoras = (() => {
    if (!bulkInicio || !bulkFin) return 0
    const [hi, mi] = bulkInicio.split(':').map(Number)
    const [hf, mf] = bulkFin.split(':').map(Number)
    const h = ((hf * 60 + mf) - (hi * 60 + mi)) / 60 - bulkDescanso
    return h > 0 ? Math.round(h * 100) / 100 : 0
  })()

  async function handleBulkSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const truckList = Object.entries(bulkSelected).map(([truckId, conductor]) => ({ truckId, conductor }))
    if (truckList.length === 0) { setBulkError('Selecciona al menos un camión'); return }
    setBulkSaving(true); setBulkError('')
    const res = await createDiasInternosBulk({
      fecha: bulkFecha, horaInicio: bulkInicio, horaFin: bulkFin,
      descanso: bulkDescanso, descripcion: bulkDescripcion, actividad: bulkActividad,
      trucks: truckList,
    })
    if (res?.error) { setBulkError(res.error); setBulkSaving(false); return }
    setShowBulk(false); setBulkSelected({})
    await cargar(); router.refresh()
    setBulkSaving(false)
  }

  function toggleBulkTruck(truck: Truck) {
    setBulkSelected(prev => {
      const next = { ...prev }
      if (next[truck.id]) { delete next[truck.id] }
      else { next[truck.id] = truck.driver?.name ?? '' }
      return next
    })
  }

  const totalHoras = (() => {
    if (!horaInicio || !horaFin) return 0
    const [hi, mi] = horaInicio.split(':').map(Number)
    const [hf, mf] = horaFin.split(':').map(Number)
    const h = ((hf * 60 + mf) - (hi * 60 + mi)) / 60 - descanso
    return h > 0 ? Math.round(h * 100) / 100 : 0
  })()

  const totalHorasEntries = entries.reduce((s, e) => s + e.totalHoras, 0)
  const montoTotal = Math.round(totalHorasEntries * 20 * 100) / 100

  async function cargar() {
    setLoading(true)
    const [data, dets] = await Promise.all([
      getDiasInternosEntries(startDate, endDate),
      getDiasInternosDetections(startDate, endDate),
    ])
    setEntries(data as Entry[])
    // Filtrar detecciones que ya tienen entrada manual
    const registered = new Set((data as Entry[]).map(e =>
      `${e.truckId}|${new Date(e.fecha).toISOString().slice(0, 10)}`
    ))
    setDetections((dets as Detection[]).filter(d => !registered.has(`${d.truckId}|${d.date}`)))
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
    setHoraInicio('07:30'); setHoraFin('17:00'); setDescanso(1)
    setDescripcion('INTERNO TRONCAL A PLANTA')
    setActividad('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
    setError(''); setShowForm(true)
  }

  function openFromDetection(d: Detection) {
    setEditing(null)
    setTruckId(d.truckId); setConductor(d.conductor); setFecha(d.date)
    setHoraInicio('07:30'); setHoraFin('17:00'); setDescanso(1)
    setDescripcion('INTERNO TRONCAL A PLANTA')
    setActividad('ACARREO DE ÑUMA DE TRONCAL A PLANTA')
    setError(''); setShowForm(true)
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  function openEdit(e: Entry) {
    setEditing(e)
    setTruckId(e.truckId); setConductor(e.conductor); setFecha(new Date(e.fecha).toISOString().slice(0, 10))
    setHoraInicio(e.horaInicio); setHoraFin(e.horaFin)
    // Calcular descanso como diferencia entre span y totalHoras almacenado
    const [hi, mi] = e.horaInicio.split(':').map(Number)
    const [hf, mf] = e.horaFin.split(':').map(Number)
    const span = ((hf * 60 + mf) - (hi * 60 + mi)) / 60
    setDescanso(Math.max(0, Math.round((span - e.totalHoras) * 100) / 100))
    setDescripcion(e.descripcion); setActividad(e.actividad)
    setError(''); setShowForm(true)
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setSaving(true); setError('')
    const fd = new FormData()
    fd.append('truckId', truckId); fd.append('conductor', conductor)
    fd.append('fecha', fecha); fd.append('horaInicio', horaInicio)
    fd.append('horaFin', horaFin); fd.append('descanso', String(descanso))
    fd.append('descripcion', descripcion); fd.append('actividad', actividad)
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
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setShowBulk(v => !v); setShowForm(false) }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
            + Día masivo
          </button>
          <button onClick={() => { openNew(); setShowBulk(false) }}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
            + Un camión
          </button>
        </div>
      </div>

      {/* ── Formulario DÍA MASIVO ──────────────────────────────────────────── */}
      {showBulk && (
        <form onSubmit={handleBulkSubmit} className="bg-zinc-900 border border-blue-500/30 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-semibold text-sm">Día interno masivo — varios camiones a la vez</h3>

          {/* Horario común */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Fecha</label>
              <input type="date" value={bulkFecha} onChange={e => setBulkFecha(e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Hora inicio</label>
              <input type="time" value={bulkInicio} onChange={e => setBulkInicio(e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Hora fin</label>
              <input type="time" value={bulkFin} onChange={e => setBulkFin(e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Descanso (h)</label>
              <input type="number" value={bulkDescanso} onChange={e => setBulkDescanso(parseFloat(e.target.value) || 0)}
                min={0} step={0.5}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* Preview horas */}
          {bulkHoras > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 text-sm text-amber-400 font-semibold">
              {bulkHoras}h × $20.00 = ${(bulkHoras * 20).toFixed(2)} por camión
              {Object.keys(bulkSelected).length > 0 && (
                <span className="text-zinc-400 font-normal ml-2">
                  · {Object.keys(bulkSelected).length} camión(es) seleccionado(s) = ${(bulkHoras * 20 * Object.keys(bulkSelected).length).toFixed(2)} total
                </span>
              )}
            </div>
          )}

          {/* Selección de camiones */}
          <div>
            <p className="text-xs text-zinc-400 mb-2">Selecciona los camiones que trabajaron ese día:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {trucks.map(truck => {
                const selected = !!bulkSelected[truck.id]
                return (
                  <label key={truck.id}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border cursor-pointer transition-colors ${
                      selected ? 'bg-blue-500/10 border-blue-500/40' : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                    }`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleBulkTruck(truck)}
                      className="accent-blue-500 w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-mono font-medium text-sm">{truck.plate}</p>
                      {selected ? (
                        <input
                          type="text"
                          value={bulkSelected[truck.id]}
                          onChange={e => setBulkSelected(prev => ({ ...prev, [truck.id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          placeholder="Conductor"
                          className="w-full bg-zinc-700 border border-zinc-600 text-white rounded px-1.5 py-0.5 text-xs mt-1 focus:outline-none focus:border-blue-500"
                        />
                      ) : (
                        <p className="text-zinc-500 text-xs truncate">{truck.driver?.name ?? '—'}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Seleccionar todos */}
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => setBulkSelected(Object.fromEntries(trucks.map(t => [t.id, t.driver?.name ?? ''])))}
              className="text-blue-400 hover:text-blue-300 transition-colors">Seleccionar todos</button>
            <button type="button" onClick={() => setBulkSelected({})}
              className="text-zinc-500 hover:text-zinc-300 transition-colors">Limpiar</button>
          </div>

          {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={bulkSaving || Object.keys(bulkSelected).length === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2 text-sm transition-colors">
              {bulkSaving ? 'Guardando...' : `Crear ${Object.keys(bulkSelected).length || ''} registro(s)`}
            </button>
            <button type="button" onClick={() => { setShowBulk(false); setBulkSelected({}) }}
              className="text-zinc-400 hover:text-white text-sm transition-colors">Cancelar</button>
          </div>
        </form>
      )}

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

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Descanso / Almuerzo (horas)</label>
              <input type="number" min="0" step="0.5" value={descanso}
                onChange={e => setDescanso(parseFloat(e.target.value) || 0)}
                className="w-32 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              <p className="text-zinc-600 text-xs mt-1">Se resta del total — por defecto 1h de almuerzo</p>
            </div>

            {totalHoras > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                <span className="text-amber-400 text-sm font-medium">
                  Span: {(() => { const [hi,mi]=horaInicio.split(':').map(Number); const [hf,mf]=horaFin.split(':').map(Number); return Math.round(((hf*60+mf)-(hi*60+mi))/60*100)/100 })()}h
                  {descanso > 0 && ` − ${descanso}h almuerzo`}
                  {' = '}<span className="font-bold">{totalHoras}h × $20 = ${(totalHoras * 20).toFixed(2)}</span>
                </span>
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

      {/* Detectados en romana — pendientes de horario */}
      {detections.length > 0 && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-amber-400 text-sm">⚡</span>
            <div>
              <h3 className="text-white font-semibold text-sm">Detectados en romana — sin horario</h3>
              <p className="text-zinc-500 text-xs mt-0.5">La romana registró estos camiones trabajando internamente. Agrega la hora inicio y fin.</p>
            </div>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {detections.map(d => (
              <div key={`${d.truckId}|${d.date}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{d.plate} <span className="text-zinc-500 font-normal">— {d.conductor}</span></p>
                  <p className="text-zinc-500 text-xs">{new Date(d.date + 'T12:00:00Z').toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'2-digit' })} · {d.tripCount} ticket{d.tripCount !== 1 ? 's' : ''} en romana</p>
                </div>
                <button onClick={() => openFromDetection(d)}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-3 py-1.5 text-xs transition-colors whitespace-nowrap">
                  + Agregar horario
                </button>
              </div>
            ))}
          </div>
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
