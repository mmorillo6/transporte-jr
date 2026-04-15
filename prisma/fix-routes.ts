/**
 * fix-routes.ts
 * Actualiza los datos de rutas en la BD local con los valores correctos.
 * Run: npx tsx prisma/fix-routes.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:dev.db' })
const prisma = new PrismaClient({ adapter } as any)

const UPDATES: { name: string; rate: number; driverWage: number; fuelLitersPerTrip: number }[] = [
  { name: 'FOSFORITO',       rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20  },
  { name: 'CHARLIE RICHARD', rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20  },
  { name: 'MACKENCI',        rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20  },
  { name: 'LA GARRAPATA',    rate: 3.00,  driverWage: 10, fuelLitersPerTrip: 20  },
  { name: 'SOSA MENDEZ',     rate: 3.50,  driverWage: 11, fuelLitersPerTrip: 40  },
  { name: 'ROSCIO SUR',      rate: 3.50,  driverWage: 11, fuelLitersPerTrip: 40  },
  { name: 'LAS CLARITAS',    rate: 4.00,  driverWage: 12, fuelLitersPerTrip: 60  },
  { name: 'NUEVO CALLAO',    rate: 8.00,  driverWage: 20, fuelLitersPerTrip: 90  },
  { name: 'LA FE',           rate: 14.00, driverWage: 40, fuelLitersPerTrip: 180 },
  { name: 'YAGUARIN',        rate: 4.00,  driverWage: 0,  fuelLitersPerTrip: 150 },
]

async function main() {
  console.log('Actualizando rutas...')

  // 1. Actualizar rutas existentes
  for (const u of UPDATES) {
    const r = await prisma.route.findFirst({ where: { name: u.name } })
    if (!r) { console.log(`  ⚠ No encontrada: ${u.name}`); continue }
    await prisma.route.update({
      where: { id: r.id },
      data: { rate: u.rate, driverWage: u.driverWage, fuelLitersPerTrip: u.fuelLitersPerTrip },
    })
    console.log(`  ✓ ${u.name} → $${u.rate} · $${u.driverWage}/viaje · ${u.fuelLitersPerTrip}L`)
  }

  // 2. Renombrar DIAS INTERNOS → DIAS INTERNOS (PLANTA) y crear DIAS INTERNOS (MINA)
  const diasInternos = await prisma.route.findFirst({ where: { name: 'DIAS INTERNOS' } })
  if (diasInternos) {
    await prisma.route.update({
      where: { id: diasInternos.id },
      data: { name: 'DIAS INTERNOS (PLANTA)', fuelLitersPerTrip: 40, rate: 20, driverWage: 0 },
    })
    console.log('  ✓ DIAS INTERNOS → DIAS INTERNOS (PLANTA) · 40L')
  } else {
    console.log('  ⚠ DIAS INTERNOS no encontrada (puede que ya esté renombrada)')
  }

  const diasMina = await prisma.route.findFirst({ where: { name: 'DIAS INTERNOS (MINA)' } })
  if (!diasMina) {
    await prisma.route.create({
      data: {
        name: 'DIAS INTERNOS (MINA)',
        rateType: 'PER_TRIP',
        rate: 20,
        driverWage: 0,
        fuelLitersPerTrip: 60,
        bidirectional: false,
        hasViatico: false,
        viaticoSingle: 0,
        viaticoDouble: 0,
        active: true,
      },
    })
    console.log('  ✓ Creada: DIAS INTERNOS (MINA) · 60L')
  } else {
    console.log('  ℹ DIAS INTERNOS (MINA) ya existe, omitiendo')
  }

  // 3. Mostrar resumen final
  const all = await prisma.route.findMany({ orderBy: { name: 'asc' } })
  console.log('\nResumen final de rutas:')
  console.log('─'.repeat(70))
  for (const r of all) {
    const status = r.active ? '' : ' [INACTIVA]'
    console.log(
      `${r.name.padEnd(28)} $${String(r.rate).padEnd(6)} · $${String(r.driverWage).padEnd(5)}/viaje · ${r.fuelLitersPerTrip}L${status}`
    )
  }
  console.log('─'.repeat(70))
  console.log('✓ Listo')
}

main().catch(console.error).finally(() => prisma.$disconnect())
