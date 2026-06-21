// Regenera nómina P2 (16-31 mayo 2026) con la lógica actual de payroll.ts
// Ejecutar desde /transporte: npx tsx scripts/regen_p2_v2.ts
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

const PERIOD_ID = 'cmppy0k0e0000tdsn288mjrq1'

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
  }) as any

  if (!period) throw new Error('Período no encontrado')
  console.log(`Período: ${period.startDate.toISOString().slice(0,10)} al ${period.endDate.toISOString().slice(0,10)}`)
  console.log(`Viajes: ${period.trips.length}`)
  console.log(`adminFeeBase: $${period.adminFeeBase} | mechanicFeeBase: $${period.mechanicFeeBase}`)

  const byTruck = new Map<string, any[]>()
  for (const trip of period.trips) {
    byTruck.set(trip.truckId, [...(byTruck.get(trip.truckId) ?? []), trip])
  }
  const truckIds = Array.from(byTruck.keys())

  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: { driver: { select: { id: true, name: true } }, owner: true },
  }) as any[]
  const truckMap = new Map(trucks.map((t: any) => [t.id, t]))

  // Propios con viajes Aurumin
  const propiosConAurumin = new Set(
    period.trips
      .filter((t: any) => t.route?.clientName !== 'LUIS PEÑA')
      .filter((t: any) => (truckMap.get(t.truckId) as any)?.owner.type === 'PROPIO')
      .map((t: any) => t.truckId)
  ) as Set<string>

  // Admin fee — directo del período ($75/carro)
  const adminFeeBase = period.adminFeeBase ?? 75
  const adminFeePerTruck = adminFeeBase

  // Mechanic fee — $950 ÷ propios activos (o override)
  const mechanicFeeBase = period.mechanicFeeBase ?? 0
  const activePropioOverride: number | null = (period as any).activePropioOverride ?? null
  const activePropioCount = activePropioOverride ?? propiosConAurumin.size
  const mechanicFeePerTruck = mechanicFeeBase > 0 && activePropioCount > 0
    ? mechanicFeeBase / activePropioCount
    : 0

  console.log(`Propios Aurumin activos: ${propiosConAurumin.size} | Override: ${activePropioOverride ?? 'auto'} | mec/carro: $${mechanicFeePerTruck.toFixed(2)}`)

  // Mecánica: MechanicWork + Expenses MECANICA
  const mechanicWorks = await prisma.mechanicWork.findMany({
    where: { truckId: { in: truckIds }, date: { gte: period.startDate, lte: period.endDate } },
    select: { truckId: true, cost: true },
  }) as any[]
  const mechanicExpenses = await prisma.expense.findMany({
    where: { truckId: { in: truckIds }, periodId: PERIOD_ID, category: 'MECANICA' },
    select: { truckId: true, amount: true },
  }) as any[]
  const mechanicByTruck = new Map<string, number>()
  for (const w of mechanicWorks) mechanicByTruck.set(w.truckId, (mechanicByTruck.get(w.truckId) ?? 0) + w.cost)
  for (const e of mechanicExpenses) { if (e.truckId) mechanicByTruck.set(e.truckId, (mechanicByTruck.get(e.truckId) ?? 0) + e.amount) }

  // Gastos operativos (excluye NOMINA, ADMIN, NPR, MECANICA) — por fecha Y por periodId
  const expenses = await prisma.expense.findMany({
    where: {
      truckId: { in: truckIds },
      periodId: PERIOD_ID,
      category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] },
    },
    select: { truckId: true, amount: true },
  }) as any[]
  const gastosByTruck = new Map<string, number>()
  for (const e of expenses) { if (e.truckId) gastosByTruck.set(e.truckId, (gastosByTruck.get(e.truckId) ?? 0) + e.amount) }

  // Préstamos
  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } }) as any[]
  const ownerLoanApplied = new Set<string>()

  // Saldo inicial del período anterior
  const allPrevEntries = await prisma.payrollEntry.findMany({
    where: { truckId: { in: truckIds }, period: { endDate: { lt: period.startDate } } },
    include: { period: { select: { endDate: true } } },
    orderBy: { period: { endDate: 'desc' } },
  }) as any[]
  const prevByTruck = new Map<string, { netAmount: number; paidAt: Date | null }>()
  for (const e of allPrevEntries) {
    if (!prevByTruck.has(e.truckId)) prevByTruck.set(e.truckId, { netAmount: e.netAmount, paidAt: e.paidAt })
  }

  await prisma.payrollEntry.deleteMany({ where: { periodId: PERIOD_ID } })
  console.log('\nGenerando entradas...\n')

  const created: string[] = []
  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId) as any
    if (!truck) continue

    const isPropio   = truck.owner.type === 'PROPIO'
    const isAfiliado = truck.owner.type === 'AFILIADO'
    const isNPROwner = truck.owner.isNPROwner
    const isLuisRivas = truck.owner.id === 'owner-sancasimiro'
    const nprPct     = truck.owner.nprPercent / 100

    const totalTons   = trips.reduce((s: number, t: any) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount = trips.reduce((s: number, t: any) => s + t.amount, 0)
    const viaticos    = 0  // Fernando entra viáticos manualmente

    const nprFee = grossAmount * nprPct

    const driverWage = isLuisRivas
      ? (grossAmount - nprFee) * 0.20
      : trips.reduce((s: number, t: any) => s + (t.route?.driverWage ?? 0), 0)

    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee  = (isPropio && tieneAurumin)
      ? mechanicFeePerTruck + (mechanicByTruck.get(truckId) ?? 0)
      : 0
    const adminFee = (isPropio && tieneAurumin) ? adminFeePerTruck : 0

    const gastosOp = gastosByTruck.get(truckId) ?? 0  // viaticos = 0 ya

    const ownerName = truck.owner.name.toLowerCase().trim()
    const driverName = truck.driver?.name ?? ''
    const driverLoans = loans.filter((l: any) => !!driverName && l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
    const ownerLoans  = loans.filter((l: any) => {
      const lname = l.driverName.toLowerCase().trim()
      return lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach((l: any) => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s: number, l: any) => s + l.deductAmount, 0)

    const prev = prevByTruck.get(truckId)
    let saldoInicial = 0
    if (prev) {
      if (prev.netAmount < 0) saldoInicial = prev.netAmount
      else if (!prev.paidAt) saldoInicial = prev.netAmount
    }

    const netAmount = grossAmount
      - gastosOp
      - (isAfiliado ? 0 : driverWage)
      + (isNPROwner ? nprFee : -nprFee)
      - mechanicFee
      - adminFee
      - loanDeductions
      + saldoInicial

    await prisma.payrollEntry.create({
      data: {
        periodId:     PERIOD_ID,
        truckId,
        totalTons:    Math.round(totalTons    * 1000) / 1000,
        grossAmount:  Math.round(grossAmount  * 100)  / 100,
        viaticos:     0,
        driverWage:   Math.round(driverWage   * 100)  / 100,
        commissionFee: Math.round(gastosOp    * 100)  / 100,
        nprFee:       Math.round(nprFee       * 100)  / 100,
        mechanicFee:  Math.round(mechanicFee  * 100)  / 100,
        adminFee:     Math.round(adminFee     * 100)  / 100,
        deductions:   Math.round(loanDeductions * 100) / 100,
        saldoInicial: Math.round(saldoInicial * 100)  / 100,
        abono:        0,
        netAmount:    Math.round(netAmount    * 100)  / 100,
      },
    })

    const flags = [
      isNPROwner ? 'NPR+' : '',
      tieneAurumin && isPropio ? `adm=$${adminFee.toFixed(0)} mec=$${mechanicFee.toFixed(0)}` : '',
    ].filter(Boolean).join(' ')
    console.log(`  ${truck.plate.padEnd(12)} bruto=$${grossAmount.toFixed(2).padStart(9)}  gastos=$${gastosOp.toFixed(2).padStart(7)}  neto=$${netAmount.toFixed(2).padStart(9)}  ${flags}  [${truck.owner.name}]`)
    created.push(truck.plate)
  }

  console.log(`\nNómina P2 regenerada: ${created.length} camiones`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })
