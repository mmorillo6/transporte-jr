'use client'
import { useState } from 'react'
import { changePassword, updateContactInfo } from '@/app/actions/profile'
import { toast } from 'sonner'

const ROLE_LABEL: Record<string, string> = {
  DUENO: 'Dueño',
  ENCARGADO: 'Encargado',
  AFILIADO: 'Afiliado',
  MECANICO: 'Mecánico',
  CHOFER: 'Chofer',
}

export default function PerfilClient({
  name, email, role, phone: initPhone, whatsappApiKey: initApiKey,
}: {
  name: string; email: string; role: string
  phone: string; whatsappApiKey: string
}) {
  // Password change
  const [loading, setLoading]   = useState(false)
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [pwError, setPwError]   = useState('')

  // WhatsApp / contacto
  const [phone, setPhone]       = useState(initPhone)
  const [apiKey, setApiKey]     = useState(initApiKey)
  const [savingWa, setSavingWa] = useState(false)

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (next !== confirm) { setPwError('Las contraseñas nuevas no coinciden'); return }
    setLoading(true)
    const res = await changePassword(current, next)
    setLoading(false)
    if (res.error) { setPwError(res.error) }
    else { toast.success('Contraseña actualizada'); setCurrent(''); setNext(''); setConfirm('') }
  }

  async function handleContacto() {
    setSavingWa(true)
    const res = await updateContactInfo(phone, apiKey)
    setSavingWa(false)
    if (res.error) toast.error(res.error)
    else toast.success('Datos de contacto guardados')
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

      {/* Notificaciones WhatsApp */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-white font-semibold text-sm">Notificaciones WhatsApp</h2>
          <p className="text-zinc-500 text-xs mt-1">
            Recibirás un mensaje cuando Fernando cierre una relación.
            Necesitas activar CallMeBot una sola vez.
          </p>
        </div>

        {/* Instrucciones CallMeBot */}
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-3 space-y-2 text-xs">
          <p className="text-zinc-300 font-medium">Cómo obtener tu API key:</p>
          <ol className="text-zinc-400 space-y-1 list-decimal list-inside">
            <li>Guarda este número en tu teléfono: <span className="text-white font-mono">+34 644 61 45 44</span></li>
            <li>Mándale este mensaje exacto por WhatsApp:<br />
              <span className="text-amber-300 font-mono">I allow callmebot to send me messages</span>
            </li>
            <li>Te responderá con tu API key en segundos</li>
          </ol>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Número de WhatsApp <span className="text-zinc-600">(con código de país, sin +)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="584121234567"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">API key de CallMeBot</label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="1234567"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <button
            onClick={handleContacto}
            disabled={savingWa}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            {savingWa ? 'Guardando...' : apiKey ? '✓ Guardar datos de WhatsApp' : 'Guardar número'}
          </button>
          {apiKey && phone && (
            <p className="text-emerald-400 text-xs">
              ✓ WhatsApp configurado — recibirás notificaciones cuando se cierre una relación
            </p>
          )}
        </div>
      </div>

      {/* Change password */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Cambiar contraseña</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Contraseña actual *</label>
            <input
              type="password" required value={current}
              onChange={e => setCurrent(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Nueva contraseña *</label>
            <input
              type="password" required minLength={6} value={next}
              onChange={e => setNext(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Confirmar nueva contraseña *</label>
            <input
              type="password" required minLength={6} value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
          <button
            type="submit" disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
