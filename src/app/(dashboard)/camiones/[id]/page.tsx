import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operativo',
  IN_SHOP: 'En taller',
  OUT_OF_SERVICE: 'Fuera de servicio',
}
const STATUS_STYLE: Record<string, string> = {
  OPERATIONAL: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  IN_SHOP: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  OUT_OF_SERVICE: 'text-red-400 bg-red-400/10 border-red-400/20',
}

const fmt = (d: Date) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default async function TruckProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id } = await params

  const truck = await prisma.truck.findUnique({
    where: { id },
    include: {
      driver:  { select: { name: true } },
      owner:   { select: { name: true, type: true, nprPercent: true, isNPROwner: true, phone: true } },
      status:  { select: { status: true, notes: true } },
      _count:  { select: { trips: true } },
    },
  })

  if (!truck) notFound()

  // Afiliados solo acceden a sus propios camiones
  if (session.role === 'AFILIADO') {
    const userRecord = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { ownerId: true },
    })
    if (!userRecord?.ownerId || truck.ownerId !== userRecord.ownerId) notFound()
  }

  // Only owners/managers and the truck's own driver can view
  if (session.role === 'CHOFER' && truck.driver?.name !== session.name) redirect('/mi-cuenta')

  const [trips, maintenanceLogs, tireRepairs] = await Promise.all([
    prisma.trip.findMany({
      where: { truckId: id },
      orderBy: { date: 'desc' },
      take: 60,
      include: { route: { select: { name: true } } },
    }),
    prisma.maintenanceLog.findMany({
      where: { truckId: id },
      orderBy: { date: 'desc' },
      take: 20,
      include: { mechanic: { select: { name: true } } },
    }),
    prisma.tireRepair.findMany({
      where: { truckId: id },
      orderBy: { date: 'desc' },
      take: 20,
    }),
  ])

  const totalTons    = trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000
  const totalAmount  = trips.reduce((s, t) => s + t.amount, 0)
  const lastTrip     = trips[0]
  const showFinancials = ['DUENO', 'ENCARGADO'].includes(session.role)

  const MAINT_LABEL: Record<string, string> = {
    OIL_CHANGE: 'Cambio aceite', AIR_FILTER: 'Filtro aire', GREASE: 'Engrase',
    REPAIR: 'Reparación', INSPECTION: 'Inspección', OTHER: 'Otro',
  }

  const statusKey = truck.status?.status ?? 'OPERATIONAL'

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back */}
      <Link href="/camiones"
        className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver a Flota
      </Link>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M3 17l1.5-7h15L21 17M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white font-mono tracking-wider">{truck.plate}</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                {truck.driver?.name ?? 'Sin chofer asignado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-medium px-3 py-1.5 rounded-xl border ${STATUS_STYLE[statusKey]}`}>
              {STATUS_LABEL[statusKey]}
            </span>
            <div className="text-right">
              <p className="text-white font-semibold text-sm">{truck.owner.name}</p>
              <p className={`text-xs ${truck.owner.type === 'AFILIADO' ? 'text-violet-400' : 'text-emerald-400'}`}>
                {truck.owner.type === 'AFILIADO'
                  ? `Afiliado · ${truck.owner.nprPercent}% NPR`
                  : 'Propio · 5% NPR'}
              </p>
            </div>
          </div>
        </div>
        {truck.status?.notes && (
          <p className="mt-3 text-sm text-amber-400 bg-amber-400/5 border border-amber-400/10 rounded-xl px-4 py-2">
            {truck.status.notes}
          </p>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Total viajes</p>
          <p className="text-2xl font-bold text-white">{truck._count.trips}</p>
          <p className="text-zinc-600 text-xs mt-1">histórico</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Toneladas (últimos 60)</p>
          <p className="text-2xl font-bold text-blue-400">{totalTons.toFixed(1)} t</p>
          <p className="text-zinc-600 text-xs mt-1">{trips.length} registros cargados</p>
        </div>
        {showFinancials && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs mb-1">Facturado (últimos 60)</p>
            <p className="text-2xl font-bold text-amber-400">${totalAmount.toFixed(0)}</p>
            <p className="text-zinc-600 text-xs mt-1">monto bruto</p>
          </div>
        )}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Último viaje</p>
          <p className="text-2xl font-bold text-white">
            {lastTrip ? fmt(lastTrip.date) : '—'}
          </p>
          <p className="text-zinc-600 text-xs mt-1 truncate">
            {lastTrip?.route?.name ?? 'sin viajes'}
          </p>
        </div>
      </div>

      {/* Historial de viajes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Historial de viajes</h2>
          <span className="text-zinc-500 text-xs">{trips.length} registros</span>
        </div>
        {trips.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10">Sin viajes registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Fecha</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Mina / Ruta</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Ticket</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Toneladas</th>
                  {showFinancials && <th className="text-right text-zinc-500 font-medium px-4 py-3 text-xs">Monto</th>}
                </tr>
              </thead>
              <tbody>
                {trips.map((trip, i) => (
                  <tr key={trip.id}
                    className={`border-b border-zinc-800/50 last:border-0 ${i % 2 === 1 ? 'bg-zinc-800/20' : ''}`}>
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{fmt(trip.date)}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs truncate max-w-[160px]">{trip.route?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{trip.ticketNo ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-white font-mono text-xs">
                      {trip.netWeightKg ? (trip.netWeightKg / 1000).toFixed(3) : '—'}
                    </td>
                    {showFinancials && (
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold text-xs">
                        ${trip.amount.toFixed(2)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mantenimiento + Cauchos en fila */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Historial de mantenimiento */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Mantenimiento</h2>
            <Link href="/mantenimiento" className="text-zinc-500 hover:text-amber-400 text-xs transition-colors">
              Ver todos →
            </Link>
          </div>
          {maintenanceLogs.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Sin registros de mantenimiento</p>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {maintenanceLogs.map(log => (
                <div key={log.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-zinc-300 text-xs font-medium">{MAINT_LABEL[log.type] ?? log.type}</p>
                    {log.description && (
                      <p className="text-zinc-500 text-xs mt-0.5 truncate">{log.description}</p>
                    )}
                    {log.mechanic && (
                      <p className="text-zinc-600 text-xs mt-0.5">{log.mechanic.name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-zinc-500 text-xs">{fmt(log.date)}</p>
                    {showFinancials && log.cost > 0 && (
                      <p className="text-amber-400 text-xs font-semibold mt-0.5">${log.cost.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cauchos */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Cauchos</h2>
            <span className="text-zinc-500 text-xs">{tireRepairs.length} registros</span>
          </div>
          {tireRepairs.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Sin reparaciones de cauchos</p>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {tireRepairs.map(rep => (
                <div key={rep.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-zinc-300 text-xs">
                      {rep.quantity} caucho{rep.quantity !== 1 ? 's' : ''}
                      {rep.notes ? ` · ${rep.notes}` : ''}
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5">{fmt(rep.date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {showFinancials && (
                      <p className="text-amber-400 text-xs font-semibold">
                        ${(rep.quantity * rep.unitCost).toFixed(2)}
                      </p>
                    )}
                    {rep.paidAt ? (
                      <p className="text-emerald-400 text-xs">Pagado</p>
                    ) : (
                      <p className="text-red-400 text-xs">Por pagar</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
