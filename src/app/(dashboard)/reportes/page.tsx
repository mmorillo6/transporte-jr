import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import ReportesClient from './ReportesClient'

export default async function ReportesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  // Summary stats for the overview cards
  const [totalExpenses, totalTrips, periods, trucks, routes] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.trip.aggregate({ _sum: { amount: true, netWeightKg: true }, _count: true }),
    prisma.period.count(),
    prisma.truck.count({ where: { active: true } }),
    prisma.route.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Exporta datos históricos a Excel</p>
      </div>

      {/* Vistas analíticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/reportes/facturacion-gastos"
          className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-2xl p-4 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl flex-shrink-0 group-hover:bg-amber-500/20 transition-colors">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm group-hover:text-amber-400 transition-colors">Facturación vs Gastos</p>
              <p className="text-zinc-500 text-xs mt-0.5">Rentabilidad por camión en cada período · Comparativa histórica</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Leyenda introductoria */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <p className="text-white font-semibold text-base leading-snug">
          Esta sección genera archivos Excel listos para compartir o archivar.
        </p>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Aquí no se registra nada — solo se <span className="text-white font-medium">exportan</span> los datos
          que ya están cargados en el sistema. Cada opción produce un Excel diferente según lo que necesites:
        </p>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
            <span>
              <span className="text-white font-medium">Relación de acarreo</span> — el Excel que se le envía a la minera.
              Muestra ticket por ticket con placa, conductor, mina, toneladas y tarifa.
              Incluye una hoja resumen por conductor para calcular lo que le corresponde a cada uno.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
            <span>
              <span className="text-white font-medium">Gastos por categoría</span> — todos los egresos del período
              agrupados por tipo (mecánica, repuestos, viáticos, etc.) con detalle de cada registro.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
            <span>
              <span className="text-white font-medium">Historial de nóminas</span> — comparativo de todas las quincenas
              cerradas, con una pestaña por período. Útil para auditorías o para llevar al banco.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
            <span>
              <span className="text-white font-medium">Rendimiento por camión</span> — cuántos viajes, toneladas y
              monto generó cada unidad en el rango de fechas que elijas.
            </span>
          </li>
        </ul>
        <p className="text-zinc-600 text-xs pt-1 border-t border-zinc-800">
          Selecciona el tipo de reporte abajo, ajusta el rango de fechas si aplica, y presiona <span className="text-zinc-400">Exportar</span>.
        </p>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs">Total viajes</p>
          <p className="text-white font-bold text-2xl mt-1">{totalTrips._count}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs">Total toneladas</p>
          <p className="text-white font-bold text-2xl mt-1">{((totalTrips._sum.netWeightKg ?? 0) / 1000).toFixed(0)} t</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs">Períodos registrados</p>
          <p className="text-white font-bold text-2xl mt-1">{periods}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs">Total gastos</p>
          <p className="text-amber-400 font-bold text-2xl mt-1">${(totalExpenses._sum.amount ?? 0).toFixed(0)}</p>
        </div>
      </div>

      <ReportesClient routes={routes} />
    </div>
  )
}
