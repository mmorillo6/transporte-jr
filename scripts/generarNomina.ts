// Script para generar nómina del período 01-15 mayo 2026
// Ejecutar: npx tsx scripts/generarNomina.ts
import 'dotenv/config'
// @ts-ignore
import pkg from '../node_modules/.prisma/client/index.js'
const { PrismaClient } = pkg

const prisma = new PrismaClient()
const PERIOD_ID = 'period-may2026-1'

async function main() {
  const period = await prisma.period.findUnique({
    where: { id: PERIOD_ID },
    include: {
      trips: {
        include: {
          truck: { include: { owner: true } },
          route: { select: { driverWage: true, name: true, clientName: true } },
        },
      },
    },
  })

  if (!period) throw new Error('Período no encontrado')
  if (period.status === 'CLOSED') throw new Error('El período está cerrado')
  console.log(`Período: ${period.startDate.toISOString().slice(0,10)} al ${period.endDate.toISOString().slice(0,10)}`)
  console.log(`Viajes: ${period.trips.length}`)

  const byTruck = new Map<string, typeof period.trips>()
  for (const trip of period.trips) {
    byTruck.set(trip.truckId, [...(byTruck.get(trip.truckId) ?? []), trip])
  }

  const truckIds = Array.from(byTruck.keys())
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: { driver: { select: { id: true, name: true } }, owner: true },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  const propiosConAurumin = new Set(
    period.trips
      .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
      .filter(t => truckMap.get(t.truckId)?.owner.type === 'PROPIO')
      .map(t => t.truckId)
  )
  const activePropioThisPeriod = propiosConAurumin.size

  const fortyFiveDaysAgo = new Date(period.startDate.getTime() - 45 * 24 * 60 * 60 * 1000)
  const propioFlotaActiva = await prisma.truck.count({
    where: {
      active: true,
      owner: { type: 'PROPIO' },
      trips: { some: { date: { gte: fortyFiveDaysAgo }, route: { clientName: { not: 'LUIS PEÑA' } } } },
    },
  })
  const adminPool = 50 * propioFlotaActiva
  const adminFeePerTruck = activePropioThisPeriod > 0 ? adminPool / activePropioThisPeriod : 0
  console.log(`Flota activa: ${propioFlotaActiva} propios | Activos Aurumin: ${activePropioThisPeriod} | Admin fee: $${adminFeePerTruck.toFixed(2)}/camión`)

  const mechanicWorks = await prisma.mechanicWork.findMany({
    where: { truckId: { in: truckIds }, date: { gte: period.startDate, lte: period.endDate } },
    select: { truckId: true, cost: true },
  })
  const mechanicExpenses = await prisma.expense.findMany({
    where: { truckId: { in: truckIds }, periodId: PERIOD_ID, category: 'MECANICA' },
    select: { truckId: true, amount: true },
  })
  const mechanicByTruck = new Map<string, number>()
  for (const w of mechanicWorks) mechanicByTruck.set(w.truckId, (mechanicByTruck.get(w.truckId) ?? 0) + w.cost)
  for (const e of mechanicExpenses) { if (e.truckId) mechanicByTruck.set(e.truckId, (mechanicByTruck.get(e.truckId) ?? 0) + e.amount) }

  const expenses = await prisma.expense.findMany({
    where: { truckId: { in: truckIds }, date: { gte: period.startDate, lte: period.endDate }, category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] } },
    select: { truckId: true, amount: true },
  })
  const gastosByTruck = new Map<string, number>()
  for (const e of expenses) { if (e.truckId) gastosByTruck.set(e.truckId, (gastosByTruck.get(e.truckId) ?? 0) + e.amount) }

  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } })
  const ownerLoanApplied = new Set<string>()

  const allPrevEntries = await prisma.payrollEntry.findMany({
    where: { truckId: { in: truckIds }, period: { endDate: { lt: period.startDate } } },
    include: { period: { select: { endDate: true } } },
    orderBy: { period: { endDate: 'desc' } },
  })
  const prevByTruck = new Map<string, { netAmount: number; paidAt: Date | null }>()
  for (const e of allPrevEntries) {
    if (!prevByTruck.has(e.truckId)) prevByTruck.set(e.truckId, { netAmount: e.netAmount, paidAt: e.paidAt })
  }

  await prisma.payrollEntry.deleteMany({ where: { periodId: PERIOD_ID } })

  const created = []
  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId)
    if (!truck) continue

    const isPropio  = truck.owner.type === 'PROPIO'
    const isNPROner = truck.owner.isNPROwner
    const nprPct    = truck.owner.nprPercent / 100

    const totalTons   = trips.reduce((s, t) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount = trips.reduce((s, t) => s + t.amount, 0)
    const viaticos    = trips.reduce((s, t) => s + t.viatico, 0)
    const driverWage  = trips.reduce((s, t) => s + ((t.route as any)?.driverWage ?? 0), 0)
    const nprFee      = grossAmount * nprPct

    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee  = (isPropio && tieneAurumin) ? (mechanicByTruck.get(truckId) ?? 0) : 0
    const adminFee     = (isPropio && tieneAurumin) ? adminFeePerTruck : 0
    const gastosOp     = (gastosByTruck.get(truckId) ?? 0) + viaticos

    const driverName  = truck.driver?.name ?? ''
    const ownerName   = truck.owner.name.toLowerCase().trim()
    const driverLoans = loans.filter(l => l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
    const ownerLoans  = loans.filter(l => {
      const lname = l.driverName.toLowerCase().trim()
      return lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach(l => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s, l) => s + l.deductAmount, 0)

    const prev = prevByTruck.get(truckId)
    let saldoInicial = 0
    if (prev) {
      if (prev.netAmount < 0) saldoInicial = prev.netAmount
      else if (prev.netAmount > 0 && !prev.paidAt) saldoInicial = prev.netAmount
    }

    const deductions = gastosOp + loanDeductions
    const nprDescuento = isNPROner ? 0 : nprFee
    const netAmount = grossAmount - driverWage - nprDescuento - mechanicFee - adminFee - deductions + saldoInicial

    await prisma.payrollEntry.create({
      data: {
        periodId: PERIOD_ID,
        truckId,
        totalTons:    Math.round(totalTons    * 100) / 100,
        grossAmount:  Math.round(grossAmount  * 100) / 100,
        viaticos:     Math.round(viaticos     * 100) / 100,
        driverWage:   Math.round(driverWage   * 100) / 100,
        nprFee:       Math.round(nprFee       * 100) / 100,
        mechanicFee:  Math.round(mechanicFee  * 100) / 100,
        adminFee:     Math.round(adminFee     * 100) / 100,
        deductions:   Math.round(deductions   * 100) / 100,
        saldoInicial: Math.round(saldoInicial * 100) / 100,
        netAmount:    Math.round(netAmount    * 100) / 100,
      },
    })

    const plate = truck.plate
    console.log(`  ${plate.padEnd(12)} bruto=$${grossAmount.toFixed(2).padStart(8)}  neto=$${netAmount.toFixed(2).padStart(8)}  [${truck.owner.name}]`)
    created.push(plate)
  }

  console.log(`\nNómina generada: ${created.length} camiones`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })
