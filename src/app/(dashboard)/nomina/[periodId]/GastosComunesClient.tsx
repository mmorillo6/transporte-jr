'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { applyGastosComunes } from '@/app/actions/expenses'
import { saveGastosComunesDefaults, type GastoDefault } from '@/app/actions/systemConfig'

export default function GastosComunesClient({
  periodId,
  periodEnd,
  truckCount,
  propioCount,
  defaults,
  autoOpen = false,
}: {
  periodId: string
  periodEnd: string
  truckCount: number
  propioCount: number
  defaults: GastoDefault[]
  autoOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen]     = useState(autoOpen)
  const [items, setItems]   = useState<GastoDefault[]>(defaults.map(d => ({ ...d })))
  const [saving, setSaving] = useState(false)

  function update(i: number, field: keyof GastoDefault, val: string | boolean) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  function perTruck(amount: string, includeAfiliados: boolean) {
    const n = parseFloat(amount)
    const count = includeAfiliados ? truckCount : propioCount
    if (!n || count === 0) return '—'
    return `$${(n / count).toFixed(2)}`
  }

  async function handleSaveDefault() {
    const res = await saveGastosComunesDefaults(items)
    if (res && 'error' in res) toast.error(res.error)
    else toast.success('Valores guardados como predeterminados')
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
      const anyAfiliados = valid.some(it => it.includeAfiliados)
      const anyPropios   = valid.some(it => !it.includeAfiliados)
      const countLabel = anyAfiliados && anyPropios
        ? `${(res as any).totalCount} camiones (mixto)`
        : anyAfiliados
        ? `${(res as any).totalCount} camiones (todos)`
        : `${(res as any).propioCount} camiones propios`
      toast.success(`${res.created} gasto(s) creados — divididos entre ${countLabel}`)
      setOpen(false)
      router.refresh()
    }
  }

  const totalNuevo = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)

  const inputRow = (it: GastoDefault, i: number) => ({
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
    per: <span className="text-amber-400 text-xs font-mono font-medium">{perTruck(it.amount, it.includeAfiliados)}</span>,
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
    <div className={`border rounded-2xl overflow-hidden transition-colors ${autoOpen && open ? 'bg-zinc-900 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Aquí entran los mecánicos y gastos compartidos. Ingresa el monto total y la app lo divide entre los camiones automáticamente."
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos comunes del período</span>
          {autoOpen && open && (
            <span className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Pendiente</span>
          )}
          <span className="text-zinc-500 text-xs">Mecánicos, Starlink, grasa — {propioCount} propios · {truckCount} total</span>
        </div>
        <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          {autoOpen && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
              <p className="text-amber-300 text-xs font-semibold">¿Qué va aquí?</p>
              <ul className="text-amber-400/80 text-xs space-y-1 leading-relaxed">
                <li><span className="text-amber-300 font-medium">Starlink</span> — costo del mes ÷ 2 (una quincena)</li>
                <li><span className="text-amber-300 font-medium">Grasa / lubricantes</span> — compra compartida entre todos</li>
                <li><span className="text-amber-300 font-medium">Gasolina general</span> — gasolina del depósito u operativa</li>
                <li><span className="text-amber-300 font-medium">Otros gastos comunes</span> — cualquier gasto que aplique a todos</li>
              </ul>
              <p className="text-amber-400/60 text-xs">El sistema divide el monto entre los camiones seleccionados automáticamente.</p>
            </div>
          )}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 space-y-1">
            <p className="text-zinc-300 text-xs font-semibold">¿Qué va aquí?</p>
            <p className="text-zinc-500 text-xs">
              <span className="text-amber-400 font-medium">Mecánicos</span> — entra el monto total de la quincena. La app divide entre los propios automáticamente.<br />
              <span className="text-zinc-400 font-medium">Starlink, grasa, gasoil de depósito</span> — cualquier gasto compartido entre varios camiones.<br />
              Después de aplicar, presiona <span className="text-amber-400 font-medium">Recalcular</span> para que aparezca en la nómina.
            </p>
          </div>

          {/* Mobile: cards */}
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
            <button
              onClick={handleSaveDefault}
              className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors"
            >
              Guardar como predeterminado
            </button>
            <div className="flex items-center gap-4">
              {totalNuevo > 0 && (
                <div className="text-sm">
                  <span className="text-zinc-500">Total: </span>
                  <span className="text-white font-bold">${totalNuevo.toFixed(2)}</span>
                </div>
              )}
              {(() => {
                const valid     = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0)
                const allPropios = valid.length > 0 && valid.every(it => !it.includeAfiliados)
                const allTodos   = valid.length > 0 && valid.every(it =>  it.includeAfiliados)
                const label = saving          ? 'Aplicando...'
                  : valid.length === 0        ? 'Aplicar'
                  : allPropios                ? `Aplicar a ${propioCount} propios`
                  : allTodos                  ? `Aplicar a ${truckCount} camiones (todos)`
                  :                             `Aplicar (${propioCount} propios / ${truckCount} total)`
                return (
                  <button
                    onClick={handleApply}
                    disabled={saving || truckCount === 0}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors"
                  >
                    {label}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
