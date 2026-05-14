'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

// Mapeo conductor (lowercase) → placa — extraído de RELACION FINAL CHOFERES abril 2026
const CONDUCTOR_PLATE: Record<string, string> = {
  'michael rojas':      'A31CX2A',
  'michel rojas':       'A31CX2A',
  'richard garcia':     'A02BK4F',
  'naudy gonzalez':     'A97AV4H',
  'neudy gonzalez':     'A97AV4H',
  'esnaldo mendoza':    '731XJP',
  'gustavo carrasquel': 'A31AA2L',
  'khelty gutierrez':   'A11AG8U',
  'amandio neto':       'A58DR3A',
  'larry narcise':      '72HLAC',
  'marcos castillo':    'A70AI7C',
  'eduardo garcia':     'A17BZ9K',
  'joaquin neto':       '43HLAC',
  'johan linares':      'A18AZ6C',
}

// Material estéril Mayo 2026 — enviado por Fernando
// Cada entrada = 1 viaje por conductor = $100 flete + $10 sueldo chofer
// Cliente: LUIS PEÑA (Chino de piedra)
// Frank Cobi excluido — no es de nuestro transporte
const ESTERIL_MAYO: { fecha: string; conductores: string[] }[] = [
  { fecha: '2026-05-01', conductores: ['richard garcia', 'michel rojas', 'leonardo gutierrez', 'neudy gonzalez', 'amandio neto', 'larry narcise', 'gustavo carrasquel'] },
  { fecha: '2026-05-02', conductores: ['esnaldo mendoza', 'naudy gonzalez', 'gustavo carrasquel', 'leonardo gutierrez', 'marcos castillo', 'eduardo garcia', 'richard garcia', 'michel rojas'] },
  { fecha: '2026-05-03', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'larry narcise', 'marcos castillo', 'eduardo garcia', 'gustavo carrasquel'] },
  { fecha: '2026-05-04', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'larry narcise', 'marcos castillo', 'gustavo carrasquel', 'naudy gonzalez'] },
  { fecha: '2026-05-05', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'gustavo carrasquel', 'naudy gonzalez'] },
  { fecha: '2026-05-07', conductores: ['esnaldo mendoza', 'gustavo carrasquel', 'leonardo gutierrez', 'larry narcise', 'jesus bravo', 'yonis hernandez', 'marcos castillo'] },
  { fecha: '2026-05-09', conductores: ['gustavo carrasquel', 'naudy gonzalez'] },
]

export async function seedMaterialEsterilMayo() {
  const session = await getSession()
  if (!session || session.role !== 'DUENO') return { error: 'Solo el dueño puede ejecutar esto' }

  // Verificar que no existan ya trips de estéril en el período de mayo
  const existing = await prisma.trip.count({
    where: {
      route: { name: { startsWith: 'MATERIAL ESTERIL' } },
      date: { gte: new Date('2026-05-01'), lte: new Date('2026-05-15') },
    },
  })
  if (existing > 0) return { error: `Ya existen ${existing} viajes de estéril en mayo — no se duplica` }

  // Obtener todos los camiones activos con su placa
  const trucks = await prisma.truck.findMany({
    where: { active: true },
    select: { id: true, plate: true, driver: { select: { name: true } } },
  })

  // Construir lookup plate → truckId
  const plateToId: Record<string, string> = {}
  for (const t of trucks) {
    plateToId[t.plate.toUpperCase()] = t.id
  }

  // Lookup por nombre de driver en DB (para conductores no mapeados)
  const driverToTruckId: Record<string, string> = {}
  for (const t of trucks) {
    if (t.driver?.name) {
      driverToTruckId[t.driver.name.toLowerCase()] = t.id
    }
  }

  // Encontrar período Mayo 01-15
  const period = await prisma.period.findFirst({
    where: {
      startDate: { gte: new Date('2026-05-01'), lte: new Date('2026-05-02') },
    },
    orderBy: { startDate: 'desc' },
  })
  if (!period) return { error: 'No se encontró período de mayo 2026. Créalo primero.' }

  // Obtener o crear ruta MATERIAL ESTERIL - LUIS PEÑA
  let route = await prisma.route.findFirst({
    where: { name: 'MATERIAL ESTERIL - LUIS PEÑA', active: true },
  })
  if (!route) {
    route = await prisma.route.create({
      data: {
        name:       'MATERIAL ESTERIL - LUIS PEÑA',
        clientName: 'LUIS PEÑA',
        rateType:   'PER_TRIP',
        rate:       100,
        driverWage: 10,
        active:     true,
      },
    })
  }

  const created: string[] = []
  const notFound: string[] = []

  for (const day of ESTERIL_MAYO) {
    for (const conductor of day.conductores) {
      const cNorm = conductor.toLowerCase()

      // Buscar truckId: primero por mapeo fijo, luego por driver en DB
      let truckId: string | undefined
      const plate = CONDUCTOR_PLATE[cNorm]
      if (plate) {
        truckId = plateToId[plate.toUpperCase()]
      }
      if (!truckId) {
        // Buscar por nombre similar en DB
        for (const [dname, tid] of Object.entries(driverToTruckId)) {
          const parts = cNorm.split(' ')
          if (parts.every(p => dname.includes(p))) {
            truckId = tid
            break
          }
        }
      }

      if (!truckId) {
        notFound.push(`${day.fecha}: ${conductor}`)
        continue
      }

      await prisma.trip.create({
        data: {
          date:      new Date(day.fecha + 'T12:00:00'),
          truckId,
          routeId:   route.id,
          amount:    100,
          viatico:   10,
          conductor: conductor.toUpperCase(),
          periodId:  period.id,
          notes:     'Material estéril — cargado desde datos de Fernando mayo 2026',
        },
      })
      created.push(`${day.fecha}: ${conductor}`)
    }
  }

  revalidatePath('/dias-internos')
  revalidatePath('/nomina')
  revalidatePath('/viajes')

  return {
    ok: true,
    created: created.length,
    notFound,
    periodId: period.id,
  }
}
