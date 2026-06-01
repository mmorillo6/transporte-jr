'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { addPendingMechanicCharge, markMechanicChargeApplied, updatePeriodAdminFee, updatePeriodMechanicFee } from '@/app/actions/mechanicCharges'

type Charge = {
  id: string
  description: string
  amount: number
  appliedAt: Date | null
  notes: string | null
  truck: { plate: string } | null
  owner: { name: string } | null
}
type PeriodOption = { id: string; startDate: string; endDate: string }
type TruckOption  = { id: string; plate: string }
type OwnerOption  = { id: string; name: string }

export default function MechanicChargesClient({
  periodId,
  currentAdminFeeBase,
  currentMechanicFeeBase,
  pendingCharges,
  allPeriods,
  allTrucks,
  allOwners,
}: {
  periodId: string
  currentAdminFeeBase: number | null
  currentMechanicFeeBase: number | null
  pendingCharges: Charge[]
  allPeriods: PeriodOption[]
  allTrucks: TruckOption[]
  allOwners: OwnerOption[]
}) {
  const router = useRouter()

  // ── Admin fee ────────────────────────────────────────────────────────────────
  const [adminFee, setAdminFee]       = useState(currentAdminFeeBase != null ? String(currentAdminFeeBase) : '')
  const [savingFee, setSavingFee]     = useState(false)

  async function handleSaveFee() {
    const val = parseFloat(adminFee)
    if (!val || val <= 0) { toast.error('Ingresa un valor válido'); return }
    setSavingFee(true)
    const res = await updatePeriodAdminFee(periodId, val)
    setSavingFee(false)
    if (res && 'error' in res) toast.error(res.error)
    else { toast.success('Admin fee guardado'); router.refresh() }
  }

  // ── Mechanic fee ─────────────────────────────────────────────────────────────
  const [mechFee, setMechFee]         = useState(currentMechanicFeeBase != null ? String(currentMechanicFeeBase) : '')
  const [savingMech, setSavingMech]   = useState(false)

  async function handleSaveMechFee() {
    const val = parseFloat(mechFee)
    if (!val || val <= 0) { toast.error('Ingresa un valor válido'); return }
    setSavingMech(true)
    const res = await updatePeriodMechanicFee(periodId, val)
    setSavingMech(false)
    if (res && 'error' in res) toast.error(res.error)
    else { toast.success('Nómina mecánicos guardada — regenera la nómina para aplicar'); router.refresh() }
  }

  // ── Mechanic charges ─────────────────────────────────────────────────────────
  const [open, setOpen]                 = useState(pendingCharges.length > 0)
  const [desc, setDesc]                 = useState('')
  const [amount, setAmount]             = useState('')
  const [truckOrOwner, setTruckOrOwner] = useState('')
  const [targetPeriodId, setTargetPeriodId] = useState(periodId)
  const [notes, setNotes]               = useState('')
  const [adding, setAdding]             = useState(false)

  async function handleAdd() {
    if (!desc.trim() || !amount || !truckOrOwner) {
      toast.error('Completa descripción, monto y destinatario')
      return
    }
    const [type, id] = truckOrOwner.split(':')
    setAdding(true)
    const res = await addPendingMechanicCharge({
      description:     desc,
      amount:          parseFloat(amount),
      truckId:         type === 'truck' ? id : null,
      ownerId:         type === 'owner' ? id : null,
      targetPeriodId,
      notes:           notes || undefined,
    })
    setAdding(false)
    if (res && 'error' in res) toast.error(res.error)
    else {
      toast.success('Cargo registrado')
      setDesc(''); setAmount(''); setNotes(''); setTruckOrOwner('')
      router.refresh()
    }
  }

  async function handleApplied(chargeId: string) {
    const res = await markMechanicChargeApplied(chargeId, periodId)
    if (res && 'error' in res) toast.error(res.error)
    else { toast.success('Marcado como aplicado'); router.refresh() }
  }

  const fmtPeriod = (d: string) =>
    new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const money = (n: number) =>
    n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-3">

      {/* ── Admin fee del período ──────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">Admin fee del período</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-zinc-300 text-sm">Base por camión propio</p>
            <p className="text-zinc-600 text-xs mt-0.5">
              {currentAdminFeeBase != null
                ? `Guardado: $${currentAdminFeeBase}/carro — se usará en la próxima generación`
                : 'Sin valor guardado — usará el global del sistema'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              type="number" step="1" min="0"
              value={adminFee}
              onChange={e => setAdminFee(e.target.value)}
              placeholder="50"
              className="w-16 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-amber-500"
            />
            <span className="text-zinc-500 text-xs">/carro</span>
            <button
              onClick={handleSaveFee}
              disabled={savingFee}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs transition-colors"
            >
              {savingFee ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Nómina mecánicos del período ─────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">Nómina mecánicos del período</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-zinc-300 text-sm">Total a repartir entre propios activos</p>
            <p className="text-zinc-600 text-xs mt-0.5">
              {currentMechanicFeeBase != null
                ? `Guardado: $${currentMechanicFeeBase} total — se divide entre propios al generar`
                : 'Sin valor — mecánica no se cobrará esta quincena'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              type="number" step="1" min="0"
              value={mechFee}
              onChange={e => setMechFee(e.target.value)}
              placeholder="1050"
              className="w-20 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-purple-500"
            />
            <span className="text-zinc-500 text-xs">total</span>
            <button
              onClick={handleSaveMechFee}
              disabled={savingMech}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs transition-colors"
            >
              {savingMech ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Cargos de mecánica ────────────────────────────────────────────────── */}
      <div className={`border rounded-2xl overflow-hidden ${pendingCharges.length > 0 ? 'bg-zinc-900 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-sm">Cargos de mecánica</span>
            {pendingCharges.length > 0 && (
              <span className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                {pendingCharges.length} pendiente{pendingCharges.length !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-zinc-500 text-xs hidden sm:inline">Recordatorio de descuentos a aplicar manualmente</span>
          </div>
          <span className="text-zinc-400 text-lg">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="border-t border-zinc-800 p-5 space-y-5">

            {/* Pending list */}
            {pendingCharges.length > 0 && (
              <div className="space-y-2">
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Pendientes de aplicar</p>
                {pendingCharges.map(c => (
                  <div key={c.id}
                    className="flex items-center justify-between gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-mono text-xs font-semibold">
                          {c.truck?.plate ?? c.owner?.name ?? '—'}
                        </span>
                        <span className="text-zinc-300 text-xs">{c.description}</span>
                      </div>
                      {c.notes && <p className="text-zinc-500 text-xs mt-0.5">{c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-amber-400 font-mono text-sm font-semibold">${money(c.amount)}</span>
                      <button
                        onClick={() => handleApplied(c.id)}
                        className="text-xs bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-400 border border-zinc-700 hover:border-emerald-500/30 text-zinc-400 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                      >
                        Ya aplicado ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">Registrar cargo futuro</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={desc}
                  onChange={e => setDesc(e.target.value.toUpperCase())}
                  placeholder="Descripción — ej. CAMBIO DIFERENCIAL"
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 sm:col-span-2"
                />
                <select
                  value={truckOrOwner}
                  onChange={e => setTruckOrOwner(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">— Camión o dueño —</option>
                  <optgroup label="Camiones">
                    {allTrucks.map(t => (
                      <option key={t.id} value={`truck:${t.id}`}>{t.plate}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Dueños">
                    {allOwners.map(o => (
                      <option key={o.id} value={`owner:${o.id}`}>{o.name}</option>
                    ))}
                  </optgroup>
                </select>
                <input
                  type="number" step="0.01" min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Monto $"
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs text-right focus:outline-none focus:border-amber-500"
                />
                <select
                  value={targetPeriodId}
                  onChange={e => setTargetPeriodId(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  {allPeriods.map(p => (
                    <option key={p.id} value={p.id}>
                      {fmtPeriod(p.startDate)} — {fmtPeriod(p.endDate)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notas (opcional)"
                  className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2 text-xs transition-colors"
                >
                  {adding ? 'Guardando...' : 'Registrar cargo'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
