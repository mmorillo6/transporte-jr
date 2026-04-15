/**
 * Importa reportes de la romana (Excel) → DB
 * Solo importa viajes de las minas activas del sistema.
 * Usa ticketNo + fecha como clave de deduplicación.
 *
 * Uso: npx tsx prisma/import-romana.ts <archivo.xlsx>
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import * as XLSX from 'xlsx'
import * as path from 'path'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

// ─── Mapeo de PROVEEDOR (romana) → nombre de ruta en el sistema ──────────────
const PROVEEDOR_MAP: Record<string, string | ((procedencia: string) => string)> = {
  'FOSFORITO':              'FOSFORITO',
  'CHARLIE RICHARD':        'CHARLIE RICHARD',
  'SOSA MENDEZ':            'SOSA MENDEZ',
  'LA GARRAPATA':           'LA GARRAPATA',
  'ROSCIO SUR':             'ROSCIO SUR',
  'MACKENCI':               'MACKENCI',
  'POZO AURUVEN':           'POZO AURUVEN',
  'LAS CLARITAS':           'LAS CLARITAS',
  'OPERACIONES DEL CENTRO': (proc: string) => {
    if (proc.includes('LA FE')) return 'LA FE'
    if (proc.includes('NUEVO CALLAO')) return 'NUEVO CALLAO'
    return 'NUEVO CALLAO' // fallback
  },
}

function excelDateToJs(serial: number): Date {
  const d = XLSX.SSF.parse_date_code(serial)
  return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S)
}

async function getOrCreatePeriod(date: Date) {
  const day = date.getDate()
  const year = date.getFullYear()
  const month = date.getMonth()
  const isFirstHalf = day <= 15
  const start = new Date(year, month, isFirstHalf ? 1 : 16)
  const end   = new Date(year, month, isFirstHalf ? 15 : new Date(year, month + 1, 0).getDate())

  const existing = await prisma.period.findFirst({
    where: { startDate: start, endDate: end },
  })
  if (existing) return existing

  return prisma.period.create({
    data: { startDate: start, endDate: end, status: 'OPEN' },
  })
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Uso: npx tsx prisma/import-romana.ts <archivo.xlsx>')
    process.exit(1)
  }

  console.log('📂 Leyendo:', path.basename(filePath))
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  const rows = rawData.slice(10).filter((r: any[]) => r[4] && r[5])
  console.log(`   ${rows.length} filas encontradas`)

  // Cargar rutas y camiones activos
  const routes   = await prisma.route.findMany({ where: { active: true } })
  const routeMap = new Map(routes.map(r => [r.name, r]))

  const trucks   = await prisma.truck.findMany({ where: { active: true } })
  const truckMap = new Map(trucks.map(t => [t.plate.toUpperCase().replace(/\s+/g, '').trim(), t]))

  let imported = 0, skipped = 0, noRoute = 0, noTruck = 0

  for (const row of rows) {
    const ticketNo   = String(row[4]).trim()
    const dateSerial = Number(row[5])
    const procedencia = String(row[7]).trim()
    const proveedor  = String(row[10]).trim()
    const conductor  = String(row[13]).trim()
    const placa      = String(row[15]).toUpperCase().replace(/\s+/g, '').trim()
    const material   = String(row[16]).trim()
    const netWeightKg = Number(row[20]) || 0

    if (!ticketNo || !dateSerial || !placa) { skipped++; continue }

    // Resolver ruta
    const routeResolver = PROVEEDOR_MAP[proveedor]
    if (!routeResolver) { noRoute++; continue }
    const routeName = typeof routeResolver === 'function'
      ? routeResolver(procedencia)
      : routeResolver
    const route = routeMap.get(routeName)
    if (!route) { noRoute++; continue }

    // Resolver camión
    const truck = truckMap.get(placa)
    if (!truck) { noTruck++; continue }

    const date = excelDateToJs(dateSerial)

    // Deduplicación: mismo ticket + misma fecha (±1h)
    const exists = await prisma.trip.findFirst({
      where: {
        ticketNo,
        date: {
          gte: new Date(date.getTime() - 3_600_000),
          lte: new Date(date.getTime() + 3_600_000),
        },
      },
    })
    if (exists) { skipped++; continue }

    // Calcular monto
    const amount = route.rateType === 'PER_TON'
      ? (netWeightKg / 1000) * route.rate
      : route.rate

    // Viático (LA FE tiene viático)
    const viatico = route.hasViatico ? route.viaticoSingle : 0

    const period = await getOrCreatePeriod(date)

    await prisma.trip.create({
      data: {
        date,
        ticketNo,
        truckId:     truck.id,
        routeId:     route.id,
        periodId:    period.id,
        netWeightKg,
        material,
        origin:      procedencia,
        amount,
        viatico,
      },
    })
    imported++
  }

  console.log(`\n✅ Resultado:`)
  console.log(`   Importados: ${imported}`)
  console.log(`   Ya existían (duplicados): ${skipped}`)
  if (noRoute > 0) console.log(`   Sin ruta activa: ${noRoute}`)
  if (noTruck > 0) console.log(`   Sin camión activo: ${noTruck}`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
