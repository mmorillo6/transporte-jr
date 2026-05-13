'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateTripInline } from '@/app/actions/generarRelacion'
import { toast } from 'sonner'

export default function TripAmountClient({
  tripId,
  amount,
  canEdit,
}: {
  tripId: string
  amount: number
  canEdit: boolean
}) {
  const router  = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(amount.toFixed(2))
  const [saving, setSaving]   = useState(false)

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function save() {
    const newAmount = parseFloat(val)
    if (isNaN(newAmount) || newAmount < 0) { toast.error('Monto inválido'); return }
    if (newAmount === amount) { setEditing(false); return }
    setSaving(true)
    const res = await updateTripInline(tripId, { amount: newAmount })
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Monto actualizado')
    setEditing(false)
    router.refresh()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setEditing(false); setVal(amount.toFixed(2)) }
  }

  if (!canEdit) {
    return <span className="text-white font-mono">${fmt(amount)}</span>
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
          step="0.01"
          min="0"
          className="w-24 bg-zinc-800 border border-amber-500/50 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
        />
        <button onClick={save} disabled={saving}
          className="text-emerald-400 hover:text-emerald-300 text-base leading-none">✓</button>
        <button onClick={() => { setEditing(false); setVal(amount.toFixed(2)) }}
          className="text-zinc-600 hover:text-white text-base leading-none">×</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-white font-mono hover:text-amber-400 transition-colors group"
      title="Clic para editar monto"
    >
      ${fmt(amount)}
      <span className="text-zinc-700 group-hover:text-amber-500 ml-0.5 text-[10px]">✎</span>
    </button>
  )
}
