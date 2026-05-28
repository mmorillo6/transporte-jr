import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import DuenosNominaClient from './DuenosNominaClient'

export default async function DuenosNominaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/nomina')

  const { period: periodParam } = await searchParams

  const periods = await prisma.period.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, startDate: true, endDate: true, status: true },
  })

  const selectedId = periodParam ?? periods[0]?.id ?? null
  if (!selectedId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">No hay períodos registrados.</p>
      </div>
    )
  }

  const selectedPeriod = periods.find(p => p.id === selectedId)
  if (!selectedPeriod) notFound()

  const [payrollEntries, trips, expenses, tireDebts] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId: selectedId },
      include: {
        truck: {
          include: {
            driver: { select: { name: true } },
            owner: {
              select: { id: true, name: true, type: true, nprPercent: true, isNPROwner: true },
            },
          },
        },
      },
    }),
    prisma.trip.findMany({
      where: { periodId: selectedId },
      include: { route: { select: { clientName: true } } },
    }),
    prisma.expense.findMany({
      where: { periodId: selectedId, truckId: { not: null } },
      orderBy: { date: 'asc' },
    }),
    prisma.tireDebt.findMany({
      where: { status: { not: 'PAID' } },
      include: {
        payments: { select: { amount: true, date: true }, orderBy: { date: 'asc' } },
      },
    }),
  ])

  // Index trips by truckId
  const tripsByTruck = new Map<string, typeof trips>()
  for (const trip of trips) {
    const arr = tripsByTruck.get(trip.truckId) ?? []
    arr.push(trip)
    tripsByTruck.set(trip.truckId, arr)
  }

  // Index expenses by truckId
  const expensesByTruck = new Map<string, typeof expenses>()
  for (const exp of expenses) {
    if (!exp.truckId) continue
    const arr = expensesByTruck.get(exp.truckId) ?? []
    arr.push(exp)
    expensesByTruck.set(exp.truckId, arr)
  }

  // Index tire debts by owner name (case-insensitive)
  const tireDebtsByOwner = new Map<string, typeof tireDebts>()
  for (const td of tireDebts) {
    const key = td.ownerName.toLowerCase()
    const arr = tireDebtsByOwner.get(key) ?? []
    arr.push(td)
    tireDebtsByOwner.set(key, arr)
  }

  // Group by owner
  type TruckRow = {
    truckId: string
    payrollEntryId: string
    plate: string
    driverName: string
    auruminGross: number
    lpGross: number
    commFee: number
    mechFee: number
    adminFee: number
    nprFee: number
    driverWage: number
    deductions: number
    saldoInicial: number
    abono: number
    netAmount: number
    viaticos: number
    totalTons: number
    paidAt: string | null
    expenses: { category: string; description: string; amount: number; date: string }[]
  }

  type OwnerRow = {
    owner: { id: string; name: string; type: string; nprPercent: number; isNPROwner: boolean }
    trucks: TruckRow[]
    tireDebts: {
      id: string
      quantity: number
      tireType: string
      totalAmount: number
      amountPaid: number
      balance: number
      status: string
      notes: string | null
      payments: { amount: number; date: string }[]
    }[]
    totals: {
      auruminGross: number
      lpGross: number
      commFee: number
      mechFee: number
      adminFee: number
      nprFee: number
      driverWage: number
      deductions: number
      saldoInicial: number
      abono: number
      netAmount: number
      viaticos: number
      totalTons: number
    }
  }

  const ownerMap = new Map<string, Omit<OwnerRow, 'totals'>>()

  for (const entry of payrollEntries) {
    const owner = entry.truck?.owner
    if (!owner) continue

    const truckTrips = tripsByTruck.get(entry.truckId) ?? []
    const auruminGross = truckTrips
      .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
      .reduce((s, t) => s + t.amount, 0)
    const lpGross = truckTrips
      .filter(t => (t.route as any)?.clientName === 'LUIS PEÑA')
      .reduce((s, t) => s + t.amount, 0)

    const truckExps = expensesByTruck.get(entry.truckId) ?? []

    const truckRow: TruckRow = {
      truckId: entry.truckId,
      payrollEntryId: entry.id,
      plate: entry.truck?.plate ?? '',
      driverName: entry.truck?.driver?.name ?? '—',
      auruminGross,
      lpGross,
      commFee: entry.commissionFee,
      mechFee: entry.mechanicFee,
      adminFee: entry.adminFee,
      nprFee: entry.nprFee,
      driverWage: entry.driverWage,
      deductions: entry.deductions,
      saldoInicial: entry.saldoInicial,
      abono: entry.abono,
      netAmount: entry.netAmount,
      viaticos: entry.viaticos,
      totalTons: entry.totalTons,
      paidAt: entry.paidAt ? entry.paidAt.toISOString() : null,
      expenses: truckExps.map(e => ({
        category: e.category,
        description: e.description,
        amount: e.amount,
        date: e.date.toISOString(),
      })),
    }

    if (!ownerMap.has(owner.id)) {
      const ownerTireDebts = tireDebtsByOwner.get(owner.name.toLowerCase()) ?? []
      ownerMap.set(owner.id, {
        owner: {
          id: owner.id,
          name: owner.name,
          type: owner.type,
          nprPercent: owner.nprPercent,
          isNPROwner: owner.isNPROwner,
        },
        trucks: [],
        tireDebts: ownerTireDebts.map(td => ({
          id: td.id,
          quantity: td.quantity,
          tireType: td.tireType,
          totalAmount: td.totalAmount,
          amountPaid: td.amountPaid,
          balance: td.balance,
          status: td.status,
          notes: td.notes,
          payments: (td.payments ?? []).map(p => ({
            amount: p.amount,
            date: p.date.toISOString(),
          })),
        })),
      })
    }
    ownerMap.get(owner.id)!.trucks.push(truckRow)
  }

  const ownerRows: OwnerRow[] = Array.from(ownerMap.values()).map(row => {
    const trucks = row.trucks
    return {
      ...row,
      totals: {
        auruminGross: trucks.reduce((s, t) => s + t.auruminGross, 0),
        lpGross: trucks.reduce((s, t) => s + t.lpGross, 0),
        commFee: trucks.reduce((s, t) => s + t.commFee, 0),
        mechFee: trucks.reduce((s, t) => s + t.mechFee, 0),
        adminFee: trucks.reduce((s, t) => s + t.adminFee, 0),
        nprFee: trucks.reduce((s, t) => s + t.nprFee, 0),
        driverWage: trucks.reduce((s, t) => s + t.driverWage, 0),
        deductions: trucks.reduce((s, t) => s + t.deductions, 0),
        saldoInicial: trucks.reduce((s, t) => s + t.saldoInicial, 0),
        abono: trucks.reduce((s, t) => s + t.abono, 0),
        netAmount: trucks.reduce((s, t) => s + t.netAmount, 0),
        viaticos: trucks.reduce((s, t) => s + t.viaticos, 0),
        totalTons: trucks.reduce((s, t) => s + t.totalTons, 0),
      },
    }
  })

  ownerRows.sort((a, b) => a.owner.name.localeCompare(b.owner.name))

  return (
    <DuenosNominaClient
      periods={periods.map(p => ({
        id: p.id,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        status: p.status,
      }))}
      selectedPeriodId={selectedId}
      ownerRows={ownerRows}
    />
  )
}
