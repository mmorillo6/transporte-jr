// Genera nómina para period-may2026-1 usando lógica de payroll.ts
import pg from 'pg'
import { randomUUID } from 'crypto'

const { Client } = pg
const DB = 'postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true'
const PERIOD_ID = 'period-may2026-1'

async function q(client, sql, params = []) {
  return (await client.query(sql, params)).rows
}

async function main() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const [period] = await q(client, `SELECT * FROM "Period" WHERE id = $1`, [PERIOD_ID])
  if (!period) throw new Error('Período no encontrado')
  if (period.status === 'CLOSED') throw new Error('Período cerrado')

  const trips = await q(client, `
    SELECT t.*, r."driverWage", r.name as "routeName", r."clientName",
           o.type as "ownerType", o.name as "ownerName", o."nprPercent", o."isNPROwner", o.id as "ownerId",
           tk.plate, u.name as "driverName"
    FROM "Trip" t
    JOIN "Route" r ON t."routeId" = r.id
    JOIN "Truck" tk ON t."truckId" = tk.id
    JOIN "Owner" o ON tk."ownerId" = o.id
    LEFT JOIN "User" u ON tk."driverId" = u.id
    WHERE t."periodId" = $1
  `, [PERIOD_ID])

  console.log(`Viajes: ${trips.length}`)

  // Agrupar por camión
  const byTruck = new Map()
  for (const t of trips) {
    if (!byTruck.has(t.truckId)) byTruck.set(t.truckId, [])
    byTruck.get(t.truckId).push(t)
  }

  // Propios con viajes Aurumin este período
  const propiosConAurumin = new Set(
    trips.filter(t => t.clientName !== 'LUIS PEÑA' && t.ownerType === 'PROPIO').map(t => t.truckId)
  )
  const activePropioThisPeriod = propiosConAurumin.size

  // Flota activa: propios con ≥1 viaje Aurumin en últimos 45 días
  const fortyFiveDaysAgo = new Date(new Date(period.startDate).getTime() - 45 * 24 * 60 * 60 * 1000).toISOString()
  const [{ count: propioFlotaActiva }] = await q(client, `
    SELECT COUNT(DISTINCT tk.id) as count
    FROM "Truck" tk
    JOIN "Owner" o ON tk."ownerId" = o.id
    JOIN "Trip" t ON t."truckId" = tk.id
    JOIN "Route" r ON t."routeId" = r.id
    WHERE tk.active = true AND o.type = 'PROPIO' AND t.date >= $1 AND r."clientName" != 'LUIS PEÑA'
  `, [fortyFiveDaysAgo])

  const adminPool = 50 * parseInt(propioFlotaActiva)
  const adminFeePerTruck = activePropioThisPeriod > 0 ? adminPool / activePropioThisPeriod : 0
  console.log(`Flota activa: ${propioFlotaActiva} | Activos Aurumin: ${activePropioThisPeriod} | Admin fee: $${adminFeePerTruck.toFixed(2)}/camión`)

  // Gastos mecánica por camión
  const truckIds = [...byTruck.keys()]
  const mechWorks = await q(client, `
    SELECT "truckId", SUM(cost) as total FROM "MechanicWork"
    WHERE "truckId" = ANY($1) AND date BETWEEN $2 AND $3
    GROUP BY "truckId"
  `, [truckIds, period.startDate, period.endDate])
  const mechExpenses = await q(client, `
    SELECT "truckId", SUM(amount) as total FROM "Expense"
    WHERE "truckId" = ANY($1) AND "periodId" = $2 AND category = 'MECANICA'
    GROUP BY "truckId"
  `, [truckIds, PERIOD_ID])
  const mechanicByTruck = new Map()
  for (const r of [...mechWorks, ...mechExpenses]) {
    mechanicByTruck.set(r.truckId, (mechanicByTruck.get(r.truckId) ?? 0) + parseFloat(r.total))
  }

  // Gastos operativos
  const gastoRows = await q(client, `
    SELECT "truckId", SUM(amount) as total FROM "Expense"
    WHERE "truckId" = ANY($1) AND date BETWEEN $2 AND $3
      AND category NOT IN ('NOMINA','ADMINISTRATIVO','NPR','MECANICA')
    GROUP BY "truckId"
  `, [truckIds, period.startDate, period.endDate])
  const gastosByTruck = new Map(gastoRows.map(r => [r.truckId, parseFloat(r.total)]))

  // Préstamos
  const loans = await q(client, `SELECT * FROM "Loan" WHERE balance > 0`)
  const ownerLoanApplied = new Set()

  // Saldo inicial (período previo más reciente por camión)
  const prevEntries = await q(client, `
    SELECT pe."truckId", pe."netAmount", pe."paidAt"
    FROM "PayrollEntry" pe
    JOIN "Period" p ON pe."periodId" = p.id
    WHERE pe."truckId" = ANY($1) AND p."endDate" < $2
    ORDER BY p."endDate" DESC
  `, [truckIds, period.startDate])
  const prevByTruck = new Map()
  for (const e of prevEntries) {
    if (!prevByTruck.has(e.truckId)) prevByTruck.set(e.truckId, e)
  }

  // Borrar nómina existente
  await client.query(`DELETE FROM "PayrollEntry" WHERE "periodId" = $1`, [PERIOD_ID])

  for (const [truckId, tps] of byTruck) {
    const first     = tps[0]
    const isPropio  = first.ownerType === 'PROPIO'
    const isNPROner = first.isNPROwner
    const nprPct    = parseFloat(first.nprPercent) / 100

    const totalTons   = tps.reduce((s, t) => s + (parseFloat(t.netWeightKg) ?? 0) / 1000, 0)
    const grossAmount = tps.reduce((s, t) => s + parseFloat(t.amount), 0)
    const viaticos    = tps.reduce((s, t) => s + parseFloat(t.viatico ?? 0), 0)
    const driverWage  = tps.reduce((s, t) => s + parseFloat(t.driverWage ?? 0), 0)
    const nprFee      = grossAmount * nprPct

    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee  = (isPropio && tieneAurumin) ? (mechanicByTruck.get(truckId) ?? 0) : 0
    const adminFee     = (isPropio && tieneAurumin) ? adminFeePerTruck : 0
    const gastosOp     = (gastosByTruck.get(truckId) ?? 0) + viaticos

    const driverName  = (first.driverName ?? '').toLowerCase().trim()
    const ownerName   = first.ownerName.toLowerCase().trim()
    const driverLoans = loans.filter(l => l.driverName.toLowerCase().trim() === driverName)
    const ownerLoans  = loans.filter(l => {
      const lname = l.driverName.toLowerCase().trim()
      return lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach(l => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s, l) => s + parseFloat(l.deductAmount), 0)

    const prev = prevByTruck.get(truckId)
    let saldoInicial = 0
    if (prev) {
      const net = parseFloat(prev.netAmount)
      if (net < 0) saldoInicial = net
      else if (net > 0 && !prev.paidAt) saldoInicial = net
    }

    const deductions    = gastosOp + loanDeductions
    const nprDescuento  = isNPROner ? 0 : nprFee
    const netAmount     = grossAmount - driverWage - nprDescuento - mechanicFee - adminFee - deductions + saldoInicial

    const round = n => Math.round(n * 100) / 100
    await client.query(`
      INSERT INTO "PayrollEntry"
        (id, "periodId", "truckId", "totalTons", "grossAmount", viaticos, "driverWage",
         "nprFee", "mechanicFee", "adminFee", deductions, "saldoInicial", "netAmount",
         "commissionFee", "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,NOW(),NOW())
    `, [
      randomUUID(), PERIOD_ID, truckId,
      round(totalTons), round(grossAmount), round(viaticos), round(driverWage),
      round(nprFee), round(mechanicFee), round(adminFee), round(deductions),
      round(saldoInicial), round(netAmount),
    ])

    console.log(`  ${first.plate.padEnd(12)} bruto=$${grossAmount.toFixed(2).padStart(9)}  neto=$${netAmount.toFixed(2).padStart(9)}  [${first.ownerName}]`)
  }

  console.log(`\nNómina generada: ${byTruck.size} camiones`)
  await client.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
