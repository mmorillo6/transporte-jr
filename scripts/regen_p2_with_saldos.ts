/**
 * Regenera la nómina de P2 (17-31 mayo 2026) preservando saldoInicial y abono actuales.
 * generatePayroll ya tiene esa lógica — este script solo lo invoca y reporta.
 */
import { prisma } from '../src/lib/prisma'
import { generatePayroll } from '../src/app/actions/payroll'

const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'

async function main() {
  // 1. Capturar saldoInicial y abono antes de regenerar (para verificar después)
  const before = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: { truckId: true, saldoInicial: true, abono: true, netAmount: true,
              truck: { select: { plate: true } } },
    orderBy: { truck: { plate: 'asc' } },
  })

  console.log('\n=== SALDOS ANTES ===')
  for (const e of before) {
    console.log(`  ${e.truck.plate.padEnd(10)} saldoInicial=${e.saldoInicial.toFixed(2).padStart(9)}  abono=${e.abono.toFixed(2).padStart(8)}  net=${e.netAmount.toFixed(2).padStart(9)}`)
  }

  // 2. Regenerar
  console.log('\nRegenerando nómina P2...')
  const result = await generatePayroll(P2_ID)
  console.log('Resultado:', result)

  // 3. Capturar saldoInicial y abono después
  const after = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: { truckId: true, saldoInicial: true, abono: true, netAmount: true,
              truck: { select: { plate: true } } },
    orderBy: { truck: { plate: 'asc' } },
  })

  console.log('\n=== SALDOS DESPUÉS ===')
  for (const e of after) {
    console.log(`  ${e.truck.plate.padEnd(10)} saldoInicial=${e.saldoInicial.toFixed(2).padStart(9)}  abono=${e.abono.toFixed(2).padStart(8)}  net=${e.netAmount.toFixed(2).padStart(9)}`)
  }

  // 4. Verificar que saldoInicial no cambió
  console.log('\n=== VERIFICACIÓN SALDO INICIAL ===')
  let ok = true
  for (const b of before) {
    const a = after.find(x => x.truckId === b.truckId)
    if (!a) { console.log(`  ${b.truck.plate} ⚠ entrada eliminada`); ok = false; continue }
    const diff = Math.abs(a.saldoInicial - b.saldoInicial)
    if (diff > 0.01) {
      console.log(`  ${b.truck.plate} ❌ saldoInicial cambió: ${b.saldoInicial.toFixed(2)} → ${a.saldoInicial.toFixed(2)}`)
      ok = false
    } else {
      console.log(`  ${b.truck.plate} ✓ saldoInicial OK (${a.saldoInicial.toFixed(2)})`)
    }
  }
  // Mostrar si se creó entrada nueva (A15AE9Y)
  for (const a of after) {
    if (!before.find(b => b.truckId === a.truckId)) {
      console.log(`  ${a.truck.plate} ✨ NUEVA entrada — saldoInicial=${a.saldoInicial.toFixed(2)} net=${a.netAmount.toFixed(2)}`)
    }
  }

  if (ok) console.log('\n✅ Todos los saldos iniciales se preservaron correctamente.')
  else console.log('\n❌ Algunos saldos iniciales cambiaron — revisar.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
