'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerPayment } from '@/app/actions/payroll'

type TruckRow = {
  truckId: string
  payrollEntryId: string
  plate: string
  driverName: string
  auruminGross: number
  lpGross: number
  commFee: number
  mechFee: number
  adminFee: number
  nprFee: number
  driverWage: number
  deductions: number
  saldoInicial: number
  abono: number
  netAmount: number
  viaticos: number
  totalTons: number
  paidAt: string | null
  expenses: { category: string; description: string; amount: number; date: string }[]
}

type TireDebt = {
  id: string
  quantity: number
  tireType: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  notes: string | null
  payments: { amount: number; date: string }[]
}

type OwnerRow = {
  owner: { id: string; name: string; type: string; nprPercent: number; isNPROwner: boolean }
  trucks: TruckRow[]
  tireDebts: TireDebt[]
  totals: {
    auruminGross: number
    lpGross: number
    commFee: number
    mechFee: number
    adminFee: number
    nprFee: number
    driverWage: number
    deductions: number
    saldoInicial: number
    abono: number
    netAmount: number
    viaticos: number
    totalTons: number
  }
}

type Period = {
  id: string
  startDate: string
  endDate: string
  status: string
}

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function periodLabel(startDate: string, endDate: string) {
  const [, sm, sd] = startDate.slice(0, 10).split('-').map(Number)
  const [, em, ed] = endDate.slice(0, 10).split('-').map(Number)
  const q = sd <= 15 ? '1ª' : '2ª'
  const month = new Date(2026, sm - 1, 1).toLocaleDateString('es-VE', { month: 'long' })
  return `${q} quincena · ${month.charAt(0).toUpperCase() + month.slice(1)} · ${fmtDate(startDate)}–${String(ed).padStart(2,'0')}/${String(em).padStart(2,'0')}`
}

const CATEGORY_LABEL: Record<string, string> = {
  REPUESTO: 'Repuesto', MECANICA: 'Mecánica', ACEITE: 'Aceite',
  CAUCHO: 'Caucho', OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Adm.',
  NPR: 'NPR', NOMINA: 'Nómina', VIATICO: 'Viático', OTRO: 'Otro',
}

const TYPE_STYLE: Record<string, string> = {
  PROPIO: 'text-emerald-400 bg-emerald-400/10',
  AFILIADO: 'text-violet-400 bg-violet-400/10',
}

export default function DuenosNominaClient({
  periods,
  selectedPeriodId,
  ownerRows,
}: {
  periods: Period[]
  selectedPeriodId: string
  ownerRows: OwnerRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [openOwner, setOpenOwner] = useState<string | null>(null)
  const [paying, setPaying] = useState<Set<string>>(new Set())
  const [payFor, setPayFor] = useState<{ entryId: string; currency: 'EFECTIVO' | 'USDT' } | null>(null)
  const [payAmt, setPayAmt] = useState('')

  function computeTruckSaldos(truck: TruckRow, ownerType?: string, isNPROwner?: boolean) {
    const isAfiliado = ownerType === 'AFILIADO'
    const totalGross = truck.auruminGross + truck.lpGross
    const nprAurumin = totalGross > 0
      ? Math.round(truck.nprFee * (truck.auruminGross / totalGross) * 100) / 100
      : 0
    const nprLP = truck.nprFee - nprAurumin
    // Para isNPROwner (José) el NPR se SUMA (es ingreso); para los demás se resta
    const nprSignAurumin = isNPROwner ? nprAurumin : -nprAurumin
    const nprSignLP      = isNPROwner ? nprLP      : -nprLP
    // Afiliados pagan sus choferes directo — driverWage es informativo, no se descuenta
    let auruminSaldo = Math.round((
      (truck.saldoInicial ?? 0)
      + truck.auruminGross - truck.commFee - (isAfiliado ? 0 : truck.driverWage)
      - truck.mechFee - truck.adminFee + nprSignAurumin - truck.abono
    ) * 100) / 100
    // LP cubre el déficit de Aurumin cuando ya fue pagado en efectivo
    if (truck.paidAt && auruminSaldo < 0) auruminSaldo = 0
    const lpSaldo = truck.paidAt
      ? 0
      : Math.round((truck.lpGross + nprSignLP - truck.deductions) * 100) / 100
    return { auruminSaldo, lpSaldo, nprAurumin, nprLP }
  }

  async function handlePayment(entryId: string, currency: 'EFECTIVO' | 'USDT') {
    const amount = parseFloat(payAmt.replace(',', '.'))
    if (!amount || amount <= 0) return
    setPaying(prev => new Set(prev).add(entryId))
    await registerPayment(entryId, amount, currency)
    setPayFor(null)
    setPayAmt('')
    setPaying(prev => { const s = new Set(prev); s.delete(entryId); return s })
    router.refresh()
  }

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId)

  const grandTotals = ownerRows.reduce(
    (acc, row) => ({
      auruminGross: acc.auruminGross + row.totals.auruminGross,
      lpGross: acc.lpGross + row.totals.lpGross,
      commFee: acc.commFee + row.totals.commFee,
      mechFee: acc.mechFee + row.totals.mechFee,
      adminFee: acc.adminFee + row.totals.adminFee,
      nprFee: acc.nprFee + row.totals.nprFee,
      driverWage: acc.driverWage + row.totals.driverWage,
      deductions: acc.deductions + row.totals.deductions,
      saldoInicial: acc.saldoInicial + row.totals.saldoInicial,
      abono: acc.abono + row.totals.abono,
      netAmount: acc.netAmount + row.totals.netAmount,
      totalTons: acc.totalTons + row.totals.totalTons,
    }),
    { auruminGross: 0, lpGross: 0, commFee: 0, mechFee: 0, adminFee: 0, nprFee: 0,
      driverWage: 0, deductions: 0, saldoInicial: 0, abono: 0, netAmount: 0, totalTons: 0 }
  )

  function handlePeriodChange(id: string) {
    setOpenOwner(null)
    startTransition(() => {
      router.push(`/nomina/duenos?period=${id}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/nomina" className="text-zinc-500 hover:text-white transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">Saldos por dueño</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {selectedPeriod
                ? periodLabel(selectedPeriod.startDate, selectedPeriod.endDate)
                : 'Sin período seleccionado'
              }
            </p>
          </div>
        </div>

        {/* Period selector */}
        <select
          value={selectedPeriodId}
          onChange={e => handlePeriodChange(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 flex-shrink-0"
        >
          {periods.map(p => (
            <option key={p.id} value={p.id}>
              {fmtDate(p.startDate)} — {fmtDate(p.endDate)}
              {p.status === 'OPEN' ? ' (abierto)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Summary KPIs */}
      {ownerRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-xs">Aurumin total</p>
            <p className="text-amber-400 font-bold text-lg mt-1">${fmt(grandTotals.auruminGross)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-xs">Luis Peña total</p>
            <p className="text-blue-400 font-bold text-lg mt-1">${fmt(grandTotals.lpGross)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-xs">Total gastos</p>
            <p className="text-red-400 font-bold text-lg mt-1">
              ${fmt(grandTotals.commFee + grandTotals.mechFee + grandTotals.adminFee + grandTotals.nprFee + grandTotals.driverWage + grandTotals.deductions)}
            </p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-300 text-xs">Total a pagar dueños</p>
            <p className={`font-bold text-lg mt-1 ${grandTotals.netAmount < 0 ? 'text-red-400' : 'text-amber-400'}`}>
              ${fmt(grandTotals.netAmount)}
            </p>
          </div>
        </div>
      )}

      {/* Owner table */}
      {ownerRows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-14 text-center">
          <p className="text-zinc-500 text-sm">No hay nómina generada para este período.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ownerRows.map(row => {
            const isOpen = openOwner === row.owner.id
            const t = row.totals
            const totalGastos = t.commFee + t.mechFee + t.adminFee + t.nprFee + t.driverWage + t.deductions
            const hasTireDebt = row.tireDebts.length > 0
            const totalTireDebt = row.tireDebts.reduce((s, d) => s + d.balance, 0)

            return (
              <div
                key={row.owner.id}
                className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${
                  isOpen ? 'border-zinc-700' : 'border-zinc-800'
                }`}
              >
                {/* Main row */}
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  onClick={() => setOpenOwner(prev => prev === row.owner.id ? null : row.owner.id)}
                >
                  <span className={`text-zinc-500 text-xs transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>

                  {/* Name + type */}
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <span className="text-white font-semibold text-sm">{row.owner.name}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${TYPE_STYLE[row.owner.type]}`}>
                      {row.owner.type === 'PROPIO' ? 'Propio' : 'Afiliado'}
                    </span>
                  </div>

                  {/* Truck plates */}
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    {row.trucks.map(t => (
                      <span key={t.truckId}
                        className="text-xs font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded">
                        {t.plate}
                      </span>
                    ))}
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Financial summary */}
                  {(() => {
                    const ownerSaldo = row.trucks.reduce((sum, tr) => {
                      const { auruminSaldo, lpSaldo } = computeTruckSaldos(tr, row.owner.type, row.owner.isNPROwner)
                      return sum + auruminSaldo + lpSaldo
                    }, 0)
                    const allLpPaid = row.trucks.filter(tr => tr.lpGross > 0).every(tr => tr.paidAt)
                    return (
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        {t.auruminGross > 0 && (
                          <div className="text-right">
                            <p className="text-zinc-500">Aurumin</p>
                            <p className="text-amber-400 font-semibold font-mono">${fmt(t.auruminGross)}</p>
                          </div>
                        )}
                        {t.lpGross > 0 && (
                          <div className="text-right">
                            <p className="text-zinc-500">LP</p>
                            <p className={`font-semibold font-mono ${allLpPaid ? 'text-zinc-500 line-through' : 'text-blue-400'}`}>
                              ${fmt(t.lpGross)}
                            </p>
                            {allLpPaid && <p className="text-emerald-500 text-[10px]">pagado</p>}
                          </div>
                        )}
                        {totalGastos > 0 && (
                          <div className="text-right">
                            <p className="text-zinc-500">Gastos</p>
                            <p className="text-red-400 font-semibold font-mono">-${fmt(totalGastos)}</p>
                          </div>
                        )}
                        {hasTireDebt && (
                          <div className="text-right">
                            <p className="text-zinc-500">Cauchos debe</p>
                            <p className="text-orange-400 font-semibold font-mono">-${fmt(totalTireDebt)}</p>
                          </div>
                        )}
                        <div className="text-right min-w-[80px]">
                          <p className="text-zinc-500">Saldo</p>
                          <p className={`font-bold font-mono text-sm ${ownerSaldo < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {ownerSaldo < 0 ? '-' : ''}${fmt(Math.abs(ownerSaldo))}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-zinc-800 px-4 py-4 space-y-5">

                    {/* Per-truck breakdown */}
                    {row.trucks.map(truck => {
                      const { auruminSaldo, lpSaldo, nprAurumin, nprLP } = computeTruckSaldos(truck, row.owner.type, row.owner.isNPROwner)
                      const lpRawSaldo = Math.round((truck.lpGross - nprLP - truck.deductions) * 100) / 100

                      return (
                        <div key={truck.truckId} className="space-y-3">
                          {/* Truck header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-white font-bold text-sm">{truck.plate}</span>
                              <span className="text-zinc-500 text-xs">{truck.driverName}</span>
                              {truck.paidAt && (
                                <span className="text-emerald-400 text-xs bg-emerald-400/10 px-1.5 py-0.5 rounded-full">✓ Pagado</span>
                              )}
                            </div>
                            <Link
                              href={`/nomina/${selectedPeriodId}/truck/${truck.truckId}`}
                              className="text-xs text-zinc-500 hover:text-amber-400 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              Ver relación →
                            </Link>
                          </div>

                          {/* Aurumin + LP side-by-side */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Aurumin column */}
                            {truck.auruminGross > 0 && (
                              <div className="bg-zinc-800/40 rounded-xl p-3 space-y-1.5">
                                <p className="text-amber-400 text-xs font-bold uppercase tracking-widest">Aurumin</p>
                                {(truck.saldoInicial ?? 0) !== 0 && (
                                  <FinRow label="Saldo anterior"
                                    value={`${truck.saldoInicial < 0 ? '-' : ''}$${fmt(Math.abs(truck.saldoInicial))}`}
                                    color={truck.saldoInicial < 0 ? 'text-red-400' : 'text-emerald-400'}
                                  />
                                )}
                                <FinRow label="Facturación"     value={`$${fmt(truck.auruminGross)}`}   color="text-white" />
                                {truck.commFee > 0    && <FinRow label="Gastos op."     value={`-$${fmt(truck.commFee)}`}    color="text-red-400" />}
                                {truck.driverWage > 0 && (
                                  row.owner.type === 'AFILIADO'
                                    ? <FinRow label="Nóm. chofer (directo)" value={`$${fmt(truck.driverWage)}`} color="text-zinc-500" />
                                    : <FinRow label="Nóm. chofer"           value={`-$${fmt(truck.driverWage)}`} color="text-orange-400" />
                                )}
                                {truck.mechFee > 0    && <FinRow label="Nóm. mecánico" value={`-$${fmt(truck.mechFee)}`}    color="text-purple-400" />}
                                {truck.adminFee > 0   && <FinRow label="Administrativo" value={`-$${fmt(truck.adminFee)}`}  color="text-zinc-400" />}
                                {nprAurumin > 0 && (row.owner.isNPROwner
                                  ? <FinRow label={`${row.owner.nprPercent}% NPR (ingreso)`} value={`+$${fmt(nprAurumin)}`} color="text-emerald-400" />
                                  : <FinRow label={`${row.owner.nprPercent}% NPR`}           value={`-$${fmt(nprAurumin)}`} color="text-red-400" />
                                )}
                                {truck.abono > 0      && <FinRow label="Abono recibido" value={`-$${fmt(truck.abono)}`}    color="text-emerald-400" />}
                                <div className="border-t border-zinc-700 pt-1.5 flex justify-between items-center">
                                  <span className="text-white text-xs font-semibold">Saldo Aurumin</span>
                                  <span className={`font-mono font-bold text-sm ${auruminSaldo < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {auruminSaldo < 0 ? '-' : ''}${fmt(Math.abs(auruminSaldo))}
                                  </span>
                                </div>
                                {/* Botón pago Aurumin (USDT) */}
                                {payFor?.entryId === truck.payrollEntryId && payFor.currency === 'USDT' ? (
                                  <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="number" min="0" step="0.01"
                                      value={payAmt}
                                      onChange={e => setPayAmt(e.target.value)}
                                      placeholder="Monto $"
                                      className="flex-1 bg-zinc-700 border border-zinc-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500 w-0"
                                      autoFocus
                                    />
                                    <button
                                      disabled={paying.has(truck.payrollEntryId)}
                                      onClick={() => handlePayment(truck.payrollEntryId, 'USDT')}
                                      className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">
                                      ✓
                                    </button>
                                    <button onClick={() => { setPayFor(null); setPayAmt('') }}
                                      className="bg-zinc-700 hover:bg-zinc-600 text-zinc-400 text-xs rounded-lg px-2 py-1.5 transition-colors">
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={e => { e.stopPropagation(); setPayFor({ entryId: truck.payrollEntryId, currency: 'USDT' }); setPayAmt(auruminSaldo.toFixed(2)) }}
                                    className="w-full text-xs text-amber-500 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 rounded-lg py-1.5 transition-colors mt-1">
                                    + Registrar pago Aurumin (USDT)
                                  </button>
                                )}
                              </div>
                            )}

                            {/* NPR column — solo A15AE9Y (isNPROwner sin viajes) */}
                            {row.owner.isNPROwner && truck.auruminGross === 0 && truck.lpGross === 0 && truck.nprFee > 0 && (
                              <div className="bg-zinc-800/40 rounded-xl p-3 space-y-1.5">
                                <p className="text-violet-400 text-xs font-bold uppercase tracking-widest">NPR — Fondo de reposición</p>
                                {(truck.saldoInicial ?? 0) !== 0 && (
                                  <FinRow label="Saldo anterior"
                                    value={`${truck.saldoInicial < 0 ? '-' : ''}$${fmt(Math.abs(truck.saldoInicial))}`}
                                    color={truck.saldoInicial < 0 ? 'text-red-400' : 'text-emerald-400'}
                                  />
                                )}
                                <FinRow label="NPR recaudado" value={`+$${fmt(truck.nprFee)}`}    color="text-emerald-400" />
                                {truck.commFee > 0 && (
                                  <FinRow label="Gastos NPR"  value={`-$${fmt(truck.commFee)}`}  color="text-red-400" />
                                )}
                                {truck.abono > 0 && (
                                  <FinRow label="Abono"       value={`-$${fmt(truck.abono)}`}    color="text-emerald-400" />
                                )}
                                <div className="border-t border-zinc-700 pt-1.5 flex justify-between items-center">
                                  <span className="text-white text-xs font-semibold">Saldo NPR</span>
                                  <span className={`font-mono font-bold text-sm ${truck.netAmount < 0 ? 'text-red-400' : 'text-violet-400'}`}>
                                    {truck.netAmount < 0 ? '-' : ''}${fmt(Math.abs(truck.netAmount))}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* LP column */}
                            {truck.lpGross > 0 && (
                              <div className="bg-zinc-800/40 rounded-xl p-3 space-y-1.5">
                                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Luis Peña</p>
                                <FinRow label="Saldo anterior"   value="$0.00"                    color="text-zinc-600" />
                                <FinRow label="Facturación"       value={`$${fmt(truck.lpGross)}`} color="text-white" />
                                {nprLP > 0 && (row.owner.isNPROwner
                                  ? <FinRow label={`${row.owner.nprPercent}% NPR (ingreso)`} value={`+$${fmt(nprLP)}`} color="text-emerald-400" />
                                  : <FinRow label={`${row.owner.nprPercent}% NPR`}           value={`-$${fmt(nprLP)}`} color="text-red-400" />
                                )}
                                {truck.deductions > 0 && <FinRow label="Repuesto/Préstamo" value={`-$${fmt(truck.deductions)}`} color="text-red-400" />}
                                <div className="border-t border-zinc-700 pt-1.5 flex justify-between items-center">
                                  <span className="text-white text-xs font-semibold">Saldo LP</span>
                                  {truck.paidAt ? (
                                    <span className="text-emerald-400 text-xs font-semibold">✓ Pagado en efectivo</span>
                                  ) : (
                                    <span className="font-mono font-bold text-sm text-blue-400">
                                      ${fmt(lpRawSaldo)}
                                    </span>
                                  )}
                                </div>
                                {/* Botón pago LP (efectivo) */}
                                {!truck.paidAt && (
                                  payFor?.entryId === truck.payrollEntryId && payFor.currency === 'EFECTIVO' ? (
                                    <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="number" min="0" step="0.01"
                                        value={payAmt}
                                        onChange={e => setPayAmt(e.target.value)}
                                        placeholder="Monto $"
                                        className="flex-1 bg-zinc-700 border border-zinc-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 w-0"
                                        autoFocus
                                      />
                                      <button
                                        disabled={paying.has(truck.payrollEntryId)}
                                        onClick={e => { e.stopPropagation(); handlePayment(truck.payrollEntryId, 'EFECTIVO') }}
                                        className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">
                                        ✓
                                      </button>
                                      <button onClick={() => { setPayFor(null); setPayAmt('') }}
                                        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-400 text-xs rounded-lg px-2 py-1.5 transition-colors">
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={e => { e.stopPropagation(); setPayFor({ entryId: truck.payrollEntryId, currency: 'EFECTIVO' }); setPayAmt(lpRawSaldo.toFixed(2)) }}
                                      className="w-full text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg py-1.5 transition-colors">
                                      ✓ Pagar LP en efectivo
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          {/* Net total for this truck */}
                          <div className="flex justify-between items-center px-1">
                            <span className="text-zinc-400 text-xs">Total a cobrar — {truck.plate}</span>
                            <span className={`font-bold font-mono ${truck.netAmount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {truck.netAmount < 0 ? '-' : ''}${fmt(Math.abs(truck.netAmount))}
                            </span>
                          </div>

                          {/* Expenses detail */}
                          {truck.expenses.length > 0 && (
                            <div>
                              <p className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1.5">Gastos del período</p>
                              <div className="bg-zinc-800/30 rounded-xl overflow-hidden">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {truck.expenses.map((exp, i) => (
                                      <tr key={i} className="border-b border-zinc-700/40 last:border-0">
                                        <td className="px-3 py-1.5 text-zinc-500">{fmtDate(exp.date)}</td>
                                        <td className="px-3 py-1.5 text-zinc-400">{CATEGORY_LABEL[exp.category] ?? exp.category}</td>
                                        <td className="px-3 py-1.5 text-zinc-300 flex-1">{exp.description}</td>
                                        <td className="px-3 py-1.5 text-right text-red-400 font-mono">-${fmt(exp.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Divider between trucks */}
                          {row.trucks.indexOf(truck) < row.trucks.length - 1 && (
                            <div className="border-t border-zinc-800 pt-1" />
                          )}
                        </div>
                      )
                    })}

                    {/* Owner total */}
                    {(() => {
                      const ownerSaldo = row.trucks.reduce((sum, tr) => {
                        const { auruminSaldo, lpSaldo } = computeTruckSaldos(tr, row.owner.type, row.owner.isNPROwner)
                        return sum + auruminSaldo + lpSaldo
                      }, 0)
                      return (
                        <div className="bg-zinc-800/60 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="text-zinc-400 text-xs">Total {row.owner.name}</p>
                            <div className="flex gap-4 text-xs">
                              {row.totals.auruminGross > 0 && (
                                <span className="text-amber-400">Aurumin: ${fmt(row.totals.auruminGross)}</span>
                              )}
                              {row.totals.lpGross > 0 && (
                                <span className={row.trucks.filter(t=>t.lpGross>0).every(t=>t.paidAt) ? 'text-zinc-500 line-through' : 'text-blue-400'}>
                                  LP: ${fmt(row.totals.lpGross)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-zinc-500 text-xs">Saldo pendiente</p>
                            <p className={`font-bold font-mono text-lg ${ownerSaldo < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {ownerSaldo < 0 ? '-' : ''}${fmt(Math.abs(ownerSaldo))}
                            </p>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Tire debts */}
                    {row.tireDebts.length > 0 && (
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-2">Deuda de cauchos</p>
                        <div className="space-y-2">
                          {row.tireDebts.map(debt => (
                            <div key={debt.id} className="bg-zinc-800/40 rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-white text-sm font-medium">
                                    {debt.quantity} {debt.tireType.toUpperCase()}
                                  </p>
                                  {debt.notes && (
                                    <p className="text-zinc-500 text-xs mt-0.5">{debt.notes}</p>
                                  )}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  debt.status === 'PARTIAL'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {debt.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-zinc-500">Total</p>
                                  <p className="text-white font-mono">${fmt(debt.totalAmount)}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Abonado</p>
                                  <p className="text-emerald-400 font-mono">${fmt(debt.amountPaid)}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Debe</p>
                                  <p className="text-red-400 font-mono font-semibold">${fmt(debt.balance)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Grand total row */}
          <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Total general</p>
              <div className="flex gap-4 mt-1 text-xs">
                <span className="text-amber-400">Aurumin: ${fmt(grandTotals.auruminGross)}</span>
                {grandTotals.lpGross > 0 && <span className="text-blue-400">LP: ${fmt(grandTotals.lpGross)}</span>}
                <span className="text-red-400">
                  Gastos: -${fmt(grandTotals.commFee + grandTotals.mechFee + grandTotals.adminFee + grandTotals.nprFee + grandTotals.driverWage + grandTotals.deductions)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs">Total a pagar</p>
              <p className={`font-bold font-mono text-xl ${grandTotals.netAmount < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {grandTotals.netAmount < 0 ? '-' : ''}${fmt(Math.abs(grandTotals.netAmount))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FinRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
