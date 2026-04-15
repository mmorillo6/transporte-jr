'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { exportExpensesReport, exportPayrollHistory, exportTrucksReport, exportTripRelacion } from '@/app/actions/exportReports'

type Tab = 'gastos' | 'nominas' | 'camiones' | 'relacion'

function downloadBase64(data: string, filename: string) {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportesClient({ routes }: { routes: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<Tab>('relacion')
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

  const tabs: { id: Tab; label: string; desc: string }[] = [
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
