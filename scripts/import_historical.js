/**
 * import_historical.js
 * Importa viajes históricos de Luis Peña (Sep-Nov 2025) y AURIM (Jan-Feb 2026)
 * Ejecutar: node scripts/import_historical.js
 */
require('dotenv').config()
const { Pool } = require('pg')
const XLSX = require('xlsx')
const path = require('path')
const { randomUUID } = require('crypto')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const DOWNLOADS = '/Users/marymorillo/Downloads'

function excelToDate(serial) {
  return new Date((serial - 25569) * 86400 * 1000)
}

function cid() { return randomUUID().replace(/-/g, '').slice(0, 25) }

// ─── Definición de períodos ────────────────────────────────────────────────────
const PERIODS = [
  { id: 'period-sep2025-1', start: '2025-09-01', end: '2025-09-16' },
  { id: 'period-sep2025-2', start: '2025-09-16', end: '2025-10-01' },
  { id: 'period-oct2025-1', start: '2025-10-01', end: '2025-10-16' },
  { id: 'period-oct2025-2', start: '2025-10-16', end: '2025-11-01' },
  { id: 'period-nov2025-1', start: '2025-11-01', end: '2025-11-16' },
  { id: 'period-nov2025-2', start: '2025-11-16', end: '2025-12-01' },
  { id: 'period-ene2026-2', start: '2026-01-16', end: '2026-02-01' },
  { id: 'period-feb2026-1', start: '2026-02-01', end: '2026-02-16' },
  { id: 'period-mar2026-1', start: '2026-03-01', end: '2026-03-16' },
]

function findPeriodId(date, allPeriods) {
  for (const p of allPeriods) {
    if (date >= p.startDate && date < p.endDate) return p.id
  }
  return null
}

// ─── Parser: formato Luis Peña PER_TON (Sep16 - Nov) ────────────────────────
// Columns: Item, Ticket, Fecha, Origen, Material, Transportista, Conductor, Placa, PesoNeto
function parseLuisPenaPerTon(filePath) {
  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const hdr = rows.findIndex(r => r.join('').toUpperCase().includes('PLACA'))
  if (hdr < 0) throw new Error('Header not found in ' + filePath)
  const data = rows.slice(hdr + 1).filter(r => typeof r[0] === 'number' && r[0] > 0 && r[7] && r[8] > 0)
  return data.map(r => ({
    ticketNo:    String(r[1]).trim() || null,
    date:        excelToDate(r[2]),
    origen:      String(r[3]).trim().toUpperCase(),
    conductor:   String(r[6]).trim(),
    plate:       String(r[7]).trim().toUpperCase(),
    netWeightKg: Number(r[8]),
    clientName:  'LUIS PEÑA',
  }))
}

// ─── Parser: formato Luis Peña PER_TRIP (Sep 1-15) ──────────────────────────
// Columns: Item, Fecha, Conductor, Placa, Desc1, Desc2, Flete$
function parseLuisPenaPerTrip(filePath) {
  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const hdr = rows.findIndex(r => r.join('').toUpperCase().includes('PLACA'))
  if (hdr < 0) throw new Error('Header not found in ' + filePath)
  const data = rows.slice(hdr + 1).filter(r => typeof r[0] === 'number' && r[0] > 0 && r[3])
  return data.map(r => ({
    ticketNo:    `LP-SEP1-${r[0]}`,  // synthetic ticket
    date:        excelToDate(r[1]),
    origen:      'NUEVO CALLAO',
    conductor:   String(r[2]).trim(),
    plate:       String(r[3]).trim().toUpperCase(),
    netWeightKg: null,
    amount:      Number(r[6]) || 0,  // direct amount, no weight
    clientName:  'LUIS PEÑA',
  }))
}

// ─── Parser: formato AURIM romana ───────────────────────────────────────────
// Columns (fixed): _, _, _, _, CODI(4), FECHA(5), _, PROCEDENCIA(7), _, _, PROVEEDOR(10), _, _, CONDUCTOR(13), _, PLACA(15), MATERIAL(16), _, _, _, NETO(20)
const PROVEEDOR_TO_ROUTE = {
  'OPERACIONES DEL CENTRO': null, // determined by procedencia
  'SOSA MENDEZ': 'SOSA MENDEZ',
  'SOSA MENDEZ C.A': 'SOSA MENDEZ',
  'FOSFORITO': 'FOSFORITO',
  'CHARLIE RICHARD': 'CHARLIE RICHARD',
  'LA GARRAPATA': 'LA GARRAPATA',
  'GARRAPATA': 'LA GARRAPATA',
  'ROSCIO SUR': 'ROSCIO SUR',
  'MACKENCI': 'MACKENCI',
  'CH.R. - RUBEN MARIN': 'CH.R. - RUBEN MARIN',
  'RUBEN MARIN': 'CH.R. - RUBEN MARIN',
  'LAS CLARITAS': 'LAS CLARITAS (SAN LUIS)',
}

function resolveRoute(proveedor, procedencia) {
  const prov = proveedor.trim().toUpperCase()
  const proc = procedencia.trim().toUpperCase()
  if (prov === 'OPERACIONES DEL CENTRO') {
    return proc.includes('FE') ? 'LA FE' : 'NUEVO CALLAO'
  }
  return PROVEEDOR_TO_ROUTE[prov] || prov
}

function parseAurimRomana(filePath) {
  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const hdr = rows.findIndex(r => r.join('').toUpperCase().includes('PLACA'))
  if (hdr < 0) throw new Error('Header not found in ' + filePath)
  const headers = rows[hdr]

  function ci(...kws) {
    for (const kw of kws) {
      const i = headers.findIndex(h => String(h).toUpperCase().includes(kw.toUpperCase()))
      if (i >= 0) return i
    }
    return -1
  }
  const COL = {
    ticket:      ci('CODI','TICKET','N°','NO.','NUM') !== -1 ? ci('CODI','TICKET','N°','NO.','NUM') : 4,
    fecha:       ci('FECHA','DATE','DIA') !== -1 ? ci('FECHA','DATE','DIA') : 5,
    procedencia: ci('PROCEDENCIA','PROC','ORIGEN','MINA') !== -1 ? ci('PROCEDENCIA','PROC','ORIGEN','MINA') : 7,
    proveedor:   ci('PROVEEDOR','EMPRESA','TRANSPORTE') !== -1 ? ci('PROVEEDOR','EMPRESA','TRANSPORTE') : 10,
    conductor:   ci('CONDUCTOR','CHOFER','OPERADOR') !== -1 ? ci('CONDUCTOR','CHOFER','OPERADOR') : 13,
    placa:       ci('PLACA','VEHICULO','UNIDAD') !== -1 ? ci('PLACA','VEHICULO','UNIDAD') : 15,
    material:    ci('MATERIAL','MAT','TIPO') !== -1 ? ci('MATERIAL','MAT','TIPO') : 16,
    netoKg:      ci('NETO','PESO N','NET') !== -1 ? ci('NETO','PESO N','NET') : 20,
  }

  const data = rows.slice(hdr + 1).filter(r => {
    const codi = r[COL.ticket]
    return (codi || codi === 0) && codi !== '' && r[COL.placa] && r[COL.placa] !== ''
  })

  return data.map(r => {
    const proveedor  = String(r[COL.proveedor] || '').trim()
    const procedencia= String(r[COL.procedencia] || '').trim()
    return {
      ticketNo:    String(r[COL.ticket]).trim(),
      date:        typeof r[COL.fecha] === 'number' ? excelToDate(r[COL.fecha]) : new Date(r[COL.fecha]),
      origen:      resolveRoute(proveedor, procedencia),
      conductor:   String(r[COL.conductor] || '').trim(),
      plate:       String(r[COL.placa] || '').trim().toUpperCase(),
      netWeightKg: Number(r[COL.netoKg]) || 0,
      clientName:  proveedor.toUpperCase() === 'OPERACIONES DEL CENTRO' ? 'LUIS PEÑA' : 'AURIM',
    }
  }).filter(t => t.plate && t.ticketNo)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Crear períodos faltantes
  console.log('📅 Creando períodos...')
  for (const p of PERIODS) {
    const exists = await pool.query('SELECT id FROM "Period" WHERE id = $1', [p.id])
    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO "Period" (id, "startDate", "endDate", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'CLOSED', NOW(), NOW())`,
        [p.id, new Date(p.start + 'T08:00:00Z'), new Date(p.end + 'T07:59:59Z')]
      )
      console.log('  ✓ Creado', p.id)
    } else {
      console.log('  - Ya existe', p.id)
    }
  }

  // 2. Cargar rutas, camiones y períodos
  const [routesRes, trucksRes, periodsRes, ticketsRes] = await Promise.all([
    pool.query('SELECT id, name, rate, "rateType" FROM "Route" WHERE active = true'),
    pool.query('SELECT id, plate FROM "Truck"'),
    pool.query('SELECT id, "startDate", "endDate" FROM "Period" ORDER BY "startDate"'),
    pool.query('SELECT "ticketNo" FROM "Trip" WHERE "ticketNo" IS NOT NULL'),
  ])

  const routeMap = new Map(routesRes.rows.map(r => [r.name.toUpperCase(), r]))
  const truckMap = new Map(trucksRes.rows.map(t => [t.plate.toUpperCase(), t]))
  const allPeriods = periodsRes.rows.map(p => ({
    id: p.id,
    startDate: new Date(p.startDate),
    endDate: new Date(p.endDate),
  }))
  const existingTickets = new Set(ticketsRes.rows.map(t => t.ticketNo))

  console.log(`\n📋 Rutas: ${routeMap.size}, Camiones: ${truckMap.size}, Períodos: ${allPeriods.length}, Tickets existentes: ${existingTickets.size}`)

  // 3. Definir archivos a importar
  const FILES = [
    // Luis Peña PER_TRIP (Sep 1-15)
    { file: 'TRANSPORTE JOSE R. 01-09 AL 15-09 (LUIS PEÑA)-3-1.xlsx', parser: 'lp-pertrip' },
    // Luis Peña PER_TON con tickets
    { file: 'TRANSPORTE JOSE R. 16-09 AL 30-09 (LUIS PEÑA)-3-1.xlsx', parser: 'lp-perton' },
    { file: 'TRANSPORTE JOSE R. 01-10 AL 15-10 (LUIS PEÑA)-1.xlsx',   parser: 'lp-perton' },
    { file: 'TRANSPORTE JOSE R. 16-10 AL 31-10 (LUIS PEÑA).xlsx',     parser: 'lp-perton' },
    { file: 'TRANSPORTE JOSE R. 01-11 AL 15-11 (LUIS PEÑA).xlsx',     parser: 'lp-perton' },
    { file: 'TRANSPORTE JOSE R. 16-11 AL 30-11 (LUIS PEÑA).xlsx',     parser: 'lp-perton' },
    // AURIM romana
    { file: 'JR.xlsx',    parser: 'aurim' },
    { file: 'JOSER.xlsx', parser: 'aurim' },
  ]

  let totalInserted = 0, totalSkipped = 0, totalNoTruck = 0, totalNoRoute = 0

  for (const { file, parser } of FILES) {
    const filePath = path.join(DOWNLOADS, file)
    console.log(`\n📂 ${file}`)
    let trips
    try {
      if (parser === 'lp-perton')  trips = parseLuisPenaPerTon(filePath)
      else if (parser === 'lp-pertrip') trips = parseLuisPenaPerTrip(filePath)
      else trips = parseAurimRomana(filePath)
    } catch (e) {
      console.error('  ❌ Error al parsear:', e.message)
      continue
    }

    console.log(`  Filas parseadas: ${trips.length}`)
    let fileInserted = 0, fileSkipped = 0

    for (const t of trips) {
      // Duplicate check
      if (t.ticketNo && existingTickets.has(t.ticketNo)) { fileSkipped++; continue }

      // Resolve truck
      const truck = truckMap.get(t.plate)
      if (!truck) { totalNoTruck++; continue }

      // Resolve route
      const route = routeMap.get(t.origen.toUpperCase())
      if (!route) {
        console.log(`    ⚠ Ruta no encontrada: "${t.origen}"`)
        totalNoRoute++
        continue
      }

      // Calculate amount
      let amount = t.amount  // for per-trip format, amount is pre-set
      if (amount == null) {
        if (route.rateType === 'PER_TON') {
          amount = (t.netWeightKg / 1000) * route.rate
        } else {
          amount = route.rate
        }
      }

      // Find period
      const periodId = findPeriodId(t.date, allPeriods)

      // Insert
      const id = cid()
      await pool.query(
        `INSERT INTO "Trip" (id, date, "ticketNo", "truckId", "routeId", "netWeightKg", material, conductor, amount, "periodId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [id, t.date, t.ticketNo || null, truck.id, route.id, t.netWeightKg || null,
         null, t.conductor || null, amount, periodId || null]
      )

      if (t.ticketNo) existingTickets.add(t.ticketNo)
      fileInserted++
      totalInserted++
    }

    console.log(`  ✓ Insertados: ${fileInserted}, Duplicados: ${fileSkipped}`)
    fileSkipped > 0 && (totalSkipped += fileSkipped)
  }

  console.log(`\n✅ RESUMEN:`)
  console.log(`   Insertados: ${totalInserted}`)
  console.log(`   Duplicados: ${totalSkipped}`)
  console.log(`   Sin camión: ${totalNoTruck}`)
  console.log(`   Sin ruta:   ${totalNoRoute}`)

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
