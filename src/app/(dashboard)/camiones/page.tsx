import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import CamionesClient from './CamionesClient'

export default async function CamionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; nuevaPlaca?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { tab: initialTab, nuevaPlaca } = await searchParams

  const [trucks, owners, drivers] = await Promise.all([
    prisma.truck.findMany({
      orderBy: { plate: 'asc' },
      include: {
        driver: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, type: true, nprPercent: true, isNPROwner: true } },
        status: { select: { status: true, notes: true } },
        _count: { select: { trips: true } },
      },
    }),
    prisma.owner.findMany({
      orderBy: { name: 'asc' },
      include: {
        trucks: {
          where: { active: true },
          select: { id: true, plate: true, driver: { select: { name: true } } },
        },
        _count: { select: { trucks: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'CHOFER', active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Payroll per owner (same logic as /duenos)
  const allOwnerTruckIds = owners.flatMap(o => o.trucks.map(t => t.id))
  const payrollEntries = allOwnerTruckIds.length > 0
    ? await prisma.payrollEntry.findMany({
        where: { truckId: { in: allOwnerTruckIds } },
        include: { period: { select: { id: true, startDate: true, endDate: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const truckToOwner = new Map<string, string>()
  for (const owner of owners) {
    for (const truck of owner.trucks) truckToOwner.set(truck.id, owner.id)
  }

  type PeriodGroup = {
    period: { id: string; startDate: Date; endDate: Date; status: string }
    grossAmount: number; commissionFee: number; netAmount: number; truckCount: number
  }
  const periodGroupMap = new Map<string, Map<string, PeriodGroup>>()
  for (const entry of payrollEntries) {
    const ownerId = truckToOwner.get(entry.truckId)
    if (!ownerId) continue
    if (!periodGroupMap.has(ownerId)) periodGroupMap.set(ownerId, new Map())
    const ownerPeriods = periodGroupMap.get(ownerId)!
    if (!ownerPeriods.has(entry.periodId!)) {
      ownerPeriods.set(entry.periodId!, {
        period: entry.period as any,
        grossAmount: 0, commissionFee: 0, netAmount: 0, truckCount: 0,
      })
    }
    const pg = ownerPeriods.get(entry.periodId!)!
    pg.grossAmount += entry.grossAmount
    pg.commissionFee += entry.commissionFee
    pg.netAmount += entry.netAmount
    pg.truckCount += 1
  }

  const payrollByOwner = Object.fromEntries(
    Array.from(periodGroupMap.entries()).map(([ownerId, periodsMap]) => [
      ownerId,
      Array.from(periodsMap.values())
        .sort((a, b) => new Date(b.period.startDate).getTime() - new Date(a.period.startDate).getTime())
        .slice(0, 10),
    ])
  )

  const canEdit = ['DUENO', 'ENCARGADO'].includes(session.role)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Flota</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          {trucks.filter(t => t.active).length} unidades activas · {owners.filter(o => o.active).length} propietarios
        </p>
      </div>
      <CamionesClient
        trucks={trucks as any}
        owners={owners as any}
        drivers={drivers}
        canEdit={canEdit}
        payrollByOwner={payrollByOwner as any}
        initialTab={initialTab}
        nuevaPlaca={nuevaPlaca}
      />
    </div>
  )
}
