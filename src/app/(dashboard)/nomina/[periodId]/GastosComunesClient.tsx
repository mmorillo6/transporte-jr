'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { applyGastosComunes } from '@/app/actions/expenses'

type Item = { description: string; category: string; amount: string }

const DEFAULTS: Item[] = [
  { description: 'NOMINA MECANICOS', category: 'MECANICA',      amount: '' },
  { description: 'STARLINK',         category: 'ADMINISTRATIVO', amount: '10.91' },
  { description: 'GASTOS COMUNES',   category: 'OPERATIVO',      amount: '3.80'  },
]

export default function GastosComunesClient({
  periodId,
  periodEnd,
  truckCount,
}: {
  periodId: string
  periodEnd: string
  truckCount: number
}) {
  const [open, setOpen]     = useState(false)
  const [items, setItems]   = useState<Item[]>(DEFAULTS)
  const [saving, setSaving] = useState(false)

  function update(i: number, field: keyof Item, val: string) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  function perTruck(amount: string) {
    const n = parseFloat(amount)
    if (!n || truckCount === 0) return '—'
    return `$${(n / truckCount).toFixed(2)}`
  }

  async function handleApply() {
    const valid = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0)
    if (valid.length === 0) { toast.error('Ingresa al menos un monto'); return }
    if (truckCount === 0) { toast.error('No hay camiones con nómina en este período'); return }

    setSaving(true)
    const res = await applyGastosComunes(
      periodId,
      valid.map(it => ({
        description: it.description.trim().toUpperCase(),
        category:    it.category,
        totalAmount: parseFloat(it.amount),
        date:        periodEnd,
      }))
    )
    setSaving(false)

    if (res && 'error' in res && res.error) { toast.error(res.error); return }
    if (res && 'created' in res) {
      toast.success(`${res.created} gasto(s) creados — divididos entre ${truckCount} camiones`)
      setItems(DEFAULTS.map(d => ({ ...d })))
      setOpen(false)
    }
  }

  const totalNuevo = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos comunes del período</span>
          <span className="text-zinc-500 text-xs">Starlink, gastos comunes — divididos entre {truckCount} camiones</span>
        </div>
        <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          <p className="text-zinc-500 text-xs">
            Ingresa el monto total de cada gasto. El sistema lo divide entre los {truckCount} camiones activos del período y crea un gasto individual por camión.
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-zinc-500 text-xs font-medium pb-2 pr-3">Descripción</th>
                <th className="text-left text-zinc-500 text-xs font-medium pb-2 pr-3 w-36">Categoría</th>
                <th className="text-right text-zinc-500 text-xs font-medium pb-2 pr-3 w-28">Total ($)</th>
                <th className="text-right text-zinc-500 text-xs font-medium pb-2 w-24">Por camión</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-1.5 pr-3">
                    <input
                      type="text"
                      value={it.description}
                      onChange={e => update(i, 'description', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 uppercase placeholder:normal-case"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <select
                      value={it.category}
                      onChange={e => update(i, 'category', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                    >
                      {['REPUESTO','MECANICA','ACEITE','CAUCHO','OPERATIVO','ADMINISTRATIVO','OTRO'].map(c => (
                        <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      value={it.amount}
                      onChange={e => update(i, 'amount', e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-amber-500"
                    />
                  </td>
                  <td className="py-1.5 text-right text-amber-400 text-xs font-mono font-medium">
                    {perTruck(it.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-zinc-600 text-xs">
              Cada gasto se asigna con fecha de fin de período ({periodEnd}).
            </p>
            <div className="flex items-center gap-4">
              {totalNuevo > 0 && (
                <div className="text-sm">
                  <span className="text-zinc-500">Total: </span>
                  <span className="text-white font-bold">${totalNuevo.toFixed(2)}</span>
                  <span className="text-zinc-500 ml-2">→ </span>
                  <span className="text-amber-400 font-bold">${(totalNuevo / truckCount).toFixed(2)} c/u</span>
                </div>
              )}
              <button
                onClick={handleApply}
                disabled={saving || truckCount === 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors"
              >
                {saving ? 'Aplicando...' : `Aplicar a ${truckCount} camiones`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
