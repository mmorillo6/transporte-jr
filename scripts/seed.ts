import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter } as any)

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
}

const ESTERIL_MAYO: { fecha: string; conductores: string[] }[] = [
  { fecha: '2026-05-01', conductores: ['richard garcia', 'michel rojas', 'leonardo gutierrez', 'neudy gonzalez', 'amandio neto', 'larry narcise', 'gustavo carrasquel'] },
  { fecha: '2026-05-02', conductores: ['esnaldo mendoza', 'naudy gonzalez', 'gustavo carrasquel', 'leonardo gutierrez', 'marcos castillo', 'eduardo garcia', 'richard garcia', 'michel rojas'] },
  { fecha: '2026-05-03', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'larry narcise', 'marcos castillo', 'eduardo garcia', 'gustavo carrasquel'] },
  { fecha: '2026-05-04', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'larry narcise', 'marcos castillo', 'gustavo carrasquel', 'naudy gonzalez'] },
  { fecha: '2026-05-05', conductores: ['esnaldo mendoza', 'richard garcia', 'michel rojas', 'leonardo gutierrez', 'gustavo carrasquel', 'naudy gonzalez'] },
  { fecha: '2026-05-07', conductores: ['esnaldo mendoza', 'gustavo carrasquel', 'leonardo gutierrez', 'larry narcise', 'jesus bravo', 'yonis hernandez', 'marcos castillo'] },
  { fecha: '2026-05-09', conductores: ['gustavo carrasquel', 'naudy gonzalez'] },
]

async function main() {
  console.log('=== SEED MATERIAL ESTÉRIL + FIX CxC ===\n')

  // ── 1. Cargar camiones ──────────────────────────────────────────────────
  const trucks = await prisma.truck.findMany({
    where: { active: true },
    select: { id: true, plate: true, driver: { select: { name: true } } },
  })
  const plateToId: Record<string, string> = {}
  const driverToTruckId: Record<string, string> = {}
  for (const t of trucks) {
    plateToId[t.plate.toUpperCase()] = t.id
    if (t.driver?.name) driverToTruckId[t.driver.name.toLowerCase()] = t.id
  }
  console.log(`Camiones activos en DB: ${trucks.length}`)
  console.log('Placas:', Object.keys(plateToId).join(', '))

  // ── 2. Período Mayo ─────────────────────────────────────────────────────
  const period = await prisma.period.findFirst({
    where: { startDate: { gte: new Date('2026-05-01'), lte: new Date('2026-05-03') } },
    orderBy: { startDate: 'desc' },
  })
  if (!period) { console.error('❌ No se encontró período de mayo. Créalo en la app primero.'); process.exit(1) }
  console.log(`\nPeríodo mayo: ${period.startDate.toISOString().slice(0,10)} al ${period.endDate.toISOString().slice(0,10)} (id=${period.id})`)

  // ── 3. Ruta MATERIAL ESTERIL - LUIS PEÑA ───────────────────────────────
  let route = await prisma.route.findFirst({ where: { name: 'MATERIAL ESTERIL - LUIS PEÑA', active: true } })
  if (!route) {
    route = await prisma.route.create({
      data: { name: 'MATERIAL ESTERIL - LUIS PEÑA', clientName: 'LUIS PEÑA', rateType: 'PER_TRIP', rate: 100, driverWage: 10, active: true },
    })
    console.log('✓ Ruta MATERIAL ESTERIL - LUIS PEÑA creada')
  } else {
    console.log('✓ Ruta MATERIAL ESTERIL - LUIS PEÑA ya existe')
  }

  // ── 4. Verificar duplicados ─────────────────────────────────────────────
  const existing = await prisma.trip.count({
    where: { routeId: route.id, date: { gte: new Date('2026-05-01'), lte: new Date('2026-05-15') } },
  })
  if (existing > 0) {
    console.log(`\n⚠️  Ya existen ${existing} viajes de estéril en mayo. Saltando seed de trips.`)
  } else {
    // ── 5. Crear trips ──────────────────────────────────────────────────────
    let created = 0
    const notFound: string[] = []

    for (const day of ESTERIL_MAYO) {
      for (const conductor of day.conductores) {
        const cNorm = conductor.toLowerCase()
        let truckId: string | undefined
        const plate = CONDUCTOR_PLATE[cNorm]
        if (plate) truckId = plateToId[plate.toUpperCase()]
        if (!truckId) {
          for (const [dname, tid] of Object.entries(driverToTruckId)) {
            if (cNorm.split(' ').every(p => dname.includes(p))) { truckId = tid; break }
          }
        }
        if (!truckId) { notFound.push(`${day.fecha}: ${conductor}`); continue }

        await prisma.trip.create({
          data: {
            date:      new Date(day.fecha + 'T12:00:00'),
            truckId,
            routeId:   route!.id,
            amount:    100,
            viatico:   10,
            conductor: conductor.toUpperCase(),
            periodId:  period.id,
            notes:     'Material estéril — cargado desde datos Fernando mayo 2026',
          },
        })
        console.log(`  ✓ ${day.fecha} ${conductor} (${plate ?? 'DB lookup'})`)
        created++
      }
    }
    console.log(`\n✅ ${created} viajes de estéril creados`)
    if (notFound.length) console.log(`⚠️  No encontrados: ${notFound.join(', ')}`)
  }

  // ── 6. Fix CxC pagos Aurumin ────────────────────────────────────────────
  console.log('\n=== FIX CxC PAGOS AURUMIN ===')
  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    include: { payments: true },
    orderBy: { date: 'asc' },
  })
  console.log(`CxC Aurumin en DB: ${cxcs.length}`)
  for (const c of cxcs) {
    console.log(`  [${c.status}] ${c.periodLabel ?? c.concept} total=${c.totalAmount} paid=${c.amountPaid} balance=${c.balance}`)
  }

  // Pagar saldo del histórico 2025
  const historical = cxcs.find(c => c.totalAmount >= 20000 && c.totalAmount <= 25000 && (!c.periodLabel || (!c.periodLabel.includes('01/04') && !c.periodLabel.includes('16/04'))))
  if (historical && historical.balance > 0.01) {
    await prisma.$transaction([
      prisma.cxCPayment.create({ data: { cxcId: historical.id, amount: historical.balance, date: new Date('2026-04-15'), method: 'Transferencia', notes: 'Saldo restante pago $25,000 Aurumin — Excel' } }),
      prisma.cuentaPorCobrar.update({ where: { id: historical.id }, data: { amountPaid: historical.totalAmount, balance: 0, status: 'PAID' } }),
    ])
    console.log(`✓ Histórico saldado: -$${historical.balance.toFixed(2)}`)
  }

  // Crear CxC 01-15 Abr si no existe
  const has0115 = cxcs.find(c => c.periodLabel?.includes('01/04') || (c.date >= new Date('2026-04-01') && c.date <= new Date('2026-04-16') && c.totalAmount > 10000 && c.totalAmount < 25000 && c.id !== historical?.id))
  if (!has0115) {
    const period0115 = await prisma.period.findFirst({ where: { startDate: { gte: new Date('2026-04-01'), lte: new Date('2026-04-02') } } })
    const new0115 = await prisma.cuentaPorCobrar.create({
      data: { clientName: 'AURUMIN', concept: 'Facturación 01/04 al 15/04', periodLabel: '01/04 al 15/04', date: period0115?.endDate ?? new Date('2026-04-15'), totalAmount: 18988.63, amountPaid: 966.15, balance: 18022.48, status: 'PARTIAL' },
    })
    await prisma.cxCPayment.create({ data: { cxcId: new0115.id, amount: 966.15, date: new Date('2026-04-15'), method: 'Transferencia', notes: 'Excedente $25,000 Aurumin — Excel 01-15 Abr' } })
    console.log('✓ CxC 01-15 Abr creada con abono $966.15 → saldo $18,022.48')
  } else {
    console.log('✓ CxC 01-15 Abr ya existe')
  }

  // Aplicar $20,000 al CxC 16-30 Abr
  const cxc1630 = cxcs.find(c => c.totalAmount >= 19000 && c.totalAmount <= 21000 && (c.periodLabel?.includes('16/04') || c.periodLabel?.includes('30/04')))
  if (cxc1630 && cxc1630.amountPaid < 19000) {
    const abono = Math.min(20000, cxc1630.balance)
    const newPaid = cxc1630.amountPaid + abono
    const newBal  = Math.round(Math.max(0, cxc1630.totalAmount - newPaid) * 100) / 100
    await prisma.$transaction([
      prisma.cxCPayment.create({ data: { cxcId: cxc1630.id, amount: abono, date: new Date('2026-04-30'), method: 'Transferencia', notes: 'Pago Aurumin — Excel CONTROL DE PAGO 16-30 Abr' } }),
      prisma.cuentaPorCobrar.update({ where: { id: cxc1630.id }, data: { amountPaid: newPaid, balance: newBal, status: newBal <= 0 ? 'PAID' : 'PARTIAL' } }),
    ])
    console.log(`✓ CxC 16-30 Abr: abono $${abono} → saldo $${newBal}`)
  } else if (cxc1630) {
    console.log('✓ CxC 16-30 Abr: pago ya registrado')
  }

  // Verificación final
  const finalCxcs = await prisma.cuentaPorCobrar.findMany({ where: { clientName: 'AURUMIN', status: { not: 'PAID' } } })
  const totalFinal = finalCxcs.reduce((s, c) => s + c.balance, 0)
  console.log(`\n💰 Total Aurumin pendiente: $${totalFinal.toFixed(2)} (objetivo: $18,065.94)`)

  console.log('\n✅ Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
