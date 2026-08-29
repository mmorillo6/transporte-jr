'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deletePeriodWithPassword } from '@/app/actions/payroll'
import { toast } from 'sonner'

// Botón + modal de "eliminar período" reutilizable — vive tanto en la
// tarjeta de "Período activo" como en cada fila de la lista de períodos,
// para que se pueda borrar un período creado por error sin tener que
// entrar primero a su página de detalle.
export default function DeletePeriodButton({ periodId }: { periodId: string }) {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!password) { toast.error('Ingresa tu contraseña'); return }
    setDeleting(true)
    const res = await deletePeriodWithPassword(periodId, password)
    setDeleting(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Período eliminado')
    setShow(false)
    setPassword('')
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setPassword(''); setShow(true) }}
        title="Eliminar período"
        className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-red-950 border border-zinc-700 hover:border-red-800 text-zinc-500 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !deleting && setShow(false)}>
          <div className="bg-zinc-900 border border-red-900/60 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
              <span className="text-red-500 text-xl">⚠</span>
              <div>
                <h2 className="text-white font-semibold text-base">Eliminar período</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-zinc-300 text-sm">
                Se eliminarán <span className="text-red-400 font-semibold">todos los viajes, gastos y entradas de nómina</span> de este período, junto con el período mismo.
              </p>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Confirma con tu contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDelete()}
                  placeholder="Contraseña"
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting || !password}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
              <button
                onClick={() => setShow(false)}
                disabled={deleting}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-2.5 text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
