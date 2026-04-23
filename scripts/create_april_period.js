const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:5432/postgres' })

async function main() {
  const PERIOD_ID = 'period-abr2026-1'
  const START = '2026-04-01T08:00:00.000Z'
  const END   = '2026-04-16T07:59:59.000Z'
  const NOW   = new Date().toISOString()

  // 1. Crear período
  await pool.query(`
    INSERT INTO "Period" (id, "startDate", "endDate", status, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, 'OPEN', $4, $4)
    ON CONFLICT (id) DO NOTHING
  `, [PERIOD_ID, START, END, NOW])
  console.log('✓ Período creado:', PERIOD_ID)

  // 2. Vincular viajes de abril a este período
  const linked = await pool.query(`
    UPDATE "Trip" SET "periodId" = $1
    WHERE date >= $2 AND date < $3 AND "periodId" IS NULL
    RETURNING id
  `, [PERIOD_ID, START, END])
  console.log('✓ Viajes vinculados:', linked.rowCount)

  // 3. Cargar datos necesarios para nómina
  const { rows: trips } = await pool.query(`
    SELECT t.id, t."truckId", t."netWeightKg", t.amount, t.viatico,
           r."driverWage", r.name as route_name
    FROM "Trip" t
    JOIN "Route" r ON r.id = t."routeId"
    WHERE t."periodId" = $1
  `, [PERIOD_ID])

  const { rows: trucks } = await pool.query(`
    SELECT t.id, t."ownerId", d.name as driver_name,
           o.type as owner_type, o."isNPROwner", o."nprPercent"
    FROM "Truck" t
    JOIN "Owner" o ON o.id = t."ownerId"
    LEFT JOIN "User" d ON d.id = t."driverId"
    WHERE t.id IN (SELECT DISTINCT "truckId" FROM "Trip" WHERE "periodId" = $1)
  `, [PERIOD_ID])

  const { rows: [{ total_propio }] } = await pool.query(`
    SELECT COUNT(*) as total_propio FROM "Truck" t
    JOIN "Owner" o ON o.id = t."ownerId"
    WHERE t.active = true AND o.type = 'PROPIO'
  `)

  const { rows: mechWorks } = await pool.query(`
    SELECT "truckId", SUM(cost) as total FROM "MechanicWork"
    WHERE "truckId" IN (SELECT DISTINCT "truckId" FROM "Trip" WHERE "periodId" = $1)
    AND date >= $2 AND date <= $3
    GROUP BY "truckId"
  `, [PERIOD_ID, START, END])

  const { rows: expenses } = await pool.query(`
    SELECT "truckId", SUM(amount) as total FROM "Expense"
    WHERE "truckId" IN (SELECT DISTINCT "truckId" FROM "Trip" WHERE "periodId" = $1)
    AND date >= $2 AND date <= $3
    AND category NOT IN ('NOMINA','ADMINISTRATIVO','NPR','MECANICA')
    GROUP BY "truckId"
  `, [PERIOD_ID, START, END])

  const { rows: loans } = await pool.query(`SELECT * FROM "Loan" WHERE balance > 0`)

  const { rows: prevEntries } = await pool.query(`
    SELECT pe."truckId", pe."netAmount", pe."paidAt"
    FROM "PayrollEntry" pe
    JOIN "Period" p ON p.id = pe."periodId"
    WHERE pe."truckId" IN (SELECT DISTINCT "truckId" FROM "Trip" WHERE "periodId" = $1)
    AND p."endDate" < $2
    ORDER BY p."endDate" DESC
  `, [PERIOD_ID, START])

  // Índices
  const truckMap    = new Map(trucks.map(t => [t.id, t]))
  const mechMap     = new Map(mechWorks.map(m => [m.truckid, parseFloat(m.total)]))
  const expMap      = new Map(expenses.map(e => [e.truckid, parseFloat(e.total)]))
  const prevMap     = new Map()
  for (const e of prevEntries) {
    if (!prevMap.has(e.truckId)) prevMap.set(e.truckId, e)
  }

  // Agrupar viajes por camión
  const byTruck = new Map()
  for (const t of trips) {
    byTruck.set(t.truckId, [...(byTruck.get(t.truckId) ?? []), t])
  }

  const activePropioCount = trucks.filter(t => t.owner_type === 'PROPIO').length
  const adminPool = 50 * parseInt(total_propio)
  const adminFeePerTruck = activePropioCount > 0 ? adminPool / activePropioCount : 0

  // Eliminar entradas previas del período
  await pool.query(`DELETE FROM "PayrollEntry" WHERE "periodId" = $1`, [PERIOD_ID])

  let created = 0
  for (const [truckId, truckTrips] of byTruck) {
    const truck = truckMap.get(truckId)
    if (!truck) continue

    const isPropio  = truck.owner_type === 'PROPIO'
    const isNPROner = truck.isnprowner
    const nprPct    = truck.nprpercent / 100

    const totalTons   = truckTrips.reduce((s, t) => s + (parseFloat(t.netweightkg) || 0) / 1000, 0)
    const grossAmount = truckTrips.reduce((s, t) => s + parseFloat(t.amount), 0)
    const viaticos    = truckTrips.reduce((s, t) => s + parseFloat(t.viatico || 0), 0)
    const driverWage  = truckTrips.reduce((s, t) => s + parseFloat(t.driverwage || 0), 0)
    const nprFee      = grossAmount * nprPct
    const mechanicFee = isPropio ? (mechMap.get(truckId) ?? 0) : 0
    const adminFee    = isPropio ? adminFeePerTruck : 0
    const gastosOp    = (expMap.get(truckId) ?? 0) + viaticos

    const driverName = truck.driver_name ?? ''
    const loanDeductions = loans
      .filter(l => l.driverName?.toLowerCase().trim() === driverName.toLowerCase().trim())
      .reduce((s, l) => s + parseFloat(l.deductAmount || 0), 0)

    const prev = prevMap.get(truckId)
    let saldoInicial = 0
    if (prev) {
      if (prev.netAmount < 0) saldoInicial = prev.netAmount
      else if (!prev.paidAt) saldoInicial = prev.netAmount
    }

    const netAmount = grossAmount - gastosOp - driverWage
      - (isNPROner ? 0 : nprFee)
      - mechanicFee - adminFee - loanDeductions + saldoInicial

    const r = m => Math.round(m * 100) / 100

    await pool.query(`
      INSERT INTO "PayrollEntry" (id, "periodId", "truckId", "totalTons", "grossAmount", viaticos,
        "driverWage", "commissionFee", "nprFee", "mechanicFee", "adminFee", deductions,
        "saldoInicial", abono, "netAmount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13, $14, $14)
    `, [PERIOD_ID, truckId, r(totalTons), r(grossAmount), r(viaticos), r(driverWage),
        r(gastosOp), r(nprFee), r(mechanicFee), r(adminFee), r(loanDeductions), r(saldoInicial),
        r(netAmount), NOW])
    created++
    console.log(`  ✓ ${truck.driver_name ?? truckId} → bruto $${r(grossAmount)} neto $${r(netAmount)}`)
  }

  console.log(`\n✓ Nómina generada: ${created} entradas`)
  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
