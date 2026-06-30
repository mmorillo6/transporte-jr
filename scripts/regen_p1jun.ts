/**
 * regen_p1jun.ts — Recalcula nómina P1 Jun con la lógica actualizada
 * (incluye días internos: bruto $20/h, chofer $2.50/h)
 * Replica generatePayroll() preservando saldoInicial y abono existentes.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
const pool = new Pool({ connectionString: DIRECT })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

const PERIOD_ID = 'cmqn41pg2003804kwj7yqtgni'  // P1 Jun 2026-06-01→15 OPEN

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
  if (!period) { console.log('Período no encontrado'); return }
  if (period.status === 'CLOSED') { console.log('Período CERRADO — no se puede recalcular'); return }
  console.log(`Período: ${period.startDate.toISOString().slice(0,10)} → ${period.endDate.toISOString().slice(0,10)}  [${period.status}]`)
  console.log(`Viajes: ${period.trips.length}`)

  // Agrupar viajes por camión
  const byTruck = new Map<string, typeof period.trips>()
  for (const trip of period.trips) {
    byTruck.set(trip.truckId, [...(byTruck.get(trip.truckId) ?? []), trip])
  }
  const truckIds = Array.from(byTruck.keys())

  // Días internos — bruto al camión trabajado, chofer al camión habitual del sustituto
  const diasInternosAll = await prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: period.startDate, lte: period.endDate } },
    select: { truckId: true, totalHoras: true, driverTruckId: true },
  })
  const diasByTruck       = new Map<string, number>()  // bruto por camión trabajado
  const diasChoferByTruck = new Map<string, number>()  // chofer por camión habitual
  for (const d of diasInternosAll) {
    diasByTruck.set(d.truckId, (diasByTruck.get(d.truckId) ?? 0) + d.totalHoras)
    const choferTruck = d.driverTruckId ?? d.truckId
    diasChoferByTruck.set(choferTruck, (diasChoferByTruck.get(choferTruck) ?? 0) + d.totalHoras)
  }
  console.log(`Días internos: ${diasInternosAll.length} registros, ${diasInternosAll.reduce((s,d)=>s+d.totalHoras,0)}h total`)

  // Camiones PROPIO con gastos pero sin viajes
  const extraExpTrucks = await prisma.expense.findMany({
    where: {
      truckId: { not: null },
      date: { gte: period.startDate, lte: period.endDate },
      truck: { owner: { OR: [{ type: 'PROPIO' }, { isNPROwner: true }] } },
    },
    select: { truckId: true },
    distinct: ['truckId'],
  })
  for (const { truckId } of extraExpTrucks) {
    if (truckId && !byTruck.has(truckId)) { byTruck.set(truckId, []); truckIds.push(truckId) }
  }

  // Camiones solo-días-internos (trabajados o como camión habitual de sustituto)
  for (const truckId of new Set([...diasByTruck.keys(), ...diasChoferByTruck.keys()])) {
    if (!byTruck.has(truckId)) { byTruck.set(truckId, []); truckIds.push(truckId) }
  }

  // Info de camiones
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: { driver: { select: { id: true, name: true } }, owner: true },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  // propiosConAurumin — incluye días internos
  const propiosConAurumin = new Set([
    ...period.trips
      .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
      .filter(t => truckMap.get(t.truckId)?.owner.type === 'PROPIO')
      .map(t => t.truckId),
    ...Array.from(diasByTruck.keys()).filter(tid => truckMap.get(tid)?.owner.type === 'PROPIO'),
  ])

  // Admin y mecánica
  const adminFeeBase      = (period as any).adminFeeBase ?? 50
  const mechanicFeeBase   = (period as any).mechanicFeeBase ?? 0
  const activePropioCount = (period as any).activePropioOverride ?? propiosConAurumin.size
  const mechanicFeePerTruck = mechanicFeeBase > 0 && activePropioCount > 0 ? mechanicFeeBase / activePropioCount : 0

  console.log(`\nAdminFee/camión: $${adminFeeBase}  |  MecánicaFee/camión: $${mechanicFeePerTruck.toFixed(2)}  |  propiosConAurumin: ${propiosConAurumin.size}`)

  // MechanicWork por camión
  const mechanicWorks = await prisma.mechanicWork.findMany({
    where: { truckId: { in: truckIds }, date: { gte: period.startDate, lte: period.endDate } },
    select: { truckId: true, cost: true },
  })
  const mechanicByTruck = new Map<string, number>()
  for (const w of mechanicWorks) mechanicByTruck.set(w.truckId, (mechanicByTruck.get(w.truckId) ?? 0) + w.cost)

  // Gastos MECANICA por camión
  const mechanicExpenses = await prisma.expense.findMany({
    where: { truckId: { in: truckIds }, periodId: PERIOD_ID, category: 'MECANICA' },
    select: { truckId: true, amount: true },
  })
  for (const e of mechanicExpenses) {
    if (!e.truckId) continue
    mechanicByTruck.set(e.truckId, (mechanicByTruck.get(e.truckId) ?? 0) + e.amount)
  }

  // Gastos operativos por camión
  const expenses = await prisma.expense.findMany({
    where: {
      truckId: { in: truckIds },
      date: { gte: period.startDate, lte: period.endDate },
      category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] },
    },
    select: { truckId: true, amount: true },
  })
  const gastosByTruck = new Map<string, number>()
  for (const e of expenses) {
    if (!e.truckId) continue
    gastosByTruck.set(e.truckId, (gastosByTruck.get(e.truckId) ?? 0) + e.amount)
  }

  // Préstamos
  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } })
  const ownerLoanApplied = new Set<string>()

  // Saldos actuales (para preservarlos)
  const currentEntries = await prisma.payrollEntry.findMany({
    where: { periodId: PERIOD_ID },
    select: { truckId: true, saldoInicial: true, abono: true, driverWageOverride: true, cashEntryId: true, paidAt: true },
  })
  const currentSaldos        = new Map(currentEntries.map(e => [e.truckId, e.saldoInicial]))
  const currentAbonos        = new Map(currentEntries.map(e => [e.truckId, e.abono]))
  const currentWageOverrides = new Map(currentEntries.filter(e => e.driverWageOverride !== null).map(e => [e.truckId, e.driverWageOverride!]))
  const currentCashEntryIds  = new Map(currentEntries.filter(e => e.cashEntryId  !== null).map(e => [e.truckId, e.cashEntryId!]))
  const currentPaidAts       = new Map(currentEntries.filter(e => e.paidAt       !== null).map(e => [e.truckId, e.paidAt!]))

  // Período anterior (carry-over si no hay saldo manual)
  const allPrevEntries = await prisma.payrollEntry.findMany({
    where: { truckId: { in: truckIds }, period: { endDate: { lt: period.startDate } } },
    include: { period: { select: { endDate: true } } },
    orderBy: { period: { endDate: 'desc' } },
  })
  const prevByTruck = new Map<string, { netAmount: number; paidAt: Date | null }>()
  for (const e of allPrevEntries) {
    if (!prevByTruck.has(e.truckId)) prevByTruck.set(e.truckId, { netAmount: e.netAmount, paidAt: e.paidAt })
  }

  // Borrar entradas existentes
  await prisma.payrollEntry.deleteMany({ where: { periodId: PERIOD_ID } })
  console.log('Entradas anteriores eliminadas.')

  const created = []
  const OWNER_SANCASIMIRO = 'owner-sancasimiro'

  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId)
    if (!truck) continue

    const isPropio   = truck.owner.type === 'PROPIO'
    const isAfiliado = truck.owner.type === 'AFILIADO'
    const isNPROwner = truck.owner.isNPROwner
    const isLuisRivas = truck.owner.id === OWNER_SANCASIMIRO
    const nprPct     = truck.owner.nprPercent / 100

    const diasHoras       = diasByTruck.get(truckId) ?? 0
    const diasChoferHoras = diasChoferByTruck.get(truckId) ?? 0
    const totalTons       = trips.reduce((s, t) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount     = trips.reduce((s, t) => s + t.amount, 0) + diasHoras * 20
    const nprFee          = grossAmount * nprPct
    const driverWageCalc  = isLuisRivas
      ? (grossAmount - nprFee) * 0.20
      : trips.reduce((s, t) => s + (t.route?.driverWage ?? 0), 0) + diasChoferHoras * 2.50
    const driverWage      = currentWageOverrides.get(truckId) ?? driverWageCalc

    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee = (isPropio && tieneAurumin)
      ? mechanicFeePerTruck + (mechanicByTruck.get(truckId) ?? 0)
      : 0
    const adminFee    = (isPropio && tieneAurumin) ? adminFeeBase : 0
    const gastosOp    = gastosByTruck.get(truckId) ?? 0

    const skip = new Set<string>()
    const driverName = truck.driver?.name ?? ''
    const ownerName  = truck.owner.name.toLowerCase().trim()
    const driverLoans = loans.filter(l => !skip.has(l.id) && !!driverName && l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
    const ownerLoans  = loans.filter(l => {
      const lname = l.driverName.toLowerCase().trim()
      return !skip.has(l.id) && lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach(l => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s, l) => s + l.deductAmount, 0)

    let saldoInicial: number
    if (currentSaldos.has(truckId)) {
      saldoInicial = currentSaldos.get(truckId)!
    } else {
      const prev = prevByTruck.get(truckId)
      saldoInicial = 0
      if (prev) {
        if (prev.netAmount < 0) saldoInicial = prev.netAmount
        else if (!prev.paidAt) saldoInicial = prev.netAmount
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

    const entry = await prisma.payrollEntry.create({
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
        netAmount:          Math.round(netAmount    * 100)  / 100,
        driverWageOverride: currentWageOverrides.has(truckId)
          ? Math.round(currentWageOverrides.get(truckId)! * 100) / 100
          : null,
        cashEntryId: currentCashEntryIds.get(truckId) ?? null,
        paidAt:      currentPaidAts.get(truckId) ?? null,
      },
    })
    const hasOverride = currentWageOverrides.has(truckId)
    created.push({ plate: truck.plate, owner: truck.owner.name, grossAmount, driverWage, gastosOp, mechanicFee, adminFee, nprFee, loanDeductions, saldoInicial, abono, netAmount, isNPROwner, diasHoras, diasChoferHoras, hasOverride })
  }

  // A15AE9Y NPR entry
  let totalNprCollected = 0
  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId)
    if (!truck || truck.owner.isNPROwner || !truck.owner.nprContributor) continue
    const gross = trips.reduce((s, t) => s + t.amount, 0) + (diasByTruck.get(truckId) ?? 0) * 20
    totalNprCollected += gross * (truck.owner.nprPercent / 100)
  }
  const nprTruck = await prisma.truck.findFirst({ where: { plate: 'A15AE9Y' }, select: { id: true } })
  const nprExpenses = nprTruck ? await prisma.expense.findMany({
    where: { periodId: PERIOD_ID, truckId: nprTruck.id },
    select: { amount: true },
  }) : []
  const totalNprExpenses = nprExpenses.reduce((s, e) => s + e.amount, 0)
  if (nprTruck && totalNprCollected > 0) {
    const nprSaldoInicial = currentSaldos.get(nprTruck.id) ?? 0
    const nprAbono        = currentAbonos.get(nprTruck.id) ?? 0
    const nprNet = Math.round((totalNprCollected - totalNprExpenses + nprSaldoInicial - nprAbono) * 100) / 100
    await prisma.payrollEntry.create({
      data: {
        periodId: PERIOD_ID, truckId: nprTruck.id,
        totalTons: 0, grossAmount: 0, viaticos: 0, driverWage: 0,
        commissionFee: Math.round(totalNprExpenses * 100) / 100,
        nprFee:        Math.round(totalNprCollected * 100) / 100,
        mechanicFee: 0, adminFee: 0, deductions: 0,
        saldoInicial: Math.round(nprSaldoInicial * 100) / 100,
        abono:        Math.round(nprAbono * 100) / 100,
        netAmount:    nprNet,
      },
    })
    created.push({ plate: 'A15AE9Y', owner: 'José Rodríguez (NPR)', grossAmount: 0, driverWage: 0, gastosOp: totalNprExpenses, mechanicFee: 0, adminFee: 0, nprFee: totalNprCollected, loanDeductions: 0, saldoInicial: nprSaldoInicial, abono: nprAbono, netAmount: nprNet, isNPROwner: true, diasHoras: 0 })
  }

  // Reporte
  console.log('\n=== RESULTADO P1 JUN ===')
  const f = (v: number) => v.toFixed(2)

  // Agrupar por dueño
  const byOwner = new Map<string, { name: string; entries: typeof created }>()
  for (const e of created) {
    if (!byOwner.has(e.owner)) byOwner.set(e.owner, { name: e.owner, entries: [] })
    byOwner.get(e.owner)!.entries.push(e)
  }

  let totalNet = 0
  for (const [, data] of byOwner) {
    const ownerNet = data.entries.reduce((s, e) => s + e.netAmount, 0)
    totalNet += ownerNet
    console.log(`\n${data.name}  →  NET=$${f(ownerNet)}`)
    for (const e of data.entries) {
      const internos = e.diasHoras > 0 ? `  [${e.diasHoras}h bruto=$${f(e.diasHoras*20)} / chofer ${e.diasChoferHoras}h=$${f(e.diasChoferHoras*2.5)}]` : ''
      const overrideTag = e.hasOverride ? '  ⚑ SUELDO MANUAL' : ''
      console.log(`  ${e.plate}${internos}${overrideTag}`)
      console.log(`    bruto=$${f(e.grossAmount)}  gastos=$${f(e.gastosOp)}  chofer=$${f(e.driverWage)}  mec=$${f(e.mechanicFee)}  admin=$${f(e.adminFee)}  npr=$${f(e.nprFee)}  ded=$${f(e.loanDeductions)}  saldoIni=$${f(e.saldoInicial)}  NET=$${f(e.netAmount)}`)
    }
  }
  console.log(`\n===  TOTAL NETO P1 JUN: $${f(totalNet)}  ===`)

  // José específico
  const jose = created.filter(e => e.owner.includes('José'))
  const joseNet = jose.reduce((s, e) => s + e.netAmount, 0)
  console.log(`\nJosé Rodríguez total: $${f(joseNet)}  (Fernando dice $19,903.88)`)
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
