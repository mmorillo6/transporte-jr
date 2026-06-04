/**
 * Regenera nómina P2 (17-31 mayo 2026) con lógica actual de payroll.ts:
 *  - Preserva saldoInicial y abono de las entries existentes
 *  - Crea entry NPR para A15AE9Y
 * Sin dependencias server-only (standalone).
 */
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
  console.log(`Período: ${period.startDate.toISOString().slice(0,10)} → ${period.endDate.toISOString().slice(0,10)}`)
  console.log(`Viajes: ${period.trips.length}  |  adminFeeBase: $${period.adminFeeBase}  |  mechanicFeeBase: $${period.mechanicFeeBase}`)

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

  const adminFeeBase      = period.adminFeeBase ?? 75
  const adminFeePerTruck  = adminFeeBase
  const mechanicFeeBase   = period.mechanicFeeBase ?? 0
  const activePropioCount = (period as any).activePropioOverride ?? propiosConAurumin.size
  const mechanicFeePerTruck = mechanicFeeBase > 0 && activePropioCount > 0
    ? mechanicFeeBase / activePropioCount : 0

  console.log(`Propios Aurumin: ${propiosConAurumin.size}  |  adm/truck: $${adminFeePerTruck}  |  mec/truck: $${mechanicFeePerTruck.toFixed(2)}`)

  // Mecánica
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

  // Gastos operativos (por fecha dentro del período, excluye NOMINA/ADMIN/NPR/MECANICA)
  const expenses = await prisma.expense.findMany({
    where: {
      truckId: { in: truckIds },
      date: { gte: period.startDate, lte: period.endDate },
      category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] },
    },
    select: { truckId: true, amount: true },
  }) as any[]
  const gastosByTruck = new Map<string, number>()
  for (const e of expenses) { if (e.truckId) gastosByTruck.set(e.truckId, (gastosByTruck.get(e.truckId) ?? 0) + e.amount) }

  // Préstamos
  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } }) as any[]
  const ownerLoanApplied = new Set<string>()

  // Saldo inicial del período anterior (para primera generación)
  const allPrevEntries = await prisma.payrollEntry.findMany({
    where: { truckId: { in: truckIds }, period: { endDate: { lt: period.startDate } } },
    include: { period: { select: { endDate: true } } },
    orderBy: { period: { endDate: 'desc' } },
  }) as any[]
  const prevByTruck = new Map<string, { netAmount: number; paidAt: Date | null }>()
  for (const e of allPrevEntries) {
    if (!prevByTruck.has(e.truckId)) prevByTruck.set(e.truckId, { netAmount: e.netAmount, paidAt: e.paidAt })
  }

  // ── PRESERVAR saldoInicial y abono actuales ───────────────────────────────────
  const currentEntries = await prisma.payrollEntry.findMany({
    where: { periodId: PERIOD_ID },
    select: { truckId: true, saldoInicial: true, abono: true,
              truck: { select: { plate: true } } },
  }) as any[]
  const currentSaldos = new Map(currentEntries.map((e: any) => [e.truckId, e.saldoInicial as number]))
  const currentAbonos = new Map(currentEntries.map((e: any) => [e.truckId, e.abono as number]))

  console.log('\n=== SALDOS INICIALES GUARDADOS (preservar) ===')
  for (const [tid, s] of currentSaldos) {
    const plate = currentEntries.find((e: any) => e.truckId === tid)?.truck?.plate ?? tid
    const a = currentAbonos.get(tid) ?? 0
    console.log(`  ${plate.padEnd(10)} saldoInicial=${s.toFixed(2).padStart(9)}  abono=${a.toFixed(2).padStart(8)}`)
  }

  // Borrar entries existentes
  await prisma.payrollEntry.deleteMany({ where: { periodId: PERIOD_ID } })
  console.log('\nGenerando entradas...\n')

  const created: string[] = []
  let totalNprCollected = 0

  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId) as any
    if (!truck) continue

    const isPropio   = truck.owner.type === 'PROPIO'
    const isAfiliado = truck.owner.type === 'AFILIADO'
    const isNPROwner = truck.owner.isNPROwner ?? false
    const isLuisRivas = truck.owner.id === 'owner-sancasimiro'
    const nprPct     = (truck.owner.nprPercent ?? 5) / 100
    const nprContrib = truck.owner.nprContributor ?? false

    const totalTons   = trips.reduce((s: number, t: any) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount = trips.reduce((s: number, t: any) => s + t.amount, 0)

    const nprFee = grossAmount * nprPct

    // Acumular NPR para A15AE9Y
    if (!isNPROwner && nprContrib) {
      totalNprCollected += nprFee
    }

    const driverWage = isLuisRivas
      ? (grossAmount - nprFee) * 0.20
      : trips.reduce((s: number, t: any) => s + (t.route?.driverWage ?? 0), 0)

    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee  = (isPropio && tieneAurumin)
      ? mechanicFeePerTruck + (mechanicByTruck.get(truckId) ?? 0)
      : 0
    const adminFee = (isPropio && tieneAurumin) ? adminFeePerTruck : 0

    const gastosOp = gastosByTruck.get(truckId) ?? 0

    const driverName  = truck.driver?.name ?? ''
    const ownerName   = truck.owner.name.toLowerCase().trim()
    const driverLoans = loans.filter((l: any) => !!driverName && l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
    const ownerLoans  = loans.filter((l: any) => {
      const lname = l.driverName.toLowerCase().trim()
      return lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach((l: any) => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s: number, l: any) => s + l.deductAmount, 0)

    // saldoInicial: preservar si ya existía, sino carry-over del período anterior
    let saldoInicial = 0
    if (currentSaldos.has(truckId)) {
      saldoInicial = currentSaldos.get(truckId)!
    } else {
      const prev = prevByTruck.get(truckId)
      if (prev) {
        if (prev.netAmount < 0)   saldoInicial = prev.netAmount
        else if (!prev.paidAt)    saldoInicial = prev.netAmount
      }
    }

    const abono = currentAbonos.get(truckId) ?? 0

    const netAmount = grossAmount
      - gastosOp
      - (isAfiliado ? 0 : driverWage)
      + (isNPROwner ? nprFee : -nprFee)
      - mechanicFee
      - adminFee
      - loanDeductions
      + saldoInicial
      - abono

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
        abono:        Math.round(abono        * 100)  / 100,
        netAmount:    Math.round(netAmount    * 100)  / 100,
      },
    })

    const flags = [
      isNPROwner ? 'NPR+' : (nprContrib ? `npr-${(nprPct*100).toFixed(0)}%` : ''),
      tieneAurumin && isPropio ? `adm=$${adminFee.toFixed(0)} mec=$${mechanicFee.toFixed(0)}` : '',
      saldoInicial !== 0 ? `si=${saldoInicial.toFixed(2)}` : '',
      abono !== 0 ? `abono=${abono.toFixed(2)}` : '',
    ].filter(Boolean).join('  ')
    console.log(`  ${truck.plate.padEnd(10)} bruto=$${grossAmount.toFixed(2).padStart(9)}  gastos=$${gastosOp.toFixed(2).padStart(7)}  neto=$${netAmount.toFixed(2).padStart(9)}   ${flags}`)
    created.push(truck.plate)
  }

  // ── Entry NPR A15AE9Y ─────────────────────────────────────────────────────────
  const nprTruck = await prisma.truck.findFirst({
    where: { plate: 'A15AE9Y' },
    select: { id: true },
  }) as any

  const nprExpenses = nprTruck ? await prisma.expense.findMany({
    where: { periodId: PERIOD_ID, truckId: nprTruck.id },
    select: { amount: true },
  }) as any[] : []
  const totalNprExpenses = nprExpenses.reduce((s: number, e: any) => s + e.amount, 0)

  if (nprTruck && totalNprCollected > 0) {
    const nprSaldoInicial = currentSaldos.get(nprTruck.id) ?? 0
    const nprAbono        = currentAbonos.get(nprTruck.id) ?? 0
    const nprNet = Math.round((totalNprCollected - totalNprExpenses + nprSaldoInicial - nprAbono) * 100) / 100

    await prisma.payrollEntry.create({
      data: {
        periodId: PERIOD_ID,
        truckId:  nprTruck.id,
        totalTons:    0,
        grossAmount:  0,
        viaticos:     0,
        driverWage:   0,
        commissionFee: Math.round(totalNprExpenses * 100) / 100,
        nprFee:       Math.round(totalNprCollected * 100) / 100,
        mechanicFee:  0,
        adminFee:     0,
        deductions:   0,
        saldoInicial: Math.round(nprSaldoInicial * 100) / 100,
        abono:        Math.round(nprAbono * 100) / 100,
        netAmount:    nprNet,
      },
    })
    console.log(`\n  A15AE9Y    NPR ingreso=$${totalNprCollected.toFixed(2)}  gastos_npr=$${totalNprExpenses.toFixed(2)}  si=${nprSaldoInicial.toFixed(2)}  neto=$${nprNet.toFixed(2)}  ✨ NUEVA`)
    created.push('A15AE9Y')
  } else {
    console.log(`\n  A15AE9Y — NPR collected: $${totalNprCollected.toFixed(2)} (sin entry${!nprTruck ? ', camión no encontrado' : ''})`)
  }

  console.log(`\n✅ Nómina P2 regenerada: ${created.length} camiones (${created.join(', ')})`)
  await pool.end()
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
