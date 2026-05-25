'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markPayrollEntryPaid, markAllPeriodPaid, updatePayrollAbono } from '@/app/actions/payroll'
import { toast } from 'sonner'

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'USDT', 'Zelle', 'Otro']

type Entry = {
  id: string
  truckId: string
  totalTons: number
  grossAmount: number
  viaticos: number
  driverWage: number
  commissionFee: number   // gastosOp (Expense records + viáticos de ruta)
  nprFee: number
  mechanicFee: number
  adminFee: number
  deductions: number
  saldoInicial: number
  abono: number
  netAmount: number
  notes: string | null
  paidAt: string | null
  paymentMethod: string | null
  truck: {
    plate: string
    driver: { name: string } | null
    owner: { id: string; name: string; type: string; nprPercent?: number } | null
  } | null
}

export default function PayrollTableClient({
  entries,
  periodId,
  periodStatus,
  role,
  totalTons,
  totalGross,
  totalViaticos,
  totalDriverWage,
  totalCommission,
  totalNprFee,
  totalMechanicFee,
  totalAdminFee,
  totalDeductions,
  totalSaldoInicial,
  totalAbono,
  totalNet,
}: {
  entries: Entry[]
  periodId: string
  periodStatus: string
  role: string
  totalTons: number
  totalGross: number
  totalViaticos: number
  totalDriverWage: number
  totalCommission: number
  totalNprFee: number
  totalMechanicFee: number
  totalAdminFee: number
  totalDeductions: number
  totalSaldoInicial: number
  totalAbono: number
  totalNet: number
}) {
  const router = useRouter()
  const [paying, setPaying] = useState<string | null>(null)
  const [payingAll, setPayingAll] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState('Efectivo')
  const [allMethod, setAllMethod] = useState('Efectivo')
  // Abono editing state: { [entryId]: string (raw input) }
  const [abonoEditing, setAbonoEditing] = useState<Record<string, string>>({})
  const [abonoLoading, setAbonoLoading] = useState<string | null>(null)

  const canPay = ['DUENO', 'ENCARGADO'].includes(role)
  const isClosed = periodStatus === 'CLOSED'
  const pendingCount = entries.filter(e => !e.paidAt).length

  async function handlePay(id: string, method: string) {
    setLoadingId(id)
    const res = await markPayrollEntryPaid(id, method)
    if (res.error) toast.error(res.error)
    else { setPaying(null); router.refresh() }
    setLoadingId(null)
  }

  async function handlePayAll(method: string) {
    setLoadingAll(true)
    const res = await markAllPeriodPaid(periodId, method)
    if (res.error) toast.error(res.error)
    else { setPayingAll(false); router.refresh() }
    setLoadingAll(false)
  }

  async function handleAbonoSave(entryId: string) {
    const raw = abonoEditing[entryId]
    const val = parseFloat(raw)
    if (isNaN(val) || val < 0) { toast.error('Abono inválido'); return }
    setAbonoLoading(entryId)
    const res = await updatePayrollAbono(entryId, val)
    if (res.error) toast.error(res.error)
    else {
      setAbonoEditing(prev => { const n = { ...prev }; delete n[entryId]; return n })
      router.refresh()
    }
    setAbonoLoading(null)
  }

  function shortDate(d: string) {
    return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })
  }

  function shortMethod(m: string | null) {
    if (!m) return ''
    if (m === 'Transferencia') return 'Transf.'
    return m
  }

  function fmt(n: number) { return `$${n.toFixed(2)}` }
  function fmtNeg(n: number) { return n > 0 ? `-${fmt(n)}` : '—' }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* ── Encabezado ── */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-sm">Relación final — choferes</h2>
        {canPay && pendingCount > 0 && !isClosed && (
          <div className="flex items-center gap-2">
            {payingAll ? (
              <>
                <select
                  value={allMethod}
                  onChange={e => setAllMethod(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
                <button
                  onClick={() => handlePayAll(allMethod)}
                  disabled={loadingAll}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg px-3 py-1.5 transition-colors"
                >
                  {loadingAll ? 'Pagando...' : `Confirmar (${pendingCount})`}
                </button>
                <button
                  onClick={() => setPayingAll(false)}
                  className="text-xs text-zinc-400 hover:text-white rounded-lg px-2 py-1.5 transition-colors"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setPayingAll(true)}
                className="flex items-center gap-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-lg px-3 py-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pagar todos ({pendingCount})
              </button>
            )}
          </div>
        )}
      </div>
      {/* ── Vista móvil: tarjetas ── */}
      <div className="md:hidden divide-y divide-zinc-800/60">
        {entries.map(entry => {
          const isNegative = entry.netAmount < 0
          const isPaid     = !!entry.paidAt
          const isPaying   = paying === entry.id

          return (
            <div
              key={entry.id}
              className={`p-4 space-y-4 ${
                isPaid     ? 'bg-emerald-500/5' :
                isNegative ? 'bg-red-500/5' : ''
              }`}
            >
              {/* Fila superior: identidad + monto */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-base leading-tight truncate">
                    {entry.truck?.driver?.name ?? '—'}
                  </p>
                  <p className="text-zinc-400 text-sm mt-0.5">
                    <span className="font-mono">{entry.truck?.plate ?? '—'}</span>
                    <span className="text-zinc-600 mx-1.5">·</span>
                    <span>{entry.truck?.owner?.name ?? '—'}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-2xl font-bold font-mono leading-none ${
                    isNegative ? 'text-red-400' : isPaid ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {isNegative ? '-' : ''}{fmt(Math.abs(entry.netAmount))}
                  </p>
                  <p className="text-zinc-600 text-xs mt-1">saldo final</p>
                </div>
              </div>

              {/* Estado / acción principal */}
              {isPaid ? (
                <div className="flex items-center gap-2 py-2.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400 text-sm font-medium">
                    Pagado el {shortDate(entry.paidAt!)}
                    {entry.paymentMethod && <span className="text-emerald-500/70 ml-1">· {shortMethod(entry.paymentMethod)}</span>}
                  </span>
                </div>
              ) : isNegative ? (
                <div className="flex items-center gap-2 py-2.5 px-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-red-400 text-sm">Saldo en negativo — se generará préstamo CC al cerrar</span>
                </div>
              ) : canPay && !isClosed ? (
                isPaying ? (
                  <div className="space-y-2">
                    <select
                      value={selectedMethod}
                      onChange={e => setSelectedMethod(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-600 text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-amber-500"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePay(entry.id, selectedMethod)}
                        disabled={loadingId === entry.id}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
                      >
                        {loadingId === entry.id ? 'Guardando...' : '✓ Confirmar pago'}
                      </button>
                      <button
                        onClick={() => setPaying(null)}
                        className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-medium rounded-xl py-3 text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPaying(entry.id); setSelectedMethod('Efectivo') }}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/40 text-zinc-300 hover:text-white font-medium rounded-xl py-3 text-sm transition-colors"
                  >
                    Marcar como pagado
                  </button>
                )
              ) : (
                <p className="text-zinc-600 text-sm text-center py-1">Pendiente de cobro</p>
              )}

              {/* Abono — visible en móvil para canPay, abierto o cerrado */}
              {canPay && !isNegative && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs">Abono:</span>
                  {entry.id in abonoEditing ? (
                    <>
                      <input
                        type="number"
                        value={abonoEditing[entry.id]}
                        onChange={e => setAbonoEditing(prev => ({ ...prev, [entry.id]: e.target.value }))}
                        className="flex-1 bg-zinc-800 border border-amber-500/50 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                      <button
                        onClick={() => handleAbonoSave(entry.id)}
                        disabled={abonoLoading === entry.id}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-3 py-1.5 text-sm transition-colors"
                      >
                        {abonoLoading === entry.id ? '...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setAbonoEditing(prev => { const n = { ...prev }; delete n[entry.id]; return n })}
                        className="text-zinc-500 hover:text-white"
                      >✕</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setAbonoEditing(prev => ({ ...prev, [entry.id]: entry.abono.toString() }))}
                      className="flex-1 flex items-center justify-between bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/40 text-zinc-300 hover:text-amber-400 rounded-lg px-3 py-2 text-sm transition-colors"
                    >
                      <span>{entry.abono > 0 ? `Abono: $${fmt(entry.abono)}` : '+ Registrar abono'}</span>
                      <span className="text-zinc-600 text-xs">✎</span>
                    </button>
                  )}
                </div>
              )}

              {/* Ver relación — siempre visible */}
              <a
                href={`/nomina/${periodId}/truck/${entry.truckId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-zinc-500 hover:text-amber-400 text-sm transition-colors py-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Ver relación completa
              </a>
            </div>
          )
        })}
      </div>

      {/* ── Vista escritorio: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-800/40">
              <th className="text-left text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Transportista</th>
              <th className="text-left text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Placa</th>
              <th className="text-left text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Dueño</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Ton</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Bruto</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Viático</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Nóm.</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">NPR</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Mec.</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Admin</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Gastos Op.</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Ded.</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Saldo Ant.</th>
              <th className="text-right text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Abono</th>
              <th className="text-right text-zinc-500 font-semibold px-2 py-2.5 whitespace-nowrap">Saldo Final</th>
              {canPay && <th className="text-left text-zinc-500 font-medium px-2 py-2.5 whitespace-nowrap">Estado</th>}
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isNegative = entry.netAmount < 0
              const rowBg = isNegative
                ? 'bg-red-500/5 hover:bg-red-500/10'
                : entry.paidAt
                ? 'hover:bg-emerald-500/5'
                : 'hover:bg-zinc-800/20'
              const netColor = isNegative ? 'text-red-400' : 'text-amber-400'
              const isEditingAbono = entry.id in abonoEditing

              return (
                <tr key={entry.id} className={`border-b border-zinc-800/50 transition-colors ${rowBg}`}>
                  <td className="px-2 py-2 text-white font-medium whitespace-nowrap">
                    {entry.truck?.driver?.name ?? '—'}
                  </td>
                  <td className="px-2 py-2 font-mono text-zinc-300 whitespace-nowrap">{entry.truck?.plate ?? '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-400">{entry.truck?.owner?.name ?? '—'}</span>
                      {entry.truck?.owner?.type === 'AFILIADO' && (
                        <span className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded-full text-[10px]">
                          {entry.truck.owner.nprPercent ?? 10}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{entry.totalTons.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right text-white whitespace-nowrap">{fmt(entry.grossAmount)}</td>
                  <td className="px-2 py-2 text-right text-blue-400 whitespace-nowrap">
                    {entry.viaticos > 0 ? fmt(entry.viaticos) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-orange-400 whitespace-nowrap">
                    {fmtNeg(entry.driverWage)}
                  </td>
                  <td className="px-2 py-2 text-right text-red-400 whitespace-nowrap">
                    {fmtNeg(entry.nprFee ?? 0)}
                  </td>
                  <td className="px-2 py-2 text-right text-purple-400 whitespace-nowrap">
                    {fmtNeg(entry.mechanicFee ?? 0)}
                  </td>
                  <td className="px-2 py-2 text-right text-zinc-400 whitespace-nowrap">
                    {fmtNeg(entry.adminFee ?? 0)}
                  </td>
                  <td className="px-2 py-2 text-right text-red-400 whitespace-nowrap">
                    {fmtNeg(entry.commissionFee)}
                  </td>
                  <td className="px-2 py-2 text-right text-red-400 whitespace-nowrap">
                    {fmtNeg(entry.deductions)}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {entry.saldoInicial !== 0 ? (
                      <span className={entry.saldoInicial < 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {entry.saldoInicial < 0 ? `-${fmt(Math.abs(entry.saldoInicial))}` : fmt(entry.saldoInicial)}
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {canPay ? (
                      isEditingAbono ? (
                        <div className="flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={abonoEditing[entry.id]}
                            onChange={e => setAbonoEditing(prev => ({ ...prev, [entry.id]: e.target.value }))}
                            className="w-20 bg-zinc-800 border border-zinc-600 text-white rounded px-1.5 py-1 text-xs focus:outline-none focus:border-amber-500 text-right"
                            autoFocus
                          />
                          <button
                            onClick={() => handleAbonoSave(entry.id)}
                            disabled={abonoLoading === entry.id}
                            className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded px-2 py-1"
                          >
                            {abonoLoading === entry.id ? '...' : 'Guardar'}
                          </button>
                          <button
                            onClick={() => setAbonoEditing(prev => { const n = { ...prev }; delete n[entry.id]; return n })}
                            className="text-zinc-500 hover:text-white text-xs"
                          >✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {entry.abono > 0 && (
                            <span className="text-emerald-400 font-mono">-{fmt(entry.abono)}</span>
                          )}
                          <button
                            onClick={() => setAbonoEditing(prev => ({ ...prev, [entry.id]: entry.abono.toString() }))}
                            className="text-xs bg-zinc-800 hover:bg-amber-500/20 border border-zinc-700 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                            title="Registrar abono para este camión"
                          >
                            {entry.abono > 0 ? 'Editar' : '+ Abono'}
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="text-zinc-400">
                        {entry.abono > 0 ? `-${fmt(entry.abono)}` : <span className="text-zinc-600">—</span>}
                      </span>
                    )}
                  </td>
                  <td className={`px-2 py-2 text-right font-bold whitespace-nowrap ${netColor}`}>
                    {isNegative ? `-${fmt(Math.abs(entry.netAmount))}` : fmt(entry.netAmount)}
                  </td>
                  {canPay && (
                    <td className="px-2 py-2">
                      {entry.paidAt ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          ✓ {shortDate(entry.paidAt)} · {shortMethod(entry.paymentMethod)}
                        </span>
                      ) : isNegative ? (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          En negativo
                        </span>
                      ) : paying === entry.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={selectedMethod}
                            onChange={e => setSelectedMethod(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:border-amber-500"
                          >
                            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                          </select>
                          <button
                            onClick={() => handlePay(entry.id, selectedMethod)}
                            disabled={loadingId === entry.id}
                            className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-2 py-1 transition-colors"
                          >
                            {loadingId === entry.id ? '...' : 'OK'}
                          </button>
                          <button
                            onClick={() => setPaying(null)}
                            className="text-zinc-500 hover:text-white text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPaying(entry.id); setSelectedMethod('Efectivo') }}
                          className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg hover:bg-amber-500/20 transition-colors whitespace-nowrap"
                        >
                          Marcar pagado
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {entry.notes && (
                        <span className="text-zinc-600 text-xs" title={entry.notes}>📝</span>
                      )}
                      {/* Relación por camión */}
                      <a
                        href={`/nomina/${periodId}/truck/${entry.truckId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Relación por camión"
                        className="text-zinc-600 hover:text-amber-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </a>
                      {/* Relación por dueño */}
                      {entry.truck?.owner?.id && (
                        <a
                          href={`/nomina/${periodId}/owner/${entry.truck.owner.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Relación dueño: ${entry.truck.owner.name}`}
                          className="text-zinc-600 hover:text-blue-400 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-800/60 border-t border-zinc-700">
              <td colSpan={3} className="px-2 py-2 text-zinc-400 font-semibold text-xs uppercase tracking-wide">
                TOTALES
              </td>
              <td className="px-2 py-2 text-right text-white font-bold whitespace-nowrap">{totalTons.toFixed(2)}</td>
              <td className="px-2 py-2 text-right text-white font-bold whitespace-nowrap">{fmt(totalGross)}</td>
              <td className="px-2 py-2 text-right text-blue-400 font-bold whitespace-nowrap">{fmt(totalViaticos)}</td>
              <td className="px-2 py-2 text-right text-orange-400 font-bold whitespace-nowrap">-{fmt(totalDriverWage)}</td>
              <td className="px-2 py-2 text-right text-red-400 font-bold whitespace-nowrap">-{fmt(totalNprFee)}</td>
              <td className="px-2 py-2 text-right text-purple-400 font-bold whitespace-nowrap">-{fmt(totalMechanicFee)}</td>
              <td className="px-2 py-2 text-right text-zinc-400 font-bold whitespace-nowrap">-{fmt(totalAdminFee)}</td>
              <td className="px-2 py-2 text-right text-red-400 font-bold whitespace-nowrap">-{fmt(totalCommission)}</td>
              <td className="px-2 py-2 text-right text-red-400 font-bold whitespace-nowrap">-{fmt(totalDeductions)}</td>
              <td className="px-2 py-2 text-right font-bold whitespace-nowrap text-zinc-400">{fmt(totalSaldoInicial)}</td>
              <td className="px-2 py-2 text-right text-zinc-400 font-bold whitespace-nowrap">-{fmt(totalAbono)}</td>
              <td className={`px-2 py-2 text-right font-bold text-sm whitespace-nowrap ${totalNet < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {totalNet < 0 ? `-${fmt(Math.abs(totalNet))}` : fmt(totalNet)}
              </td>
              {canPay && <td />}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
