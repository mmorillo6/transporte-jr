'use client'
import { useState, useRef } from 'react'
import { importTripsFromExcel } from '@/app/actions/trips'

type Result = { created: number; skipped: number; errors: string[]; total: number }
type Warning = { warning: true; existingCount: number; totalCount: number; pct: number; dateRange: string }

export default function ExcelImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'select' | 'loading' | 'warning' | 'result'>('select')
  const [result, setResult] = useState<Result | null>(null)
  const [warning, setWarning] = useState<Warning | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function runImport(confirmed: boolean) {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Selecciona un archivo primero'); return }

    setStep('loading')
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    if (confirmed) formData.append('confirmed', 'true')

    const res = await importTripsFromExcel(formData)

    if ('error' in res) {
      setError(res.error ?? 'Error al importar')
      setStep('select')
    } else if ('warning' in res) {
      setWarning(res as Warning)
      setStep('warning')
    } else {
      setResult(res as Result)
      setStep('result')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Importar viajes desde Excel</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── SELECT ── */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              Sube el archivo Excel de la romana. Solo se importarán los viajes de las minas activas y los camiones de la flota.
            </p>

            <div
              className="border-2 border-dashed border-zinc-700 hover:border-amber-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-zinc-400 text-sm">
                {fileRef.current?.files?.[0]?.name ?? 'Haz clic para seleccionar archivo'}
              </p>
              <p className="text-zinc-600 text-xs mt-1">.xlsx, .xls</p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) setError('') }}
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => runImport(false)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-3 text-sm transition-colors"
              >
                Importar viajes
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div className="py-10 text-center">
            <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">Procesando archivo...</p>
            <p className="text-zinc-600 text-xs mt-1">Esto puede tomar unos segundos</p>
          </div>
        )}

        {/* ── WARNING ── */}
        {step === 'warning' && warning && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-amber-400 font-semibold text-sm">Este archivo ya parece estar cargado</p>
                  <p className="text-amber-300/80 text-xs mt-1">
                    {warning.existingCount} de {warning.totalCount} registros del período{' '}
                    <span className="font-semibold">{warning.dateRange}</span> ya existen en el sistema ({warning.pct}%).
                  </p>
                </div>
              </div>
            </div>

            <p className="text-zinc-400 text-sm">
              Si importas de nuevo, los viajes duplicados serán ignorados automáticamente. Solo se agregarán los que aún no existen.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => runImport(true)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-3 text-sm transition-colors"
              >
                Importar de todas formas
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-4xl font-bold text-emerald-400">{result.created}</p>
              <p className="text-emerald-300 text-sm mt-1">viajes importados exitosamente</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{result.total}</p>
                <p className="text-zinc-500 text-xs">filas totales</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-3 text-center">
                <p className="text-zinc-400 font-bold text-lg">{result.skipped ?? 0}</p>
                <p className="text-zinc-500 text-xs">omitidos</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-3 text-center">
                <p className={`font-bold text-lg ${result.errors.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {result.errors.length}
                </p>
                <p className="text-zinc-500 text-xs">errores</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-zinc-800 rounded-xl p-3 max-h-40 overflow-y-auto">
                <p className="text-zinc-400 text-xs font-medium mb-2">Filas con errores:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-amber-400 text-xs py-0.5">{e}</p>
                ))}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-3 text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
