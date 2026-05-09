'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTireRepair, markTireRepairPaid, deleteTireRepair, addTireDebtPayment, createTireDebt } from '@/app/actions/tires'

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
type TireDebt = {
  id: string
  ownerName: string
  truckPlate: string | null
  tireType: string
  quantity: number
  unitCost: number
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  date: string | Date
  notes: string | null
  payments: { id: string; amount: number; date: string | Date; notes: string | null }[]
}

interface Props {
  repairs: Repair[]
  trucks: Truck[]
  truckTotals: Record<string, { count: number; cost: number }>
  tireDebts: TireDebt[]
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function CauchosClient({ repairs, trucks, truckTotals, tireDebts }: Props) {
  const [view, setView] = useState<'lista' | 'camion' | 'deudas'>('lista')
  const [showForm, setShowForm] = useState(false)
  const [showDebtForm, setShowDebtForm] = useState(false)
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null)
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

  async function handleDebtPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!payingDebtId) return
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await addTireDebtPayment(payingDebtId, fd)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('Abono registrado')
        setPayingDebtId(null)
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  async function handleCreateDebt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createTireDebt(fd)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('Deuda registrada')
        setShowDebtForm(false)
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  const totalDeudas = tireDebts.filter(d => d.status !== 'PAID').reduce((s, d) => s + d.balance, 0)

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
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Total cauchos</p>
          <p className="text-white text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Costo total</p>
          <p className="text-white text-2xl font-bold">${totalCost.toFixed(0)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Por pagar (reparaciones)</p>
          <p className="text-red-400 text-2xl font-bold">${unpaidCost.toFixed(0)}</p>
        </div>
        <div className={`rounded-xl p-4 border ${totalDeudas > 0 ? 'bg-orange-500/5 border-orange-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs mb-1">Deudas de caucho</p>
          <p className={`text-2xl font-bold ${totalDeudas > 0 ? 'text-orange-400' : 'text-zinc-400'}`}>${totalDeudas.toFixed(0)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {(['lista', 'camion', 'deudas'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {v === 'lista' ? 'Lista' : v === 'camion' ? 'Por camión' : 'Deudas'}
            </button>
          ))}
        </div>
        {view !== 'deudas' ? (
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors"
          >
            + Reparación
          </button>
        ) : (
          <button
            onClick={() => setShowDebtForm(v => !v)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors"
          >
            + Deuda
          </button>
        )}
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

      {/* Deudas form */}
      {view === 'deudas' && showDebtForm && (
        <form onSubmit={handleCreateDebt} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Nombre (dueño / encargado)</label>
            <input type="text" name="ownerName" required placeholder="FERNANDO PÉREZ" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Placa (opcional)</label>
            <input type="text" name="truckPlate" placeholder="A11AG8U" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Tipo de caucho</label>
            <input type="text" name="tireType" defaultValue="1200r24" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Cantidad</label>
            <input type="number" name="quantity" defaultValue={1} min={1} required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Costo unitario ($)</label>
            <input type="number" name="unitCost" step="0.01" min={0} placeholder="330" required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Fecha</label>
            <input type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-zinc-400 text-xs mb-1 block">Notas (opcional)</label>
            <input type="text" name="notes" placeholder="..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowDebtForm(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">Cancelar</button>
            <button type="submit" disabled={pending} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50">Guardar</button>
          </div>
        </form>
      )}

      {/* Deudas view */}
      {view === 'deudas' && (
        <div className="space-y-3">
          {tireDebts.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500 text-sm">Sin deudas registradas</div>
          ) : (
            tireDebts.map(d => (
              <div key={d.id} className={`bg-zinc-900 border rounded-xl p-4 ${d.status === 'PAID' ? 'border-zinc-800 opacity-60' : d.status === 'PARTIAL' ? 'border-orange-500/30' : 'border-red-500/20'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold">{d.ownerName}</p>
                      {d.truckPlate && <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">{d.truckPlate}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.status === 'PAID' ? 'bg-green-400/10 text-green-400' :
                        d.status === 'PARTIAL' ? 'bg-orange-400/10 text-orange-400' :
                        'bg-red-400/10 text-red-400'
                      }`}>
                        {d.status === 'PAID' ? 'Pagado' : d.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">
                      {d.quantity} cauchos {d.tireType} · ${d.unitCost}/u ·
                      {new Date(d.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                    {d.notes && <p className="text-zinc-600 text-xs mt-0.5">{d.notes}</p>}
                    {d.payments.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {d.payments.map(p => (
                          <p key={p.id} className="text-xs text-zinc-500">
                            Abono: <span className="text-green-400">${p.amount}</span> — {new Date(p.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            {p.notes && ` · ${p.notes}`}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-zinc-500 text-xs">Total: <span className="text-white">${d.totalAmount.toFixed(0)}</span></p>
                    <p className="text-zinc-500 text-xs">Pagado: <span className="text-green-400">${d.amountPaid.toFixed(0)}</span></p>
                    <p className={`font-bold text-lg ${d.balance > 0 ? 'text-orange-400' : 'text-green-400'}`}>${d.balance.toFixed(0)}</p>
                    <p className="text-zinc-600 text-xs">saldo</p>
                  </div>
                </div>
                {d.status !== 'PAID' && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    {payingDebtId === d.id ? (
                      <form onSubmit={handleDebtPayment} className="flex gap-2 items-center flex-wrap">
                        <input type="number" name="amount" step="0.01" min={0.01} max={d.balance} placeholder="Monto abono" required className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm w-36" />
                        <input type="text" name="notes" placeholder="Notas (opcional)" className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0" />
                        <button type="submit" disabled={pending} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setPayingDebtId(null)} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm transition-colors">Cancelar</button>
                      </form>
                    ) : (
                      <button onClick={() => setPayingDebtId(d.id)} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">+ Registrar abono</button>
                    )}
                  </div>
                )}
              </div>
            ))
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
