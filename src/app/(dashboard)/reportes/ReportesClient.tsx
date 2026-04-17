'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { exportExpensesReport, exportPayrollHistory, exportTrucksReport, exportTripRelacion } from '@/app/actions/exportReports'

type Tab = 'gastos' | 'nominas' | 'camiones' | 'relacion' | 'completa'

function downloadBase64(data: string, filename: string) {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportesClient({ routes }: { routes: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<Tab>('completa')
  const [loading, setLoading] = useState(false)

  // Gastos filters
  const [gastoFrom, setGastoFrom] = useState('')
  const [gastoTo, setGastoTo] = useState('')

  // Camiones filters
  const [camionFrom, setCamionFrom] = useState('')
  const [camionTo, setCamionTo] = useState('')

  // Relación filters
  const [relacionFrom, setRelacionFrom] = useState('')
  const [relacionTo, setRelacionTo] = useState('')
  const [relacionRouteId, setRelacionRouteId] = useState('')

  // Relación Completa José
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const isFirstHalf = now.getDate() <= 15
  const defaultStart = isFirstHalf
    ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-16`
  const defaultEnd = isFirstHalf
    ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-15`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${lastDay}`
  const [compFrom, setCompFrom] = useState(defaultStart)
  const [compTo, setCompTo]     = useState(defaultEnd)

  async function handleExportGastos() {
    setLoading(true)
    const res = await exportExpensesReport(gastoFrom, gastoTo)
    if ('error' in res) toast.error(res.error)
    else { downloadBase64(res.data, res.filename); toast.success('Reporte exportado') }
    setLoading(false)
  }

  async function handleExportNominas() {
    setLoading(true)
    const res = await exportPayrollHistory()
    if ('error' in res) toast.error(res.error)
    else { downloadBase64(res.data, res.filename); toast.success('Historial exportado') }
    setLoading(false)
  }

  async function handleExportCamiones() {
    setLoading(true)
    const res = await exportTrucksReport(camionFrom, camionTo)
    if ('error' in res) toast.error(res.error)
    else { downloadBase64(res.data, res.filename); toast.success('Reporte exportado') }
    setLoading(false)
  }

  async function handleExportRelacion() {
    setLoading(true)
    const res = await exportTripRelacion(relacionFrom, relacionTo, relacionRouteId)
    if ('error' in res) toast.error(res.error)
    else { downloadBase64(res.data, res.filename); toast.success('Relación exportada') }
    setLoading(false)
  }

  async function handleRelacionCompleta() {
    if (!compFrom || !compTo) { toast.error('Selecciona el período'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/relacion-jose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: compFrom, endDate: compTo }),
      })
      if (!res.ok) { const j = await res.json(); toast.error(j.error ?? 'Error generando Excel'); return }
      const blob = new Blob([await res.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Relacion-Completa-${compFrom}_${compTo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Relación completa descargada')
    } catch (e) {
      toast.error('Error de conexión')
    } finally { setLoading(false) }
  }

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'completa',  label: 'Relación Completa', desc: 'Excel maestro para José — nómina, cuentas por dueño, afiliados, deuda Aurumin' },
    { id: 'relacion',  label: 'Relación de acarreo', desc: 'Detalle de viajes por mina con resumen por conductor — formato Fernando' },
    { id: 'gastos',   label: 'Gastos por categoría', desc: 'Resumen y detalle de todos los gastos agrupados por categoría' },
    { id: 'nominas',  label: 'Historial de nóminas',  desc: 'Comparativo de todas las quincenas con una pestaña por período' },
    { id: 'camiones', label: 'Rendimiento por camión', desc: 'Viajes, toneladas y montos desglosados por camión' },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Relación Completa para José */}
      {tab === 'completa' && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Excel Maestro</span>
            </div>
            <h2 className="text-white font-semibold text-lg">Relación Completa — Para José</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Genera un solo archivo con todo lo que necesita José: nómina detallada, cuenta por cada dueño, % de afiliados, historial de deuda Aurumin.
            </p>
          </div>

          {/* Cortes rápidos */}
          <div className="flex gap-2 flex-wrap">
            {[0, -1].map(offset => {
              const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
              const y = d.getFullYear(), m = d.getMonth()
              const last = new Date(y, m + 1, 0).getDate()
              const p = (n: number) => String(n).padStart(2, '0')
              const monthName = d.toLocaleString('es-VE', { month: 'short' })
              const q1s = `${y}-${p(m+1)}-01`, q1e = `${y}-${p(m+1)}-15`
              const q2s = `${y}-${p(m+1)}-16`, q2e = `${y}-${p(m+1)}-${last}`
              return [
                <button key={`${offset}-1`} type="button"
                  onClick={() => { setCompFrom(q1s); setCompTo(q1e) }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${compFrom===q1s&&compTo===q1e ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                  1–15 {monthName}
                </button>,
                <button key={`${offset}-2`} type="button"
                  onClick={() => { setCompFrom(q2s); setCompTo(q2e) }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${compFrom===q2s&&compTo===q2e ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                  16–{last} {monthName}
                </button>,
              ]
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
              <input type="date" value={compFrom} onChange={e => setCompFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
              <input type="date" value={compTo} onChange={e => setCompTo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">El archivo Excel incluye:</p>
            <p>• <span className="text-white">NÓMINA Y GASTOS OP.</span> — todos los camiones: bruto, nómina, NPR, mecánicos, admin, saldo</p>
            <p>• <span className="text-white">RESUMEN DEUDA AURUMIN</span> — historial quincena a quincena con abonos y saldo pendiente</p>
            <p>• <span className="text-white">Una hoja por dueño</span> (José, Leo, Carlos, Mauro, Fernando, De Freita, Los Neto, San Casimiro) — facturación, gastos y saldo de cada camión</p>
            <p>• <span className="text-white">% AFILIADOS</span> — 10% por quincena, lo de Fernando y lo de caja chica</p>
          </div>

          <button onClick={handleRelacionCompleta} disabled={loading}
            className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold rounded-xl text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Generando…' : 'Descargar Relación Completa'}
          </button>
        </div>
      )}

      {/* Relación de acarreo */}
      {tab === 'relacion' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-white font-semibold">Relación de acarreo por mina</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Genera el Excel igual al formato de relación — Item, Ticket, Fecha, Origen, Material, Transportista, Conductor, Placa, Peso Neto.
              Incluye hoja de resumen por conductor.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Mina / Ruta</label>
              <select value={relacionRouteId} onChange={e => setRelacionRouteId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
                <option value="">Todas las minas</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
              <input type="date" value={relacionFrom} onChange={e => setRelacionFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
              <input type="date" value={relacionTo} onChange={e => setRelacionTo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">El archivo Excel incluye:</p>
            <p>• Hoja "Relación de viajes" — Item, Nro. Ticket, Fecha, Origen, Tipo de Material, Transportista, Conductor, Placa, Peso Neto (Ton)</p>
            <p>• Hoja "Resumen por conductor" — Nro. viajes, ton totales, tarifa y monto por chofer</p>
          </div>
          <button onClick={handleExportRelacion} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Exportando...' : 'Exportar relación Excel'}
          </button>
        </div>
      )}

      {/* Gastos report */}
      {tab === 'gastos' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-white font-semibold">Reporte de gastos por categoría</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Genera un Excel con dos hojas: resumen agrupado por categoría y detalle de cada gasto.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
              <input type="date" value={gastoFrom} onChange={e => setGastoFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
              <input type="date" value={gastoTo} onChange={e => setGastoTo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">El archivo Excel incluye:</p>
            <p>• Hoja "Resumen" — total por categoría con porcentaje del gasto total</p>
            <p>• Hoja "Detalle" — cada gasto con fecha, descripción, camión y estado (fiado/pagado)</p>
          </div>
          <button onClick={handleExportGastos} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Exportando...' : 'Exportar gastos Excel'}
          </button>
        </div>
      )}

      {/* Nóminas report */}
      {tab === 'nominas' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-white font-semibold">Historial completo de nóminas</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Exporta todas las quincenas. Una hoja comparativa + una hoja por cada período cerrado.
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">El archivo Excel incluye:</p>
            <p>• Hoja "Comparativo" — todos los períodos con totales (bruto, neto, toneladas)</p>
            <p>• Una hoja por cada período — desglose por camión idéntico al reporte individual</p>
          </div>
          <button onClick={handleExportNominas} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Exportando...' : 'Exportar historial Excel'}
          </button>
        </div>
      )}

      {/* Camiones report */}
      {tab === 'camiones' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-white font-semibold">Rendimiento por camión</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Viajes, toneladas y monto bruto agrupados por cada unidad en el rango seleccionado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Desde</label>
              <input type="date" value={camionFrom} onChange={e => setCamionFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Hasta</label>
              <input type="date" value={camionTo} onChange={e => setCamionTo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">El archivo Excel incluye:</p>
            <p>• Hoja "Resumen" — totales por camión: viajes, toneladas, monto bruto, viáticos</p>
            <p>• Hoja "Detalle viajes" — cada viaje individual con fecha, placa, ruta y ticket</p>
          </div>
          <button onClick={handleExportCamiones} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Exportando...' : 'Exportar rendimiento Excel'}
          </button>
        </div>
      )}
    </div>
  )
}
