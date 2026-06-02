'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteExpense, updateExpenseInline } from '@/app/actions/expenses'

type Expense = {
  id: string
  date: string | Date
  description: string
  category: string
  amount: number
  truck: { id: string; plate: string } | null
}

const CATEGORIES = [
  { value: 'REPUESTO',  label: 'Repuesto' },
  { value: 'MECANICA',  label: 'Mecánica' },
  { value: 'ACEITE',    label: 'Aceite' },
  { value: 'CAUCHO',    label: 'Caucho' },
  { value: 'OPERATIVO', label: 'Operativo' },
  { value: 'VIATICO',   label: 'Viático' },
  { value: 'OTRO',      label: 'Otro' },
]
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
const CATEGORY_COLOR: Record<string, string> = {
  REPUESTO:  'text-blue-400 bg-blue-500/10',
  MECANICA:  'text-orange-400 bg-orange-500/10',
  ACEITE:    'text-yellow-400 bg-yellow-500/10',
  CAUCHO:    'text-cyan-400 bg-cyan-500/10',
  OPERATIVO: 'text-zinc-400 bg-zinc-700/50',
  VIATICO:   'text-purple-400 bg-purple-500/10',
  OTRO:      'text-zinc-500 bg-zinc-800',
}

export default function TruckExpensesClient({
  periodId,
  expenses,
  periodEndISO,
  isOpen,
}: {
  periodId: string
  expenses: Expense[]
  periodEndISO: string
  isOpen: boolean
}) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc]   = useState('')
  const [editCat,  setEditCat]    = useState('')
  const [editAmt,  setEditAmt]    = useState('')
  const [saving,   setSaving]     = useState(false)

  function startEdit(e: Expense) {
    setEditingId(e.id)
    setEditDesc(e.description)
    setEditCat(e.category)
    setEditAmt(String(e.amount))
  }

  function cancelEdit() { setEditingId(null) }

  async function handleSaveEdit(id: string) {
    const amount = parseFloat(editAmt)
    if (!editDesc.trim() || isNaN(amount) || amount <= 0) { toast.error('Descripción y monto requeridos'); return }
    setSaving(true)
    const res = await updateExpenseInline(id, { description: editDesc, amount, category: editCat })
    setSaving(false)
    if (res && 'error' in res) { toast.error(res.error); return }
    toast.success('Gasto actualizado')
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const res = await deleteExpense(id)
    setDeleting(null)
    if (res && 'error' in res) { toast.error(res.error); return }
    toast.success('Gasto eliminado')
    router.refresh()
  }

  // Agrupar por camión
  const byTruck = new Map<string, { plate: string; items: Expense[] }>()
  for (const e of expenses) {
    const key   = e.truck?.id ?? '__none'
    const plate = e.truck?.plate ?? 'Sin camión'
    if (!byTruck.has(key)) byTruck.set(key, { plate, items: [] })
    byTruck.get(key)!.items.push(e)
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const money = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: string | Date) => new Date(d).toISOString().slice(5, 10).replace('-', '/')

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Gastos por camión</span>
          {expenses.length > 0 && (
            <span className="text-zinc-400 text-xs bg-zinc-800 border border-zinc-700 rounded-full px-2 py-0.5">
              {expenses.length} · ${money(total)}
            </span>
          )}
          <span className="text-zinc-500 text-xs hidden sm:inline">Desglose completo · editable</span>
        </div>
        <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          {expenses.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-4">Sin gastos registrados para este período</p>
          ) : (
            <div className="space-y-4">
              {Array.from(byTruck.entries()).map(([key, { plate, items }]) => {
                const truckTotal = items.reduce((s, e) => s + e.amount, 0)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-mono font-semibold text-xs">{plate}</span>
                      <span className="text-zinc-400 text-xs font-mono">${money(truckTotal)}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map(e => (
                        editingId === e.id ? (
                          /* ── Fila de edición ── */
                          <div key={e.id} className="bg-zinc-800/60 border border-amber-500/30 rounded-xl p-3 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={editCat}
                                onChange={ev => setEditCat(ev.target.value)}
                                className="bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                              >
                                {CATEGORIES.map(c => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={editDesc}
                                onChange={ev => setEditDesc(ev.target.value.toUpperCase())}
                                className="flex-1 min-w-0 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                                placeholder="Descripción"
                              />
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-zinc-500 text-xs">$</span>
                                <input
                                  type="number"
                                  value={editAmt}
                                  onChange={ev => setEditAmt(ev.target.value)}
                                  step="0.01" min="0"
                                  className="w-20 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveEdit(e.id)}
                                disabled={saving}
                                className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-3 py-1.5 transition-colors"
                              >
                                {saving ? '...' : 'Guardar'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-xs text-zinc-500 hover:text-white rounded-lg px-3 py-1.5 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Fila normal ── */
                          <div key={e.id} className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                            <span className="text-zinc-600 text-[10px] flex-shrink-0 w-8">{fmtDate(e.date)}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${CATEGORY_COLOR[e.category] ?? 'text-zinc-500 bg-zinc-800'}`}>
                              {CATEGORY_LABEL[e.category] ?? e.category}
                            </span>
                            <span className="text-zinc-300 text-xs flex-1 truncate">{e.description}</span>
                            <span className="text-zinc-400 font-mono text-xs flex-shrink-0">${money(e.amount)}</span>
                            {isOpen && (
                              <>
                                <button
                                  onClick={() => startEdit(e)}
                                  className="text-zinc-600 hover:text-amber-400 transition-colors text-xs flex-shrink-0 px-1"
                                  title="Editar"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDelete(e.id)}
                                  disabled={deleting === e.id}
                                  className="text-zinc-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 disabled:opacity-50"
                                  title="Eliminar"
                                >
                                  {deleting === e.id ? '...' : '✕'}
                                </button>
                              </>
                            )}
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="text-zinc-500 text-xs">Total gastos por camión</span>
            <span className="text-white font-bold font-mono text-sm">${money(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
