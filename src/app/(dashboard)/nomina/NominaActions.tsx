'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generatePayroll, closePeriod, reopenPeriod } from '@/app/actions/payroll'
import { toast } from 'sonner'
import DeletePeriodButton from './DeletePeriodButton'

export default function NominaActions({
  periodId,
  status,
  hasPayroll,
}: {
  periodId: string
  status: string
  hasPayroll: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    const res = await generatePayroll(periodId)
    if (res.error) toast.error(res.error)
    else router.refresh()
    setLoading(false)
  }

  async function handleClose() {
    if (!confirm('¿Cerrar este período? Ya no se podrán agregar viajes.')) return
    setLoading(true)
    const res = await closePeriod(periodId)
    if (res.error) toast.error(res.error)
    else router.refresh()
    setLoading(false)
  }

  async function handleReopen() {
    setLoading(true)
    await reopenPeriod(periodId)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleGenerate}
        disabled={loading}
        title={hasPayroll ? 'Recalcula el saldo de cada dueño con los viajes, gastos y préstamos actuales. Úsalo cada vez que agregues viajes o gastos nuevos.' : 'Genera la nómina del período por primera vez basándose en los viajes y gastos registrados.'}
        className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-sm transition-colors"
      >
        {loading ? '...' : hasPayroll ? 'Recalcular' : 'Generar nómina'}
      </button>

      {status === 'OPEN' && hasPayroll && (
        <button
          onClick={handleClose}
          disabled={loading}
          title="Cierra la quincena y notifica a los dueños. Solo hazlo cuando ya estén todos los viajes y gastos cargados. Después no se podrán agregar más viajes."
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          Cerrar período
        </button>
      )}

      {status === 'CLOSED' && (
        <button
          onClick={handleReopen}
          disabled={loading}
          title="Reabre la quincena para hacer correcciones. Los dueños recibirán nueva notificación cuando se cierre de nuevo."
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          Reabrir
        </button>
      )}

      <DeletePeriodButton periodId={periodId} />
    </div>
  )
}
