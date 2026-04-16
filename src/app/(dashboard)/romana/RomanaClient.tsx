'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { parseRomana, confirmarImport } from '@/app/actions/importarRomana'
import type { RomanaPreview, RomanaTrip } from '@/app/actions/importarRomana'

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

export default function RomanaClient({ openPeriodId }: { openPeriodId?: string }) {
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
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const data = await parseRomana(base64)
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
      const res = await confirmarImport(tripsConRemapeo, openPeriodId)
      setResultado(res)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally { setSaving(false) }
  }

  const sinCamion = preview?.trips.filter(t => !t.truckId && !t.duplicate).length ?? 0
  const placasSinRegistrar = preview
    ? [...new Set(preview.trips.filter(t => !t.truckId && !t.duplicate).map(t => t.plate))]
    : []
  // plateMappings: placa errónea → truckId del camión correcto
  const [plateMappings, setPlateMappings] = useState<Record<string, string>>({})
  const [sugerenciasRechazadas, setSugerenciasRechazadas] = useState<Set<string>>(new Set())
  // conductorMappings: nombre romana → nombre normalizado del chofer registrado
  const [conductorMappings, setConductorMappings] = useState<Record<string, string>>({})
  const [conductoresSugerRechazadas, setConductoresSugerRechazadas] = useState<Set<string>>(new Set())
  const [ignorarDuplicado, setIgnorarDuplicado] = useState(false)

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
              <p className="text-zinc-500 text-xs mb-1">Viajes en archivo</p>
              <p className="text-2xl font-bold text-white">{preview.totalTrips}</p>
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
                  <div key={r.name} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-zinc-300 text-sm font-medium">{r.name}</span>
                    <div className="flex items-center gap-6 text-xs text-right">
                      <span className="text-zinc-500">{r.trips} viajes</span>
                      <span className="text-zinc-400">{r.tons.toFixed(2)} ton</span>
                      <span className="text-amber-400 font-semibold w-24">${r.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
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
            const viajesSinResolver = preview.trips.filter(t => !t.truckId && !t.duplicate && !plateMappings[t.plate]).length
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

          {/* Acción */}
          <div className="flex gap-3">
            <button onClick={handleImportar} disabled={saving || preview.newTrips === 0}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              {saving ? 'Importando...' : `Importar ${preview.newTrips} viajes nuevos`}
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
