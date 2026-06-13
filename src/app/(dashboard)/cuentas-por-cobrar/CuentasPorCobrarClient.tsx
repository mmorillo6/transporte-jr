'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCuenta, updateCuenta, addPayment, deleteCuenta } from '@/app/actions/cuentasPorCobrar'

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Cobrado' }
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-400/10',
  PARTIAL: 'text-blue-400 bg-blue-400/10',
  PAID: 'text-emerald-400 bg-emerald-400/10',
}

type Payment = { id: string; amount: number; date: string; method: string | null; notes: string | null }
type CxC = {
  id: string
  clientName: string
  concept: string
  periodLabel: string | null
  date: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  notes: string | null
  payments: Payment[]
}

export default function CuentasPorCobrarClient({ cuentas }: { cuentas: CxC[] }) {
  const router = useRouter()
  const [filter, setFilter]    = useState<'all' | 'PENDING' | 'PARTIAL' | 'PAID'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<CxC | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const today = new Date().toISOString().slice(0, 10)

  // Unpaid entries (newest first) at top; paid entries (oldest first) at bottom
  const filtered = (filter === 'all' ? cuentas : cuentas.filter(c => c.status === filter))
    .sort((a, b) => {
      const aUnpaid = a.status !== 'PAID'
      const bUnpaid = b.status !== 'PAID'
      if (aUnpaid && !bUnpaid) return -1
      if (!aUnpaid && bUnpaid) return 1
      if (aUnpaid && bUnpaid) return new Date(b.date).getTime() - new Date(a.date).getTime()
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

  // Per client, only the most recent unpaid entry can receive payments
  const newestUnpaidByClient = new Map<string, string>()
  for (const c of cuentas) {
    if (c.status !== 'PAID') {
      const existingId = newestUnpaidByClient.get(c.clientName)
      if (!existingId) {
        newestUnpaidByClient.set(c.clientName, c.id)
      } else {
        const existing = cuentas.find(x => x.id === existingId)!
        if (new Date(c.date) > new Date(existing.date)) {
          newestUnpaidByClient.set(c.clientName, c.id)
        }
      }
    }
  }

  const totalPendiente = cuentas.filter(c => c.status !== 'PAID').reduce((s, c) => s + c.balance, 0)
  const totalCobrado   = cuentas.filter(c => c.status === 'PAID').reduce((s, c) => s + c.totalAmount, 0)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError('')
    const res = await createCuenta(new FormData(e.currentTarget))
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowForm(false); router.refresh(); setLoading(false) }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setLoading(true); setError('')
    const res = await updateCuenta(editing.id, new FormData(e.currentTarget))
    if (res?.error) { setError(res.error); setLoading(false) }
    else { setEditing(null); router.refresh(); setLoading(false) }
  }

  async function handlePayment(e: React.FormEvent<HTMLFormElement>, cxcId: string) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await addPayment(cxcId, new FormData(e.currentTarget))
    if (res?.error) { setError(res.error); setLoading(false) }
    else { setPayingId(null); setPaymentAmount(''); router.refresh(); setLoading(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cuenta por cobrar?')) return
    await deleteCuenta(id); router.refresh()
  }

  function togglePaying(id: string) {
    if (payingId === id) { setPayingId(null); setPaymentAmount(''); setError('') }
    else { setPayingId(id); setPaymentAmount(''); setError('') }
  }

  const formOpen = showForm || !!editing

  return (
    <div className="space-y-4">
      {/* Guía de uso */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4">
        <p className="text-white font-semibold text-sm mb-2">Cómo usar esta sección</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 text-sm font-bold">↓</span>
            </div>
            <div>
              <p className="text-emerald-400 font-semibold text-sm">Aurumin / Chino me pagó algo</p>
              <p className="text-zinc-500 text-xs mt-0.5">Presiona <strong className="text-emerald-400">"Registrar pago"</strong> en la fila más reciente del cliente. El formulario se abre ahí mismo. Reduce el saldo y registra el ingreso en Caja automáticamente.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-400 text-sm font-bold">+</span>
            </div>
            <div>
              <p className="text-amber-400 font-semibold text-sm">Hay una nueva factura que cobrar</p>
              <p className="text-zinc-500 text-xs mt-0.5">Usa <strong className="text-amber-400">"Nueva factura"</strong> solo cuando el cliente tiene una deuda nueva (al cerrar un período). Esto <strong className="text-red-400">aumenta</strong> el saldo pendiente.</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Por cobrar</p>
          <p className="text-2xl font-bold text-amber-400">${totalPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Cobrado (histórico)</p>
          <p className="text-2xl font-bold text-emerald-400">${totalCobrado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Clientes activos</p>
          <p className="text-2xl font-bold text-white">{new Set(cuentas.filter(c => c.status !== 'PAID').map(c => c.clientName)).size}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([['all', 'Todas'], ['PENDING', 'Pendiente'], ['PARTIAL', 'Parcial'], ['PAID', 'Cobrado']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>{l}</button>
          ))}
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setError('') }}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-medium rounded-xl px-4 py-2 text-sm transition-colors">
          + Nueva factura por cobrar
        </button>
      </div>

      {/* Create / Edit form */}
      {formOpen && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-white font-semibold">{editing ? 'Editar factura' : 'Nueva factura por cobrar'}</h3>
            {!editing && <p className="text-amber-400/80 text-xs mt-0.5">Esto registra una deuda nueva del cliente. Si ya te pagaron, cancela y usa "Registrar pago" en la fila correspondiente.</p>}
          </div>
          <form onSubmit={editing ? handleUpdate : handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Cliente *</label>
                <input name="clientName" required defaultValue={editing?.clientName ?? ''}
                  placeholder="Ej: AURUMIN, CHINO PEÑA..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha del corte *</label>
                <input name="date" type="date" required defaultValue={editing ? editing.date.slice(0, 10) : today}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Concepto *</label>
                <input name="concept" required defaultValue={editing?.concept ?? ''}
                  placeholder="Ej: Relación nº3 — transporte minero"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Período</label>
                <input name="periodLabel" defaultValue={editing?.periodLabel ?? ''}
                  placeholder="Del 16/03 al 31/03/2026"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto total $ *</label>
                <input name="totalAmount" type="number" step="0.01" min="0.01" required
                  defaultValue={editing?.totalAmount ?? ''}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Ya abonado $</label>
                <input name="amountPaid" type="number" step="0.01" min="0"
                  defaultValue={editing?.amountPaid ?? '0'}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Notas</label>
              <input name="notes" defaultValue={editing?.notes ?? ''}
                placeholder="Observaciones..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setError('') }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay cuentas por cobrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Cliente</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Concepto / Período</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Total</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Abonado</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Saldo</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const isActiveForPayment = c.status !== 'PAID' && newestUnpaidByClient.get(c.clientName) === c.id
                  const payOpen = payingId === c.id
                  const cxcBalance = c.balance

                  return (
                    <React.Fragment key={c.id}>
                      <tr className={`border-b border-zinc-800/50 transition-colors ${payOpen ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'}`}>
                        <td className="px-4 py-3 text-white font-semibold">{c.clientName}</td>
                        <td className="px-4 py-3">
                          <p className="text-zinc-300 text-xs">{c.concept}</p>
                          {c.periodLabel && <p className="text-zinc-600 text-xs mt-0.5">{c.periodLabel}</p>}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">
                          {new Date(c.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300 font-semibold">${c.totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-zinc-500">${c.amountPaid.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={c.balance > 0 ? 'text-amber-400 font-bold' : 'text-zinc-600'}>
                            ${c.balance.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            {c.payments.length > 0 && (
                              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                className="text-zinc-600 hover:text-zinc-300 text-xs transition-colors whitespace-nowrap">
                                {expanded === c.id ? '▴ ocultar' : `▾ ${c.payments.length} pago${c.payments.length !== 1 ? 's' : ''}`}
                              </button>
                            )}
                            {isActiveForPayment && (
                              <button onClick={() => togglePaying(c.id)}
                                className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap ${
                                  payOpen
                                    ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                }`}>
                                {payOpen ? '✕ Cancelar' : 'Registrar pago'}
                              </button>
                            )}
                            {c.status !== 'PAID' && !isActiveForPayment && (
                              <span className="text-xs text-zinc-600 whitespace-nowrap">deuda anterior</span>
                            )}
                            <button onClick={() => { setEditing(c); setShowForm(false); setError('') }}
                              className="text-zinc-600 hover:text-amber-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(c.id)}
                              className="text-zinc-600 hover:text-red-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline payment accordion */}
                      {payOpen && (
                        <tr className="bg-zinc-800/40 border-b border-emerald-500/20">
                          <td colSpan={8} className="px-6 py-4">
                            {c.clientName.toUpperCase().includes('AURUMIN') && (
                              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 leading-relaxed">
                                <span className="font-bold text-amber-400">⚠ Recuerda:</span> Después de registrar este cobro de Aurumin, debes hacer dos pasos más ese mismo día:<br />
                                1. Ir a <strong>Caja → Deudas a socios</strong> y marcar el préstamo de José Rodríguez como pagado.<br />
                                2. Registrar un <strong>EGRESO en Caja</strong> por el monto que se le devuelve a José.
                              </div>
                            )}
                            <form onSubmit={e => handlePayment(e, c.id)} className="flex flex-wrap gap-3 items-end">
                              <div className="flex-shrink-0">
                                <p className="text-emerald-400 text-xs font-semibold mb-0.5">Registrando pago — {c.clientName}</p>
                                <p className="text-zinc-500 text-xs">Saldo pendiente: <span className="text-amber-400 font-bold">${cxcBalance.toFixed(2)}</span></p>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1">Monto $ *</label>
                                <input name="amount" type="number" step="0.01" min="0.01" required autoFocus
                                  placeholder="0.00"
                                  value={paymentAmount}
                                  onChange={e => setPaymentAmount(e.target.value)}
                                  className="w-32 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-500" />
                                {paymentAmount && parseFloat(paymentAmount) > cxcBalance && (
                                  <p className="text-red-400 text-xs mt-1 w-48">
                                    ⚠ ${parseFloat(paymentAmount).toFixed(2)} supera el saldo (${cxcBalance.toFixed(2)})
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1">Fecha *</label>
                                <input name="date" type="date" required defaultValue={today}
                                  className="bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1">Método</label>
                                <select name="method"
                                  className="bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                                  <option value="USDT">USDT</option>
                                  <option value="Transferencia">Transferencia</option>
                                  <option value="Efectivo">Efectivo</option>
                                  <option value="Zelle">Zelle</option>
                                  <option value="Otro">Otro</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1">Notas</label>
                                <input name="notes" placeholder="Referencia..."
                                  className="w-36 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-500" />
                              </div>
                              <button type="submit" disabled={loading}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap">
                                {loading ? 'Guardando...' : 'Confirmar cobro'}
                              </button>
                              {error && <p className="text-red-400 text-xs w-full">{error}</p>}
                            </form>
                          </td>
                        </tr>
                      )}

                      {/* Payment history accordion */}
                      {expanded === c.id && c.payments.length > 0 && (
                        <tr className="bg-zinc-800/30 border-b border-zinc-800/50">
                          <td colSpan={8} className="px-8 py-3">
                            <p className="text-zinc-500 text-xs font-medium mb-2">Historial de abonos</p>
                            <div className="space-y-1">
                              {c.payments.map(p => (
                                <div key={p.id} className="flex items-center gap-4 text-xs">
                                  <span className="text-zinc-500">
                                    {new Date(p.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                  </span>
                                  <span className="text-emerald-400 font-semibold">${p.amount.toFixed(2)}</span>
                                  {p.method && <span className="text-zinc-600">{p.method}</span>}
                                  {p.notes && <span className="text-zinc-600">{p.notes}</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
