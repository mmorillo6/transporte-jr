'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewRelacion, registrarRelacion, updateTripInline } from '@/app/actions/generarRelacion'
import type { RelacionPreview, RelacionTrip } from '@/app/actions/generarRelacion'

type TipoRelacion = {
  id: string; label: string; sublabel: string
  client: string; destinatario: 'EMPRESA' | 'JOSE'
  hasEstadoCuenta: boolean
}

const TIPOS: TipoRelacion[] = [
  { id: 'aurumin-jose',    label: 'Aurumin → José',       sublabel: 'Nota de entrega + estado de cuenta', client: 'AURUMIN',               destinatario: 'JOSE',    hasEstadoCuenta: true  },
  { id: 'chino-jose',      label: 'Chino Peña → José',    sublabel: 'La Fe / Nuevo Callao',               client: 'CHINO PEÑA (LUIS PEÑA)', destinatario: 'JOSE',    hasEstadoCuenta: false },
  { id: 'aurumin-empresa', label: 'Aurumin → Empresa',    sublabel: 'Con estado de cuenta acumulado',     client: 'AURUMIN',               destinatario: 'EMPRESA', hasEstadoCuenta: true  },
  { id: 'chino-empresa',   label: 'Chino Peña → Empresa', sublabel: 'Derivada de Chino Peña',             client: 'CHINO PEÑA (LUIS PEÑA)', destinatario: 'EMPRESA', hasEstadoCuenta: false },
]

function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Fila editable ─────────────────────────────────────────────────────────────
function TripRow({ trip, isPerton, onSaved }: {
  trip: RelacionTrip; isPerton: boolean
  onSaved: (updated: Partial<RelacionTrip>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [ticket, setTicket]   = useState(trip.ticketNo ?? '')
  const [kg, setKg]           = useState(trip.netWeightKg?.toString() ?? '')
  const [saving, setSaving]   = useState(false)

  async function save() {
    setSaving(true)
    const res = await updateTripInline(trip.tripId, {
      ticketNo:    ticket || undefined,
      netWeightKg: isPerton && kg ? parseFloat(kg) : undefined,
    })
    if (!('error' in res)) {
      const newKg  = isPerton && kg ? parseFloat(kg) : trip.netWeightKg
      const newAmt = isPerton && newKg
        ? Math.round(newKg / 1000 * (trip.amount / ((trip.netWeightKg ?? 1) / 1000)) * 100) / 100
        : trip.amount
      onSaved({ ticketNo: ticket || null, netWeightKg: newKg, amount: newAmt })
      setEditing(false)
    }
    setSaving(false)
  }

  return (
    <tr className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors group">
      <td className="px-3 py-2 font-mono text-xs text-zinc-400">
        {editing
          ? <input value={ticket} onChange={e => setTicket(e.target.value)}
              className="w-24 bg-zinc-700 border border-zinc-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-amber-500" />
          : (trip.ticketNo ?? '—')}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-400">{fmtDate(trip.date)}</td>
      <td className="px-3 py-2 text-xs text-white font-medium">{trip.conductor}</td>
      <td className="px-3 py-2 text-xs font-mono text-zinc-300">{trip.plate}</td>
      <td className="px-3 py-2 text-xs text-right text-zinc-300">
        {isPerton
          ? editing
            ? <input type="number" value={kg} onChange={e => setKg(e.target.value)} step="0.01"
                className="w-24 bg-zinc-700 border border-zinc-600 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:border-amber-500" />
            : (trip.netWeightKg ? `${(trip.netWeightKg / 1000).toFixed(3)} t` : '—')
          : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right text-amber-400 font-semibold">{fmt$(trip.amount)}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex items-center gap-1 justify-end">
            <button onClick={save} disabled={saving}
              className="text-[10px] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold rounded px-2 py-0.5">
              {saving ? '…' : 'OK'}
            </button>
            <button onClick={() => setEditing(false)} className="text-[10px] text-zinc-500 hover:text-white px-1">✕</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-amber-400 transition-all" title="Editar viaje">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Sección de ruta colapsable ────────────────────────────────────────────────
function RouteSection({ route: initial }: { route: RelacionPreview['byRoute'][0] }) {
  const [open, setOpen]   = useState(false)
  const [trips, setTrips] = useState<RelacionTrip[]>(initial.trips)
  const [qty, setQty]     = useState(initial.quantity)
  const [amt, setAmt]     = useState(initial.amount)
  const isPerton  = initial.rateType === 'PER_TON'
  const isPerHour = initial.rateType === 'PER_HOUR'

  function handleSaved(tripId: string, updated: Partial<RelacionTrip>) {
    const newTrips = trips.map(t => t.tripId === tripId ? { ...t, ...updated } : t)
    setTrips(newTrips)
    if (isPerton) setQty(newTrips.reduce((s, t) => s + (t.netWeightKg ?? 0) / 1000, 0))
    setAmt(newTrips.reduce((s, t) => s + t.amount, 0))
  }

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left">
        <span className={`text-zinc-500 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-white font-semibold text-sm flex-1">{initial.routeName}</span>
        <span className="text-zinc-500 text-xs">{trips.length} viaje{trips.length !== 1 ? 's' : ''}</span>
        <span className="text-zinc-400 text-xs w-24 text-right">
          {isPerton ? `${qty.toFixed(3)} t` : isPerHour ? `${qty} h` : `${qty} viajes`}
        </span>
        <span className="text-amber-400 font-bold text-sm w-24 text-right">{fmt$(amt)}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-zinc-800/50">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-800/40">
                <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Ticket</th>
                <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Fecha</th>
                <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Conductor</th>
                <th className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">Placa</th>
                <th className="text-right text-zinc-500 font-medium px-3 py-2 text-xs">
                  {isPerton ? 'Ton' : isPerHour ? 'Horas' : '—'}
                </th>
                <th className="text-right text-zinc-500 font-medium px-3 py-2 text-xs">Monto</th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {trips.map(trip => (
                <TripRow key={trip.tripId} trip={trip} isPerton={isPerton}
                  onSaved={updated => handleSaved(trip.tripId, updated)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700 bg-zinc-800/20">
                <td colSpan={4} className="px-3 py-2 text-xs text-zinc-500">Total {initial.routeName}</td>
                <td className="px-3 py-2 text-xs text-right text-zinc-300">{isPerton ? `${qty.toFixed(3)} t` : ''}</td>
                <td className="px-3 py-2 text-xs text-right text-amber-400 font-bold">{fmt$(amt)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Principal ─────────────────────────────────────────────────────────────────
export default function RelacionesClient({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const router = useRouter()
  const [tipoId, setTipoId]       = useState('aurumin-jose')
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate]     = useState(defaultEnd)
  const [abono, setAbono]         = useState(0)
  const [preview, setPreview]     = useState<RelacionPreview | null>(null)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [saved, setSaved]         = useState(false)

  const tipo  = TIPOS.find(t => t.id === tipoId)!
  const saldo = preview ? Math.max(0, preview.subTotal - abono) : 0
  const hasData = (preview?.byRoute.length ?? 0) > 0

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    if (!startDate || !endDate) return
    setLoading(true); setError(''); setPreview(null); setSaved(false); setAbono(0)
    try {
      setPreview(await previewRelacion(tipo.client, startDate, endDate, tipo.destinatario))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally { setLoading(false) }
  }

  async function handleDescargar() {
    if (!preview) return
    const res = await fetch('/api/relaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview, abono, hasEstadoCuenta: tipo.hasEstadoCuenta }),
    })
    if (!res.ok) { setError('Error generando Excel'); return }
    const dest   = preview.destinatario === 'EMPRESA' ? 'Empresa' : 'Jose'
    const client = preview.client === 'AURUMIN' ? 'Aurumin' : 'LuisPena'
    const filename = `Relacion-${client}-${dest}-${preview.periodLabel.replace(/\//g,'-').replace(/\s/g,'_')}.xlsx`
    const blob = new Blob([await res.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleRegistrar() {
    if (!preview || saved) return
    setSaving(true); setError('')
    try {
      await registrarRelacion(preview, abono)
      setSaved(true); router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al registrar')
    } finally { setSaving(false) }
  }

  const clientLabel = tipo.client === 'AURUMIN' ? 'Planta Aurumin' : 'Luis Peña'
  const totalViajes = preview?.byRoute.reduce((s, r) => s + r.trips.length, 0) ?? 0

  return (
    <div className="space-y-5">

      {/* ── Estilos de impresión ─────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm 2cm; }

          /* Neutralizar el padding del sidebar */
          html, body { padding: 0 !important; margin: 0 !important; }
          body > * { padding-left: 0 !important; margin-left: 0 !important; }
          aside, nav { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          [class*="pl-16"], [class*="pl-64"] { padding-left: 0 !important; }

          body { background: white !important; color: black !important; font-family: Arial, sans-serif; }
          .print-hide { display: none !important; }
          .print-only { display: block !important; }
          .print-section {
            background: white !important; border: 1px solid #d1d5db !important;
            border-radius: 6px !important; padding: 12px 16px !important;
            margin-bottom: 10px !important; break-inside: avoid; overflow: visible !important;
          }
          .print-section * { color: black !important; background: transparent !important; border-color: #e5e7eb !important; }
          .print-section table { width: 100% !important; border-collapse: collapse !important; }
          .print-section th, .print-section td { border: 1px solid #d1d5db !important; padding: 5px 8px !important; font-size: 10px !important; text-align: left; }
          .print-section th { background: #f3f4f6 !important; font-weight: 700 !important; }
          .print-section tfoot td { background: #f3f4f6 !important; font-weight: 700 !important; }
          .print-kpi-grid { display: grid !important; grid-template-columns: repeat(4,1fr) !important; gap: 10px !important; }
          .print-kpi { border: 1px solid #e5e7eb !important; border-radius: 6px !important; padding: 10px 12px !important; }
          .print-kpi-label { font-size: 8px !important; color: #6b7280 !important; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px !important; }
          .print-kpi-value { font-size: 17px !important; font-weight: 800 !important; }
          .print-kpi-sub { font-size: 9px !important; color: #9ca3af !important; margin-top: 2px; }
          .print-kpi-saldo { font-size: 11px !important; font-weight: 700 !important; color: #dc2626 !important; margin-top: 4px; }
          .print-header { display: flex !important; justify-content: space-between !important; align-items: flex-start !important; margin-bottom: 14px !important; }
          .print-company { font-size: 17px !important; font-weight: 800 !important; }
          .print-company-sub { font-size: 9px !important; color: #6b7280 !important; margin-top: 2px; }
          .print-rel-title { font-size: 13px !important; font-weight: 700 !important; text-align: right; }
          .print-rel-sub { font-size: 9px !important; color: #6b7280 !important; text-align: right; margin-top: 2px; }
          .print-ec-table { width: 100% !important; border-collapse: collapse !important; font-size: 9px !important; }
          .print-ec-table th { background: #f3f4f6 !important; border: 1px solid #d1d5db !important; padding: 4px 8px !important; font-weight: 700; }
          .print-ec-table td { border: 1px solid #e5e7eb !important; padding: 3px 8px !important; }
          .print-divider { border: none !important; border-top: 1px solid #e5e7eb !important; margin: 8px 0 !important; }
          .print-slabel { font-size: 10px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .07em; color: #374151 !important; margin-bottom: 8px !important; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      {/* ── Selector de tipo ─────────────────────────────────────────────── */}
      <div className="print-hide grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {TIPOS.map((t, i) => (
          <button key={t.id}
            onClick={() => { setTipoId(t.id); setPreview(null); setSaved(false); setAbono(0) }}
            className={`text-left rounded-xl p-3.5 border transition-all ${
              tipoId === t.id
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${tipoId === t.id ? 'text-amber-500' : 'text-zinc-600'}`}>#{i + 1}</span>
            <p className={`text-sm font-semibold ${tipoId === t.id ? 'text-amber-400' : 'text-white'}`}>{t.label}</p>
            <p className="text-zinc-500 text-xs mt-0.5 leading-snug">{t.sublabel}</p>
          </button>
        ))}
      </div>

      {/* ── Formulario de período ─────────────────────────────────────────── */}
      <form onSubmit={handlePreview} className="print-hide bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
            <input type="date" value={startDate} required
              onChange={e => { setStartDate(e.target.value); setPreview(null) }}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
            <input type="date" value={endDate} required
              onChange={e => { setEndDate(e.target.value); setPreview(null) }}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <button type="submit" disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2 text-sm transition-colors">
            {loading ? 'Calculando…' : 'Ver relación'}
          </button>
          {saved && (
            <button type="button" onClick={() => { setPreview(null); setSaved(false); setAbono(0) }}
              className="text-zinc-400 hover:text-white text-sm transition-colors">
              Nueva relación →
            </button>
          )}
        </div>
      </form>

      {error && <p className="print-hide text-red-400 text-sm px-1">{error}</p>}

      {/* ── Resultado ────────────────────────────────────────────────────── */}
      {preview && (
        <div className="space-y-4">

          {/* Alerta camiones negativos */}
          {preview.negativeTrucks.length > 0 && (
            <div className="print-hide bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-orange-400 font-semibold text-sm">
                  {preview.negativeTrucks.length} carro{preview.negativeTrucks.length !== 1 ? 's' : ''} en negativo → préstamo de caja chica
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {preview.negativeTrucks.map(t => (
                  <span key={t.plate} className="text-xs bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-mono">
                    {t.plate} <span className="text-orange-400 font-bold">{fmt$(Math.abs(t.netAmount))}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!hasData ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
              <p className="text-zinc-400 font-medium">No hay viajes en este período</p>
              <p className="text-zinc-600 text-sm mt-1">{fmtDate(startDate)} al {fmtDate(endDate)} · {clientLabel}</p>
            </div>
          ) : (
            <>
              {/* Cabecera print-only */}
              <div className="print-only" style={{ marginBottom: 12 }}>
                <div className="print-header">
                  <div>
                    <div className="print-company">Acarreos José Rodríguez</div>
                    <div className="print-company-sub">RIF: V-11.352.305 · Valencia, Edo. Carabobo</div>
                  </div>
                  <div>
                    <div className="print-rel-title">{preview.relationNo} — {clientLabel}</div>
                    <div className="print-rel-sub">{preview.periodLabel}</div>
                    <div className="print-rel-sub">Fecha: {fmtDate(preview.endDate)}</div>
                  </div>
                </div>
                <hr className="print-divider" />
              </div>

              {/* Cabecera relación (pantalla) */}
              <div className="print-hide bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wide font-medium">Relación</p>
                    <p className="text-white font-bold text-lg mt-0.5">{preview.relationNo} — {tipo.label}</p>
                    <p className="text-zinc-400 text-sm mt-0.5">{preview.periodLabel} · {totalViajes} viajes · {preview.byRoute.length} rutas</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => window.print()}
                      className="flex items-center gap-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-xl px-4 py-2 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      PDF
                    </button>
                    <button onClick={handleDescargar}
                      className="flex items-center gap-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-xl px-4 py-2 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Excel
                    </button>
                    {!saved ? (
                      <button onClick={handleRegistrar} disabled={saving}
                        className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-2 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {saving ? 'Registrando…' : 'Registrar relación'}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium px-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Registrada
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* KPIs pantalla */}
              <div className="print-hide grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-zinc-500 text-xs mb-1">Facturado este período</p>
                  <p className="text-2xl font-bold text-amber-400">{fmt$(preview.totalFacturado)}</p>
                  <p className="text-zinc-600 text-xs mt-1">{totalViajes} viajes · {preview.byRoute.length} rutas</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-zinc-500 text-xs mb-1">Acumulado anterior</p>
                  <p className="text-2xl font-bold text-blue-400">{fmt$(preview.acumulado)}</p>
                  <p className="text-zinc-600 text-xs mt-1">Saldo sin cobrar</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-zinc-500 text-xs mb-1">Sub-total</p>
                  <p className="text-2xl font-bold text-white">{fmt$(preview.subTotal)}</p>
                  <p className="text-zinc-600 text-xs mt-1">Período + acumulado</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-zinc-500 text-xs mb-1">Abono recibido</p>
                  <input type="number" step="0.01" min="0" value={abono || ''}
                    onChange={e => setAbono(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-sm mt-1 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600" />
                  <p className={`text-xs font-semibold mt-1 ${saldo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    Saldo: {fmt$(saldo)}
                  </p>
                </div>
              </div>

              {/* KPIs print-only */}
              <div className="print-only print-section">
                <div className="print-kpi-grid">
                  <div className="print-kpi">
                    <div className="print-kpi-label">Facturado este período</div>
                    <div className="print-kpi-value">{fmt$(preview.totalFacturado)}</div>
                    <div className="print-kpi-sub">{totalViajes} viajes · {preview.byRoute.length} rutas</div>
                  </div>
                  <div className="print-kpi">
                    <div className="print-kpi-label">Acumulado anterior</div>
                    <div className="print-kpi-value">{fmt$(preview.acumulado)}</div>
                    <div className="print-kpi-sub">Saldo pendiente</div>
                  </div>
                  <div className="print-kpi">
                    <div className="print-kpi-label">Sub-total</div>
                    <div className="print-kpi-value">{fmt$(preview.subTotal)}</div>
                  </div>
                  <div className="print-kpi">
                    <div className="print-kpi-label">Abono recibido</div>
                    <div className="print-kpi-value">{fmt$(abono)}</div>
                    <div className="print-kpi-saldo">Saldo: {fmt$(saldo)}</div>
                  </div>
                </div>
              </div>

              {/* Nota de Entrega */}
              <div className="print-section bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="print-hide px-4 py-3 border-b border-zinc-800">
                  <h3 className="text-white font-semibold text-sm">Nota de Entrega</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">Resumen por ruta · {clientLabel}</p>
                </div>
                <div className="print-only print-slabel">Nota de Entrega — {clientLabel}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/30">
                      <th className="text-left text-zinc-500 font-medium px-4 py-2.5 text-xs">Descripción / Ruta</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Und</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Cantidad</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Precio Unit.</th>
                      <th className="text-right text-zinc-500 font-medium px-4 py-2.5 text-xs">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.byRoute.map((r, i) => (
                      <tr key={r.routeName} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2.5">
                          <span className="text-zinc-500 text-xs mr-2">{i + 1}.</span>
                          <span className="text-white font-medium text-sm">{r.routeName}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{r.unit}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300 text-sm">{r.quantity.toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">${r.rate.toFixed(2)}/{r.unit.toLowerCase()}</td>
                        <td className="px-4 py-2.5 text-right text-amber-400 font-semibold">{fmt$(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-800/40">
                      <td colSpan={4} className="px-4 py-3 text-white font-bold text-right">Total a Cancelar</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold text-base">{fmt$(preview.totalFacturado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Detalle de viajes (print-hide) */}
              <div className="print-hide bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h3 className="text-white font-semibold text-sm">Detalle de viajes por ruta</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">Clic en ▶ para expandir · Pasa el cursor sobre un viaje para editarlo</p>
                </div>
                {preview.byRoute.map(route => (
                  <RouteSection key={route.routeName} route={route} />
                ))}
              </div>

              {/* Estado de cuenta */}
              {tipo.hasEstadoCuenta && preview.estadoCuenta.length > 0 && (
                <div className="print-section bg-zinc-900 border border-blue-500/20 rounded-2xl overflow-hidden">
                  <div className="print-hide px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                    <h3 className="text-white font-semibold text-sm">Estado de cuenta — {clientLabel}</h3>
                    <span className="text-blue-400 text-xs bg-blue-400/10 px-2 py-0.5 rounded-full">En Excel</span>
                  </div>
                  <div className="print-only print-slabel">Estado de cuenta — {clientLabel}</div>
                  <table className="print-ec-table w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/20">
                        <th className="text-left text-zinc-500 font-medium px-4 py-2">Período</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-2">Facturado</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-2">Abono</th>
                        <th className="text-right text-zinc-500 font-medium px-4 py-2">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.estadoCuenta.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-800/40">
                          <td className="px-4 py-2 text-zinc-400">{row.periodLabel}</td>
                          <td className="px-4 py-2 text-right text-zinc-300">{fmt$(row.total)}</td>
                          <td className="px-4 py-2 text-right text-emerald-400">{row.abono > 0 ? fmt$(row.abono) : '—'}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${row.saldo > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                            {fmt$(row.saldo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Botones finales */}
              <div className="print-hide flex items-center gap-3 flex-wrap pb-2">
                {!saved ? (
                  <button onClick={handleRegistrar} disabled={saving}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {saving ? 'Registrando…' : 'Registrar relación'}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Registrada en cuentas por cobrar
                  </span>
                )}
                <button onClick={handleDescargar}
                  className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-xl px-4 py-2.5 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar Excel
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-medium rounded-xl px-4 py-2.5 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Imprimir / PDF
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
