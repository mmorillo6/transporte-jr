// Script de importación romana 01-15 mayo 2026
// Archivos: JR.xlsx + JOSE R.xlsx
import XLSX from 'xlsx'
import pg from 'pg'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const { Client } = pg

const DB = 'postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true'
const PERIOD_ID = 'period-may2026-1'

const PROVEEDOR_TO_ROUTE = {
  'OPERACIONES DEL CENTRO': 'NUEVO CALLAO',
  'SOSA MENDEZ':            'SOSA MENDEZ',
  'FOSFORITO':              'FOSFORITO',
  'CHARLIE RICHARD':        'CHARLIE RICHARD',
  'RUBEN MARIN':            'CH.R. - RUBEN MARIN',
  'LA GARRAPATA':           'LA GARRAPATA',
  'ROSCIO SUR':             'ROSCIO SUR',
  'MACKENCI':               'MACKENCI',
  'CH.R. - RUBEN MARIN':   'CH.R. - RUBEN MARIN',
  'LAS CLARITAS':           'LAS CLARITAS (SAN LUIS)',
}

const HOURLY_KEYWORDS = ['TRONCAL', 'H66', 'PLANTA']

function resolveRoute(proveedor, procedencia) {
  const prov = proveedor.trim().toUpperCase()
  const proc = procedencia.trim().toUpperCase()
  if (HOURLY_KEYWORDS.some(kw => proc === kw || proc.includes(kw))) return 'DIAS INTERNOS (PLANTA)'
  if (prov === 'OPERACIONES DEL CENTRO') return proc.includes('FE') ? 'LA FE' : 'NUEVO CALLAO'
  if (prov === 'CHARLIE RICHARD') {
    if (proc.includes('RUBEN') || proc.includes('MARIN') || proc.includes('R.MARIN') || proc.includes('R. MARIN'))
      return 'CH.R. - RUBEN MARIN'
    return 'CHARLIE RICHARD'
  }
  return PROVEEDOR_TO_ROUTE[prov] ?? null
}

function excelDate(serial) {
  return new Date((serial - 25569) * 86400 * 1000)
}

function colIdx(headers, ...keywords) {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => String(h).toUpperCase().includes(kw.toUpperCase()))
    if (idx !== -1) return idx
  }
  return -1
}

function parseFile(filePath) {
  const buf = readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let headerRowIdx = -1
  for (let i = 0; i < 30; i++) {
    if (rows[i]?.some(c => String(c).toUpperCase().includes('PLACA'))) { headerRowIdx = i; break }
  }
  if (headerRowIdx === -1) throw new Error(`No se encontró cabecera en ${filePath}`)

  const headers = rows[headerRowIdx]
  const COL = {
    ticket:      colIdx(headers, 'CODI', 'CODIGO', 'TICKET', 'N°', 'NO.', 'NUM'),
    fecha:       colIdx(headers, 'FECHA', 'DATE', 'DIA'),
    procedencia: colIdx(headers, 'PROCEDENCIA', 'PROC', 'ORIGEN', 'MINA'),
    proveedor:   colIdx(headers, 'PROVEEDOR', 'EMPRESA', 'TRANSPORTE'),
    conductor:   colIdx(headers, 'CONDUCTOR', 'CHOFER', 'OPERADOR'),
    placa:       colIdx(headers, 'PLACA', 'VEHICULO', 'UNIDAD'),
    material:    colIdx(headers, 'MATERIAL', 'MAT', 'TIPO'),
    netoKg:      colIdx(headers, 'NETO', 'PESO N', 'NET'),
  }

  const rawRows = []
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const codi = r[COL.ticket]
    if (!codi && codi !== 0) continue
    const ticketNo = String(codi).trim()
    if (!ticketNo) continue

    const dateSerial  = r[COL.fecha]
    const procedencia = String(r[COL.procedencia] ?? '').trim()
    const proveedor   = String(r[COL.proveedor]   ?? '').trim()
    const conductor   = String(r[COL.conductor]   ?? '').trim()
    const plate       = String(r[COL.placa]        ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const material    = String(r[COL.material]     ?? '').trim()
    const netoKg      = typeof r[COL.netoKg] === 'number' ? r[COL.netoKg] : 0

    if (!procedencia || !proveedor || !plate) continue
    const date = typeof dateSerial === 'number' ? excelDate(dateSerial) : new Date(String(dateSerial))
    if (isNaN(date.getTime())) continue

    rawRows.push({ ticketNo, date, procedencia, proveedor, conductor, plate, material, netoKg })
  }
  return rawRows
}

async function main() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Cargar datos del sistema (secuencial para evitar conflictos con pg)
  const routesRes  = await client.query('SELECT id, name, "rateType", rate FROM "Route" WHERE active = true')
  const trucksRes  = await client.query('SELECT id, plate FROM "Truck"')
  const ticketsRes = await client.query('SELECT "ticketNo" FROM "Trip" WHERE "ticketNo" IS NOT NULL')

  const routeMap = new Map(routesRes.rows.map(r => [r.name.toUpperCase(), r]))
  const truckMap = new Map(trucksRes.rows.map(t => [t.plate.toUpperCase(), t]))
  const ticketSet = new Set(ticketsRes.rows.map(r => r.ticketNo))

  const files = [
    '/Users/marymorillo/Downloads/JR.xlsx',
    '/Users/marymorillo/Downloads/JOSE R.xlsx',
  ]

  let inserted = 0, skipped = 0, unknown = 0
  const unknownRoutes = new Set()

  for (const file of files) {
    console.log(`\nProcesando: ${file.split('/').pop()}`)
    const rows = parseFile(file)
    console.log(`  ${rows.length} filas encontradas`)

    for (const row of rows) {
      // Duplicado
      if (ticketSet.has(row.ticketNo)) { skipped++; continue }

      const routeName = resolveRoute(row.proveedor, row.procedencia)
      if (!routeName) { unknownRoutes.add(row.proveedor); unknown++; continue }

      const route = routeMap.get(routeName.toUpperCase())
      if (!route) { unknownRoutes.add(routeName); unknown++; continue }

      const truck = truckMap.get(row.plate)
      if (!truck) { console.log(`  PLACA NO REGISTRADA: ${row.plate} (ticket ${row.ticketNo})`); unknown++; continue }
      const truckId = truck.id

      const isDiasInternos = route.name.toUpperCase().includes('DIAS INTERNOS')
      const tons = row.netoKg / 1000
      const amount = isDiasInternos ? 0
        : route.rateType === 'PER_TON' ? Math.round(tons * route.rate * 100) / 100
        : route.rate

      await client.query(
        `INSERT INTO "Trip" (id, date, "ticketNo", "truckId", "routeId", "netWeightKg", material, conductor, amount, "periodId", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
        [
          randomUUID(),
          row.date.toISOString(),
          row.ticketNo,
          truckId,
          route.id,
          row.netoKg,
          row.material || null,
          row.conductor || null,
          amount,
          PERIOD_ID,
        ]
      )
      ticketSet.add(row.ticketNo)
      inserted++
    }
  }

  await client.end()

  console.log('\n=== RESULTADO ===')
  console.log(`Insertados:  ${inserted}`)
  console.log(`Duplicados:  ${skipped}`)
  console.log(`Sin ruta:    ${unknown}`)
  if (unknownRoutes.size > 0) console.log(`Proveedores sin ruta: ${[...unknownRoutes].join(', ')}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
