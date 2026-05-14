/**
 * Seed histórico de CxC para Aurumin y Luis Peña
 * Datos extraídos de los Excel de relaciones Jan-Abr 2026
 * Todos los períodos anteriores a Abr están saldados (PAID)
 */
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter } as any)

// ── Datos de CONTROL DE PAGO (todos los períodos 2026) ───────────────────────
// Del RESUMEN DEUDA MDLA en los Excel de abril
// balance_inicio_2025 = $48,792.40

const AURUMIN_PERIODS = [
  // { periodLabel, concept, date_end, billing, acumulado, abono, saldo_final }
  { label: '01/01 al 15/01', date: '2026-01-15', billing: 5562.73,  abono: 28000, saldo: 26355.13 },
  { label: '16/01 al 31/01', date: '2026-01-31', billing: 15816.18, abono: 13000, saldo: 29171.31 },
  { label: '01/02 al 15/02', date: '2026-02-15', billing: 11638.26, abono: 20000, saldo: 20809.57 },
  { label: '16/02 al 28/02', date: '2026-02-28', billing: 19751.63, abono: 10000, saldo: 30561.20 },
  { label: '01/03 al 15/03', date: '2026-03-15', billing: 14292.20, abono: 20000, saldo: 24853.40 },
  // Mar 16-31 ya existe en DB como acumulado ($44,033.85) — se omite para no duplicar
]

// Luis Peña: billing por período, todos pagados (no hay tracking de acumulado)
const LUIS_PENA_PERIODS = [
  { label: '01/02 al 15/02', date: '2026-02-15', billing: 4823.98  },
  { label: '16/02 al 28/02', date: '2026-02-28', billing: 5718.58  },
  { label: '01/03 al 15/03', date: '2026-03-15', billing: 4499.74  },
  // Apr 16-30: $8,372.24 ya está en DB como PAID
]

async function main() {
  console.log('=== SEED HISTÓRICO CxC ===\n')

  // Ver qué ya existe
  const existing = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: { in: ['AURUMIN', 'LUIS PEÑA', 'CHINO PEÑA (LUIS PEÑA)'] } },
    select: { clientName: true, periodLabel: true, totalAmount: true, balance: true, status: true },
    orderBy: { date: 'asc' },
  })
  console.log('CxC existentes:')
  for (const c of existing) {
    console.log(`  [${c.clientName}] ${c.periodLabel} total=${c.totalAmount} balance=${c.balance} ${c.status}`)
  }

  const existingLabels = new Set(existing.map(c => `${c.clientName}|${c.periodLabel}`))

  // ── Aurumin histórico ────────────────────────────────────────────────────────
  console.log('\n--- Aurumin histórico ---')
  let auruminCreated = 0

  for (const p of AURUMIN_PERIODS) {
    const key = `AURUMIN|${p.label}`
    if (existingLabels.has(key)) { console.log(`  ⏭ ${p.label} ya existe`); continue }

    // Para el deuda report: el CxC se crea con el billing del período (PAID)
    // El saldo negativo acumulado de períodos anteriores ya está capturado en el
    // CxC acumulado "Del 16-03 al 31-03" que ya existe y está saldado.
    const cxc = await prisma.cuentaPorCobrar.create({
      data: {
        clientName:  'AURUMIN',
        concept:     `Facturación ${p.label}`,
        periodLabel: p.label,
        date:        new Date(p.date + 'T12:00:00'),
        totalAmount: p.billing,
        amountPaid:  p.billing,  // marcado como pagado (el pago va contra la deuda acumulada)
        balance:     0,
        status:      'PAID',
      },
    })
    // Registrar abono simbólico (el pago real cubría acumulado+período)
    await prisma.cxCPayment.create({
      data: {
        cxcId:  cxc.id,
        amount: p.billing,
        date:   new Date(p.date + 'T12:00:00'),
        method: 'Transferencia',
        notes:  `Pago parcial Aurumin — del abono total $${p.abono} · Excel CONTROL DE PAGO`,
      },
    })
    console.log(`  ✓ ${p.label}: $${p.billing} (PAID)`)
    auruminCreated++
  }

  // ── Luis Peña histórico ──────────────────────────────────────────────────────
  console.log('\n--- Luis Peña histórico ---')
  let lpCreated = 0

  for (const p of LUIS_PENA_PERIODS) {
    const key = `LUIS PEÑA|${p.label}`
    if (existingLabels.has(key)) { console.log(`  ⏭ ${p.label} ya existe`); continue }

    const cxc = await prisma.cuentaPorCobrar.create({
      data: {
        clientName:  'LUIS PEÑA',
        concept:     `Facturación ${p.label}`,
        periodLabel: p.label,
        date:        new Date(p.date + 'T12:00:00'),
        totalAmount: p.billing,
        amountPaid:  p.billing,
        balance:     0,
        status:      'PAID',
      },
    })
    await prisma.cxCPayment.create({
      data: {
        cxcId:  cxc.id,
        amount: p.billing,
        date:   new Date(p.date + 'T12:00:00'),
        method: 'Transferencia',
        notes:  'Cobrado — Excel Relación Luis Peña',
      },
    })
    console.log(`  ✓ ${p.label}: $${p.billing} (PAID)`)
    lpCreated++
  }

  // ── Verificación final ───────────────────────────────────────────────────────
  const finalAurumin = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    orderBy: { date: 'asc' },
  })
  const pendingAurumin = finalAurumin.filter(c => c.status !== 'PAID').reduce((s, c) => s + c.balance, 0)
  console.log(`\n✅ Creados: ${auruminCreated} Aurumin + ${lpCreated} Luis Peña`)
  console.log(`💰 Aurumin pendiente: $${pendingAurumin.toFixed(2)} (objetivo $18,065.94)`)

  const allAurumin = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' }, orderBy: { date: 'asc' }
  })
  console.log(`\nHistorial Aurumin completo (${allAurumin.length} registros):`)
  for (const c of allAurumin) {
    console.log(`  [${c.status}] ${c.periodLabel} $${c.totalAmount} → saldo $${c.balance}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect().then(() => pool.end()))
