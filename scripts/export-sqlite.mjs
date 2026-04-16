// Exporta todos los datos de dev.db a JSON para migrar a Supabase
import { createClient } from '@libsql/client'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const db = createClient({ url: `file:${resolve(process.cwd(), 'dev.db')}` })

async function exportTable(name) {
  const { rows } = await db.execute(`SELECT * FROM "${name}"`)
  return rows
}

const tables = [
  'User', 'Owner', 'Truck', 'Route', 'Period', 'Trip',
  'PayrollEntry', 'Expense', 'MaintenanceLog', 'MechanicWork',
  'ClockEntry', 'Loan', 'MaintenanceAlert', 'TruckStatus', 'Part',
  'OilBatch', 'OilUsage', 'TireRepair', 'FuelTank', 'FuelIntake', 'FuelEntry',
  'CashEntry', 'CuentaPorCobrar', 'CxCPayment', 'Dispatch', 'DispatchEntry',
]

const data = {}
for (const t of tables) {
  try {
    data[t] = await exportTable(t)
    console.log(`✓ ${t}: ${data[t].length} filas`)
  } catch (e) {
    console.warn(`⚠ ${t}: ${e.message}`)
    data[t] = []
  }
}

writeFileSync('scripts/sqlite-export.json', JSON.stringify(data, null, 2))
console.log('\n✅ Exportado a scripts/sqlite-export.json')
