'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createLoan, updateLoan, markLoanPaid, deleteLoan } from '@/app/actions/loans'

const DEDUCT_LABEL: Record<string, string> = {
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
  DICIEMBRE: 'Diciembre',
}

type Loan = {
  id: string
  driverName: string
  amount: number
  balance: number
  deductType: string
  deductAmount: number
  notes: string | null
  date: string
}
type Driver = { id: string; name: string }

export default function PrestamosClient({
  loans, drivers,
}: { loans: Loan[]; drivers: Driver[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Loan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'paid'>('active')

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await createLoan(new FormData(e.currentTarget))
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowForm(false); router.refresh(); setLoading(false) }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setLoading(true); setError('')
    const res = await updateLoan(editing.id, new FormData(e.currentTarget))
    if (res?.error) { setError(res.error); setLoading(false) }
    else { setEditing(null); router.refresh(); setLoading(false) }
  }

  async function handlePaid(id: string) {
    if (!confirm('¿Marcar este préstamo como saldado?')) return
    await markLoanPaid(id)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este préstamo?')) return
    await deleteLoan(id)
    router.refresh()
  }

  const filtered = loans.filter(l => {
    if (filterActive === 'active') return l.balance > 0
    if (filterActive === 'paid') return l.balance === 0
    return true
  })

  const formOpen = showForm || !!editing

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([['active', 'Activos'], ['paid', 'Saldados'], ['all', 'Todos']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterActive(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterActive === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setError('') }}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
          + Nuevo préstamo
        </button>
      </div>

      {/* Create / Edit form */}
      {formOpen && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{editing ? 'Editar préstamo' : 'Registrar préstamo / adelanto'}</h3>
          <form onSubmit={editing ? handleUpdate : handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Chofer *</label>
                <select name="driverName" required defaultValue={editing?.driverName ?? ''}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Seleccionar...</option>
                  {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto original $ *</label>
                <input name="amount" type="number" step="0.01" min="0.01" required
                  defaultValue={editing?.amount ?? ''}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            {editing && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Saldo pendiente $</label>
                <input name="balance" type="number" step="0.01" min="0"
                  defaultValue={editing.balance}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                <p className="text-zinc-600 text-xs mt-1">Ajusta manualmente si ya se hicieron pagos parciales</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tipo de descuento *</label>
                <select name="deductType" required defaultValue={editing?.deductType ?? 'QUINCENAL'}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="QUINCENAL">Quincenal (cada período)</option>
                  <option value="MENSUAL">Mensual</option>
                  <option value="DICIEMBRE">Diciembre (año completo)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto a descontar $ *</label>
                <input name="deductAmount" type="number" step="0.01" min="0" required
                  defaultValue={editing?.deductAmount ?? ''}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                <p className="text-zinc-600 text-xs mt-1">Se descuenta de cada quincena en nómina</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
              <input name="notes" defaultValue={editing?.notes ?? ''}
                placeholder="Motivo del préstamo..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar préstamo'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setError('') }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loans table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay préstamos {filterActive === 'active' ? 'activos' : filterActive === 'paid' ? 'saldados' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Chofer</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Saldo</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descuento</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Notas</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(loan => (
                  <tr key={loan.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${editing?.id === loan.id ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3 text-white font-medium">{loan.driverName}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {new Date(loan.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-semibold">${loan.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={loan.balance > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-600'}>
                        ${loan.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      <span className="bg-zinc-800 px-2 py-0.5 rounded-full">{DEDUCT_LABEL[loan.deductType]}</span>
                      <span className="text-zinc-600 ml-1.5">-${loan.deductAmount.toFixed(2)}/quincena</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">{loan.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        loan.balance > 0
                          ? 'text-amber-400 bg-amber-400/10'
                          : 'text-emerald-400 bg-emerald-400/10'
                      }`}>
                        {loan.balance > 0 ? 'Activo' : 'Saldado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditing(loan); setShowForm(false); setError('') }}
                          className="text-zinc-600 hover:text-amber-400 transition-colors" title="Editar">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {loan.balance > 0 && (
                          <button onClick={() => handlePaid(loan.id)}
                            className="text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
                            Saldado
                          </button>
                        )}
                        <button onClick={() => handleDelete(loan.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
