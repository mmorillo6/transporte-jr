'use client'
import { useState, Fragment, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createUser, updateUser, toggleUserActive, deleteUser } from '@/app/actions/config'
import { toast } from 'sonner'

const ROLE_LABEL: Record<string, string> = {
  DUENO: 'Dueño',
  ENCARGADO: 'Encargado',
  AFILIADO: 'Afiliado',
  MECANICO: 'Mecánico',
  CHOFER: 'Chofer',
}

const ROLE_STYLE: Record<string, string> = {
  DUENO: 'text-amber-400 bg-amber-400/10',
  ENCARGADO: 'text-blue-400 bg-blue-400/10',
  AFILIADO: 'text-violet-400 bg-violet-400/10',
  MECANICO: 'text-orange-400 bg-orange-400/10',
  CHOFER: 'text-emerald-400 bg-emerald-400/10',
}

type User = {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  whatsappApiKey: string | null
  active: boolean
  owner: { id: string; name: string } | null
}
type Owner = { id: string; name: string }

function UserForm({
  editing,
  owners,
  onCancel,
  onSaved,
}: {
  editing: User | null
  owners: Owner[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = editing ? await updateUser(editing.id, fd) : await createUser(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { onSaved(); setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-zinc-800/50 border-t border-amber-500/20">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Nombre completo *</label>
          <input name="name" required defaultValue={editing?.name ?? ''} placeholder="Luis Peña"
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Email *</label>
          <input name="email" type="email" required defaultValue={editing?.email ?? ''} placeholder="usuario@transportejr.com"
            onInvalid={e => (e.target as HTMLInputElement).setCustomValidity('Ingresa un correo válido (ej: nombre@dominio.com)')}
            onInput={e => (e.target as HTMLInputElement).setCustomValidity('')}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Rol *</label>
          <select name="role" required defaultValue={editing?.role ?? ''}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
            <option value="">Seleccionar...</option>
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Teléfono</label>
          <input name="phone" type="tel" defaultValue={editing?.phone ?? ''} placeholder="04141234567"
            maxLength={15}
            onKeyDown={e => { if (!/[\d+\-\s()]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">
            {editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
          </label>
          <div className="relative">
            <input name={editing ? 'newPassword' : 'password'} type={showPassword ? 'text' : 'password'}
              required={!editing} placeholder="••••••••"
              autoComplete="new-password"
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
              {showPassword
                ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              }
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Dueño vinculado (afiliados)</label>
          <select name="ownerId" defaultValue={editing?.owner?.id ?? ''}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
            <option value="">Ninguno</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">WhatsApp API key (CallMeBot)</label>
        <p className="text-zinc-600 text-[11px] mb-1.5">
          El dueño debe enviar &quot;I allow callmebot to send me messages&quot; al número <span className="text-zinc-400 font-mono">+34 623 78 64 49</span> en WhatsApp, y recibirá su API key.
        </p>
        <input name="whatsappApiKey" defaultValue={editing?.whatsappApiKey ?? ''} placeholder="ej: 1234567"
          className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
      </div>

      {editing && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Estado</label>
          <select name="active" defaultValue={editing.active ? 'true' : 'false'}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
          {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear usuario'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default function UsuariosClient({
  users, owners, currentUserId, currentUserRole,
}: { users: User[]; owners: Owner[]; currentUserId: string; currentUserRole: string }) {
  const router = useRouter()
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const accordionRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (editingId && accordionRef.current) {
      accordionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [editingId])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar al usuario "${name}"? Esta acción no se puede deshacer.`)) return
    const res = await deleteUser(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  async function handleToggle(id: string, active: boolean) {
    if (id === currentUserId) return
    await toggleUserActive(id, !active)
    router.refresh()
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = !filterRole || u.role === filterRole
    return matchSearch && matchRole
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
          <option value="">Todos los roles</option>
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={() => { setShowNewForm(v => !v); setEditingId(null) }}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors whitespace-nowrap">
          + Nuevo usuario
        </button>
      </div>

      {/* Formulario nuevo usuario */}
      {showNewForm && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl overflow-hidden">
          <p className="text-white font-semibold text-sm px-5 pt-4 pb-0">Nuevo usuario</p>
          <UserForm
            key="new"
            editing={null}
            owners={owners}
            onCancel={() => setShowNewForm(false)}
            onSaved={() => { setShowNewForm(false); router.refresh() }}
          />
        </div>
      )}

      {/* Tabla */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 text-sm">No se encontraron usuarios</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Nombre</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Email</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Rol</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Teléfono</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Dueño</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <Fragment key={user.id}>
                    <tr className={`border-b border-zinc-800/50 transition-colors ${editingId === user.id ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'} ${!user.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_STYLE[user.role] ?? 'text-zinc-400'}`}>
                          {ROLE_LABEL[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{user.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{user.owner?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.active ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 bg-zinc-500/10'}`}>
                          {user.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingId(editingId === user.id ? null : user.id); setShowNewForm(false) }}
                            className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${editingId === user.id ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'}`}>
                            {editingId === user.id ? 'Cerrar' : 'Editar'}
                          </button>
                          {user.id !== currentUserId && (
                            <>
                              <button onClick={() => handleToggle(user.id, user.active)}
                                className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${
                                  user.active
                                    ? 'text-red-400 bg-red-400/10 hover:bg-red-400/20'
                                    : 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                                }`}>
                                {user.active ? 'Desactivar' : 'Activar'}
                              </button>
                              {currentUserRole === 'DUENO' && (
                                <button onClick={() => handleDelete(user.id, user.name)}
                                  className="text-xs text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg px-2 py-1.5 transition-colors"
                                  title="Eliminar usuario">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingId === user.id && (
                      <tr ref={accordionRef} className="border-b border-amber-500/20">
                        <td colSpan={7} className="p-0">
                          <UserForm
                            key={user.id}
                            editing={user}
                            owners={owners}
                            onCancel={() => setEditingId(null)}
                            onSaved={() => { setEditingId(null); router.refresh() }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
