'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { generatePayroll, closePeriod, reopenPeriod } from '@/app/actions/payroll'
import { exportPeriodExcel } from '@/app/actions/exportPayroll'
import { toast } from 'sonner'

export default function PeriodActions({ periodId, periodStatus, role }: {
  periodId: string
  periodStatus: string
  role: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)

  const isOpen = periodStatus === 'OPEN'

  async function handleGenerate() {
    setLoading(true)
    const res = await generatePayroll(periodId)
    if (res.error) toast.error(res.error)
    else { toast.success(`Nómina calculada — ${res.count} camiones`); router.refresh() }
    setLoading(false)
  }

  async function handleClose() {
    setClosing(true)
    const res = await closePeriod(periodId)
    if ('error' in res && res.error) toast.error(res.error)
    else {
      const r = res as { ok: boolean; prestamos: number }
      if (r.prestamos > 0) {
        toast.success(`Período cerrado — ${r.prestamos} carro${r.prestamos !== 1 ? 's' : ''} con saldo negativo → préstamo de caja chica creado`)
      } else {
        toast.success('Período cerrado correctamente')
      }
      router.refresh()
    }
    setClosing(false)
  }

  async function handleReopen() {
    setReopening(true)
    const res = await reopenPeriod(periodId)
    if (res.error) toast.error(res.error)
    else { toast.success('Período reabierto'); router.refresh() }
    setReopening(false)
  }

  async function handleExcel() {
    setExporting(true)
    const res = await exportPeriodExcel(periodId)
    if ('error' in res) {
      toast.error(res.error)
    } else {
      const bytes = Uint8Array.from(atob(res.data), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = res.filename; a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {isOpen && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Calculando...' : 'Recalcular nómina'}
        </button>
      )}
      <button
        onClick={handleExcel}
        disabled={exporting}
        className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {exporting ? 'Exportando...' : 'Exportar Excel'}
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Imprimir / PDF
      </button>
      {isOpen && role === 'DUENO' || role === 'ENCARGADO' ? (
        isOpen ? (
          <button
            onClick={handleClose}
            disabled={closing}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {closing ? 'Cerrando...' : 'Cerrar período'}
          </button>
        ) : role === 'DUENO' ? (
          <button
            onClick={handleReopen}
            disabled={reopening}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 hover:text-white font-medium rounded-lg text-sm transition-colors"
          >
            {reopening ? 'Reabriendo...' : 'Reabrir período'}
          </button>
        ) : null
      ) : null}
    </div>
  )
}
