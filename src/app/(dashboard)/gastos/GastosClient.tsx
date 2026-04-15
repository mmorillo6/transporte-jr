'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createExpense, updateExpense, markExpensePaid, markExpensePartialPaid, deleteExpense } from '@/app/actions/expenses'
import { analyzeInvoice } from '@/app/actions/analyzeInvoice'
import { toast } from 'sonner'

const CATEGORIES = [
  { value: 'MECANICA', label: 'Mecánica' },
  { value: 'REPUESTO', label: 'Repuesto' },
  { value: 'ACEITE', label: 'Aceite' },
  { value: 'CAUCHO', label: 'Caucho' },
  { value: 'VIATICO', label: 'Viático' },
  { value: 'NOMINA', label: 'Nómina' },
  { value: 'OPERATIVO', label: 'Operativo' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'NPR', label: 'NPR' },
  { value: 'OTRO', label: 'Otro' },
]

const CAT_COLORS: Record<string, string> = {
  MECANICA: 'text-orange-400 bg-orange-400/10',
  REPUESTO: 'text-blue-400 bg-blue-400/10',
  ACEITE: 'text-yellow-400 bg-yellow-400/10',
  CAUCHO: 'text-purple-400 bg-purple-400/10',
  VIATICO: 'text-cyan-400 bg-cyan-400/10',
  NOMINA: 'text-green-400 bg-green-400/10',
  OPERATIVO: 'text-zinc-400 bg-zinc-400/10',
  ADMINISTRATIVO: 'text-rose-400 bg-rose-400/10',
  NPR: 'text-amber-400 bg-amber-400/10',
  OTRO: 'text-zinc-500 bg-zinc-500/10',
}

type Expense = {
  id: string
  date: string
  category: string
  description: string
  amount: number
  amountPaid: number
  isCredit: boolean
  paidDate: string | null
  truckId: string | null
  invoiceUrl: string | null
  truck: { plate: string; driver: { name: string } | null } | null
}

export default function GastosClient({
  expenses,
  trucks,
  params,
  categoryLabels,
  filterBase = '/gastos',
}: {
  expenses: Expense[]
  trucks: { id: string; plate: string; driver: { name: string } | null }[]
  params: Record<string, string | undefined>
  categoryLabels: Record<string, string>
  filterBase?: string
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Controlled form fields
  const [fDate, setFDate] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fTruckId, setFTruckId] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fPaymentStatus, setFPaymentStatus] = useState<'pagado' | 'pendiente' | 'parcial'>('pagado')
  const [fAmountPaid, setFAmountPaid] = useState('')
  const [fInvoiceUrl, setFInvoiceUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // Quick-pay partial state per row
  const [partialId, setPartialId] = useState<string | null>(null)
  const [partialAmount, setPartialAmount] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  function openCreate() {
    const today = new Date().toISOString().split('T')[0]
    setFDate(today)
    setFCategory('')
    setFTruckId('')
    setFAmount('')
    setFDescription('')
    setFPaymentStatus('pagado')
    setFAmountPaid('')
    setFInvoiceUrl('')
    setEditing(null)
    setShowForm(true)
    setFormError('')
  }

  function openEdit(exp: Expense) {
    setFDate(new Date(exp.date).toISOString().split('T')[0])
    setFCategory(exp.category)
    setFTruckId(exp.truckId ?? '')
    setFAmount(String(exp.amount))
    setFDescription(exp.description)
    const status = !exp.isCredit ? 'pagado' : exp.amountPaid > 0 ? 'parcial' : 'pendiente'
    setFPaymentStatus(status)
    setFAmountPaid(exp.amountPaid > 0 ? String(exp.amountPaid) : '')
    setFInvoiceUrl(exp.invoiceUrl ?? '')
    setEditing(exp)
    setShowForm(false)
    setFormError('')
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setFormError('')
    setFInvoiceUrl('')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)
    const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) { toast.error('Error al subir archivo'); return }
    const { url } = await uploadRes.json()
    setFInvoiceUrl(url)

    setAnalyzing(true)
    const result = await analyzeInvoice(url)
    setAnalyzing(false)

    if (result.data) {
      const d = result.data
      if (d.category) setFCategory(d.category)
      if (d.amount !== null) setFAmount(String(d.amount))
      if (d.description) setFDescription(d.description)
      if (d.date) setFDate(d.date)
      toast.success('Factura analizada — revisa los campos')
    } else {
      toast.error(result.error ?? 'No se pudo analizar la factura')
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFormError('')

    const fd = new FormData()
    fd.set('date', fDate)
    fd.set('category', fCategory)
    fd.set('truckId', fTruckId)
    fd.set('amount', fAmount)
    fd.set('description', fDescription)
    fd.set('paymentStatus', fPaymentStatus)
    fd.set('amountPaid', fAmountPaid)
    fd.set('invoiceUrl', fInvoiceUrl)

    const res = editing ? await updateExpense(editing.id, fd) : await createExpense(fd)

    if (res?.error) { setFormError(res.error); setLoading(false) }
    else { closeForm(); router.refresh(); setLoading(false) }
  }

  async function handlePaid(id: string) {
    await markExpensePaid(id)
    router.refresh()
  }

  async function handlePartialSave(id: string) {
    const val = parseFloat(partialAmount)
    if (isNaN(val) || val <= 0) { toast.error('Ingresa un monto válido'); return }
    const res = await markExpensePartialPaid(id, val)
    if (res?.error) toast.error(res.error)
    else { setPartialId(null); setPartialAmount(''); router.refresh() }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    await deleteExpense(id)
    router.refresh()
  }

  function applyFilter(key: string, value: string) {
    const base = new URLSearchParams(filterBase.includes('?') ? filterBase.split('?')[1] : '')
    const existing = new URLSearchParams(params as any)
    // merge: start from base params, overlay existing filters, apply new value
    existing.forEach((v, k) => base.set(k, v))
    if (value) base.set(key, value); else base.delete(key)
    const path = filterBase.split('?')[0]
    router.push(`${path}?${base.toString()}`)
  }

  const formOpen = showForm || !!editing

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Desde</label>
            <input type="date" defaultValue={params.from ?? ''} onChange={e => applyFilter('from', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Hasta</label>
            <input type="date" defaultValue={params.to ?? ''} onChange={e => applyFilter('to', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Categoría</label>
            <select defaultValue={params.category ?? ''} onChange={e => applyFilter('category', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
              <option value="">Todas</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Camión</label>
            <select defaultValue={params.truckId ?? ''} onChange={e => applyFilter('truckId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
              <option value="">Todos</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={params.credit === '1'} onChange={e => applyFilter('credit', e.target.checked ? '1' : '')}
              className="rounded accent-amber-500" />
            <span className="text-zinc-400 text-sm">Solo fiados</span>
          </label>
          <button onClick={openCreate}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
            + Nuevo gasto
          </button>
        </div>
      </div>

      {/* Create / Edit form */}
      {formOpen && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">{editing ? 'Editar gasto' : 'Registrar gasto'}</h3>
            <div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden" onChange={handleFileChange} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={analyzing}
                className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                {analyzing ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>Analizando...</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>Subir factura</>
                )}
              </button>
            </div>
          </div>

          {fInvoiceUrl && !fInvoiceUrl.endsWith('.pdf') && (
            <div className="mb-4">
              <img src={fInvoiceUrl} alt="Factura" className="max-h-40 rounded-lg border border-zinc-700 object-contain" />
            </div>
          )}
          {fInvoiceUrl && fInvoiceUrl.endsWith('.pdf') && (
            <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
              <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              PDF adjunto —{' '}
              <a href={fInvoiceUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">ver archivo</a>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Fecha *</label>
                <input name="date" type="date" required value={fDate} onChange={e => setFDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Categoría *</label>
                <select name="category" required value={fCategory} onChange={e => setFCategory(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Seleccionar...</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Camión (opcional)</label>
                <select name="truckId" value={fTruckId} onChange={e => setFTruckId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Sin asignar</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} — {t.driver?.name ?? ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Monto $ *</label>
                <input name="amount" type="number" step="0.01" min="0" required
                  value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Descripción *</label>
              <input name="description" type="text" required
                value={fDescription} onChange={e => setFDescription(e.target.value)}
                placeholder="Cambio de aceite, repuesto..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            </div>

            {/* Payment status */}
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Estado de pago</label>
              <div className="flex gap-2">
                {(['pagado', 'pendiente', 'parcial'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setFPaymentStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      fPaymentStatus === s
                        ? s === 'pagado' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : s === 'parcial' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                    }`}>
                    {s === 'pagado' ? 'Pagado' : s === 'pendiente' ? 'Pendiente' : 'Parcial'}
                  </button>
                ))}
              </div>
              {fPaymentStatus === 'parcial' && (
                <div className="mt-2">
                  <label className="block text-xs text-zinc-400 mb-1">Monto pagado hasta ahora $</label>
                  <input type="number" step="0.01" min="0" value={fAmountPaid}
                    onChange={e => setFAmountPaid(e.target.value)} placeholder="0.00"
                    className="w-48 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  {fAmount && fAmountPaid && (
                    <span className="ml-3 text-xs text-zinc-500">
                      Pendiente: ${(parseFloat(fAmount) - parseFloat(fAmountPaid || '0')).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <input type="hidden" name="invoiceUrl" value={fInvoiceUrl} />

            {formError && <p className="text-red-400 text-sm">{formError}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={loading || analyzing}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Guardar gasto'}
              </button>
              <button type="button" onClick={closeForm}
                className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {expenses.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No hay gastos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Categoría</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Descripción</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Camión</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => {
                  const isPaid = !!exp.paidDate || (!exp.isCredit && exp.amountPaid >= exp.amount)
                  const isPartial = exp.isCredit && exp.amountPaid > 0 && exp.amountPaid < exp.amount
                  const isPending = exp.isCredit && exp.amountPaid === 0
                  const remaining = exp.amount - exp.amountPaid

                  return (
                    <tr key={exp.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${editing?.id === exp.id ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                        {new Date(exp.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[exp.category] ?? 'text-zinc-400'}`}>
                          {categoryLabels[exp.category] ?? exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{exp.description}</span>
                          {exp.invoiceUrl && (
                            <a href={exp.invoiceUrl} target="_blank" rel="noreferrer" title="Ver factura"
                              className="text-zinc-500 hover:text-amber-400 transition-colors flex-shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{exp.truck ? exp.truck.plate : '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-semibold">${exp.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <span className="text-xs text-emerald-400">✓ Pagado</span>
                        ) : isPartial ? (
                          <div className="space-y-1">
                            <div className="text-xs text-amber-400">
                              Parcial: ${exp.amountPaid.toFixed(2)} / ${exp.amount.toFixed(2)}
                            </div>
                            <div className="text-xs text-zinc-500">Debe: ${remaining.toFixed(2)}</div>
                            {partialId === exp.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <input type="number" step="0.01" min="0" placeholder="Abonar $"
                                  value={partialAmount} onChange={e => setPartialAmount(e.target.value)}
                                  className="w-24 bg-zinc-800 border border-zinc-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500" />
                                <button onClick={() => handlePartialSave(exp.id)}
                                  className="text-xs bg-amber-500 text-zinc-950 font-semibold px-2 py-1 rounded transition-colors hover:bg-amber-400">OK</button>
                                <button onClick={() => setPartialId(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setPartialId(exp.id); setPartialAmount('') }}
                                className="text-xs text-amber-400 hover:underline">+ Abonar</button>
                            )}
                          </div>
                        ) : isPending ? (
                          <div className="space-y-1">
                            <span className="text-xs text-red-400 block">Pendiente ${exp.amount.toFixed(2)}</span>
                            {partialId === exp.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <input type="number" step="0.01" min="0" placeholder="Monto $"
                                  value={partialAmount} onChange={e => setPartialAmount(e.target.value)}
                                  className="w-24 bg-zinc-800 border border-zinc-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500" />
                                <button onClick={() => handlePartialSave(exp.id)}
                                  className="text-xs bg-amber-500 text-zinc-950 font-semibold px-2 py-1 rounded transition-colors hover:bg-amber-400">OK</button>
                                <button onClick={() => { handlePaid(exp.id) }}
                                  className="text-xs bg-emerald-600 text-white px-2 py-1 rounded transition-colors hover:bg-emerald-500">Full</button>
                                <button onClick={() => setPartialId(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setPartialId(exp.id); setPartialAmount('') }}
                                className="text-xs text-amber-400 hover:underline">Registrar pago</button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(exp)}
                            className="text-zinc-600 hover:text-amber-400 transition-colors" title="Editar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(exp.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors" title="Eliminar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
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
