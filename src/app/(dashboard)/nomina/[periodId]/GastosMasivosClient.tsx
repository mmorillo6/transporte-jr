'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { createExpensesBulk, getExpensesForPeriodTruck } from '@/app/actions/expenses'

const CATEGORIES = [
  { value: 'REPUESTO',      label: 'Repuesto' },
  { value: 'MECANICA',      label: 'Mecánica' },
  { value: 'ACEITE',        label: 'Aceite' },
  { value: 'CAUCHO',        label: 'Caucho' },
  { value: 'OPERATIVO',     label: 'Operativo' },
  { value: 'ADMINISTRATIVO',label: 'Administrativo' },
  { value: 'OTRO',          label: 'Otro' },
]

type Row = { date: string; description: string; category: string; amount: string }
type Truck = { id: string; plate: string; driverName: string }
type ExistingExpense = { id: string; date: string; description: string; category: string; amount: number }

const emptyRow = (date: string): Row => ({ date, description: '', category: 'REPUESTO', amount: '' })

export default function GastosMasivosClient({
  trucks,
  periodId,
  periodStart,
  periodEnd,
}: {
  trucks: Truck[]
  periodId: string
  periodStart: string
  periodEnd: string
}) {
  const [open, setOpen]           = useState(false)
  const [truckId, setTruckId]     = useState('')
  const [rows, setRows]           = useState<Row[]>([emptyRow(periodStart)])
  const [existing, setExisting]   = useState<ExistingExpense[]>([])
  const [saving, setSaving]       = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)

  const selectedTruck = trucks.find(t => t.id === truckId)
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  async function handleTruckChange(id: string) {
    setTruckId(id)
    if (!id) { setExisting([]); return }
    setLoadingExisting(true)
    const data = await getExpensesForPeriodTruck(periodId, id)
    setExisting(data.map(e => ({
      ...e,
      date: new Date(e.date).toISOString().slice(0, 10),
    })) as ExistingExpense[])
    setLoadingExisting(false)
  }

  function updateRow(i: number, field: keyof Row, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow(periodStart)])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function loadFromCommon() {
    const commons: Row[] = [
      { date: periodEnd, description: 'GASTOS COMUNES', category: 'OPERATIVO', amount: '' },
      { date: periodEnd, description: 'STARLINK',       category: 'ADMINISTRATIVO', amount: '' },
    ]
    setRows(prev => [...prev, ...commons])
  }

  async function handleSave() {
    const valid = rows.filter(r => r.description.trim() && parseFloat(r.amount) > 0 && r.date)
    if (valid.length === 0) { toast.error('Agrega al menos un gasto con monto'); return }
    if (!truckId) { toast.error('Selecciona un camión'); return }

    setSaving(true)
    const res = await createExpensesBulk(valid.map(r => ({
      date:        r.date,
      description: r.description.trim().toUpperCase(),
      category:    r.category,
      amount:      parseFloat(r.amount),
      truckId,
      periodId,
    })))
    setSaving(false)

    if (res?.error) { toast.error(res.error); return }
    toast.success(`${res.created} gasto(s) guardados`)
    setRows([emptyRow(periodStart)])
    // Refresh existing
    const data = await getExpensesForPeriodTruck(periodId, truckId)
    setExisting(data.map(e => ({ ...e, date: new Date(e.date).toISOString().slice(0, 10) })) as ExistingExpense[])
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos operativos del período</span>
          <span className="text-zinc-500 text-xs">Repuestos, mecánica, aceites y demás por camión</span>
        </div>
        <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">

          {/* Selector de camión */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-zinc-400 mb-1.5">Camión</label>
              <select
                value={truckId}
                onChange={e => handleTruckChange(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="">Seleccionar camión...</option>
                {trucks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.plate} — {t.driverName}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadFromCommon}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-xl px-3 py-2 transition-colors"
            >
              + Gastos comunes
            </button>
          </div>

          {/* Gastos ya registrados para este camión/período */}
          {truckId && (
            <div>
              {loadingExisting ? (
                <p className="text-zinc-500 text-xs">Cargando...</p>
              ) : existing.length > 0 ? (
                <div className="bg-zinc-800/40 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs font-medium mb-2">Ya registrados ({existing.length})</p>
                  <div className="space-y-1">
                    {existing.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">{e.date.slice(5)} · {e.description}</span>
                        <span className="text-white font-mono">${e.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-zinc-700 pt-1 flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400">Total registrado</span>
                      <span className="text-amber-400">${existing.reduce((s, e) => s + e.amount, 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-600 text-xs">Sin gastos registrados aún para {selectedTruck?.plate}</p>
              )}
            </div>
          )}

          {/* Filas de entrada — tarjetas en mobile, tabla en desktop */}
          <div className="space-y-3 sm:space-y-0">
            {/* Cabecera visible solo en desktop */}
            <div className="hidden sm:grid grid-cols-[130px_1fr_130px_100px_24px] gap-2 pb-1 border-b border-zinc-700">
              {['Fecha','Descripción','Categoría','Monto $',''].map(h => (
                <span key={h} className="text-zinc-500 text-xs font-medium">{h}</span>
              ))}
            </div>

            {rows.map((row, i) => (
              <div key={i}>
                {/* Mobile: tarjeta apilada */}
                <div className="sm:hidden bg-zinc-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs">Gasto {i + 1}</span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400 transition-colors text-xs px-1">✕ Eliminar</button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={row.description}
                    onChange={e => updateRow(i, 'description', e.target.value)}
                    placeholder="Descripción del gasto"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 uppercase placeholder:normal-case"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={row.category}
                      onChange={e => updateRow(i, 'category', e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={row.amount}
                      onChange={e => updateRow(i, 'amount', e.target.value)}
                      placeholder="$ Monto"
                      min="0"
                      step="0.01"
                      className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm text-right focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <input
                    type="date"
                    value={row.date}
                    min={periodStart}
                    max={periodEnd}
                    onChange={e => updateRow(i, 'date', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Desktop: fila de tabla */}
                <div className="hidden sm:grid grid-cols-[130px_1fr_130px_100px_24px] gap-2 items-center border-b border-zinc-800/50 py-1.5">
                  <input
                    type="date"
                    value={row.date}
                    min={periodStart}
                    max={periodEnd}
                    onChange={e => updateRow(i, 'date', e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 w-full"
                  />
                  <input
                    type="text"
                    value={row.description}
                    onChange={e => updateRow(i, 'description', e.target.value)}
                    placeholder="Descripción"
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 uppercase placeholder:normal-case w-full"
                  />
                  <select
                    value={row.category}
                    onChange={e => updateRow(i, 'category', e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500 w-full"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={row.amount}
                    onChange={e => updateRow(i, 'amount', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-amber-500 w-full"
                  />
                  <div className="text-center">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400 transition-colors text-xs">✕</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              <button
                onClick={addRow}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-xl px-3 py-2 transition-colors"
              >
                + Agregar fila
              </button>
            </div>
            <div className="flex items-center gap-4">
              {total > 0 && (
                <div className="text-sm">
                  <span className="text-zinc-500">Total nuevos: </span>
                  <span className="text-amber-400 font-bold">${total.toFixed(2)}</span>
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !truckId || rows.every(r => !r.amount)}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors"
              >
                {saving ? 'Guardando...' : `Guardar ${rows.filter(r => parseFloat(r.amount) > 0).length || ''} gastos`}
              </button>
            </div>
          </div>

          <p className="text-zinc-600 text-xs">
            Los gastos se descuentan automáticamente del neto al regenerar la nómina.
          </p>
        </div>
      )}
    </div>
  )
}
