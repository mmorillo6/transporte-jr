'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { parseRomana, confirmarImport, crearRutaDesdeRomana } from '@/app/actions/importarRomana'
import type { RomanaPreview, RomanaTrip, UnknownProveedorRow } from '@/app/actions/importarRomana'
import { updateSystemConfig } from '@/app/actions/systemConfig'
import type { SystemConfigItem } from '@/app/actions/systemConfig'
import { updateOwnerNpr } from '@/app/actions/owners'
import type { OwnerParam } from '@/app/actions/owners'

// ─── Utilidades de similitud de placas ────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

type PlacaSugerida  = { id: string; plate: string; distance: number }
type ChoferSugerido = { id: string; name: string; distance: number }

function sugerirPlacas(
  placaErronea: string,
  registradas: { id: string; plate: string }[],
  maxDistance = 2,
): PlacaSugerida[] {
  return registradas
    .map(t => ({ ...t, distance: levenshtein(placaErronea, t.plate) }))
    .filter(t => t.distance <= maxDistance && t.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
}

function sugerirChoferes(
  nombre: string,
  registrados: { id: string; name: string }[],
  maxDistance = 4,
): ChoferSugerido[] {
  const norm = (s: string) => s.toUpperCase().trim()
  return registrados
    .map(d => ({ ...d, distance: levenshtein(norm(nombre), norm(d.name)) }))
    .filter(d => d.distance <= maxDistance && d.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
}

// Renderiza dos placas resaltando los caracteres diferentes
function DiffPlate({ wrong, correct }: { wrong: string; correct: string }) {
  const maxLen = Math.max(wrong.length, correct.length)
  return (
    <span className="font-mono text-sm font-bold tracking-wider">
      {Array.from({ length: maxLen }).map((_, i) => {
        const wc = wrong[i] ?? ''
        const cc = correct[i] ?? ''
        const differs = wc !== cc
        return (
          <span key={i} className={differs ? 'text-amber-400 underline underline-offset-2' : 'text-white'}>
            {cc || ' '}
          </span>
        )
      })}
    </span>
  )
}

export default function RomanaClient({ openPeriodId, systemConfig = [], owners = [] }: { openPeriodId?: string; systemConfig?: SystemConfigItem[]; owners?: OwnerParam[] }) {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview,   setPreview]   = useState<RomanaPreview | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [resultado, setResultado] = useState<{ imported: number } | null>(null)
  const [showTrips, setShowTrips] = useState<string | null>(null) // client name to expand

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setError(''); setPreview(null); setResultado(null); setIgnorarDuplicado(false)
    setProveedorClassifications({}); setProveedorMode({}); setRutaForms({}); setNewRoutes([]); setProveedorSugerRechazadas(new Set())
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const data = await parseRomana(base64, openPeriodId)
      setPreview(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al leer el archivo')
    } finally { setLoading(false) }
  }

  async function handleImportar() {
    if (!preview) return
    setSaving(true); setError('')
    try {
      // Aplicar remapeos de placas y normalización de conductores
      const tripsConRemapeo = preview.trips.map(t => {
        let trip = t
        if (!t.truckId && !t.duplicate && plateMappings[t.plate]) {
          trip = { ...trip, truckId: plateMappings[t.plate] }
        }
        if (!t.duplicate && t.conductor && conductorMappings[t.conductor]) {
          trip = { ...trip, conductor: conductorMappings[t.conductor] }
        }
        return trip
      })
      // Incluir viajes de proveedores clasificados como horario
      const todosLosViajes = [...tripsConRemapeo, ...resolvedUnknownTrips]
      const res = await confirmarImport(todosLosViajes, openPeriodId)
      setResultado(res)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally { setSaving(false) }
  }

  // Incluye también filas de proveedores desconocidos (clasificados o no)
  const sinCamion = preview
    ? (preview.trips.filter(t => !t.truckId && !t.duplicate).length +
       preview.unknownProveedores.flatMap(up => up.rows).filter(r => !r.truckId && !r.duplicate).length)
    : 0
  const placasSinRegistrar = preview ? [...new Set([
    ...preview.trips.filter(t => !t.truckId && !t.duplicate).map(t => t.plate),
    ...preview.unknownProveedores.flatMap(up => up.rows).filter(r => !r.truckId && !r.duplicate).map(r => r.plate),
  ])] : []
  // plateMappings: placa errónea → truckId del camión correcto
  const [plateMappings, setPlateMappings] = useState<Record<string, string>>({})
  const [sugerenciasRechazadas, setSugerenciasRechazadas] = useState<Set<string>>(new Set())
  // conductorMappings: nombre romana → nombre normalizado del chofer registrado
  const [conductorMappings, setConductorMappings] = useState<Record<string, string>>({})
  const [conductoresSugerRechazadas, setConductoresSugerRechazadas] = useState<Set<string>>(new Set())
  const [ignorarDuplicado, setIgnorarDuplicado] = useState(false)
  // Parámetros editables (copia local de systemConfig, editable antes de importar)
  const [configEdits, setConfigEdits] = useState<Record<string, string>>(
    Object.fromEntries(systemConfig.map(c => [c.key, c.value]))
  )
  const [savingConfig, setSavingConfig] = useState(false)
  const [nprEdits, setNprEdits]   = useState<Record<string, string>>(
    Object.fromEntries(owners.map(o => [o.id, String(o.nprPercent)]))
  )
  const [savingNpr, setSavingNpr] = useState<string | null>(null)

  // Placas sin resolver: existen en el preview pero no tienen truckId ni mapeo asignado
  const placasSinResolver = preview
    ? placasSinRegistrar.filter(p => !plateMappings[p])
    : []
  const viajesSinResolver = preview
    ? (preview.trips.filter(t => !t.truckId && !t.duplicate && !plateMappings[t.plate]).length +
       preview.unknownProveedores.flatMap(up => up.rows).filter(r => !r.truckId && !r.duplicate && !plateMappings[r.plate]).length)
    : 0
  // proveedorClassifications: proveedor → routeId (ruta existente o recién creada)
  const [proveedorClassifications, setProveedorClassifications] = useState<Record<string, string>>({})
  // proveedorMode: qué opción seleccionó el encargado ('mine' | 'hourly' | 'existing') → muestra el formulario
  const [proveedorMode, setProveedorMode] = useState<Record<string, 'mine' | 'hourly' | 'existing'>>({})
  // rutas recién creadas desde el formulario inline
  const [newRoutes, setNewRoutes] = useState<{ id: string; name: string; rate: number; rateType: string; clientName: string }[]>([])
  // sugerencias de proveedor rechazadas
  const [proveedorSugerRechazadas, setProveedorSugerRechazadas] = useState<Set<string>>(new Set())
  // estado del formulario inline por proveedor
  type RutaForm = {
    name: string; rateType: 'PER_TON' | 'PER_TRIP'
    rate: string; driverWage: string; fuelLitersPerTrip: string
    bidirectional: boolean; hasViatico: boolean
    viaticoSingle: string; viaticoDouble: string
    saving: boolean; error: string
  }
  const [rutaForms, setRutaForms] = useState<Record<string, RutaForm>>({})

  function initForm(proveedor: string, mode: 'mine' | 'hourly') {
    setProveedorMode(prev => ({ ...prev, [proveedor]: mode }))
    setRutaForms(prev => ({
      ...prev,
      [proveedor]: {
        name: mode === 'hourly' ? `DIAS INTERNOS (${proveedor})` : proveedor,
        rateType: mode === 'hourly' ? 'PER_TRIP' : 'PER_TON',
        rate: '', driverWage: '', fuelLitersPerTrip: '',
        bidirectional: false, hasViatico: false,
        viaticoSingle: '', viaticoDouble: '',
        saving: false, error: '',
      },
    }))
  }

  function updateForm(proveedor: string, patch: Partial<RutaForm>) {
    setRutaForms(prev => ({ ...prev, [proveedor]: { ...prev[proveedor], ...patch } }))
  }

  async function submitRutaForm(proveedor: string) {
    const f = rutaForms[proveedor]
    if (!f) return
    updateForm(proveedor, { saving: true, error: '' })
    try {
      const route = await crearRutaDesdeRomana({
        name:              f.name.trim(),
        rateType:          f.rateType,
        rate:              parseFloat(f.rate) || 0,
        driverWage:        parseFloat(f.driverWage) || 0,
        fuelLitersPerTrip: parseFloat(f.fuelLitersPerTrip) || 0,
        bidirectional:     f.bidirectional,
        hasViatico:        f.hasViatico,
        viaticoSingle:     parseFloat(f.viaticoSingle) || 0,
        viaticoDouble:     parseFloat(f.viaticoDouble) || 0,
      })
      setNewRoutes(prev => [...prev, { ...route, clientName: 'AURUM' }])
      setProveedorClassifications(prev => ({ ...prev, [proveedor]: route.id }))
      updateForm(proveedor, { saving: false })
    } catch (e: unknown) {
      updateForm(proveedor, { saving: false, error: e instanceof Error ? e.message : 'Error al crear la ruta' })
    }
  }

  // Todas las rutas disponibles (existentes + recién creadas)
  const allRoutes = [...(preview?.allRoutes ?? []), ...newRoutes]

  function resolveUnknownRows(rows: UnknownProveedorRow[], routeId: string): RomanaTrip[] {
    const route = allRoutes.find(r => r.id === routeId)
    if (!route) return []
    return rows.filter(row => !row.duplicate).map(row => ({
      ...row,
      truckId: row.truckId ?? plateMappings[row.plate] ?? null,
      routeName: route.name,
      routeId: route.id,
      rateType: route.rateType,
      rate: route.rate,
      amount: route.rateType === 'PER_TON'
        ? Math.round((row.netWeightKg / 1000) * route.rate * 100) / 100
        : route.rate,
      clientLabel: route.clientName || 'INTERNO',
      viatico:       0,
      zeroWeight:    route.rateType === 'PER_TON' && row.netWeightKg === 0,
      outsidePeriod: false,
    }))
  }

  const resolvedUnknownTrips: RomanaTrip[] = preview
    ? preview.unknownProveedores.flatMap(up => {
        const cls = proveedorClassifications[up.name]
        if (!cls) return []
        return resolveUnknownRows(up.rows, cls)
      })
    : []

  const unknownPendientes = preview
    ? preview.unknownProveedores.filter(up => !proveedorClassifications[up.name]).length
    : 0

  return (
    <div className="space-y-6">

      {/* Upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 hover:border-amber-500/50 rounded-2xl p-10 text-center cursor-pointer transition-colors group"
      >
        <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-amber-500/10 transition-colors">
          <svg className="w-6 h-6 text-zinc-500 group-hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className="text-white font-medium text-sm">Subir archivo de la romana</p>
        <p className="text-zinc-500 text-xs mt-1">Excel (.xlsx) del reporte de transporte</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      </div>

      {loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <p className="text-zinc-400 text-sm">Leyendo archivo y cruzando con camiones y rutas...</p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm px-1">{error}</p>}

      {resultado && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4">
          <p className="text-emerald-400 font-semibold">{resultado.imported} viajes importados correctamente</p>
          <p className="text-zinc-400 text-sm mt-1">Ya están disponibles en el módulo de Viajes y en el generador de Relaciones.</p>
          <button onClick={() => { setPreview(null); setResultado(null); if (fileRef.current) fileRef.current.value = '' }}
            className="text-emerald-400 hover:text-emerald-300 text-xs mt-2 transition-colors">
            Importar otro archivo →
          </button>
        </div>
      )}

      {preview && !resultado && (
        <div className="space-y-4">

          {/* Aviso: archivo ya importado */}
          {preview.likelyAlreadyImported && !ignorarDuplicado && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-lg mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-red-400 font-semibold text-sm">Este archivo parece ya haber sido importado</p>
                  <p className="text-zinc-400 text-xs mt-1">
                    El {Math.round((preview.duplicates / preview.totalTrips) * 100)}% de los tickets ({preview.duplicates} de {preview.totalTrips}) ya existen en el sistema para el período {preview.period}.
                    Probablemente es el mismo archivo que subiste antes.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Cancelar — no importar
                    </button>
                    <button
                      onClick={() => setIgnorarDuplicado(true)}
                      className="text-zinc-500 hover:text-zinc-300 text-xs px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      Continuar de todas formas
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resumen KPIs + detalle — ocultar mientras se muestra el aviso de archivo duplicado */}
          {(!preview.likelyAlreadyImported || ignorarDuplicado) && <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Período</p>
              <p className="text-white font-semibold text-sm">{preview.period}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Filas en archivo</p>
              <p className="text-2xl font-bold text-white">{preview.rawRowCount}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Nuevos a importar</p>
              <p className="text-2xl font-bold text-amber-400">{preview.newTrips}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Ya existentes</p>
              <p className={`text-2xl font-bold ${preview.duplicates > 0 ? 'text-zinc-500' : 'text-zinc-700'}`}>
                {preview.duplicates}
              </p>
            </div>
          </div>

          {/* ── Reconciliación de filas ── */}
          {(() => {
            const unknownCount = preview.unknownProveedores.reduce((s, u) => s + u.count, 0)
            const clasificados = preview.rawRowCount
            const accounted    = preview.totalTrips + unknownCount + preview.skippedRows.length
            const diff         = clasificados - accounted
            const allOk        = preview.skippedRows.length === 0 && diff === 0
            return (
              <div className={`rounded-2xl border px-4 py-3 ${allOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900 border-zinc-700'}`}>
                <p className="text-xs font-semibold text-zinc-400 mb-2">Reconciliación de filas</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span className="text-white">{preview.rawRowCount} filas en el archivo</span>
                  <span className="text-amber-400">→ {preview.newTrips} nuevas</span>
                  {preview.duplicates > 0 && <span className="text-zinc-500">+ {preview.duplicates} duplicadas</span>}
                  {unknownCount > 0 && <span className="text-blue-400">+ {unknownCount} proveedor desconocido</span>}
                  {preview.skippedRows.length > 0 && <span className="text-red-400 font-semibold">+ {preview.skippedRows.length} saltadas con error</span>}
                  {diff !== 0 && <span className="text-orange-400">+ {diff} sin clasificar</span>}
                  {allOk && <span className="text-emerald-400 font-medium">✓ Todo cuadra</span>}
                </div>
                {preview.skippedRows.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {preview.skippedRows.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-red-400">✕</span>
                        <span className="text-zinc-300 font-mono">#{s.ticketNo}</span>
                        <span className="text-zinc-500">{s.plate} · {s.conductor || '—'}</span>
                        <span className="text-red-400">
                          {s.reason === 'sin_fecha'      ? 'Fecha inválida'
                          : s.reason === 'sin_datos'     ? 'Falta placa, proveedor o procedencia'
                          : 'Ruta no existe en el sistema'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Peso cero en ruta PER_TON ── */}
          {(() => {
            const ceroTrips = preview.trips.filter(t => t.zeroWeight && !t.duplicate)
            if (ceroTrips.length === 0) return null
            return (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-orange-400 text-sm font-medium">
                  {ceroTrips.length} {ceroTrips.length === 1 ? 'viaje' : 'viajes'} con peso 0 — monto será $0
                </p>
                <p className="text-zinc-500 text-xs">Revisa si falta el peso neto en la romana antes de importar.</p>
                <div className="space-y-0.5">
                  {ceroTrips.map(t => (
                    <div key={t.ticketNo} className="flex gap-3 text-xs">
                      <span className="text-zinc-300 font-mono">#{t.ticketNo}</span>
                      <span className="text-zinc-500">{t.plate} · {t.routeName} · {t.conductor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Viajes fuera del período ── */}
          {(() => {
            const fueraTrips = preview.trips.filter(t => t.outsidePeriod && !t.duplicate)
            if (fueraTrips.length === 0) return null
            return (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-yellow-400 text-sm font-medium">
                  {fueraTrips.length} {fueraTrips.length === 1 ? 'viaje cae' : 'viajes caen'} fuera del período abierto
                </p>
                <p className="text-zinc-500 text-xs">Se importarán igual pero verifica que correspondan a este período.</p>
                <div className="space-y-0.5">
                  {fueraTrips.map(t => (
                    <div key={t.ticketNo} className="flex gap-3 text-xs">
                      <span className="text-zinc-300 font-mono">#{t.ticketNo}</span>
                      <span className="text-zinc-500">{new Date(t.date).toLocaleDateString('es-VE')} · {t.plate} · {t.routeName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Por cliente */}
          {preview.byClient.map(client => (
            <div key={client.client} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Client header */}
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold text-sm">{client.client}</h3>
                  <p className="text-zinc-500 text-xs">{client.totalTrips} viajes · {client.totalTons.toFixed(2)} ton · <span className="text-amber-400">${client.totalAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></p>
                </div>
                <button onClick={() => setShowTrips(showTrips === client.client ? null : client.client)}
                  className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                  {showTrips === client.client ? '▴ ocultar detalle' : '▾ ver viajes'}
                </button>
              </div>

              {/* Routes summary */}
              <div className="divide-y divide-zinc-800/50">
                {client.routes.map(r => (
                  <div key={r.name} className="flex items-center justify-between px-4 py-2.5 gap-2">
                    <span className="text-zinc-300 text-sm font-medium flex-1 min-w-0">{r.name}</span>
                    <div className="flex items-center gap-3 text-xs text-right shrink-0">
                      <span className="text-zinc-500 whitespace-nowrap">{r.trips} v.</span>
                      <span className="text-zinc-400 whitespace-nowrap hidden sm:inline">{r.tons.toFixed(2)} t</span>
                      <span className="text-amber-400 font-semibold whitespace-nowrap">${r.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trip detail */}
              {showTrips === client.client && (
                <div className="border-t border-zinc-800 overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                      <tr>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Ticket</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Fecha</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Ruta</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Placa</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Conductor</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-2">Neto Kg</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-2">Monto</th>
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.trips.filter(t => t.clientLabel === client.client).map(t => (
                        <tr key={t.ticketNo} className={`border-b border-zinc-800/40 ${t.duplicate ? 'opacity-40' : ''}`}>
                          <td className="px-4 py-1.5 text-zinc-400 font-mono">{t.ticketNo}</td>
                          <td className="px-4 py-1.5 text-zinc-400">{new Date(t.date).toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit' })}</td>
                          <td className="px-4 py-1.5 text-white">{t.routeName}</td>
                          <td className="px-4 py-1.5 text-zinc-300 font-mono">{t.plate}</td>
                          <td className="px-4 py-1.5 text-zinc-400 max-w-28 truncate">{t.conductor}</td>
                          <td className="px-4 py-1.5 text-right text-zinc-300">{t.netWeightKg.toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-right text-amber-400">${t.amount.toFixed(2)}</td>
                          <td className="px-4 py-1.5">
                            {t.duplicate ? (
                              <span className="text-zinc-600">Ya existe</span>
                            ) : !t.truckId ? (
                              <span className="text-orange-400">Sin camión</span>
                            ) : (
                              <span className="text-emerald-400">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Warning sin camión */}
          {sinCamion > 0 && (() => {
            return (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-4 space-y-3">
              <div>
                <p className="text-orange-400 text-sm font-medium">
                  {sinCamion} {sinCamion === 1 ? 'viaje' : 'viajes'} con {placasSinRegistrar.length === 1 ? 'placa' : 'placas'} no registrada{placasSinRegistrar.length !== 1 ? 's' : ''}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Revisa si es un error tipográfico de la romana o una placa nueva.
                </p>
              </div>

              <div className="space-y-2">
                {placasSinRegistrar.map(placa => {
                  const viajesPlaca = preview.trips.filter(t => t.plate === placa && !t.duplicate).length
                  const mapeadoA = plateMappings[placa]
                  const truckMapeado = mapeadoA ? preview.registeredTrucks.find(t => t.id === mapeadoA) : null
                  const sugerencias = sugerirPlacas(placa, preview.registeredTrucks)
                  const mejorSugerencia = sugerencias[0]
                  const rechazada = sugerenciasRechazadas.has(placa)
                  const resuelta = !!mapeadoA

                  return (
                    <div key={placa} className={`border rounded-xl p-3 space-y-2.5 transition-colors ${
                      resuelta ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900/60 border-orange-500/20'
                    }`}>
                      {/* Encabezado: placa errónea + conteo */}
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm font-bold tracking-wider line-through decoration-orange-400/60">{placa}</span>
                        <span className="text-zinc-500 text-xs">· {viajesPlaca} {viajesPlaca === 1 ? 'viaje' : 'viajes'}</span>
                        {resuelta && truckMapeado && (
                          <span className="text-emerald-400 text-xs font-medium ml-auto flex items-center gap-1">
                            ✓ asignado a <span className="font-mono">{truckMapeado.plate}</span>
                          </span>
                        )}
                      </div>

                      {/* Estado resuelto — solo botón para cambiar */}
                      {resuelta ? (
                        <button
                          onClick={() => setPlateMappings(prev => { const n = { ...prev }; delete n[placa]; return n })}
                          className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                        >
                          Cambiar asignación →
                        </button>
                      ) : (
                        <>
                          {/* Sugerencia automática */}
                          {mejorSugerencia && !rechazada && (
                            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 space-y-2">
                              <p className="text-zinc-400 text-xs">
                                {mejorSugerencia.distance === 1
                                  ? '1 carácter de diferencia — probablemente es:'
                                  : `${mejorSugerencia.distance} caracteres de diferencia — ¿quizás es?`}
                              </p>
                              {/* Diff visual */}
                              <div className="flex items-center gap-3">
                                <div className="space-y-0.5">
                                  <p className="text-zinc-600 text-xs">Romana dice</p>
                                  <span className="font-mono text-sm text-zinc-400 tracking-wider">{placa}</span>
                                </div>
                                <span className="text-zinc-600">→</span>
                                <div className="space-y-0.5">
                                  <p className="text-zinc-600 text-xs">¿Era esta?</p>
                                  <DiffPlate wrong={placa} correct={mejorSugerencia.plate} />
                                </div>
                                {sugerencias.length > 1 && (
                                  <div className="ml-2 space-y-0.5">
                                    <p className="text-zinc-600 text-xs">Otras similares</p>
                                    <div className="flex gap-1.5">
                                      {sugerencias.slice(1).map(s => (
                                        <button key={s.id}
                                          onClick={() => setPlateMappings(prev => ({ ...prev, [placa]: s.id }))}
                                          className="font-mono text-xs text-zinc-400 hover:text-amber-400 bg-zinc-700 hover:bg-zinc-600 px-1.5 py-0.5 rounded transition-colors"
                                        >
                                          {s.plate}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Acciones sugerencia */}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => setPlateMappings(prev => ({ ...prev, [placa]: mejorSugerencia.id }))}
                                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Sí, es {mejorSugerencia.plate}
                                </button>
                                <button
                                  onClick={() => setSugerenciasRechazadas(prev => new Set([...prev, placa]))}
                                  className="text-zinc-500 hover:text-zinc-300 text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                                >
                                  No es esa
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Sin sugerencia o sugerencia rechazada: mostrar opciones manuales */}
                          {(!mejorSugerencia || rechazada) && (
                            <div className="flex flex-wrap gap-2 items-center">
                              <Link
                                href={`/camiones?nuevaPlaca=${encodeURIComponent(placa)}`}
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
                              >
                                + Registrar placa nueva
                              </Link>
                              <span className="text-zinc-600 text-xs">o asignar a:</span>
                              <select
                                value={mapeadoA ?? ''}
                                onChange={e => {
                                  const val = e.target.value
                                  setPlateMappings(prev => {
                                    if (!val) { const n = { ...prev }; delete n[placa]; return n }
                                    return { ...prev, [placa]: val }
                                  })
                                }}
                                className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500"
                              >
                                <option value="">Seleccionar placa...</option>
                                {preview.registeredTrucks.map(t => (
                                  <option key={t.id} value={t.id}>{t.plate}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {viajesSinResolver > 0 && (
                <p className="text-zinc-600 text-xs">
                  {viajesSinResolver} {viajesSinResolver === 1 ? 'viaje quedará' : 'viajes quedarán'} sin importar hasta que resuelvas todas las placas.
                </p>
              )}
            </div>
            )
          })()}

          {/* Conductores desconocidos */}
          {preview.unknownConductors.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-4 space-y-3">
              <div>
                <p className="text-blue-400 text-sm font-medium">
                  {preview.unknownConductors.length} {preview.unknownConductors.length === 1 ? 'chofer nuevo' : 'choferes nuevos'} detectados en la romana
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Estos nombres no coinciden exactamente con ningún chofer registrado. Confírmalos o regístralos.
                </p>
              </div>

              <div className="space-y-2">
                {preview.unknownConductors.map(conductor => {
                  const mapeadoA    = conductorMappings[conductor]
                  const rechazada   = conductoresSugerRechazadas.has(conductor)
                  const resuelta    = !!mapeadoA || rechazada
                  const sugerencias = sugerirChoferes(conductor, preview.registeredDrivers)
                  const mejor       = sugerencias[0]
                  const viajesCount = preview.trips.filter(t => t.conductor === conductor && !t.duplicate).length

                  return (
                    <div key={conductor} className={`border rounded-xl p-3 space-y-2.5 transition-colors ${
                      mapeadoA ? 'bg-emerald-500/5 border-emerald-500/20'
                      : rechazada ? 'bg-zinc-900/60 border-zinc-700'
                      : 'bg-zinc-900/60 border-blue-500/20'
                    }`}>
                      {/* Encabezado */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{conductor}</span>
                        <span className="text-zinc-500 text-xs">· {viajesCount} {viajesCount === 1 ? 'viaje' : 'viajes'}</span>
                        {mapeadoA && (
                          <span className="text-emerald-400 text-xs font-medium ml-auto">
                            ✓ normalizado a <span className="font-medium">{mapeadoA}</span>
                          </span>
                        )}
                        {rechazada && !mapeadoA && (
                          <span className="text-zinc-500 text-xs ml-auto">Se importará como nombre nuevo</span>
                        )}
                      </div>

                      {mapeadoA ? (
                        <button
                          onClick={() => setConductorMappings(prev => { const n = { ...prev }; delete n[conductor]; return n })}
                          className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                        >
                          Cambiar →
                        </button>
                      ) : rechazada ? (
                        <div className="flex gap-2 items-center flex-wrap">
                          <Link
                            href={`/usuarios?nuevoConductor=${encodeURIComponent(conductor)}`}
                            className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
                          >
                            + Registrar como chofer
                          </Link>
                          <button
                            onClick={() => setConductoresSugerRechazadas(prev => { const n = new Set(prev); n.delete(conductor); return n })}
                            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                          >
                            ← Volver
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Sugerencia automática */}
                          {mejor && (
                            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 space-y-2">
                              <p className="text-zinc-400 text-xs">
                                {mejor.distance <= 2
                                  ? 'Muy similar a un chofer registrado — ¿es este?'
                                  : 'Podría ser este chofer registrado:'}
                              </p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div>
                                  <p className="text-zinc-600 text-xs mb-0.5">Romana dice</p>
                                  <span className="text-zinc-400 text-sm font-medium">{conductor}</span>
                                </div>
                                <span className="text-zinc-600">→</span>
                                <div>
                                  <p className="text-zinc-600 text-xs mb-0.5">¿Era este?</p>
                                  <span className="text-white text-sm font-medium">{mejor.name}</span>
                                </div>
                                {sugerencias.length > 1 && (
                                  <div className="ml-2">
                                    <p className="text-zinc-600 text-xs mb-0.5">Otros similares</p>
                                    <div className="flex gap-1.5">
                                      {sugerencias.slice(1).map(s => (
                                        <button key={s.id}
                                          onClick={() => setConductorMappings(prev => ({ ...prev, [conductor]: s.name }))}
                                          className="text-xs text-zinc-400 hover:text-amber-400 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
                                        >
                                          {s.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => setConductorMappings(prev => ({ ...prev, [conductor]: mejor.name }))}
                                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Sí, es {mejor.name}
                                </button>
                                <button
                                  onClick={() => setConductoresSugerRechazadas(prev => new Set([...prev, conductor]))}
                                  className="text-zinc-500 hover:text-zinc-300 text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                                >
                                  No es ese
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Sin sugerencia: opciones directas */}
                          {!mejor && (
                            <div className="flex gap-2 items-center flex-wrap">
                              <span className="text-zinc-500 text-xs">Asignar a:</span>
                              <select
                                value={mapeadoA ?? ''}
                                onChange={e => {
                                  const val = e.target.value
                                  setConductorMappings(prev => {
                                    if (!val) { const n = { ...prev }; delete n[conductor]; return n }
                                    const driver = preview.registeredDrivers.find(d => d.id === val)
                                    return driver ? { ...prev, [conductor]: driver.name } : prev
                                  })
                                }}
                                className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                              >
                                <option value="">Seleccionar chofer...</option>
                                {preview.registeredDrivers.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                              <Link
                                href={`/usuarios?nuevoConductor=${encodeURIComponent(conductor)}`}
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
                              >
                                + Registrar nuevo
                              </Link>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Proveedores desconocidos */}
          {preview.unknownProveedores.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-4 space-y-3">
              <div>
                <p className="text-yellow-400 text-sm font-medium">
                  {preview.unknownProveedores.length} {preview.unknownProveedores.length === 1 ? 'proveedor nuevo' : 'proveedores nuevos'} detectados en el archivo
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  No están registrados en el sistema. Defínelos para que la nómina calcule correctamente.
                </p>
              </div>

              <div className="space-y-3">
                {preview.unknownProveedores.map(up => {
                  const cls    = proveedorClassifications[up.name]
                  const mode   = proveedorMode[up.name]
                  const f      = rutaForms[up.name]
                  const resolved = cls ? allRoutes.find(r => r.id === cls) : null
                  const newCount = up.rows.filter(r => !r.duplicate).length
                  const sugerRechazada = proveedorSugerRechazadas.has(up.name)

                  return (
                    <div key={up.name} className={`border rounded-xl p-3 space-y-3 transition-colors ${
                      resolved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900/60 border-yellow-500/20'
                    }`}>
                      {/* Encabezado */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{up.name}</span>
                        <span className="text-zinc-500 text-xs">· {up.count} {up.count === 1 ? 'viaje' : 'viajes'}</span>
                        {newCount < up.count && <span className="text-zinc-600 text-xs">({newCount} nuevos)</span>}
                        {up.likelyHourly && !resolved && (
                          <span className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                            ¿Día interno?
                          </span>
                        )}
                        {resolved && (
                          <span className="text-emerald-400 text-xs font-medium ml-auto">
                            ✓ asignado a: {resolved.name}
                          </span>
                        )}
                      </div>

                      {/* Clasificado → solo cambiar */}
                      {resolved ? (
                        <button
                          onClick={() => {
                            setProveedorClassifications(prev => { const n = { ...prev }; delete n[up.name]; return n })
                            setProveedorMode(prev => { const n = { ...prev }; delete n[up.name]; return n })
                            setProveedorSugerRechazadas(prev => { const n = new Set(prev); n.delete(up.name); return n })
                          }}
                          className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                        >
                          Cambiar →
                        </button>

                      ) : !mode ? (
                        <div className="space-y-3">
                          {/* Sugerencias fuzzy de rutas similares */}
                          {up.suggestedRoutes.length > 0 && !sugerRechazada && (
                            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 space-y-2">
                              <p className="text-zinc-400 text-xs">
                                Nombre similar a {up.suggestedRoutes.length === 1 ? 'una ruta registrada' : 'rutas registradas'} — ¿es alguna de estas?
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {up.suggestedRoutes.map(s => (
                                  <button key={s.id}
                                    onClick={() => setProveedorClassifications(prev => ({ ...prev, [up.name]: s.id }))}
                                    className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                                    Sí, es {s.name}
                                    <span className="text-emerald-600 ml-1.5">({s.distance} {s.distance === 1 ? 'car.' : 'car.'})</span>
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => setProveedorSugerRechazadas(prev => new Set([...prev, up.name]))}
                                className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                                No es ninguna →
                              </button>
                            </div>
                          )}

                          {/* Opciones de clasificación (cuando no hay sugerencias o fueron rechazadas) */}
                          {(!up.suggestedRoutes.length || sugerRechazada) && (
                            <div className="space-y-2">
                              {up.likelyHourly && (
                                <p className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                                  La procedencia parece un viaje interno (¿TRONCAL/H66/PLANTA mal escrito?)
                                </p>
                              )}
                              <p className="text-zinc-400 text-xs">¿Qué tipo de viaje es?</p>
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => initForm(up.name, 'mine')}
                                  className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20">
                                  Mina nueva (por tonelada)
                                </button>
                                <button onClick={() => initForm(up.name, 'hourly')}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border ${
                                    up.likelyHourly
                                      ? 'bg-blue-500/25 hover:bg-blue-500/35 text-blue-300 border-blue-500/40'
                                      : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/20'
                                  }`}>
                                  {up.likelyHourly ? '⬆ Viaje por horario (por viaje)' : 'Viaje por horario (por viaje)'}
                                </button>
                                <button onClick={() => setProveedorMode(prev => ({ ...prev, [up.name]: 'existing' }))}
                                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                                  Ya existe con otro nombre
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                      ) : mode === 'existing' ? (
                        /* Asignar a ruta ya existente */
                        <div className="space-y-2">
                          <label className="text-zinc-400 text-xs block">Selecciona la ruta a la que corresponde:</label>
                          <select
                            defaultValue=""
                            onChange={e => {
                              if (e.target.value) setProveedorClassifications(prev => ({ ...prev, [up.name]: e.target.value }))
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                            <option value="">Seleccionar ruta...</option>
                            {preview.allRoutes.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setProveedorMode(prev => { const n = { ...prev }; delete n[up.name]; return n })}
                            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
                            ← Volver
                          </button>
                        </div>

                      ) : f ? (
                        /* Paso 2: formulario de ruta */
                        <div className="space-y-3 pt-1">
                          <p className="text-zinc-400 text-xs font-medium">
                            {mode === 'mine' ? 'Datos de la mina nueva' : 'Datos del viaje por horario'}
                          </p>

                          <div className="grid grid-cols-1 gap-2.5">
                            {/* Nombre */}
                            <div>
                              <label className="text-zinc-500 text-xs block mb-1">Nombre de la ruta</label>
                              <input
                                value={f.name}
                                onChange={e => updateForm(up.name, { name: e.target.value })}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              {/* Tarifa */}
                              <div>
                                <label className="text-zinc-500 text-xs block mb-1">
                                  Tarifa ({mode === 'mine' ? '$/ton' : '$/viaje'})
                                </label>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={f.rate}
                                  onChange={e => updateForm(up.name, { rate: e.target.value })}
                                  placeholder="0.00"
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                                />
                              </div>
                              {/* Sueldo chofer */}
                              <div>
                                <label className="text-zinc-500 text-xs block mb-1">Sueldo chofer ($/viaje)</label>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={f.driverWage}
                                  onChange={e => updateForm(up.name, { driverWage: e.target.value })}
                                  placeholder="0.00"
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>

                            {/* Gasoil */}
                            <div>
                              <label className="text-zinc-500 text-xs block mb-1">Litros gasoil por viaje</label>
                              <input
                                type="number" min="0" step="1"
                                value={f.fuelLitersPerTrip}
                                onChange={e => updateForm(up.name, { fuelLitersPerTrip: e.target.value })}
                                placeholder="0"
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                              />
                            </div>

                            {/* Opcionales */}
                            <div className="flex flex-wrap gap-4">
                              {mode === 'mine' && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={f.bidirectional}
                                    onChange={e => updateForm(up.name, { bidirectional: e.target.checked })}
                                    className="accent-amber-500" />
                                  <span className="text-zinc-400 text-xs">Bidireccional (tarifa × 2)</span>
                                </label>
                              )}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={f.hasViatico}
                                  onChange={e => updateForm(up.name, { hasViatico: e.target.checked })}
                                  className="accent-amber-500" />
                                <span className="text-zinc-400 text-xs">Tiene viático</span>
                              </label>
                            </div>

                            {f.hasViatico && (
                              <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                  <label className="text-zinc-500 text-xs block mb-1">Viático sencillo ($)</label>
                                  <input type="number" min="0" step="0.01" value={f.viaticoSingle}
                                    onChange={e => updateForm(up.name, { viaticoSingle: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
                                </div>
                                <div>
                                  <label className="text-zinc-500 text-xs block mb-1">Viático doble ($)</label>
                                  <input type="number" min="0" step="0.01" value={f.viaticoDouble}
                                    onChange={e => updateForm(up.name, { viaticoDouble: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
                                </div>
                              </div>
                            )}
                          </div>

                          {f.error && <p className="text-red-400 text-xs">{f.error}</p>}

                          <div className="flex gap-2">
                            <button
                              onClick={() => submitRutaForm(up.name)}
                              disabled={f.saving || !f.name.trim() || !f.rate}
                              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-4 py-2 text-xs transition-colors"
                            >
                              {f.saving ? 'Guardando...' : 'Guardar ruta e incluir viajes'}
                            </button>
                            <button
                              onClick={() => setProveedorMode(prev => { const n = { ...prev }; delete n[up.name]; return n })}
                              className="text-zinc-500 hover:text-zinc-300 text-xs px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                            >
                              Volver
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {unknownPendientes > 0 && (
                <p className="text-yellow-500/70 text-xs">
                  Define todos los proveedores antes de importar.
                </p>
              )}
            </div>
          )}

          {/* ── Panel de parámetros y viáticos ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-5">
            <p className="text-white text-sm font-semibold">Confirmar parámetros antes de importar</p>

            {/* Viáticos detectados */}
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Viáticos detectados en el archivo</p>
              {preview.viaticosPreview.length > 0 ? (
                preview.viaticosPreview.map(vp => (
                  <div key={vp.routeId} className="bg-zinc-800 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-white text-sm font-medium">{vp.routeName}</p>
                      <p className="text-zinc-500 text-xs">
                        {vp.tripsCount > 0 && `${vp.tripsCount} viajes × $${vp.perTrip}`}
                        {vp.doubleDaysCount > 0 && ` · ${vp.doubleDaysCount} días dobles × $${vp.perDoubleDay}`}
                      </p>
                    </div>
                    <p className="text-amber-400 font-semibold font-mono">${vp.total.toFixed(2)}</p>
                  </div>
                ))
              ) : (
                <p className="text-zinc-600 text-xs">No se detectaron viáticos en este archivo.</p>
              )}
            </div>

            {/* Parámetros globales editables */}
            {systemConfig.length > 0 && (
              <div className="space-y-2">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Parámetros globales</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {systemConfig.map(cfg => (
                    <div key={cfg.key} className="bg-zinc-800 rounded-xl px-3 py-2.5">
                      <label className="block text-zinc-400 text-xs mb-1">{cfg.label}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-sm">$</span>
                        <input
                          type="number"
                          value={configEdits[cfg.key] ?? cfg.value}
                          onChange={e => setConfigEdits(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                          step="0.01" min="0"
                          className="flex-1 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                        />
                        {configEdits[cfg.key] !== cfg.value && (
                          <button
                            onClick={async () => {
                              setSavingConfig(true)
                              await updateSystemConfig(cfg.key, configEdits[cfg.key])
                              setSavingConfig(false)
                            }}
                            disabled={savingConfig}
                            className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {savingConfig ? '...' : 'Guardar'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NPR % por dueño */}
            {owners.length > 0 && (
              <div className="space-y-2">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">NPR % por dueño de camión</p>
                <p className="text-zinc-600 text-[11px]">Verifica que el porcentaje de cada dueño sea correcto antes de generar la nómina.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {owners.map(owner => {
                    const current = nprEdits[owner.id] ?? String(owner.nprPercent)
                    const changed = current !== String(owner.nprPercent)
                    const isSaving = savingNpr === owner.id
                    return (
                      <div key={owner.id} className={`bg-zinc-800 rounded-xl px-3 py-2.5 transition-colors ${changed ? 'border border-amber-500/30' : ''}`}>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <p className="text-white text-xs font-medium truncate">{owner.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                            owner.type === 'PROPIO'
                              ? 'bg-zinc-700 text-zinc-400'
                              : 'bg-violet-500/10 text-violet-400'
                          }`}>
                            {owner.type === 'PROPIO' ? 'Propio' : 'Afiliado'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={current}
                            onChange={e => setNprEdits(prev => ({ ...prev, [owner.id]: e.target.value }))}
                            step="1" min="0" max="100"
                            className="w-16 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-zinc-500 text-sm">%</span>
                          {changed && (
                            <button
                              onClick={async () => {
                                setSavingNpr(owner.id)
                                await updateOwnerNpr(owner.id, parseFloat(current) || 0)
                                setSavingNpr(null)
                                // Actualizar el valor base para que el badge desaparezca
                                setNprEdits(prev => ({ ...prev, [owner.id]: current }))
                              }}
                              disabled={!!isSaving}
                              className="ml-auto text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {isSaving ? '...' : 'Guardar'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Acción */}
          <div className="flex gap-3">
            <button
              onClick={handleImportar}
              disabled={saving || (preview.newTrips === 0 && resolvedUnknownTrips.length === 0) || unknownPendientes > 0 || viajesSinResolver > 0}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
            >
              {saving
                ? 'Importando...'
                : viajesSinResolver > 0
                  ? `Resuelve ${placasSinResolver.length} placa${placasSinResolver.length !== 1 ? 's' : ''} antes de importar`
                  : `Importar ${preview.newTrips + resolvedUnknownTrips.length} viajes nuevos`}
            </button>
            <button onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
              className="px-5 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors border border-zinc-800">
              Cancelar
            </button>
          </div>
          </>}
        </div>
      )}
    </div>
  )
}
