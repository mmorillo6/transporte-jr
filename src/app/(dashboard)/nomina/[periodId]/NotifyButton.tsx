'use client'
import { useState } from 'react'
import { notifyPeriodReady, type NotifyResult } from '@/app/actions/notify'
import { toast } from 'sonner'

export default function NotifyButton({ periodId }: { periodId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NotifyResult | null>(null)

  async function handleNotify() {
    if (!confirm('¿Enviar notificación a todos los dueños y afiliados con camiones en este período?')) return
    setLoading(true)
    const res = await notifyPeriodReady(periodId)
    setLoading(false)
    if (res.error) { toast.error(res.error); return }
    setResult(res)
    if (res.sent.length > 0) toast.success(`Notificación enviada a ${res.sent.length} persona${res.sent.length !== 1 ? 's' : ''}`)
    else toast.error('No se pudo notificar a nadie')
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleNotify}
        disabled={loading}
        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 hover:border-amber-500/40 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition-colors"
      >
        <span className="text-base leading-none">{loading ? '⏳' : '🔔'}</span>
        {loading ? 'Enviando...' : 'Notificar dueños'}
      </button>

      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs space-y-1.5">
          {result.sent.map(s => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span className="text-white font-medium">{s.name}</span>
              <span className="text-zinc-500">
                {[s.email && 'email', s.whatsapp && 'WhatsApp'].filter(Boolean).join(' + ')}
              </span>
            </div>
          ))}
          {result.skipped.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-zinc-600">—</span>
              <span className="text-zinc-500">{s.name}: {s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
