'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearPeriodo } from '@/app/actions/payroll'
import { toast } from 'sonner'

export default function CrearPeriodoBtn() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [start, setStart]     = useState('')
  const [end, setEnd]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) return
    setLoading(true)
    const res = await crearPeriodo(start, end)
    setLoading(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Período creado')
      setOpen(false)
      router.refresh()
      if (res.periodId) router.push(`/nomina/${res.periodId}`)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl text-sm transition-colors"
      >
        + Nuevo período
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-4">Crear período</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-sm block mb-1">Fecha inicio</label>
                <input
                  type="date" required value={start} onChange={e => setStart(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1">Fecha fin</label>
                <input
                  type="date" required value={end} onChange={e => setEnd(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={loading}
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl text-sm transition-colors"
                >
                  {loading ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
