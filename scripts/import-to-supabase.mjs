// Importa datos de sqlite-export.json → Supabase (PostgreSQL)
import pg from 'pg'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Pool } = pg

const directUrl = process.env.DIRECT_URL
if (!directUrl) throw new Error('DIRECT_URL no definida — corre: DIRECT_URL=... node scripts/import-to-supabase.mjs')

const pool = new Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } })
const data = JSON.parse(readFileSync('scripts/sqlite-export.json', 'utf8'))

// Orden respetando FK
const ORDER = [
  'Owner', 'User', 'Route', 'Truck', 'Period',
  'Trip', 'PayrollEntry', 'Expense',
  'MaintenanceLog', 'MechanicWork', 'ClockEntry', 'Loan',
  'MaintenanceAlert', 'TruckStatus', 'Part',
  'OilBatch', 'OilUsage', 'TireRepair',
  'FuelTank', 'FuelIntake', 'FuelEntry',
  'CashEntry', 'CuentaPorCobrar', 'CxCPayment',
  'Dispatch', 'DispatchEntry',
]

// Campos booleanos (SQLite los guarda como 0/1)
const BOOL_FIELDS = {
  Owner: ['active', 'isNPROwner'],
  User:  ['active'],
  Route: ['bidirectional', 'hasViatico', 'active'],
  Truck: ['active'],
  Expense: ['isCredit'],
}

function normalizeRow(table, row) {
  const r = { ...row }
  for (const f of (BOOL_FIELDS[table] ?? [])) {
    if (f in r) r[f] = r[f] === 1 || r[f] === '1' || r[f] === true
  }
  // Quitar undefined
  for (const k of Object.keys(r)) {
    if (r[k] === undefined) r[k] = null
  }
  return r
}

const client = await pool.connect()
let total = 0

try {
  await client.query('BEGIN')

  // Deshabilitar FK checks temporalmente
  await client.query('SET session_replication_role = replica')

  for (const table of ORDER) {
    const rows = data[table]
    if (!rows || rows.length === 0) { console.log(`⏭  ${table}: vacío`); continue }

    const normalized = rows.map(r => normalizeRow(table, r))

    // Limpiar tabla
    await client.query(`TRUNCATE TABLE "${table}" CASCADE`)

    // Insertar en lotes de 50
    const keys = Object.keys(normalized[0])
    const cols = keys.map(k => `"${k}"`).join(', ')

    for (let i = 0; i < normalized.length; i += 50) {
      const batch = normalized.slice(i, i + 50)
      const placeholders = batch.map((_, bi) =>
        `(${keys.map((_, ki) => `$${bi * keys.length + ki + 1}`).join(', ')})`
      ).join(', ')
      const values = batch.flatMap(r => keys.map(k => r[k] ?? null))
      await client.query(`INSERT INTO "${table}" (${cols}) VALUES ${placeholders}`, values)
    }

    console.log(`✓ ${table}: ${normalized.length} filas`)
    total += normalized.length
  }

  await client.query('SET session_replication_role = DEFAULT')
  await client.query('COMMIT')
  console.log(`\n✅ Total importado: ${total} filas`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('✗ Error:', e.message)
  throw e
} finally {
  client.release()
  await pool.end()
}
