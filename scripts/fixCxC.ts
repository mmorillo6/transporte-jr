import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter } as any)

async function main() {
  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    include: { payments: { orderBy: { date: 'asc' } } },
    orderBy: { date: 'asc' },
  })

  console.log('Estado actual CxC Aurumin:')
  let totalPending = 0
  for (const c of cxcs) {
    console.log(`  [${c.status}] "${c.periodLabel ?? c.concept}" total=${c.totalAmount} paid=${c.amountPaid} balance=${c.balance}`)
    for (const p of c.payments) console.log(`    → abono $${p.amount} "${p.notes ?? ''}"`)
    if (c.status !== 'PAID') totalPending += c.balance
  }
  console.log(`\nTotal pendiente actual: $${totalPending.toFixed(2)}`)

  // CxC con mayor total = el acumulado (debería ser ~$44,033)
  const cxcAcum = cxcs.find(c => c.totalAmount > 30000)
  // CxC 16-30 Abr (totalAmount ~$20,043)
  const cxc1630 = cxcs.find(c => Math.abs(c.totalAmount - 20043.46) < 10)
  // CxC 01-15 Abr (nueva, balance ~$18,022)
  const cxc0115 = cxcs.find(c => c.periodLabel?.includes('01/04'))

  console.log('\n--- Corrigiendo ---')

  // 1. Corregir CxC 16-30 Abr: tenía pago erróneo de $20,043 como "histórico"
  //    Eliminar ese pago y poner el correcto de $20,000
  if (cxc1630) {
    for (const p of cxc1630.payments) {
      console.log(`  Eliminando pago de CxC 16-30 Abr: $${p.amount}`)
      await prisma.cxCPayment.delete({ where: { id: p.id } })
    }
    // Aplicar el pago correcto: $20,000
    const abono1630 = 20000
    const newBal1630 = Math.round((cxc1630.totalAmount - abono1630) * 100) / 100
    await prisma.cxCPayment.create({
      data: { cxcId: cxc1630.id, amount: abono1630, date: new Date('2026-04-30'), method: 'Transferencia', notes: 'Pago Aurumin — Excel CONTROL DE PAGO 16-30 Abr' }
    })
    await prisma.cuentaPorCobrar.update({
      where: { id: cxc1630.id },
      data: { amountPaid: abono1630, balance: newBal1630, status: 'PARTIAL' }
    })
    console.log(`  ✓ CxC 16-30 Abr corregida: abono $${abono1630} → saldo $${newBal1630.toFixed(2)}`)
  }

  // 2. Saldar CxC acumulada si tiene saldo
  if (cxcAcum && cxcAcum.balance > 0.01) {
    const bal = cxcAcum.balance
    await prisma.cxCPayment.create({
      data: { cxcId: cxcAcum.id, amount: bal, date: new Date('2026-04-15'), method: 'Transferencia', notes: 'Saldo restante — pago $25,000 Aurumin Excel' }
    })
    await prisma.cuentaPorCobrar.update({
      where: { id: cxcAcum.id },
      data: { amountPaid: cxcAcum.totalAmount, balance: 0, status: 'PAID' }
    })
    console.log(`  ✓ CxC acumulada saldada: -$${bal.toFixed(2)}`)
  }

  // Verificación final
  const final = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN', status: { not: 'PAID' } },
  })
  const totalFinal = final.reduce((s, c) => s + c.balance, 0)
  console.log(`\n💰 Total Aurumin pendiente: $${totalFinal.toFixed(2)}`)
  console.log(`   Objetivo:                 $18,065.94`)
  console.log(`   Diferencia:               $${(totalFinal - 18065.94).toFixed(2)}`)
}

main().catch(console.error).finally(() => prisma.$disconnect().then(() => pool.end()))
