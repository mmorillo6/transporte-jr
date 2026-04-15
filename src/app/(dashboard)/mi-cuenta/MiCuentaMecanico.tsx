'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  session: { name: string }
  recentWork: {
    id: string
    date: string
    description: string
    plate: string
    mechanicCut: number
  }[]
  clockEntry: { id: string; clockIn: string } | null
  monthEarnings: number
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })

export default function MiCuentaMecanico({ session, recentWork, clockEntry, monthEarnings }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'

  async function handleClock() {
    setLoading(true)
    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: clockEntry ? 'out' : 'in', entryId: clockEntry?.id }),
      })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else {
        toast.success(clockEntry ? 'Salida registrada' : 'Entrada registrada')
        router.refresh()
      }
    } catch {
      toast.error('Error de conexión')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="pt-2">
        <p className="text-zinc-500 text-sm">{greeting},</p>
        <h1 className="text-2xl font-bold text-white">{session.name.split(' ')[0]}</h1>
        <p className="text-zinc-500 text-xs mt-0.5">Mecánico</p>
      </div>

      {/* Clock in/out */}
      <div className={`rounded-2xl p-5 border ${clockEntry ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              {clockEntry ? 'Turno en curso' : 'Sin turno activo'}
            </p>
            {clockEntry && (
              <p className="text-emerald-400 font-bold text-xl mt-1">
                Desde las {fmtTime(clockEntry.clockIn)}
              </p>
            )}
            {!clockEntry && (
              <p className="text-zinc-500 text-sm mt-1">Registra tu entrada cuando comiences</p>
            )}
          </div>
          <button
            onClick={handleClock}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${
              clockEntry
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-emerald-500 text-white hover:bg-emerald-400'
            }`}
          >
            {loading ? '...' : clockEntry ? 'Marcar salida' : 'Marcar entrada'}
          </button>
        </div>
      </div>

      {/* Month earnings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-3">Este mes</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-500 text-xs">Ganancias acumuladas</p>
            <p className="text-amber-400 font-bold text-3xl mt-1">${monthEarnings.toFixed(2)}</p>
          </div>
          <p className="text-zinc-500 text-xs">{recentWork.length} trabajos</p>
        </div>
      </div>

      {/* Recent work */}
      {recentWork.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Últimos trabajos</p>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {recentWork.map(w => (
              <div key={w.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm truncate">{w.description}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {fmt(w.date)} · <span className="font-mono">{w.plate}</span>
                  </p>
                </div>
                <p className="text-amber-400 font-semibold text-sm ml-3">${w.mechanicCut.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentWork.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-500 text-sm">Sin trabajos registrados aún</p>
        </div>
      )}
    </div>
  )
}
