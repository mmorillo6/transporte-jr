'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { generatePayroll, closePeriod, reopenPeriod, getPayrollParams } from '@/app/actions/payroll'
import type { PayrollParams, LoanForPayroll } from '@/app/actions/payroll'
import { exportPeriodExcel } from '@/app/actions/exportPayroll'
import { toast } from 'sonner'

type Disposition = 'CAJA_CHICA' | 'AURUMIN' | 'LUIS_PENA' | 'SIGUIENTE'

type NegativoTruck = {
  id: string
  plate: string
  ownerName: string
  netAmount: number
}

type ChecklistData = {
  payrollCount: number
  tripsWithoutTicket: number
  unpaidEntries: number
  negativoEntries: number
  totalAlmacenPendiente: number
  totalLoansPendientes: number
  mecanicoExpensesCount: number
  negativoTrucks?: NegativoTruck[]
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
  const [showParams, setShowParams] = useState(false)
  const [params, setParams] = useState<PayrollParams | null>(null)
  const [loadingParams, setLoadingParams] = useState(false)
  const [skipLoanIds, setSkipLoanIds] = useState<Set<string>>(new Set())
  const [adminFeeOverride, setAdminFeeOverride] = useState<string>('')
  const [dispositions, setDispositions] = useState<Record<string, Disposition>>({})

  const isOpen = periodStatus === 'OPEN'

  async function handleOpenParams() {
    setLoadingParams(true)
    const res = await getPayrollParams(periodId)
    setLoadingParams(false)
    if ('error' in res) { toast.error(res.error); return }
    setParams(res)
    setSkipLoanIds(new Set())
    setAdminFeeOverride(String(res.adminFeeBase))
    setShowParams(true)
  }

  async function handleGenerate() {
    setShowParams(false)
    setLoading(true)
    const res = await generatePayroll(periodId, {
      skipLoanIds: [...skipLoanIds],
      adminFeeOverride: adminFeeOverride ? parseFloat(adminFeeOverride) : undefined,
    })
    if (res.error) toast.error(res.error)
    else { toast.success(`Nómina calculada — ${res.count} camiones`); router.refresh() }
    setLoading(false)
  }

  async function handleClose() {
    setClosing(true)
    const res = await closePeriod(periodId, dispositions)
    if ('error' in res && res.error) toast.error(res.error)
    else {
      const r = res as { ok: boolean; prestamos: number; cxcCreadas: string[] }
      const parts: string[] = ['Período cerrado']
      if (r.prestamos > 0) parts.push(`${r.prestamos} préstamo${r.prestamos !== 1 ? 's' : ''} CC`)
      if (r.cxcCreadas?.length > 0) parts.push(`CxC creada: ${r.cxcCreadas.join(', ')}`)
      toast.success(parts.join(' — '))
      router.refresh()
    }
    setClosing(false)
    setShowChecklist(false)
  }

  function openChecklist() {
    const defaults: Record<string, Disposition> = {}
    for (const t of checklistData?.negativoTrucks ?? []) {
      defaults[t.id] = t.ownerName === 'José Rodríguez' ? 'SIGUIENTE' : 'CAJA_CHICA'
    }
    setDispositions(defaults)
    setShowChecklist(true)
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
            onClick={handleOpenParams}
            disabled={loading || loadingParams}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Calculando...' : loadingParams ? 'Cargando...' : <><span className="sm:hidden">Recalcular</span><span className="hidden sm:inline">Recalcular nómina</span></>}
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
              onClick={openChecklist}
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

      {/* Modal de parámetros antes de generar nómina */}
      {showParams && params && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h2 className="text-white font-semibold text-base">Revisar parámetros de nómina</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Confirma o ajusta antes de calcular. Los cambios solo aplican a esta generación.</p>
            </div>

            <div className="px-5 py-4 space-y-5">

              {/* Admin fee */}
              <div>
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">Admin fee</p>
                <div className="bg-zinc-800 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-white text-sm">Fee por camión propio</p>
                    <p className="text-zinc-500 text-xs">{params.fleetCount} carros en flota ÷ {params.activeCount} activos Aurumin = <span className="text-amber-400">${params.adminFeePerTruck.toFixed(2)}/carro</span></p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500 text-sm">$</span>
                    <input
                      type="number" step="1" min="0"
                      value={adminFeeOverride}
                      onChange={e => setAdminFeeOverride(e.target.value)}
                      className="w-16 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-zinc-500 text-xs">/carro</span>
                  </div>
                </div>
              </div>

              {/* Préstamos */}
              <div>
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  Préstamos a descontar — {params.loans.length === 0 ? 'ninguno activo' : `${params.loans.filter(l => !skipLoanIds.has(l.id)).length} de ${params.loans.length} seleccionados`}
                </p>
                {params.loans.length === 0 ? (
                  <p className="text-zinc-600 text-xs">No hay préstamos activos que apliquen a los camiones de este período.</p>
                ) : (
                  <div className="space-y-2">
                    {params.loans.map(loan => {
                      const checked = !skipLoanIds.has(loan.id)
                      return (
                        <label key={loan.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-900 border-zinc-800 opacity-50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setSkipLoanIds(prev => {
                              const n = new Set(prev)
                              if (e.target.checked) n.delete(loan.id)
                              else n.add(loan.id)
                              return n
                            })}
                            className="mt-0.5 accent-amber-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">{loan.driverName}</p>
                            <p className="text-zinc-500 text-xs">
                              {loan.type === 'chofer' ? 'Chofer de' : 'Dueño de'} <span className="font-mono text-zinc-400">{loan.truckPlate}</span>
                              {loan.type === 'dueno' && <span className="ml-1">({loan.ownerName})</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-red-400 font-semibold text-sm">-${loan.deductAmount.toFixed(2)}</p>
                            <p className="text-zinc-600 text-xs">saldo: ${loan.balance.toFixed(2)}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Referencia viáticos y otros params */}
              {params.systemConfig.length > 0 && (
                <div>
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">Referencia — parámetros del sistema</p>
                  <div className="grid grid-cols-2 gap-2">
                    {params.systemConfig.filter(c => c.key !== 'adminFeePerTruck').map(c => (
                      <div key={c.key} className="bg-zinc-800/50 rounded-lg px-3 py-2">
                        <p className="text-zinc-500 text-xs">{c.label}</p>
                        <p className="text-white text-sm font-medium">${c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-3 sticky bottom-0 bg-zinc-900">
              <button
                onClick={() => setShowParams(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-sm transition-colors"
              >
                {loading ? 'Calculando...' : 'Generar nómina'}
              </button>
            </div>
          </div>
        </div>
      )}

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

              {/* Gastos mecánicos */}
              {cl.mecanicoExpensesCount > 0 ? (
                <CheckItem type="ok" text="Gastos de mecánicos ingresados" />
              ) : (
                <CheckItem type="warn" text="No se ingresaron gastos de mecánicos — verifica si aplica" />
              )}

              {/* Pagos pendientes */}
              {cl.unpaidEntries > 0 && (
                <CheckItem type="warn" text={`${cl.unpaidEntries} carro${cl.unpaidEntries !== 1 ? 's' : ''} con pago pendiente de cobro`} />
              )}

              {/* Carros negativos — selección de disposición por carro */}
              {(cl.negativoTrucks ?? []).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-xs font-bold text-amber-400 w-4 flex-shrink-0">⚠</span>
                    <span className="text-sm text-amber-400">
                      {cl.negativoTrucks!.length} carro{cl.negativoTrucks!.length !== 1 ? 's' : ''} en negativo — elige cómo cubrir cada déficit:
                    </span>
                  </div>
                  {cl.negativoTrucks!.map(t => {
                    const isJose = t.ownerName === 'José Rodríguez'
                    const cur = dispositions[t.id] ?? 'CAJA_CHICA'
                    const opts: { value: Disposition; label: string }[] = [
                      { value: 'CAJA_CHICA', label: 'Caja chica' },
                      { value: 'AURUMIN',    label: 'Aurumin' },
                      { value: 'LUIS_PENA',  label: 'Luis Peña' },
                      { value: 'SIGUIENTE',  label: 'Arrastra' },
                    ]
                    return (
                      <div key={t.id} className="ml-6 bg-zinc-800/60 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm font-medium font-mono">{t.plate}</span>
                          <span className="text-red-400 text-sm font-semibold">
                            −${Math.abs(t.netAmount).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-zinc-500 text-xs">{t.ownerName}</p>
                        {isJose ? (
                          <p className="text-zinc-500 text-xs italic">Arrastra automáticamente (regla José Rodríguez)</p>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            {opts.map(o => (
                              <button
                                key={o.value}
                                type="button"
                                onClick={() => setDispositions(prev => ({ ...prev, [t.id]: o.value }))}
                                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                  cur === o.value
                                    ? o.value === 'CAJA_CHICA' ? 'bg-red-500/20 text-red-400'
                                    : o.value === 'AURUMIN'    ? 'bg-blue-500/20 text-blue-400'
                                    : o.value === 'LUIS_PENA'  ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-zinc-600 text-zinc-300'
                                    : 'bg-zinc-700 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
