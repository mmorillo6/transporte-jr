'use client'
import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createTruck, updateTruck, toggleTruckStatus, deleteTruck, createOwner, updateOwner, deleteOwner } from '@/app/actions/config'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Truck = {
  id: string; plate: string; active: boolean
  driver: { id: string; name: string } | null
  owner: { id: string; name: string; type: string; nprPercent: number; isNPROwner: boolean }
  status: { status: string; notes: string | null } | null
  _count: { trips: number }
}
type Owner = {
  id: string; name: string; type: string; nprPercent: number; isNPROwner: boolean
  phone: string | null; active: boolean
  trucks: { id: string; plate: string; driver: { name: string } | null }[]
}
type Driver = { id: string; name: string }
type PeriodGroup = {
  period: { id: string; startDate: string; endDate: string; status: string }
  grossAmount: number; commissionFee: number; netAmount: number; truckCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRUCK_STATUS_STYLE: Record<string, string> = {
  OPERATIONAL: 'text-emerald-400 bg-emerald-400/10',
  IN_SHOP: 'text-amber-400 bg-amber-400/10',
  OUT_OF_SERVICE: 'text-red-400 bg-red-400/10',
}
const TRUCK_STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operativo',
  IN_SHOP: 'En taller',
  OUT_OF_SERVICE: 'Fuera de servicio',
}
const OWNER_TYPE_STYLE: Record<string, string> = {
  PROPIO: 'text-emerald-400 bg-emerald-400/10',
  AFILIADO: 'text-violet-400 bg-violet-400/10',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CamionesClient({
  trucks, owners, drivers, canEdit, payrollByOwner, initialTab, nuevaPlaca,
}: {
  trucks: Truck[]
  owners: Owner[]
  drivers: Driver[]
  canEdit: boolean
  payrollByOwner: Record<string, PeriodGroup[]>
  initialTab?: string
  nuevaPlaca?: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'flota' | 'propietarios'>(
    initialTab === 'propietarios' ? 'propietarios' : 'flota'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Truck form state
  const [showTruckForm, setShowTruckForm] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [formPlate, setFormPlate] = useState('')
  const editFormRef = useRef<HTMLDivElement>(null)

  // Auto-open form when coming from romana with a plate
  useEffect(() => {
    if (nuevaPlaca && canEdit) {
      setFormPlate(nuevaPlaca)
      setEditingTruck(null)
      setShowTruckForm(true)
      setError('')
    }
  }, [nuevaPlaca, canEdit])

  // Scroll to form when editing a truck
  useEffect(() => {
    if (editingTruck && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [editingTruck])

  // Owner form state
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null)
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null)

  // ─── Truck handlers ─────────────────────────────────────────────────────────

  async function handleTruckSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = editingTruck ? await updateTruck(editingTruck.id, fd) : await createTruck(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowTruckForm(false); setEditingTruck(null); router.refresh(); setLoading(false) }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleTruckStatus(id, !active)
    router.refresh()
  }

  async function handleDeleteTruck(id: string, plate: string, tripCount: number) {
    const msg = tripCount > 0
      ? `¿Eliminar el camión ${plate}?\n\nTiene ${tripCount} viajes registrados que también se eliminarán.\n\nEscribe "ELIMINAR" para confirmar.`
      : `¿Eliminar el camión ${plate}? Esta acción no se puede deshacer.`
    if (tripCount > 0) {
      if (window.prompt(msg)?.trim().toUpperCase() !== 'ELIMINAR') return
    } else {
      if (!confirm(msg)) return
    }
    const res = await deleteTruck(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  // ─── Owner handlers ──────────────────────────────────────────────────────────

  async function handleOwnerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    const res = editingOwner ? await updateOwner(editingOwner.id, fd) : await createOwner(fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setShowOwnerForm(false); setEditingOwner(null); router.refresh(); setLoading(false) }
  }

  async function handleDeleteOwner(id: string, name: string) {
    if (!confirm(`¿Eliminar al dueño "${name}"?`)) return
    const res = await deleteOwner(id)
    if (res.error) toast.error(res.error)
    else router.refresh()
  }

  function formatPeriod(start: string, end: string) {
    const fmt = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    return `${fmt(start)} — ${fmt(end)}`
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(['flota', 'propietarios'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t === 'flota' ? `Unidades (${trucks.filter(t => t.active).length})` : `Propietarios (${owners.length})`}
          </button>
        ))}
      </div>

      {/* ── FLOTA TAB ────────────────────────────────────────────────────────── */}
      {tab === 'flota' && (
        <>
          {canEdit && (
            <div className="flex gap-2">
              <button onClick={() => { setEditingTruck(null); setFormPlate(''); setShowTruckForm(true); setError('') }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
                + Nuevo camión
              </button>
            </div>
          )}

          {(showTruckForm || editingTruck) && (
            <div ref={editFormRef} className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">{editingTruck ? 'Editar camión' : 'Nuevo camión'}</h3>
              <form key={editingTruck?.id ?? formPlate} onSubmit={handleTruckSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Placa *</label>
                    <input name="plate" required defaultValue={editingTruck?.plate ?? formPlate} placeholder="A31CX2A"
                      maxLength={8}
                      onKeyDown={e => { if (!/[A-Za-z0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
                      onInput={e => { const el = e.target as HTMLInputElement; el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }}
                      pattern="[A-Z0-9]{5,8}" title="5 a 8 caracteres alfanuméricos"
                      onInvalid={e => (e.target as HTMLInputElement).setCustomValidity('Placa inválida.')}
                      onChange={e => (e.target as HTMLInputElement).setCustomValidity('')}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm uppercase tracking-widest font-mono focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Dueño *</label>
                    <select name="ownerId" required defaultValue={editingTruck?.owner.id ?? ''}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Seleccionar...</option>
                      {owners.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.type === 'AFILIADO' ? `Afiliado ${o.nprPercent}%` : 'Propio'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Chofer asignado</label>
                    <select name="driverId" defaultValue={editingTruck?.driver?.id ?? ''}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Sin chofer</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  {editingTruck && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Estado</label>
                      <select name="active" defaultValue={editingTruck.active ? 'true' : 'false'}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                      </select>
                    </div>
                  )}
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => { setShowTruckForm(false); setEditingTruck(null) }}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {trucks.map(truck => (
              <div key={truck.id} className={`bg-zinc-900 border rounded-2xl p-4 transition-opacity ${truck.active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-lg font-mono">{truck.plate}</p>
                    <p className="text-zinc-400 text-sm">{truck.driver?.name ?? 'Sin chofer asignado'}</p>
                  </div>
                  <div className="text-right">
                    {truck.status ? (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${TRUCK_STATUS_STYLE[truck.status.status]}`}>
                        {TRUCK_STATUS_LABEL[truck.status.status]}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600 px-2 py-1 rounded-full bg-zinc-800">Sin estado</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 mb-3">
                  <div>
                    <p className="text-zinc-500 text-xs">Dueño</p>
                    <p className="text-zinc-300 text-sm">{truck.owner.name}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Tipo</p>
                    <p className={`text-sm font-medium ${OWNER_TYPE_STYLE[truck.owner.type]}`}>
                      {truck.owner.type === 'AFILIADO' ? `Afiliado ${truck.owner.nprPercent}%` : 'Propio'}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Viajes</p>
                    <p className="text-zinc-300 text-sm font-semibold">{truck._count.trips}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t border-zinc-800">
                  <Link href={`/camiones/${truck.id}`}
                    className="flex-1 text-center text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 rounded-lg py-1.5 transition-colors font-medium">
                    Ver ficha
                  </Link>
                  {canEdit && (
                    <>
                      <button onClick={() => { setEditingTruck(truck); setShowTruckForm(false); setError('') }}
                        className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg py-1.5 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleToggle(truck.id, truck.active)}
                        className={`flex-1 text-xs rounded-lg py-1.5 transition-colors ${
                          truck.active ? 'text-zinc-400 bg-zinc-800 hover:bg-zinc-700' : 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                        }`}>
                        {truck.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button onClick={() => handleDeleteTruck(truck.id, truck.plate, truck._count.trips)}
                        className="text-xs text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg px-2.5 py-1.5 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PROPIETARIOS TAB ─────────────────────────────────────────────────── */}
      {tab === 'propietarios' && (
        <>
          {canEdit && (
            <button onClick={() => { setShowOwnerForm(true); setEditingOwner(null); setError('') }}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-sm transition-colors">
              + Nuevo dueño
            </button>
          )}

          {(showOwnerForm || editingOwner) && (
            <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">{editingOwner ? 'Editar dueño' : 'Nuevo dueño'}</h3>
              <form onSubmit={handleOwnerSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Nombre *</label>
                    <input name="name" required defaultValue={editingOwner?.name ?? ''} placeholder="Jose Rodríguez"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Tipo *</label>
                    <select name="type" required defaultValue={editingOwner?.type ?? 'PROPIO'}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="PROPIO">Propio (empresa)</option>
                      <option value="AFILIADO">Afiliado (externo)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">% NPR</label>
                    <input name="nprPercent" type="number" step="0.1" min="0" max="100"
                      defaultValue={editingOwner?.nprPercent ?? 5}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                    <p className="text-zinc-600 text-xs mt-1">5% propio · 10% afiliado</p>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Dueño del NPR</label>
                    <select name="isNPROwner" defaultValue={editingOwner?.isNPROwner ? 'true' : 'false'}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                      <option value="false">No</option>
                      <option value="true">Sí (José)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Teléfono</label>
                    <input name="phone" type="tel" defaultValue={editingOwner?.phone ?? ''} placeholder="04141234567" maxLength={15}
                      onKeyDown={e => { if (!/[\d+\-\s()]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                    {loading ? 'Guardando...' : editingOwner ? 'Guardar cambios' : 'Crear dueño'}
                  </button>
                  <button type="button" onClick={() => { setShowOwnerForm(false); setEditingOwner(null) }}
                    className="px-4 py-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Nombre</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Tipo</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">NPR</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs hidden md:table-cell">Teléfono</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs hidden lg:table-cell">Camiones activos</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {owners.map(owner => (
                  <React.Fragment key={owner.id}>
                    <tr className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${!owner.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-white font-medium">{owner.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${OWNER_TYPE_STYLE[owner.type]}`}>
                          {owner.type === 'PROPIO' ? 'Propio' : 'Afiliado'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {owner.nprPercent}%{owner.isNPROwner && <span className="ml-1 text-amber-400 text-xs" title="Dueño del NPR">★</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs hidden md:table-cell">{owner.phone ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {owner.trucks.length === 0
                            ? <span className="text-zinc-600 text-xs">—</span>
                            : owner.trucks.map(t => (
                              <span key={t.plate} className="text-xs bg-zinc-800 text-zinc-300 font-mono px-2 py-0.5 rounded">
                                {t.plate}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setExpandedOwner(prev => prev === owner.id ? null : owner.id)}
                            className={`text-xs rounded-lg px-3 py-1.5 transition-colors ${expandedOwner === owner.id ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700'}`}>
                            Ver cuenta
                          </button>
                          {canEdit && (
                            <>
                              <button onClick={() => { setEditingOwner(owner); setShowOwnerForm(false); setError('') }}
                                className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                                Editar
                              </button>
                              <button onClick={() => handleDeleteOwner(owner.id, owner.name)}
                                className="text-zinc-600 hover:text-red-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedOwner === owner.id && (() => {
                      const periods = payrollByOwner[owner.id] ?? []
                      const totalGross = periods.reduce((s, p) => s + p.grossAmount, 0)
                      const totalCommission = periods.reduce((s, p) => s + p.commissionFee, 0)
                      return (
                        <tr key={`${owner.id}-account`}>
                          <td colSpan={6} className="px-4 pb-4 pt-0">
                            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-white font-semibold text-sm">Estado de cuenta — {owner.name}</h4>
                                <span className="text-zinc-500 text-xs">{periods.length} período{periods.length !== 1 ? 's' : ''}</span>
                              </div>
                              {periods.length === 0 ? (
                                <p className="text-zinc-500 text-sm">Sin nóminas generadas para esta flota</p>
                              ) : (
                                <>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-zinc-900 rounded-lg p-3">
                                      <p className="text-zinc-500 text-xs">Monto bruto total</p>
                                      <p className="text-white font-bold mt-0.5">${totalGross.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-zinc-900 rounded-lg p-3">
                                      <p className="text-zinc-500 text-xs">Gastos Op. totales</p>
                                      <p className="text-amber-400 font-bold mt-0.5">${totalCommission.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-zinc-900 rounded-lg p-3">
                                      <p className="text-zinc-500 text-xs">% NPR</p>
                                      <p className="text-zinc-300 font-bold mt-0.5">{owner.nprPercent}%{owner.isNPROwner ? ' ★' : ''}</p>
                                    </div>
                                  </div>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-zinc-700">
                                        <th className="text-left text-zinc-500 font-medium py-2">Período</th>
                                        <th className="text-right text-zinc-500 font-medium py-2">Camiones</th>
                                        <th className="text-right text-zinc-500 font-medium py-2">Bruto</th>
                                        <th className="text-right text-zinc-500 font-medium py-2">Comisión</th>
                                        <th className="text-left text-zinc-500 font-medium py-2">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {periods.map(pg => (
                                        <tr key={pg.period.id} className="border-b border-zinc-700/40">
                                          <td className="py-2 text-zinc-300">{formatPeriod(pg.period.startDate, pg.period.endDate)}</td>
                                          <td className="py-2 text-right text-zinc-400">{pg.truckCount}</td>
                                          <td className="py-2 text-right text-white">${pg.grossAmount.toFixed(2)}</td>
                                          <td className="py-2 text-right text-amber-400">${pg.commissionFee.toFixed(2)}</td>
                                          <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded-full ${pg.period.status === 'CLOSED' ? 'text-zinc-400 bg-zinc-700' : 'text-emerald-400 bg-emerald-400/10'}`}>
                                              {pg.period.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })()}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
