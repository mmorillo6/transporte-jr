'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCashEntry, deleteCashEntry, registrarApertura, createSocioLoan, markSocioLoanPaid, deleteSocioLoan } from '@/app/actions/cash'
import { toast } from 'sonner'

type Entry = {
  id: string
  date: string
  type: 'INGRESO' | 'EGRESO'
  currency: 'EFECTIVO' | 'USDT'
  amount: number
  concept: string
  source: string | null
  notes: string | null
}

type SocioLoan = {
  id: string
  creditor: string
  amount: number
  currency: 'EFECTIVO' | 'USDT'
  concept: string
  date: string
  status: 'PENDIENTE' | 'PAGADO'
  paidDate: string | null
  notes: string | null
}

const SOURCES = ['Aurumin', 'Chino Peña', 'Nómina', 'Repuesto', 'Mecánica', 'Proveedor', 'Otro']
const SOCIOS  = ['José Rodríguez', 'Chino Peña', 'Mary', 'Otro']

export default function CajaClient({
  entries,
  balanceEfectivo,
  balanceUsdt,
  hideSaldoCards = false,
  socioLoans = [],
}: {
  entries: Entry[]
  balanceEfectivo: number
  balanceUsdt: number
  hideSaldoCards?: boolean
  socioLoans?: SocioLoan[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO')
  const [moneda, setMoneda] = useState<'EFECTIVO' | 'USDT'>('EFECTIVO')
  const [filterCurrency, setFilterCurrency] = useState<'ALL' | 'EFECTIVO' | 'USDT'>('ALL')
  const [showAjuste, setShowAjuste] = useState(false)
  const [ajusteEfectivo, setAjusteEfectivo] = useState('')
  const [ajusteUsdt, setAjusteUsdt] = useState('')
  const [loadingAjuste, setLoadingAjuste] = useState(false)
  const [showSocioForm, setShowSocioForm] = useState(false)
  const [loadingSocio, setLoadingSocio] = useState(false)
  const [socioMoneda, setSocioMoneda] = useState<'EFECTIVO' | 'USDT'>('EFECTIVO')
  const [showPaid, setShowPaid] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const res = await createCashEntry(fd)
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Movimiento registrado')
    setShowForm(false)
    router.refresh()
  }

  async function handleAjuste() {
    const ef = parseFloat(ajusteEfectivo)
    const us = ajusteUsdt !== '' ? parseFloat(ajusteUsdt) : undefined
    if (isNaN(ef)) { toast.error('Ingresa el saldo de efectivo'); return }
    if (us !== undefined && isNaN(us)) { toast.error('Monto USDT inválido'); return }
    setLoadingAjuste(true)
    const res = await registrarApertura(ef, us)
    setLoadingAjuste(false)
    if (!res.ok) { toast.error('Error al ajustar'); return }
    toast.success(res.adjusted > 0 ? 'Saldo ajustado correctamente' : 'No se necesitó ajuste — el saldo ya era correcto')
    setShowAjuste(false)
    router.refresh()
  }

  async function handleDelete(id: string, concept: string) {
    if (!confirm(`¿Eliminar "${concept}"?`)) return
    await deleteCashEntry(id)
    router.refresh()
  }

  async function handleSocioSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoadingSocio(true)
    const fd = new FormData(e.currentTarget)
    const res = await createSocioLoan(fd)
    setLoadingSocio(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Préstamo de socio registrado')
    setShowSocioForm(false)
    router.refresh()
  }

  async function handleSocioPaid(id: string, creditor: string) {
    if (!confirm(`¿Marcar préstamo de ${creditor} como PAGADO?`)) return
    const res = await markSocioLoanPaid(id)
    if (!res.ok) { toast.error('Error al actualizar'); return }
    toast.success('Marcado como pagado')
    router.refresh()
  }

  async function handleSocioDelete(id: string, creditor: string) {
    if (!confirm(`¿Eliminar préstamo de ${creditor}?`)) return
    await deleteSocioLoan(id)
    router.refresh()
  }

  const filtered = filterCurrency === 'ALL' ? entries : entries.filter(e => e.currency === filterCurrency)
  const pendingSocioLoans = socioLoans.filter(l => l.status === 'PENDIENTE')
  const paidSocioLoans    = socioLoans.filter(l => l.status === 'PAGADO')

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

  return (
    <div className="space-y-4">
      {/* Saldo cards — solo cuando se usa de forma independiente */}
      {!hideSaldoCards && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">Efectivo en mano</p>
            <p className={`text-2xl font-bold ${balanceEfectivo >= 0 ? 'text-white' : 'text-red-400'}`}>
              {balanceEfectivo < 0 ? '-' : ''}{fmt(balanceEfectivo)}
            </p>
            <p className="text-zinc-600 text-xs mt-1">USD billete</p>
          </div>
          <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">USDT en wallet</p>
            <p className={`text-2xl font-bold ${balanceUsdt >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
              {balanceUsdt < 0 ? '-' : ''}{fmt(balanceUsdt)}
            </p>
            <p className="text-zinc-600 text-xs mt-1">Tether / Binance</p>
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['ALL', 'EFECTIVO', 'USDT'] as const).map(c => (
            <button key={c} onClick={() => setFilterCurrency(c)}
              className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${filterCurrency === c ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
              {c === 'ALL' ? 'Todos' : c}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setAjusteEfectivo(balanceEfectivo.toFixed(2)); setAjusteUsdt(balanceUsdt.toFixed(2)); setShowAjuste(true) }}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white font-medium rounded-xl px-4 py-2 text-sm transition-colors">
            Ajustar saldo
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
            + Movimiento
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Registrar movimiento</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo + Moneda */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo *</label>
                <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                  {(['INGRESO', 'EGRESO'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTipo(t)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${tipo === t
                        ? t === 'INGRESO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
                      {t === 'INGRESO' ? '+ Ingreso' : '− Egreso'}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="type" value={tipo} />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1.5">Moneda *</label>
                <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                  {(['EFECTIVO', 'USDT'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMoneda(m)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${moneda === m
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="currency" value={moneda} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                <input name="date" type="date" required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto $ *</label>
                <input name="amount" type="number" step="0.01" min="0.01" required
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Concepto *</label>
              <input name="concept" type="text" required placeholder="Cobro quincena, Pago repuesto..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fuente / Destino</label>
                <select name="source"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">—</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
                <input name="notes" type="text" placeholder="Opcional..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal ajuste de saldo */}
      {showAjuste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Ajustar saldo inicial</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Ingresa los saldos reales. Se creará un ajuste por la diferencia.</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Saldo Efectivo real ($)</label>
                <input
                  type="number" step="0.01"
                  value={ajusteEfectivo}
                  onChange={e => setAjusteEfectivo(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                />
                <p className="text-zinc-600 text-xs mt-1">Sistema actual: ${balanceEfectivo.toFixed(2)}</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Saldo USDT real ($)</label>
                <input
                  type="number" step="0.01"
                  value={ajusteUsdt}
                  onChange={e => setAjusteUsdt(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                />
                <p className="text-zinc-600 text-xs mt-1">Sistema actual: ${balanceUsdt.toFixed(2)}</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => setShowAjuste(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleAjuste} disabled={loadingAjuste}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-sm transition-colors">
                {loadingAjuste ? 'Ajustando...' : 'Aplicar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deudas a socios ─────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-purple-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-sm">Deudas a socios</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              {pendingSocioLoans.length === 0
                ? 'Sin préstamos pendientes de socios'
                : `${pendingSocioLoans.length} préstamo${pendingSocioLoans.length !== 1 ? 's' : ''} pendiente${pendingSocioLoans.length !== 1 ? 's' : ''} — $${pendingSocioLoans.reduce((s, l) => s + l.amount, 0).toFixed(2)}`}
            </p>
          </div>
          <button
            onClick={() => setShowSocioForm(v => !v)}
            className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 font-medium rounded-lg px-3 py-1.5 transition-colors"
          >
            + Registrar
          </button>
        </div>

        {/* Formulario nuevo préstamo de socio */}
        {showSocioForm && (
          <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-800/30">
            <form onSubmit={handleSocioSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Prestamista *</label>
                  <select name="creditor" required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                    {SOCIOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Moneda *</label>
                  <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                    {(['EFECTIVO', 'USDT'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setSocioMoneda(m)}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${socioMoneda === m ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="currency" value={socioMoneda} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Monto $ *</label>
                  <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder:text-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Fecha *</label>
                  <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Concepto *</label>
                <input name="concept" type="text" required placeholder="Ej: Nómina P2 Mayo 2026"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Notas</label>
                <input name="notes" type="text" placeholder="Opcional..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder:text-zinc-600" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loadingSocio}
                  className="bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
                  {loadingSocio ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setShowSocioForm(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista pendientes */}
        {pendingSocioLoans.length === 0 && !showSocioForm ? (
          <div className="px-5 py-6 text-center">
            <p className="text-zinc-600 text-sm">Sin deudas pendientes a socios</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {pendingSocioLoans.map(l => (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{l.creditor}</p>
                  <p className="text-zinc-500 text-xs">{l.concept} · {new Date(l.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</p>
                  {l.notes && <p className="text-zinc-600 text-xs mt-0.5">{l.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-purple-400 font-semibold text-sm">${l.amount.toFixed(2)}</p>
                  <p className="text-zinc-600 text-xs">{l.currency}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleSocioPaid(l.id, l.creditor)}
                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium rounded-lg px-2 py-1 transition-colors"
                    title="Marcar como pagado"
                  >
                    Pagado
                  </button>
                  <button onClick={() => handleSocioDelete(l.id, l.creditor)}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagados (colapsable) */}
        {paidSocioLoans.length > 0 && (
          <div className="border-t border-zinc-800">
            <button
              onClick={() => setShowPaid(v => !v)}
              className="w-full px-5 py-2.5 text-left text-zinc-600 hover:text-zinc-400 text-xs flex items-center gap-2 transition-colors"
            >
              <span>{showPaid ? '▲' : '▼'}</span>
              {paidSocioLoans.length} pagado{paidSocioLoans.length !== 1 ? 's' : ''}
            </button>
            {showPaid && (
              <div className="divide-y divide-zinc-800/30 pb-2">
                {paidSocioLoans.map(l => (
                  <div key={l.id} className="px-5 py-2.5 flex items-center gap-3 opacity-50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-400 text-sm">{l.creditor}</p>
                      <p className="text-zinc-600 text-xs">{l.concept}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-zinc-400 font-semibold text-sm line-through">${l.amount.toFixed(2)}</p>
                      {l.paidDate && <p className="text-zinc-600 text-xs">Pagado {new Date(l.paidDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</p>}
                    </div>
                    <button onClick={() => handleSocioDelete(l.id, l.creditor)}
                      className="text-zinc-700 hover:text-red-400 transition-colors p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Movements table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">Sin movimientos registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Tipo</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Moneda</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Concepto</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fuente</th>
                <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      e.type === 'INGRESO' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                    }`}>
                      {e.type === 'INGRESO' ? '+ Ingreso' : '− Egreso'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      e.currency === 'USDT' ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-300 bg-zinc-700'
                    }`}>
                      {e.currency}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 max-w-xs truncate">{e.concept}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{e.source ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${e.type === 'INGRESO' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {e.type === 'EGRESO' ? '−' : '+'}{fmt(e.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(e.id, e.concept)}
                      className="text-zinc-600 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
