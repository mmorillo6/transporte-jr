'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseRomana, confirmarImport } from '@/app/actions/importarRomana'
import type { RomanaPreview, RomanaTrip } from '@/app/actions/importarRomana'

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
      const res = await confirmarImport(preview.trips, openPeriodId)
      setResultado(res)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally { setSaving(false) }
  }

  const sinCamion = preview?.trips.filter(t => !t.truckId && !t.duplicate).length ?? 0
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
          {sinCamion > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3">
              <p className="text-orange-400 text-sm font-medium">{sinCamion} viajes no se importarán — placa no registrada en el sistema</p>
              <p className="text-zinc-500 text-xs mt-0.5">Registra esos camiones en el módulo de Camiones y vuelve a importar.</p>
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
