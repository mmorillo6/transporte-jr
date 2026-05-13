'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { applyGastosComunes } from '@/app/actions/expenses'

type Item = { description: string; category: string; amount: string; includeAfiliados: boolean }

const STORAGE_KEY = 'gastos-comunes-defaults'

const FACTORY_DEFAULTS: Item[] = [
  { description: 'NOMINA MECANICOS', category: 'MECANICA',      amount: '',      includeAfiliados: false },
  { description: 'STARLINK',         category: 'ADMINISTRATIVO', amount: '10.91', includeAfiliados: true  },
  { description: 'GASTOS COMUNES',   category: 'OPERATIVO',      amount: '3.80',  includeAfiliados: false },
]

function loadSavedDefaults(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return FACTORY_DEFAULTS.map(d => ({ ...d }))
    return JSON.parse(raw)
  } catch {
    return FACTORY_DEFAULTS.map(d => ({ ...d }))
  }
}

export default function GastosComunesClient({
  periodId,
  periodEnd,
  truckCount,
}: {
  periodId: string
  periodEnd: string
  truckCount: number
}) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [items, setItems]         = useState<Item[]>(FACTORY_DEFAULTS.map(d => ({ ...d })))
  const [saving, setSaving]       = useState(false)
  const [hasCustom, setHasCustom] = useState(false)

  // Load saved defaults on first open
  useEffect(() => {
    if (!open) return
    const saved = loadSavedDefaults()
    setItems(saved)
    try {
      setHasCustom(!!localStorage.getItem(STORAGE_KEY))
    } catch { /* ignore */ }
  }, [open])

  function update(i: number, field: keyof Item, val: string | boolean) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  function perTruck(amount: string) {
    const n = parseFloat(amount)
    if (!n || truckCount === 0) return '—'
    return `$${(n / truckCount).toFixed(2)}`
  }

  function saveAsDefault() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      setHasCustom(true)
      toast.success('Valores guardados como predeterminados')
    } catch {
      toast.error('No se pudieron guardar los predeterminados')
    }
  }

  function resetDefaults() {
    try {
      localStorage.removeItem(STORAGE_KEY)
      setHasCustom(false)
    } catch { /* ignore */ }
    setItems(FACTORY_DEFAULTS.map(d => ({ ...d })))
    toast('Valores restaurados a los originales')
  }

  async function handleApply() {
    const valid = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0)
    if (valid.length === 0) { toast.error('Ingresa al menos un monto'); return }
    if (truckCount === 0) { toast.error('No hay camiones con nómina en este período'); return }

    setSaving(true)
    const res = await applyGastosComunes(
      periodId,
      valid.map(it => ({
        description:      it.description.trim().toUpperCase(),
        category:         it.category,
        totalAmount:      parseFloat(it.amount),
        date:             periodEnd,
        includeAfiliados: it.includeAfiliados,
      }))
    )
    setSaving(false)

    if (res && 'error' in res && res.error) { toast.error(res.error); return }
    if (res && 'created' in res) {
      toast.success(`${res.created} gasto(s) creados — divididos entre ${truckCount} camiones`)
      setItems(loadSavedDefaults())
      setOpen(false)
      router.refresh()
    }
  }

  const totalNuevo = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)

  const inputRow = (it: Item, i: number) => ({
    desc: (
      <input
        type="text"
        value={it.description}
        onChange={e => update(i, 'description', e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 uppercase placeholder:normal-case"
      />
    ),
    cat: (
      <select
        value={it.category}
        onChange={e => update(i, 'category', e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
      >
        {['REPUESTO','MECANICA','ACEITE','CAUCHO','OPERATIVO','ADMINISTRATIVO','OTRO'].map(c => (
          <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
        ))}
      </select>
    ),
    amt: (
      <input
        type="number"
        value={it.amount}
        onChange={e => update(i, 'amount', e.target.value)}
        placeholder="0.00"
        min="0"
        step="0.01"
        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-amber-500"
      />
    ),
    per: <span className="text-amber-400 text-xs font-mono font-medium">{perTruck(it.amount)}</span>,
    toggle: (
      <button
        type="button"
        onClick={() => update(i, 'includeAfiliados', (!it.includeAfiliados) as any)}
        title={it.includeAfiliados ? 'Aplica a todos los carros (propios + afiliados)' : 'Aplica solo a propios'}
        className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${
          it.includeAfiliados
            ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
        }`}
      >
        {it.includeAfiliados ? 'Todos' : 'Propios'}
      </button>
    ),
  })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos comunes del período</span>
          <span className="text-zinc-500 text-xs hidden sm:inline">Starlink, gastos comunes — divididos entre {truckCount} camiones</span>
        </div>
        <div className="flex items-center gap-2">
          {hasCustom && <span className="text-amber-500 text-xs">★ custom</span>}
          <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          <p className="text-zinc-500 text-xs">
            Ingresa el monto total de cada gasto. El sistema lo divide entre los {truckCount} camiones activos del período.
          </p>

          {/* Mobile: cards apiladas */}
          <div className="sm:hidden space-y-3">
            {items.map((it, i) => {
              const row = inputRow(it, i)
              return (
                <div key={i} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3 space-y-2">
                  {row.desc}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">{row.cat}</div>
                    <div className="w-28">{row.amt}</div>
                    <div className="w-14 text-right flex-shrink-0">{row.per}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.toggle}
                    <span className="text-zinc-600 text-xs">
                      {it.includeAfiliados ? '— aplica a todos los carros' : '— solo propios'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: tabla */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-zinc-500 text-xs font-medium pb-2 pr-3">Descripción</th>
                <th className="text-left text-zinc-500 text-xs font-medium pb-2 pr-3 w-36">Categoría</th>
                <th className="text-right text-zinc-500 text-xs font-medium pb-2 pr-3 w-28">Total ($)</th>
                <th className="text-right text-zinc-500 text-xs font-medium pb-2 pr-3 w-24">Por camión</th>
                <th className="text-center text-zinc-500 text-xs font-medium pb-2 w-24">Aplica a</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const row = inputRow(it, i)
                return (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-1.5 pr-3">{row.desc}</td>
                    <td className="py-1.5 pr-3">{row.cat}</td>
                    <td className="py-1.5 pr-3">{row.amt}</td>
                    <td className="py-1.5 pr-3 text-right">{row.per}</td>
                    <td className="py-1.5 text-center">{row.toggle}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={saveAsDefault}
                className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors"
              >
                Guardar como predeterminado
              </button>
              {hasCustom && (
                <button
                  onClick={resetDefaults}
                  className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                >
                  Restaurar originales
                </button>
              )}
            </div>
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
