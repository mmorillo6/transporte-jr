import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import MantenimientoClient from './MantenimientoClient'

export default async function MantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role === 'CHOFER' || session.role === 'AFILIADO') redirect('/dashboard')

  const params = await searchParams
  const initialTab = params.tab ?? 'flota'

  const [trucks, alerts, logs, mechanics, parts, mechanicWorks, tireRepairs] = await Promise.all([
    prisma.truck.findMany({
      where: { active: true },
      orderBy: { plate: 'asc' },
      include: {
        driver: { select: { name: true } },
        status: true,
      },
    }),
    prisma.maintenanceAlert.findMany({
      where: { status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      include: { truck: { select: { plate: true } } },
    }),
    prisma.maintenanceLog.findMany({
      orderBy: { date: 'desc' },
      take: 50,
      include: {
        truck: { select: { plate: true } },
        mechanic: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'MECANICO', active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.part.findMany({
      orderBy: { purchasedAt: 'desc' },
      take: 100,
      include: { truck: { select: { plate: true } } },
    }),
    prisma.mechanicWork.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        truck: { select: { plate: true } },
        mechanic: { select: { name: true } },
      },
    }),
    prisma.tireRepair.findMany({
      orderBy: { date: 'desc' },
      include: {
        truck: { select: { plate: true, driver: { select: { name: true } } } },
      },
    }),
  ])

  const truckTotals: Record<string, { count: number; cost: number }> = {}
  for (const r of tireRepairs) {
    const prev = truckTotals[r.truckId] ?? { count: 0, cost: 0 }
    truckTotals[r.truckId] = {
      count: prev.count + r.quantity,
      cost: prev.cost + r.quantity * r.unitCost,
    }
  }

  const canManage = ['DUENO', 'ENCARGADO'].includes(session.role)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Mantenimiento</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Historial de servicios de cada camión: cambios de aceite, filtros, engrases e inspecciones. Genera alertas cuando se acerca el próximo mantenimiento.</p>
        <p className="text-zinc-600 text-xs mt-1">{alerts.length} alertas pendientes · {trucks.length} camiones activos</p>
      </div>

      <MantenimientoClient
        trucks={trucks as any}
        alerts={alerts as any}
        logs={logs as any}
        mechanics={mechanics}
        parts={parts as any}
        mechanicWorks={mechanicWorks as any}
        tireRepairs={tireRepairs as any}
        truckTotals={truckTotals}
        canManage={canManage}
        initialTab={initialTab}
      />
    </div>
  )
}
