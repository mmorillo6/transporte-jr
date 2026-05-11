'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updatePayrollAbono } from '@/app/actions/payroll'

export default function AbonoClient({
  entryId,
  currentAbono,
  netAmount,
  periodStatus,
}: {
  entryId: string
  currentAbono: number
  netAmount: number
  periodStatus: string
}) {
  const router  = useRouter()
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(currentAbono.toString())
  const [saving,  setSaving]  = useState(false)

  const isClosed = periodStatus === 'CLOSED'

  if (isClosed) {
    return currentAbono > 0 ? (
      <div className="px-6 py-4 border-t border-zinc-800 print:border-zinc-200 print:hidden">
        <p className="text-xs text-zinc-500">Abono registrado: <span className="text-emerald-400 font-mono font-semibold">${currentAbono.toFixed(2)}</span></p>
      </div>
    ) : null
  }

  async function handleSave() {
    const val = parseFloat(value)
    if (isNaN(val) || val < 0) { toast.error('Monto inválido'); return }
    setSaving(true)
    const res = await updatePayrollAbono(entryId, val)
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Abono guardado')
    setEditing(false)
    router.refresh()
  }

  return (
    <div className="px-6 py-4 border-t border-zinc-800 print:hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-white font-semibold text-sm">Registrar abono</p>
          {currentAbono > 0 && (
            <p className="text-zinc-500 text-xs mt-0.5">
              Abono actual: <span className="text-emerald-400 font-mono">${currentAbono.toFixed(2)}</span>
              {' · '}Saldo final: <span className={`font-mono font-semibold ${netAmount < 0 ? 'text-red-400' : 'text-amber-400'}`}>${Math.abs(netAmount).toFixed(2)}</span>
            </p>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-sm">$</span>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              min="0"
              step="0.01"
              autoFocus
              className="w-28 bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 text-right"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(currentAbono.toString()) }}
              className="text-zinc-500 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 text-emerald-400 font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {currentAbono > 0 ? 'Editar abono' : 'Registrar abono'}
          </button>
        )}
      </div>
    </div>
  )
}
