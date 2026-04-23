const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:5432/postgres' })

const r = v => Math.round(v * 100) / 100

async function generatePayrollForPeriod(periodId) {
  const NOW = new Date().toISOString()

  const { rows: trips } = await pool.query(`
    SELECT t.id, t."truckId", t."netWeightKg", t.amount, t.viatico,
           r."driverWage", r.name as route_name
    FROM "Trip" t JOIN "Route" r ON r.id = t."routeId"
    WHERE t."periodId" = $1`, [periodId])

  if (trips.length === 0) { console.log(`  (sin viajes en ${periodId})`); return 0 }

  const { rows: period } = await pool.query(`SELECT * FROM "Period" WHERE id = $1`, [periodId])
  const p = period[0]

  const truckIds = [...new Set(trips.map(t => t.truckId))]

  const { rows: trucks } = await pool.query(`
    SELECT t.id, t."ownerId", d.name as driver_name,
           o.type as owner_type, o."isNPROwner" as isnprowner, o."nprPercent" as nprpercent
    FROM "Truck" t JOIN "Owner" o ON o.id = t."ownerId"
    LEFT JOIN "User" d ON d.id = t."driverId"
    WHERE t.id = ANY($1)`, [truckIds])

  const { rows: [{ total_propio }] } = await pool.query(`
    SELECT COUNT(*) as total_propio FROM "Truck" t JOIN "Owner" o ON o.id = t."ownerId"
    WHERE t.active = true AND o.type = 'PROPIO'`)

  const { rows: mechWorks } = await pool.query(`
    SELECT "truckId", SUM(cost) as total FROM "MechanicWork"
    WHERE "truckId" = ANY($1) AND date >= $2 AND date <= $3
    GROUP BY "truckId"`, [truckIds, p.startDate, p.endDate])

  const { rows: expenses } = await pool.query(`
    SELECT "truckId", SUM(amount) as total FROM "Expense"
    WHERE "truckId" = ANY($1) AND date >= $2 AND date <= $3
    AND category NOT IN ('NOMINA','ADMINISTRATIVO','NPR','MECANICA')
    GROUP BY "truckId"`, [truckIds, p.startDate, p.endDate])

  const { rows: loans } = await pool.query(`SELECT * FROM "Loan" WHERE balance > 0`)

  const { rows: prevEntries } = await pool.query(`
    SELECT pe."truckId", pe."netAmount", pe."paidAt"
    FROM "PayrollEntry" pe JOIN "Period" pp ON pp.id = pe."periodId"
    WHERE pe."truckId" = ANY($1) AND pp."endDate" < $2
    ORDER BY pp."endDate" DESC`, [truckIds, p.startDate])

  const truckMap  = new Map(trucks.map(t => [t.id, t]))
  const mechMap   = new Map(mechWorks.map(m => [m.truckid, parseFloat(m.total)]))
  const expMap    = new Map(expenses.map(e => [e.truckid, parseFloat(e.total)]))
  const prevMap   = new Map()
  for (const e of prevEntries) if (!prevMap.has(e.truckId)) prevMap.set(e.truckId, e)

  const byTruck = new Map()
  for (const t of trips) byTruck.set(t.truckId, [...(byTruck.get(t.truckId) ?? []), t])

  const activePropioCount = trucks.filter(t => t.owner_type === 'PROPIO').length
  const adminFeePerTruck  = activePropioCount > 0 ? (50 * parseInt(total_propio)) / activePropioCount : 0

  await pool.query(`DELETE FROM "PayrollEntry" WHERE "periodId" = $1`, [periodId])

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
    const loanDeductions = loans
      .filter(l => l.driverName?.toLowerCase().trim() === (truck.driver_name ?? '').toLowerCase().trim())
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

    await pool.query(`
      INSERT INTO "PayrollEntry" (id, "periodId", "truckId", "totalTons", "grossAmount", viaticos,
        "driverWage", "commissionFee", "nprFee", "mechanicFee", "adminFee", deductions,
        "saldoInicial", abono, "netAmount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13, $14, $14)
    `, [periodId, truckId, r(totalTons), r(grossAmount), r(viaticos), r(driverWage),
        r(gastosOp), r(nprFee), r(mechanicFee), r(adminFee), r(loanDeductions), r(saldoInicial),
        r(netAmount), NOW])

    console.log(`    ${truck.driver_name ?? truckId}: ${truckTrips.length} viajes → bruto $${r(grossAmount)} neto $${r(netAmount)}`)
    created++
  }
  return created
}

async function main() {
  const NOW = new Date().toISOString()

  // 1. Crear período de abril si no existe con fechas correctas
  await pool.query(`
    INSERT INTO "Period" (id, "startDate", "endDate", status, "createdAt", "updatedAt")
    VALUES ('period-abr2026-1', '2026-04-01T08:00:00.000Z', '2026-04-16T07:59:59.000Z', 'OPEN', $1, $1)
    ON CONFLICT (id) DO UPDATE SET "startDate"='2026-04-01T08:00:00.000Z', "endDate"='2026-04-16T07:59:59.000Z'
  `, [NOW])
  console.log('✓ Período abril creado/actualizado')

  // 2. Mover viajes de abril al período correcto
  const moved = await pool.query(`
    UPDATE "Trip" SET "periodId" = 'period-abr2026-1'
    WHERE "periodId" = 'period-mar2026-2' AND date >= '2026-04-01T00:00:00.000Z'
    RETURNING id`)
  console.log(`✓ ${moved.rowCount} viajes de abril movidos al período de abril`)

  // 3. Regenerar nómina de marzo (ahora solo con 62 viajes de marzo)
  console.log('\n── Nómina Marzo 16-31 ──')
  const marCount = await generatePayrollForPeriod('period-mar2026-2')
  console.log(`✓ ${marCount} entradas generadas para marzo`)

  // 4. Generar nómina de abril
  console.log('\n── Nómina Abril 1-15 ──')
  const aprCount = await generatePayrollForPeriod('period-abr2026-1')
  console.log(`✓ ${aprCount} entradas generadas para abril`)

  // Verificación final
  const { rows: summary } = await pool.query(`
    SELECT p.id, p."startDate"::date, p."endDate"::date, p.status,
           COUNT(t.id) as trips, COUNT(pe.id) as payroll_entries
    FROM "Period" p
    LEFT JOIN "Trip" t ON t."periodId" = p.id
    LEFT JOIN "PayrollEntry" pe ON pe."periodId" = p.id
    GROUP BY p.id, p."startDate", p."endDate", p.status
    ORDER BY p."startDate"`)
  console.log('\n── Resumen final ──')
  console.log(JSON.stringify(summary, null, 2))

  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
