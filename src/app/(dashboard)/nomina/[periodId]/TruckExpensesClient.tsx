'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteExpense } from '@/app/actions/expenses'

type Expense = {
  id: string
  description: string
  category: string
  amount: number
  truck: { id: string; plate: string } | null
}

const CATEGORY_LABEL: Record<string, string> = {
  REPUESTO: 'Repuesto', MECANICA: 'Mecánica', ACEITE: 'Aceite',
  CAUCHO: 'Caucho', OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Admin',
  OTRO: 'Otro',
}
const CATEGORY_COLOR: Record<string, string> = {
  REPUESTO: 'text-blue-400 bg-blue-500/10',
  MECANICA: 'text-purple-400 bg-purple-500/10',
  ACEITE: 'text-amber-400 bg-amber-500/10',
  CAUCHO: 'text-orange-400 bg-orange-500/10',
  OPERATIVO: 'text-zinc-400 bg-zinc-700/50',
  ADMINISTRATIVO: 'text-cyan-400 bg-cyan-500/10',
  OTRO: 'text-zinc-500 bg-zinc-800',
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
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

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
    const key = e.truck?.id ?? '__none'
    const plate = e.truck?.plate ?? 'Sin camión'
    if (!byTruck.has(key)) byTruck.set(key, { plate, items: [] })
    byTruck.get(key)!.items.push(e)
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const money = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
          <span className="text-zinc-500 text-xs hidden sm:inline">Desglose completo · editable antes de generar</span>
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
                        <div key={e.id} className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${CATEGORY_COLOR[e.category] ?? 'text-zinc-500 bg-zinc-800'}`}>
                            {CATEGORY_LABEL[e.category] ?? e.category}
                          </span>
                          <span className="text-zinc-300 text-xs flex-1 truncate">{e.description}</span>
                          <span className="text-zinc-400 font-mono text-xs flex-shrink-0">${money(e.amount)}</span>
                          {isOpen && (
                            <button
                              onClick={() => handleDelete(e.id)}
                              disabled={deleting === e.id}
                              className="text-zinc-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 disabled:opacity-50"
                              title="Eliminar gasto"
                            >
                              {deleting === e.id ? '...' : '✕'}
                            </button>
                          )}
                        </div>
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

          {isOpen && (
            <a
              href="/gastos"
              className="block text-center text-amber-400 hover:text-amber-300 text-xs border border-amber-500/20 bg-amber-500/5 rounded-xl px-4 py-2 transition-colors"
            >
              + Agregar o editar gastos en /gastos
            </a>
          )}
        </div>
      )}
    </div>
  )
}
