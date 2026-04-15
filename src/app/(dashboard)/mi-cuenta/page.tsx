import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import MiCuentaChofer from './MiCuentaChofer'
import MiCuentaMecanico from './MiCuentaMecanico'

export default async function MiCuentaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['CHOFER', 'MECANICO'].includes(session.role)) redirect('/dashboard')

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

  if (session.role === 'CHOFER') {
    // Find truck assigned to this driver
    const truck = await prisma.truck.findFirst({
      where: { driverId: session.userId, active: true },
      include: {
        owner: { select: { name: true } },
        driver: { select: { name: true, phone: true } },
      },
    })

    // Today's dispatch for this truck
    const todayDispatch = truck ? await prisma.dispatchEntry.findFirst({
      where: {
        truckId: truck.id,
        dispatch: { date: { gte: todayStart, lte: todayEnd } },
      },
      include: {
        route: { select: { id: true, name: true, fuelLitersPerTrip: true, rate: true, rateType: true } },
        dispatch: { select: { date: true, notes: true } },
      },
    }) : null

    // Open period payroll entry for this truck
    const openPeriod = await prisma.period.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startDate: 'desc' },
    })
    const payrollEntry = openPeriod && truck ? await prisma.payrollEntry.findFirst({
      where: { periodId: openPeriod.id, truckId: truck.id },
    }) : null

    // Recent trips for this truck (last 10)
    const recentTrips = truck ? await prisma.trip.findMany({
      where: { truckId: truck.id },
      orderBy: { date: 'desc' },
      take: 10,
      include: { route: { select: { name: true } } },
    }) : []

    // Loan balance for this driver
    const loans = await prisma.loan.findMany({
      where: {
        driverName: session.name,
        balance: { gt: 0 },
      },
    })
    const totalDebt = loans.reduce((s, l) => s + l.balance, 0)

    // Period trip count and tons
    const periodStats = openPeriod && truck ? await prisma.trip.aggregate({
      where: { truckId: truck.id, periodId: openPeriod.id },
      _count: { id: true },
      _sum: { netWeightKg: true, amount: true },
    }) : null

    return (
      <MiCuentaChofer
        session={{ name: session.name, role: session.role }}
        truck={truck ? {
          id: truck.id,
          plate: truck.plate,
          ownerName: truck.owner.name,
        } : null}
        todayDispatch={todayDispatch ? {
          plannedTrips: todayDispatch.plannedTrips,
          routeName: todayDispatch.route.name,
          fuelLiters: todayDispatch.route.fuelLitersPerTrip * todayDispatch.plannedTrips,
          rate: todayDispatch.route.rate,
          rateType: todayDispatch.route.rateType,
          dispatchNotes: todayDispatch.dispatch.notes,
        } : null}
        payrollEntry={payrollEntry ? {
          grossAmount: payrollEntry.grossAmount,
          netAmount: payrollEntry.netAmount,
          totalTons: payrollEntry.totalTons,
          driverWage: payrollEntry.driverWage,
          deductions: payrollEntry.deductions,
          paidAt: payrollEntry.paidAt?.toISOString() ?? null,
        } : null}
        periodLabel={openPeriod ? {
          start: openPeriod.startDate.toISOString(),
          end: openPeriod.endDate.toISOString(),
          tripCount: periodStats?._count.id ?? 0,
          tons: (periodStats?._sum.netWeightKg ?? 0) / 1000,
        } : null}
        recentTrips={recentTrips.map(t => ({
          id: t.id,
          date: t.date.toISOString(),
          ticketNo: t.ticketNo,
          routeName: t.route.name,
          netWeightKg: t.netWeightKg,
          amount: t.amount,
        }))}
        totalDebt={totalDebt}
      />
    )
  }

  // MECÁNICO view
  const recentWork = await prisma.mechanicWork.findMany({
    where: { mechanic: { id: session.userId } },
    orderBy: { date: 'desc' },
    take: 10,
    include: { truck: { select: { plate: true } } },
  })

  const clockEntry = await prisma.clockEntry.findFirst({
    where: { userId: session.userId, clockOut: null },
    orderBy: { clockIn: 'desc' },
  })

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEarnings = await prisma.mechanicWork.aggregate({
    where: { mechanicId: session.userId, date: { gte: monthStart } },
    _sum: { mechanicCut: true },
  })

  return (
    <MiCuentaMecanico
      session={{ name: session.name }}
      recentWork={recentWork.map(w => ({
        id: w.id,
        date: w.date.toISOString(),
        description: w.description,
        plate: w.truck.plate,
        mechanicCut: w.mechanicCut,
      }))}
      clockEntry={clockEntry ? {
        id: clockEntry.id,
        clockIn: clockEntry.clockIn.toISOString(),
      } : null}
      monthEarnings={monthEarnings._sum.mechanicCut ?? 0}
    />
  )
}
