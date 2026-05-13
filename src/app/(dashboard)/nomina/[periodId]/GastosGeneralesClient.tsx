'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { addGastoGeneral } from '@/app/actions/expenses'

type Row = { description: string; category: string; amount: string }

const CATEGORIES = ['OPERATIVO','ADMINISTRATIVO','MECANICA','REPUESTO','ACEITE','CAUCHO','OTRO']

const EMPTY: Row = { description: '', category: 'OPERATIVO', amount: '' }

export default function GastosGeneralesClient({
  periodId,
  periodEnd,
  existingCount,
}: {
  periodId: string
  periodEnd: string
  existingCount: number
}) {
  const [open, setOpen]     = useState(false)
  const [rows, setRows]     = useState<Row[]>([{ ...EMPTY }])
  const [saving, setSaving] = useState(false)
  const [count, setCount]   = useState(existingCount)

  function updateRow(i: number, field: keyof Row, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { ...EMPTY }])
  }

  function removeRow(i: number) {
    setRows(prev => prev.length === 1 ? [{ ...EMPTY }] : prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    const valid = rows.filter(r => r.description.trim() && parseFloat(r.amount) > 0)
    if (valid.length === 0) { toast.error('Ingresa al menos un gasto con descripción y monto'); return }

    setSaving(true)
    const res = await addGastoGeneral(
      periodId,
      valid.map(r => ({
        description: r.description.trim(),
        category:    r.category,
        amount:      parseFloat(r.amount),
        date:        periodEnd,
      }))
    )
    setSaving(false)

    if (res && 'error' in res && res.error) { toast.error(res.error); return }
    if (res && 'ok' in res && res.ok && 'created' in res && typeof res.created === 'number') {
      setCount(c => c + (res.created as number))
      toast.success(`${res.created} gasto${res.created !== 1 ? 's' : ''} registrado${res.created !== 1 ? 's' : ''}`)
      setRows([{ ...EMPTY }])
    }
  }

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos generales de caja chica</span>
          <span className="text-zinc-500 text-xs hidden sm:inline">Gasolina moto, comida, tizas… sin camión asignado</span>
          {count > 0 && (
            <span className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          <p className="text-zinc-500 text-xs">
            Gastos pagados de caja chica que no pertenecen a ningún camión específico.
            Se registran con la fecha de fin del período.
          </p>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                {/* Descripción */}
                <input
                  type="text"
                  value={row.description}
                  onChange={e => updateRow(i, 'description', e.target.value)}
                  placeholder="Descripción (ej: gasolina moto)"
                  className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 uppercase placeholder:normal-case placeholder:text-zinc-600"
                />
                {/* Categoría */}
                <select
                  value={row.category}
                  onChange={e => updateRow(i, 'category', e.target.value)}
                  className="w-32 flex-shrink-0 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                {/* Monto */}
                <input
                  type="number"
                  value={row.amount}
                  onChange={e => updateRow(i, 'amount', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-24 flex-shrink-0 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-amber-500"
                />
                {/* Eliminar */}
                <button
                  onClick={() => removeRow(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none"
                  title="Eliminar fila"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={addRow}
              className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1 transition-colors"
            >
              <span className="text-base leading-none">+</span> Agregar fila
            </button>
            <div className="flex items-center gap-4">
              {total > 0 && (
                <span className="text-sm text-zinc-500">
                  Total: <span className="text-white font-bold">${total.toFixed(2)}</span>
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2 text-sm transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar gastos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
