'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { fixAuruminCxCPayments } from '@/app/actions/fixCxCPayments'
import { seedMaterialEsterilMayo } from '@/app/actions/seedMaterialEsteril'

export default function FixCxCButton() {
  const [loadingCxC, setLoadingCxC]     = useState(false)
  const [loadingSeed, setLoadingSeed]   = useState(false)
  const [doneCxC, setDoneCxC]           = useState(false)
  const [doneSeed, setDoneSeed]         = useState(false)

  async function handleCxC() {
    if (!confirm('Registrará los pagos faltantes de Aurumin del Excel ($25,000 abr 01-15 y $20,000 abr 16-30) para que la deuda refleje $18,065.94. ¿Continuar?')) return
    setLoadingCxC(true)
    const res = await fixAuruminCxCPayments()
    setLoadingCxC(false)
    if (res.error) { toast.error(res.error); return }
    setDoneCxC(true)
    toast.success('Pagos registrados: ' + res.results?.join(' · '))
  }

  async function handleSeed() {
    if (!confirm('Cargará 46 viajes de material estéril (mayo 2026, Luis Peña) desde los datos enviados por Fernando. ¿Continuar?')) return
    setLoadingSeed(true)
    const res = await seedMaterialEsterilMayo()
    setLoadingSeed(false)
    if (res.error) { toast.error(res.error); return }
    setDoneSeed(true)
    const msg = `${res.created} viajes de estéril cargados` +
      (res.notFound && res.notFound.length > 0 ? ` · No encontrados: ${res.notFound.join(', ')}` : '')
    toast.success(msg)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {doneSeed ? (
        <span className="text-emerald-400 text-xs">✓ Estéril mayo cargado</span>
      ) : (
        <button onClick={handleSeed} disabled={loadingSeed}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-violet-500/40 text-zinc-400 hover:text-violet-400 rounded-xl text-xs font-medium transition-colors disabled:opacity-50">
          {loadingSeed ? 'Cargando...' : '🪨 Cargar estéril mayo (Fernando)'}
        </button>
      )}
      {doneCxC ? (
        <span className="text-emerald-400 text-xs">✓ Pagos Aurumin corregidos</span>
      ) : (
        <button onClick={handleCxC} disabled={loadingCxC}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/40 text-zinc-400 hover:text-amber-400 rounded-xl text-xs font-medium transition-colors disabled:opacity-50">
          {loadingCxC ? 'Aplicando...' : '🔧 Corregir pagos Aurumin (Excel)'}
        </button>
      )}
    </div>
  )
}
