'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCashEntry, deleteCashEntry } from '@/app/actions/cash'
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

const SOURCES = ['Aurumin', 'Chino Peña', 'Nómina', 'Repuesto', 'Mecánica', 'Proveedor', 'Otro']

export default function CajaClient({
  entries,
  balanceEfectivo,
  balanceUsdt,
  hideSaldoCards = false,
}: {
  entries: Entry[]
  balanceEfectivo: number
  balanceUsdt: number
  hideSaldoCards?: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO')
  const [moneda, setMoneda] = useState<'EFECTIVO' | 'USDT'>('EFECTIVO')
  const [filterCurrency, setFilterCurrency] = useState<'ALL' | 'EFECTIVO' | 'USDT'>('ALL')

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

  async function handleDelete(id: string, concept: string) {
    if (!confirm(`¿Eliminar "${concept}"?`)) return
    await deleteCashEntry(id)
    router.refresh()
  }

  const filtered = filterCurrency === 'ALL' ? entries : entries.filter(e => e.currency === filterCurrency)

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
        <button onClick={() => setShowForm(v => !v)}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Movimiento
        </button>
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
