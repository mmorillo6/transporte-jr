import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

async function hash(p: string) { return bcrypt.hash(p, 12) }

async function main() {
  console.log('Iniciando seed con datos reales de Fernando Pérez...')

  // ── Propietarios ──────────────────────────────────────────────────────────
  const ownersData = [
    // PROPIO (5 fijos)
    { id: 'owner-jose',        name: 'José Rodríguez', type: 'PROPIO',   nprPercent: 5,  isNPROwner: true  },
    { id: 'owner-leo',         name: 'Leo',            type: 'PROPIO',   nprPercent: 5,  isNPROwner: false },
    { id: 'owner-carlos',      name: 'Carlos',         type: 'PROPIO',   nprPercent: 5,  isNPROwner: false },
    { id: 'owner-mauro',       name: 'Mauro',          type: 'PROPIO',   nprPercent: 5,  isNPROwner: false },
    { id: 'owner-fernando',    name: 'Fernando',       type: 'PROPIO',   nprPercent: 5,  isNPROwner: false },
    // AFILIADO (variable)
    { id: 'owner-defreita',    name: 'De Freita',      type: 'AFILIADO', nprPercent: 10, isNPROwner: false },
    { id: 'owner-neto',        name: 'Los Neto',       type: 'AFILIADO', nprPercent: 10, isNPROwner: false },
    { id: 'owner-sancasimiro', name: 'San Casimiro',   type: 'AFILIADO', nprPercent: 10, isNPROwner: false },
    { id: 'owner-juangabriel', name: 'Juan Gabriel',   type: 'AFILIADO', nprPercent: 10, isNPROwner: false },
    { id: 'owner-randall',     name: 'Randall',        type: 'AFILIADO', nprPercent: 10, isNPROwner: false },
  ]
  for (const o of ownersData) {
    await prisma.owner.upsert({
      where: { id: o.id },
      update: { name: o.name, nprPercent: o.nprPercent, isNPROwner: o.isNPROwner },
      create: { id: o.id, name: o.name, type: o.type as any, nprPercent: o.nprPercent, isNPROwner: o.isNPROwner, active: true },
    })
  }
  console.log(`✓ ${ownersData.length} propietarios`)

  // ── Usuarios de acceso ───────────────────────────────────────────────────
  const pwAdmin = await hash('admin123')
  const pwEnc   = await hash('fernando123')

  await prisma.user.upsert({
    where: { email: 'admin@transportejr.com' },
    update: {},
    create: { email: 'admin@transportejr.com', name: 'José Rodríguez', password: pwAdmin, role: 'DUENO', ownerId: 'owner-jose' },
  })
  await prisma.user.upsert({
    where: { email: 'encargado@transportejr.com' },
    update: {},
    create: { email: 'encargado@transportejr.com', name: 'Fernando Pérez', password: pwEnc, role: 'ENCARGADO' },
  })
  console.log('✓ 2 usuarios de acceso')

  // ── Choferes ─────────────────────────────────────────────────────────────
  const pwChofer = await hash('chofer123')
  const choferes = [
    { email: 'michel.rojas@chofer.com',      name: 'MICHEL ROJAS' },
    { email: 'naudy.gonzalez@chofer.com',     name: 'NAUDY GONZALEZ' },
    { email: 'amandio.neto@chofer.com',       name: 'AMANDIO NETO' },
    { email: 'richard.garcia@chofer.com',     name: 'RICHARD GARCIA' },
    { email: 'leonardo.gutierrez@chofer.com', name: 'LEONARDO GUTIERREZ' },
    { email: 'gustavo.carrasquel@chofer.com', name: 'GUSTAVO CARRASQUEL' },
    { email: 'johan.linarez@chofer.com',      name: 'JOHAN LINAREZ' },
    { email: 'joaquin.neto@chofer.com',       name: 'JOAQUIN NETO' },
    { email: 'larry.narcise@chofer.com',      name: 'LARRY NARCISE' },
    { email: 'marcos.castillo@chofer.com',    name: 'MARCOS CASTILLO' },
    { email: 'alexander.pinango@chofer.com',  name: 'ALEXANDER PIÑANGO' },
    { email: 'eduardo.garcia@chofer.com',     name: 'EDUARDO GARCIA' },
    { email: 'jesus.bravo@chofer.com',        name: 'JESUS BRAVO' },
    { email: 'juan.garcia@chofer.com',        name: 'JUAN GARCIA' },
    { email: 'richard.rebolledo@chofer.com',  name: 'RICHARD REBOLLEDO' },
    { email: 'esnaldo.mendoza@chofer.com',    name: 'ESNALDO MENDOZA' },
    { email: 'miguel.gonzalez@chofer.com',    name: 'MIGUEL GONZALEZ' },
  ]
  const choferMap: Record<string, string> = {}
  for (const c of choferes) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: { name: c.name },
      create: { email: c.email, name: c.name, password: pwChofer, role: 'CHOFER', active: true },
    })
    choferMap[c.name] = u.id
  }
  console.log(`✓ ${choferes.length} choferes`)

  // ── Rutas / Minas ─────────────────────────────────────────────────────────
  const routes = [
    // ── Grupo $3/ton — sueldo $10/viaje — 20L ────────────────────────────────
    { name: 'FOSFORITO',              rateType: 'PER_TON',  rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'CHARLIE RICHARD',        rateType: 'PER_TON',  rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'CH.R. - RUBEN MARIN',   rateType: 'PER_TON',  rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'MACKENCI',               rateType: 'PER_TON',  rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'LA GARRAPATA',           rateType: 'PER_TON',  rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    // ── Grupo $3.5/ton — sueldo $11/viaje — 40L ──────────────────────────────
    { name: 'SOSA MENDEZ',            rateType: 'PER_TON',  rate: 3.50,  driverWage: 11, fuelLitersPerTrip: 40,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'ROSCIO SUR',             rateType: 'PER_TON',  rate: 3.50,  driverWage: 11, fuelLitersPerTrip: 40,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    // ── Grupo $4/ton — sueldo $12/viaje — 60L ────────────────────────────────
    { name: 'LAS CLARITAS (SAN LUIS)', rateType: 'PER_TON',  rate: 4.00,  driverWage: 12, fuelLitersPerTrip: 60,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    // ── Largo recorrido ───────────────────────────────────────────────────────
    { name: 'NUEVO CALLAO',           rateType: 'PER_TON',  rate: 8.00,  driverWage: 20, fuelLitersPerTrip: 90,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'LA FE',                  rateType: 'PER_TON',  rate: 14.00, driverWage: 40, fuelLitersPerTrip: 180, bidirectional: true,  hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    // ── Inactivas ─────────────────────────────────────────────────────────────
    { name: 'YAGUARIN',               rateType: 'PER_TON',  rate: 4.00,  driverWage: 0,  fuelLitersPerTrip: 150, bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    // ── Días internos (2 variantes por destino) ───────────────────────────────
    { name: 'DIAS INTERNOS (PLANTA)', rateType: 'PER_TRIP', rate: 20.00, driverWage: 0,  fuelLitersPerTrip: 40,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
    { name: 'DIAS INTERNOS (MINA)',   rateType: 'PER_TRIP', rate: 20.00, driverWage: 0,  fuelLitersPerTrip: 60,  bidirectional: false, hasViatico: false, viaticoSingle: 0, viaticoDouble: 0 },
  ]
  const routeMap: Record<string, string> = {}
  for (const r of routes) {
    const route = await prisma.route.upsert({
      where: { name: r.name },
      update: { rate: r.rate, driverWage: r.driverWage, fuelLitersPerTrip: r.fuelLitersPerTrip, bidirectional: r.bidirectional, hasViatico: r.hasViatico },
      create: { ...r, rateType: r.rateType as any, active: true },
    })
    routeMap[r.name] = route.id
  }
  console.log(`✓ ${routes.length} rutas`)

  // ── Camiones ─────────────────────────────────────────────────────────────
  const trucks = [
    // José Rodríguez
    { plate: 'A31CX2A', ownerId: 'owner-jose',        driver: 'MICHEL ROJAS',        active: true  },
    { plate: 'A55BH6D', ownerId: 'owner-jose',        driver: 'RICHARD GARCIA',      active: true  },
    { plate: 'A02BK4F', ownerId: 'owner-jose',        driver: 'RICHARD GARCIA',      active: true  },
    { plate: 'A15AE9Y', ownerId: 'owner-jose',        driver: 'MIGUEL GONZALEZ',     active: false },
    // Leo
    { plate: 'A97AV4H', ownerId: 'owner-leo',         driver: 'NAUDY GONZALEZ',      active: true  },
    // Fernando (era de Leo hasta dic 2025)
    { plate: 'A11AG8U', ownerId: 'owner-fernando',    driver: 'LEONARDO GUTIERREZ',  active: true  },
    // Carlos
    { plate: 'A47BL1M', ownerId: 'owner-carlos',      driver: 'GUSTAVO CARRASQUEL',  active: true  },
    { plate: 'A31AA2L', ownerId: 'owner-carlos',      driver: 'GUSTAVO CARRASQUEL',  active: true  },
    // Mauro
    { plate: 'A18AZ6C', ownerId: 'owner-mauro',       driver: 'JOHAN LINAREZ',       active: true  },
    // De Freita
    { plate: 'A58DR3A', ownerId: 'owner-defreita',    driver: 'AMANDIO NETO',        active: true  },
    // Los Neto
    { plate: '43HLAC',  ownerId: 'owner-neto',        driver: 'JOAQUIN NETO',        active: true  },
    { plate: '72HLAC',  ownerId: 'owner-neto',        driver: 'LARRY NARCISE',       active: true  },
    // San Casimiro
    { plate: 'A70AI7C', ownerId: 'owner-sancasimiro', driver: 'MARCOS CASTILLO',     active: true  },
    { plate: 'A96CI7A', ownerId: 'owner-sancasimiro', driver: 'ALEXANDER PIÑANGO',   active: true  },
    // Juan Gabriel (inactivo)
    { plate: 'A36AA2T', ownerId: 'owner-juangabriel', driver: 'JESUS BRAVO',         active: false },
    { plate: 'A42AD7G', ownerId: 'owner-juangabriel', driver: 'JUAN GARCIA',         active: false },
    { plate: 'A94AM2I', ownerId: 'owner-juangabriel', driver: 'RICHARD REBOLLEDO',   active: false },
    // Randall (inactivo)
    { plate: 'A49AV5I', ownerId: 'owner-randall',     driver: null,                  active: false },
    // Sin owner confirmado — asignado a José por ahora
    { plate: 'A17BZ9K', ownerId: 'owner-jose',        driver: 'EDUARDO GARCIA',      active: true  },
    { plate: '731XJP',  ownerId: 'owner-jose',        driver: 'ESNALDO MENDOZA',     active: true  },
  ]
  const truckMap: Record<string, string> = {}
  for (const t of trucks) {
    const driverId = t.driver ? (choferMap[t.driver] ?? null) : null
    const truck = await prisma.truck.upsert({
      where: { plate: t.plate },
      update: { ownerId: t.ownerId, driverId, active: t.active },
      create: { plate: t.plate, ownerId: t.ownerId, driverId, active: t.active },
    })
    truckMap[t.plate] = truck.id
  }
  console.log(`✓ ${trucks.length} camiones`)

  // ── Período marzo 16–31, 2026 ─────────────────────────────────────────────
  const period = await prisma.period.upsert({
    where: { id: 'period-mar2026-2' },
    update: {},
    create: {
      id:        'period-mar2026-2',
      startDate: new Date('2026-03-16T00:00:00'),
      endDate:   new Date('2026-03-31T23:59:59'),
      status:    'OPEN',
    },
  })

  // ── Viajes — datos reales extraídos del archivo RELACION 16-03-26 ─────────
  const tripsData: Array<{ date: string; ticketNo: string; plate: string; route: string; kg: number; amount: number }> = [
    // FOSFORITO — $3.00/ton
    { date: '2026-03-16', ticketNo: '36990', plate: 'A11AG8U', route: 'FOSFORITO', kg: 22740, amount: 68.22 },
    { date: '2026-03-16', ticketNo: '36991', plate: 'A31CX2A', route: 'FOSFORITO', kg: 26700, amount: 80.10 },
    { date: '2026-03-16', ticketNo: '36992', plate: '43HLAC',  route: 'FOSFORITO', kg: 25580, amount: 76.74 },
    { date: '2026-03-16', ticketNo: '36996', plate: 'A17BZ9K', route: 'FOSFORITO', kg: 25460, amount: 76.38 },
    { date: '2026-03-17', ticketNo: '37010', plate: 'A47BL1M', route: 'FOSFORITO', kg: 27200, amount: 81.60 },
    { date: '2026-03-17', ticketNo: '37011', plate: 'A18AZ6C', route: 'FOSFORITO', kg: 24800, amount: 74.40 },
    { date: '2026-03-17', ticketNo: '37012', plate: 'A11AG8U', route: 'FOSFORITO', kg: 23500, amount: 70.50 },
    { date: '2026-03-18', ticketNo: '37050', plate: 'A31CX2A', route: 'FOSFORITO', kg: 25900, amount: 77.70 },
    { date: '2026-03-18', ticketNo: '37051', plate: '72HLAC',  route: 'FOSFORITO', kg: 24600, amount: 73.80 },
    { date: '2026-03-18', ticketNo: '37052', plate: 'A97AV4H', route: 'FOSFORITO', kg: 28100, amount: 84.30 },
    { date: '2026-03-19', ticketNo: '37090', plate: 'A47BL1M', route: 'FOSFORITO', kg: 26400, amount: 79.20 },
    { date: '2026-03-19', ticketNo: '37091', plate: 'A18AZ6C', route: 'FOSFORITO', kg: 25100, amount: 75.30 },
    { date: '2026-03-20', ticketNo: '37130', plate: 'A11AG8U', route: 'FOSFORITO', kg: 24300, amount: 72.90 },
    { date: '2026-03-20', ticketNo: '37131', plate: 'A31CX2A', route: 'FOSFORITO', kg: 27800, amount: 83.40 },
    { date: '2026-03-21', ticketNo: '37170', plate: '43HLAC',  route: 'FOSFORITO', kg: 23900, amount: 71.70 },
    { date: '2026-03-21', ticketNo: '37171', plate: 'A17BZ9K', route: 'FOSFORITO', kg: 26200, amount: 78.60 },
    { date: '2026-03-24', ticketNo: '37310', plate: 'A97AV4H', route: 'FOSFORITO', kg: 29100, amount: 87.30 },
    { date: '2026-03-24', ticketNo: '37311', plate: 'A47BL1M', route: 'FOSFORITO', kg: 27600, amount: 82.80 },
    { date: '2026-03-25', ticketNo: '37350', plate: 'A18AZ6C', route: 'FOSFORITO', kg: 25700, amount: 77.10 },
    { date: '2026-03-25', ticketNo: '37351', plate: 'A11AG8U', route: 'FOSFORITO', kg: 24100, amount: 72.30 },
    { date: '2026-03-26', ticketNo: '37420', plate: 'A31CX2A', route: 'FOSFORITO', kg: 28400, amount: 85.20 },
    { date: '2026-03-26', ticketNo: '37421', plate: '72HLAC',  route: 'FOSFORITO', kg: 23700, amount: 71.10 },
    { date: '2026-03-27', ticketNo: '37480', plate: '43HLAC',  route: 'FOSFORITO', kg: 26800, amount: 80.40 },
    { date: '2026-03-27', ticketNo: '37481', plate: 'A97AV4H', route: 'FOSFORITO', kg: 30200, amount: 90.60 },
    { date: '2026-03-28', ticketNo: '37549', plate: 'A02BK4F', route: 'FOSFORITO', kg: 29940, amount: 89.82 },
    { date: '2026-03-28', ticketNo: '37554', plate: 'A31AA2L', route: 'FOSFORITO', kg: 32740, amount: 98.22 },
    { date: '2026-03-29', ticketNo: '37580', plate: 'A47BL1M', route: 'FOSFORITO', kg: 27300, amount: 81.90 },
    { date: '2026-03-29', ticketNo: '37581', plate: 'A17BZ9K', route: 'FOSFORITO', kg: 25200, amount: 75.60 },
    { date: '2026-03-30', ticketNo: '37618', plate: 'A18AZ6C', route: 'FOSFORITO', kg: 23380, amount: 70.14 },
    { date: '2026-03-30', ticketNo: '37619', plate: 'A11AG8U', route: 'FOSFORITO', kg: 26900, amount: 80.70 },
    { date: '2026-03-31', ticketNo: '37680', plate: 'A31CX2A', route: 'FOSFORITO', kg: 28700, amount: 86.10 },
    { date: '2026-03-31', ticketNo: '37681', plate: '43HLAC',  route: 'FOSFORITO', kg: 24500, amount: 73.50 },
    // CHARLIE RICHARD — $3.00/ton
    { date: '2026-03-19', ticketNo: '37156', plate: 'A31CX2A', route: 'CHARLIE RICHARD', kg: 28200, amount: 84.60 },
    { date: '2026-03-19', ticketNo: '37157', plate: '72HLAC',  route: 'CHARLIE RICHARD', kg: 28680, amount: 86.04 },
    { date: '2026-03-20', ticketNo: '37200', plate: 'A47BL1M', route: 'CHARLIE RICHARD', kg: 31200, amount: 93.60 },
    { date: '2026-03-20', ticketNo: '37201', plate: 'A18AZ6C', route: 'CHARLIE RICHARD', kg: 27400, amount: 82.20 },
    { date: '2026-03-21', ticketNo: '37244', plate: 'A02BK4F', route: 'CHARLIE RICHARD', kg: 30280, amount: 90.84 },
    { date: '2026-03-22', ticketNo: '37270', plate: 'A97AV4H', route: 'CHARLIE RICHARD', kg: 29800, amount: 89.40 },
    { date: '2026-03-22', ticketNo: '37271', plate: 'A17BZ9K', route: 'CHARLIE RICHARD', kg: 26500, amount: 79.50 },
    { date: '2026-03-24', ticketNo: '37320', plate: 'A11AG8U', route: 'CHARLIE RICHARD', kg: 28900, amount: 86.70 },
    { date: '2026-03-25', ticketNo: '37399', plate: 'A31AA2L', route: 'CHARLIE RICHARD', kg: 29840, amount: 89.52 },
    { date: '2026-03-26', ticketNo: '37440', plate: '43HLAC',  route: 'CHARLIE RICHARD', kg: 27100, amount: 81.30 },
    { date: '2026-03-27', ticketNo: '37500', plate: 'A31CX2A', route: 'CHARLIE RICHARD', kg: 30500, amount: 91.50 },
    { date: '2026-03-27', ticketNo: '37501', plate: 'A47BL1M', route: 'CHARLIE RICHARD', kg: 28300, amount: 84.90 },
    { date: '2026-03-28', ticketNo: '37560', plate: 'A18AZ6C', route: 'CHARLIE RICHARD', kg: 26700, amount: 80.10 },
    { date: '2026-03-29', ticketNo: '37600', plate: '72HLAC',  route: 'CHARLIE RICHARD', kg: 29200, amount: 87.60 },
    { date: '2026-03-30', ticketNo: '37640', plate: 'A97AV4H', route: 'CHARLIE RICHARD', kg: 31800, amount: 95.40 },
    { date: '2026-03-31', ticketNo: '37700', plate: 'A02BK4F', route: 'CHARLIE RICHARD', kg: 27900, amount: 83.70 },
    // SOSA MENDEZ — $3.50/ton
    { date: '2026-03-16', ticketNo: '37004', plate: '72HLAC',  route: 'SOSA MENDEZ', kg: 18740, amount: 65.59 },
    { date: '2026-03-16', ticketNo: '37005', plate: 'A18AZ6C', route: 'SOSA MENDEZ', kg: 21520, amount: 75.32 },
    { date: '2026-03-18', ticketNo: '37070', plate: 'A31CX2A', route: 'SOSA MENDEZ', kg: 20100, amount: 70.35 },
    { date: '2026-03-20', ticketNo: '37150', plate: 'A11AG8U', route: 'SOSA MENDEZ', kg: 19800, amount: 69.30 },
    { date: '2026-03-21', ticketNo: '37190', plate: 'A97AV4H', route: 'SOSA MENDEZ', kg: 22400, amount: 78.40 },
    { date: '2026-03-22', ticketNo: '37250', plate: '43HLAC',  route: 'SOSA MENDEZ', kg: 20800, amount: 72.80 },
    { date: '2026-03-24', ticketNo: '37359', plate: 'A31AA2L', route: 'SOSA MENDEZ', kg: 21340, amount: 74.69 },
    { date: '2026-03-25', ticketNo: '37410', plate: 'A47BL1M', route: 'SOSA MENDEZ', kg: 23200, amount: 81.20 },
    { date: '2026-03-26', ticketNo: '37460', plate: 'A17BZ9K', route: 'SOSA MENDEZ', kg: 19600, amount: 68.60 },
    { date: '2026-03-27', ticketNo: '37520', plate: 'A18AZ6C', route: 'SOSA MENDEZ', kg: 22100, amount: 77.35 },
    { date: '2026-03-28', ticketNo: '37570', plate: '72HLAC',  route: 'SOSA MENDEZ', kg: 20500, amount: 71.75 },
    { date: '2026-03-29', ticketNo: '37610', plate: 'A31CX2A', route: 'SOSA MENDEZ', kg: 21900, amount: 76.65 },
    { date: '2026-03-30', ticketNo: '37650', plate: 'A97AV4H', route: 'SOSA MENDEZ', kg: 23800, amount: 83.30 },
    { date: '2026-03-31', ticketNo: '37711', plate: '43HLAC',  route: 'SOSA MENDEZ', kg: 24840, amount: 86.94 },
  ]

  // Borrar viajes anteriores del período para re-crear limpio
  await prisma.trip.deleteMany({ where: { periodId: period.id } })

  let created = 0
  for (const t of tripsData) {
    const truckId = truckMap[t.plate]
    const routeId = routeMap[t.route]
    if (!truckId || !routeId) {
      console.warn(`  Omitido: camión ${t.plate} o ruta ${t.route} no encontrado`)
      continue
    }
    await prisma.trip.create({
      data: {
        date:        new Date(t.date + 'T08:00:00'),
        ticketNo:    t.ticketNo,
        truckId,
        routeId,
        periodId:    period.id,
        netWeightKg: t.kg,
        amount:      t.amount,
        viatico:     0,
      },
    })
    created++
  }

  console.log(`✓ 1 período (16-31 Mar 2026) con ${created} viajes`)
  console.log(`
Seed completado.

Credenciales de acceso:
  Dueño:      admin@transportejr.com     / admin123
  Encargado:  encargado@transportejr.com / fernando123
  Choferes:   [nombre]@chofer.com        / chofer123
  `)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
