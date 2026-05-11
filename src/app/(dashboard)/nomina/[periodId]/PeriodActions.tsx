'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { generatePayroll, closePeriod, reopenPeriod } from '@/app/actions/payroll'
import { exportPeriodExcel } from '@/app/actions/exportPayroll'
import { toast } from 'sonner'

type ChecklistData = {
  payrollCount: number
  tripsWithoutTicket: number
  unpaidEntries: number
  negativoEntries: number
  totalAlmacenPendiente: number
  totalLoansPendientes: number
}

export default function PeriodActions({ periodId, periodStatus, role, checklistData }: {
  periodId: string
  periodStatus: string
  role: string
  checklistData?: ChecklistData
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)

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
    setShowChecklist(false)
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

  const cl = checklistData

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {isOpen && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Calculando...' : <><span className="sm:hidden">Recalcular</span><span className="hidden sm:inline">Recalcular nómina</span></>}
          </button>
        )}
        <button
          onClick={handleExcel}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="sm:hidden">{exporting ? '...' : 'Excel'}</span>
          <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Exportar Excel'}</span>
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span className="sm:hidden">PDF</span>
          <span className="hidden sm:inline">Imprimir / PDF</span>
        </button>
        {['DUENO', 'ENCARGADO'].includes(role) && (
          isOpen ? (
            <button
              onClick={() => setShowChecklist(true)}
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
        )}
      </div>

      {/* Modal checklist de cierre */}
      {showChecklist && cl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold text-base">Checklist de cierre</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Revisa el estado del período antes de cerrar</p>
            </div>

            <div className="px-5 py-4 space-y-2.5">
              {/* Nómina generada */}
              {cl.payrollCount > 0 ? (
                <CheckItem type="ok" text={`Nómina generada — ${cl.payrollCount} camiones`} />
              ) : (
                <CheckItem type="error" text="Nómina no generada — genera la nómina antes de cerrar" />
              )}

              {/* Tickets */}
              {cl.tripsWithoutTicket === 0 ? (
                <CheckItem type="ok" text="Todos los viajes tienen número de ticket" />
              ) : (
                <CheckItem type="warn" text={`${cl.tripsWithoutTicket} viaje${cl.tripsWithoutTicket !== 1 ? 's' : ''} sin número de ticket`} />
              )}

              {/* Pagos pendientes */}
              {cl.unpaidEntries > 0 && (
                <CheckItem type="warn" text={`${cl.unpaidEntries} carro${cl.unpaidEntries !== 1 ? 's' : ''} con pago pendiente de cobro`} />
              )}

              {/* Carros negativos */}
              {cl.negativoEntries > 0 && (
                <CheckItem
                  type="info"
                  text={`${cl.negativoEntries} carro${cl.negativoEntries !== 1 ? 's' : ''} en negativo → se generarán préstamos de caja chica`}
                />
              )}

              {/* Almacén */}
              {cl.totalAlmacenPendiente > 0 && (
                <CheckItem
                  type="info"
                  text={`Almacén pendiente: $${cl.totalAlmacenPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                />
              )}

              {/* Préstamos */}
              {cl.totalLoansPendientes > 0 && (
                <CheckItem
                  type="info"
                  text={`Préstamos activos: $${cl.totalLoansPendientes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                />
              )}
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setShowChecklist(false)}
                disabled={closing}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={closing || cl.payrollCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {closing ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CheckItem({ type, text }: { type: 'ok' | 'warn' | 'error' | 'info'; text: string }) {
  const styles = {
    ok:    { dot: 'bg-emerald-500', text: 'text-emerald-400', icon: '✓' },
    warn:  { dot: 'bg-amber-500',   text: 'text-amber-400',   icon: '⚠' },
    error: { dot: 'bg-red-500',     text: 'text-red-400',     icon: '✕' },
    info:  { dot: 'bg-zinc-500',    text: 'text-zinc-400',    icon: 'ℹ' },
  }[type]

  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 text-xs font-bold ${styles.text} w-4 flex-shrink-0`}>{styles.icon}</span>
      <span className={`text-sm ${styles.text}`}>{text}</span>
    </div>
  )
}
