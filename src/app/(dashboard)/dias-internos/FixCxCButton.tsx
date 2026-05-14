'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { fixAuruminCxCPayments } from '@/app/actions/fixCxCPayments'

export default function FixCxCButton() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handle() {
    if (!confirm('Esto registrará los pagos faltantes de Aurumin ($25,000 abr 01-15 y $20,000 abr 16-30) para que la deuda refleje $18,065.94. ¿Continuar?')) return
    setLoading(true)
    const res = await fixAuruminCxCPayments()
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    setDone(true)
    toast.success('Pagos registrados: ' + res.results?.join(' | '))
  }

  if (done) return <span className="text-emerald-400 text-xs">✓ Pagos corregidos</span>

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
    >
      {loading ? 'Aplicando...' : '🔧 Corregir pagos Aurumin (Excel)'}
    </button>
  )
}
