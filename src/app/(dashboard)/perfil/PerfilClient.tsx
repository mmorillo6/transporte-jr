'use client'
import { useState } from 'react'
import { changePassword } from '@/app/actions/profile'
import { toast } from 'sonner'

const ROLE_LABEL: Record<string, string> = {
  DUENO: 'Dueño',
  ENCARGADO: 'Encargado',
  AFILIADO: 'Afiliado',
  MECANICO: 'Mecánico',
  CHOFER: 'Chofer',
}

export default function PerfilClient({
  name, email, role,
}: { name: string; email: string; role: string }) {
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden'); return }
    setLoading(true)
    const res = await changePassword(current, next)
    setLoading(false)
    if (res.error) { setError(res.error) }
    else {
      toast.success('Contraseña actualizada')
      setCurrent(''); setNext(''); setConfirm('')
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Info card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm">Información de cuenta</h2>
        <div className="space-y-3">
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Nombre</p>
            <p className="text-white text-sm">{name}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Email</p>
            <p className="text-white text-sm">{email}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Rol</p>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
              {ROLE_LABEL[role] ?? role}
            </span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Contraseña actual *</label>
            <input
              type="password"
              required
              value={current}
              onChange={e => setCurrent(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Nueva contraseña *</label>
            <input
              type="password"
              required
              minLength={6}
              value={next}
              onChange={e => setNext(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Confirmar nueva contraseña *</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
