'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTireRepair, markTireRepairPaid, deleteTireRepair } from '@/app/actions/tires'

type Truck = { id: string; plate: string; driver: { name: string } | null }
type Repair = {
  id: string
  date: string | Date
  truckId: string
  truck: { plate: string; driver: { name: string } | null }
  quantity: number
  unitCost: number
  notes: string | null
  paidAt: string | Date | null
}

interface Props {
  repairs: Repair[]
  trucks: Truck[]
  truckTotals: Record<string, { count: number; cost: number }>
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function CauchosClient({ repairs, trucks, truckTotals }: Props) {
  const [view, setView] = useState<'lista' | 'camion'>('lista')
  const [showForm, setShowForm] = useState(false)
  const [pending, startTransition] = useTransition()

  const totalCost = repairs.reduce((s, r) => s + r.quantity * r.unitCost, 0)
  const totalCount = repairs.reduce((s, r) => s + r.quantity, 0)
  const unpaidCost = repairs
    .filter(r => !r.paidAt)
    .reduce((s, r) => s + r.quantity * r.unitCost, 0)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createTireRepair(fd)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('Reparación registrada')
        setShowForm(false)
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  async function handlePay(id: string) {
    startTransition(async () => {
      const res = await markTireRepairPaid(id)
      if (res?.error) toast.error(res.error)
      else toast.success('Marcado como pagado')
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar reparación?')) return
    startTransition(async () => {
      const res = await deleteTireRepair(id)
      if (res?.error) toast.error(res.error)
      else toast.success('Eliminado')
    })
  }

  // Por camión view
  const byTruck = trucks
    .filter(t => truckTotals[t.id])
    .map(t => ({
      ...t,
      count: truckTotals[t.id].count,
      cost: truckTotals[t.id].cost,
    }))
    .sort((a, b) => b.cost - a.cost)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Total cauchos</p>
          <p className="text-white text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Costo total</p>
          <p className="text-white text-2xl font-bold">${totalCost.toFixed(0)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Por pagar</p>
          <p className="text-red-400 text-2xl font-bold">${unpaidCost.toFixed(0)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {(['lista', 'camion'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {v === 'lista' ? 'Lista' : 'Por camión'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors"
        >
          + Reparación
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 grid grid-cols-2 gap-3"
        >
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Camión</label>
            <select
              name="truckId"
              required
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {trucks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.plate} {t.driver ? `— ${t.driver.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Fecha</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Cantidad</label>
            <input
              type="number"
              name="quantity"
              defaultValue={1}
              min={1}
              required
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Costo unitario ($)</label>
            <input
              type="number"
              name="unitCost"
              step="0.01"
              min={0}
              placeholder="0.00"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="text-zinc-400 text-xs mb-1 block">Notas (opcional)</label>
            <input
              type="text"
              name="notes"
              placeholder="Descripción o taller..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {/* List view */}
      {view === 'lista' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {repairs.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Sin registros</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Camión</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Cant.</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">C/u</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Total</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Notas</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {repairs.map(r => (
                  <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-300">{fmt(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{r.truck.plate}</span>
                      {r.truck.driver && (
                        <span className="text-zinc-500 text-xs ml-1">
                          {r.truck.driver.name.split(' ')[0]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-300">{r.quantity}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {r.unitCost > 0 ? `$${r.unitCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {r.unitCost > 0 ? `$${(r.quantity * r.unitCost).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-[120px] truncate">
                      {r.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.paidAt ? (
                        <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                          Pagado
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePay(r.id)}
                          disabled={pending}
                          className="text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                        >
                          Pendiente
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={pending}
                        className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Por camión view */}
      {view === 'camion' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {byTruck.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Sin datos</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Camión</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Chofer</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Cauchos</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">Costo total</th>
                </tr>
              </thead>
              <tbody>
                {byTruck.map(t => (
                  <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-white font-medium">{t.plate}</td>
                    <td className="px-4 py-3 text-zinc-300">{t.driver?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-zinc-300">{t.count}</td>
                    <td className="px-4 py-3 text-right text-white font-semibold">
                      ${t.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
