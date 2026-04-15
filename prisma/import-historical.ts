/**
 * Script de importación histórica — Transporte JR
 * Importa JR.xlsx (16-31 enero) y JR!..xlsx (16-28 febrero)
 * También corrige datos y agrega camiones/rutas faltantes
 *
 * Uso: npx tsx prisma/import-historical.ts
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import * as XLSX from 'xlsx'
import * as path from 'path'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAmount(rateType: string, rate: number, netWeightKg: number): number {
  if (rateType === 'PER_TON') return (netWeightKg / 1000) * rate
  return rate
}

async function getOrCreatePeriod(date: Date) {
  const day = date.getDate()
  const year = date.getFullYear()
  const month = date.getMonth()
  const isFirstHalf = day <= 15
  const start = new Date(year, month, isFirstHalf ? 1 : 16)
  const end = new Date(year, month, isFirstHalf ? 15 : new Date(year, month + 1, 0).getDate())
  end.setHours(23, 59, 59, 999)

  const existing = await prisma.period.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
  })
  if (existing) return existing

  return prisma.period.create({ data: { startDate: start, endDate: end, status: 'OPEN' } })
}

// ─── Paso 1: Corregir nombre del encargado ────────────────────────────────────

async function fixEncargado() {
  const res = await prisma.user.updateMany({
    where: { email: 'encargado@transportejr.com' },
    data: { name: 'Fernando Pérez' },
  })
  console.log(`✓ Encargado actualizado a Fernando Pérez (${res.count} registro)`)
}

// ─── Paso 2: Agregar ruta faltante ────────────────────────────────────────────

async function addMissingRoutes() {
  const missing = [
    { name: 'OPERACIONES DEL CENTRO', rateType: 'PER_TON' as const, rate: 3.0, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
  ]
  for (const r of missing) {
    const existing = await prisma.route.findUnique({ where: { name: r.name } })
    if (!existing) {
      await prisma.route.create({ data: { ...r, active: true } })
      console.log(`✓ Ruta agregada: ${r.name}`)
    } else {
      console.log(`  Ruta ya existe: ${r.name}`)
    }
  }
}

// ─── Paso 3: Agregar camiones faltantes ───────────────────────────────────────

async function addMissingTrucks() {
  // Find owners for new trucks
  const ownerJose = await prisma.owner.findFirst({ where: { name: { contains: 'Jose' } } })
  const ownerDefault = ownerJose ?? await prisma.owner.findFirst()
  if (!ownerDefault) throw new Error('No hay dueños en la BD')

  // Find drivers
  const driverMap = new Map<string, string>() // name → userId
  const users = await prisma.user.findMany({ where: { role: 'CHOFER' }, select: { id: true, name: true } })
  users.forEach(u => driverMap.set(u.name.toUpperCase().trim(), u.id))

  const newTrucks = [
    { plate: '04UMBC', driverName: 'JOAQUIN NETO' },
    { plate: 'A58AB3R', driverName: 'AMANDIO NETO' },
    { plate: 'A17AW3E', driverName: 'EDUARDO GARCIA' },
  ]

  for (const t of newTrucks) {
    const existing = await prisma.truck.findUnique({ where: { plate: t.plate } })
    if (!existing) {
      // Try to find driver
      let driverId: string | null = null
      for (const [name, id] of driverMap) {
        if (name.includes(t.driverName.split(' ')[0]) || t.driverName.includes(name.split(' ')[0])) {
          driverId = id
          break
        }
      }
      await prisma.truck.create({
        data: { plate: t.plate, ownerId: ownerDefault.id, driverId, active: false },
      })
      console.log(`✓ Camión agregado: ${t.plate} (chofer: ${t.driverName})`)
    } else {
      console.log(`  Camión ya existe: ${t.plate}`)
    }
  }
}

// ─── Paso 4: Importar viajes desde archivo ────────────────────────────────────

async function importFile(filePath: string) {
  const fileName = path.basename(filePath)
  console.log(`\n📂 Importando: ${fileName}`)

  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Load trucks and routes
  const [trucks, routes] = await Promise.all([
    prisma.truck.findMany({ select: { id: true, plate: true } }),
    prisma.route.findMany({ select: { id: true, name: true, rateType: true, rate: true, hasViatico: true, viaticoSingle: true, viaticoDouble: true } }),
  ])
  const truckByPlate = new Map(trucks.map(t => [t.plate.toUpperCase().trim(), t]))
  const routeByName = new Map(routes.map(r => [r.name.toUpperCase().trim(), r]))

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 11; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[15]) continue // skip empty rows (check plate column P=15)

    const rawDate = row[5]
    const supplier = row[10] ? String(row[10]).trim().toUpperCase() : null
    const plate = row[15] ? String(row[15]).trim().toUpperCase() : null
    const material = row[16] ? String(row[16]).trim() : null
    const netWeightKg = row[20] ? parseFloat(String(row[20])) : null
    const origin = row[7] ? String(row[7]).trim() : null
    const ticketNo = row[4] ? String(row[4]).trim() : null

    if (!plate || !supplier || !rawDate) { skipped++; continue }

    const truck = truckByPlate.get(plate)
    if (!truck) {
      errors.push(`Fila ${i + 1}: Placa "${plate}" no encontrada`)
      continue
    }

    // Route matching: exact then partial
    let route = routeByName.get(supplier)
    if (!route) {
      for (const [name, r] of routeByName) {
        if (supplier.includes(name) || name.includes(supplier)) {
          route = r
          break
        }
      }
    }
    if (!route) {
      errors.push(`Fila ${i + 1}: Ruta "${supplier}" no encontrada`)
      continue
    }

    const date = rawDate instanceof Date ? rawDate : new Date(rawDate)
    if (isNaN(date.getTime())) {
      errors.push(`Fila ${i + 1}: Fecha inválida`)
      continue
    }

    // Check for duplicate (same plate + date + ticketNo)
    if (ticketNo) {
      const dup = await prisma.trip.findFirst({
        where: { truckId: truck.id, ticketNo, date: { gte: new Date(date.getTime() - 3600000), lte: new Date(date.getTime() + 3600000) } },
      })
      if (dup) { skipped++; continue }
    }

    const kg = netWeightKg ?? 0
    const amount = calcAmount(route.rateType, route.rate, kg)

    // Viático: count trips today for this truck
    const todayStart = new Date(date); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(date); todayEnd.setHours(23, 59, 59, 999)
    const tripsToday = await prisma.trip.count({
      where: { truckId: truck.id, date: { gte: todayStart, lte: todayEnd } },
    })
    const viatico = route.hasViatico
      ? (tripsToday >= 1 ? route.viaticoDouble : route.viaticoSingle)
      : 0

    const period = await getOrCreatePeriod(date)

    await prisma.trip.create({
      data: {
        date,
        ticketNo,
        truckId: truck.id,
        routeId: route.id,
        netWeightKg: kg,
        material,
        origin,
        amount,
        viatico,
        periodId: period.id,
      },
    })
    created++
  }

  console.log(`  ✓ Creados: ${created} viajes`)
  if (skipped > 0) console.log(`  ⟳ Omitidos (duplicados/vacíos): ${skipped}`)
  if (errors.length > 0) {
    console.log(`  ✗ Errores (${errors.length}):`)
    errors.slice(0, 10).forEach(e => console.log(`    ${e}`))
    if (errors.length > 10) console.log(`    ... y ${errors.length - 10} más`)
  }
  return { created, errors: errors.length }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚚 Importación histórica — Transporte JR\n')

  await fixEncargado()
  await addMissingRoutes()
  await addMissingTrucks()

  const files = [
    '/Users/marymorillo/Downloads/JR.xlsx',      // Jan 16-31
    '/Users/marymorillo/Downloads/JOSER.xlsx',   // Feb 01-15
    '/Users/marymorillo/Downloads/JR!..xlsx',    // Feb 16-28
  ]

  let totalCreated = 0
  let totalErrors = 0
  for (const f of files) {
    const { created, errors } = await importFile(f)
    totalCreated += created
    totalErrors += errors
  }

  console.log(`\n✅ Importación completada: ${totalCreated} viajes creados, ${totalErrors} errores`)

  // Show period summary
  const periods = await prisma.period.findMany({ orderBy: { startDate: 'asc' }, include: { _count: { select: { trips: true } } } })
  console.log('\n📅 Períodos creados:')
  periods.forEach(p => {
    const start = p.startDate.toISOString().split('T')[0]
    const end = p.endDate.toISOString().split('T')[0]
    console.log(`  ${start} → ${end}: ${p._count.trips} viajes [${p.status}]`)
  })
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
