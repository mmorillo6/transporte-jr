// Reconciliación puntual — 2026-09-07
// Reconstruye el historial de PayrollAbono (con lado correcto) para los 3
// camiones reportados con el bug de "abono siempre restado de Aurumin":
// A02BK4F, 43HLAC, 72HLAC. Usa los CashEntry ya existentes (que sí tienen la
// moneda correcta: EFECTIVO → Luis Peña, USDT → Aurumin) para reconstruir
// quién recibió cada pago. No cambia ningún monto total ya correcto — solo
// corrige la categorización visual.
//
// Caso especial 72HLAC (Larry): el 06-sep se registraron 2 pagos en efectivo
// casi iguales por error ($3543.64 y $3543.00) — la usuaria confirmó que el
// correcto es $3543.64 con decimales. Ese duplicado se excluye del backfill
// y se corrige abono/netAmount/paidAt/CashEntry de esa entrada.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const DRY_RUN = process.argv.includes('--dry-run')

function sideFor(currency: string): 'AURUMIN' | 'LP' {
  return currency === 'USDT' ? 'AURUMIN' : 'LP'
}

async function backfillTruck(plate: string, opts?: { excludeCashEntryAmount?: number; excludeCashEntryCurrency?: string }) {
  const truck = await prisma.truck.findFirst({ where: { plate } })
  if (!truck) { console.log(`${plate}: NOT FOUND`); return }

  const entries = await prisma.payrollEntry.findMany({
    where: { truckId: truck.id, abono: { gt: 0 } },
    include: { period: true },
    orderBy: { period: { startDate: 'desc' } },
  })
  const cashEntries = await prisma.cashEntry.findMany({
    where: { truckId: truck.id, source: 'NOMINA' },
    orderBy: { createdAt: 'desc' },
  })

  let cursor = 0
  let excludeUsed = false
  for (const entry of entries) {
    const target = Math.round(entry.abono * 100)
    let sum = 0
    const consumed: typeof cashEntries = []
    while (cursor < cashEntries.length && sum < target) {
      consumed.push(cashEntries[cursor])
      sum += Math.round(cashEntries[cursor].amount * 100)
      cursor++
    }
    const label = `${plate} · período ${entry.period.startDate.toISOString().slice(0,10)}`
    if (sum !== target) {
      console.log(`⚠️  ${label}: no cuadra (target=${target/100}, sum=${sum/100}) — SE OMITE, revisar a mano.`)
      continue
    }

    let excluded: (typeof cashEntries)[number] | null = null
    let usable = consumed
    if (!excludeUsed && opts?.excludeCashEntryAmount != null) {
      const idx = consumed.findIndex(c =>
        Math.abs(c.amount - opts.excludeCashEntryAmount!) < 0.001 && c.currency === opts.excludeCashEntryCurrency)
      if (idx >= 0) {
        excluded = consumed[idx]
        usable = consumed.filter((_, i) => i !== idx)
        excludeUsed = true
      }
    }

    for (const c of usable) {
      console.log(`   + abono ${sideFor(c.currency)} $${c.amount} (${c.currency}, ${c.createdAt.toISOString().slice(0,10)})`)
    }
    if (excluded) {
      const newAbono = Math.round((entry.abono - excluded.amount) * 100) / 100
      const newNet   = Math.round((entry.netAmount + excluded.amount) * 100) / 100
      const stillFullyPaid = newNet <= 0
      console.log(`   ✂️  excluir duplicado $${excluded.amount} (${excluded.currency}) — abono ${entry.abono}→${newAbono}, netAmount ${entry.netAmount}→${newNet}${entry.paidAt && !stillFullyPaid ? ', reabre (paidAt→null)' : ''}`)
    }

    if (!DRY_RUN) {
      await prisma.$transaction(async tx => {
        for (const c of usable) {
          await tx.payrollAbono.create({
            data: {
              entryId: entry.id,
              side: sideFor(c.currency),
              amount: c.amount,
              currency: c.currency,
              cashEntryId: c.id,
              date: c.createdAt,
            },
          })
        }
        if (excluded) {
          const newAbono = Math.round((entry.abono - excluded.amount) * 100) / 100
          const newNet   = Math.round((entry.netAmount + excluded.amount) * 100) / 100
          const stillFullyPaid = newNet <= 0
          await tx.payrollEntry.update({
            where: { id: entry.id },
            data: {
              abono: newAbono,
              netAmount: newNet,
              ...(entry.paidAt && !stillFullyPaid ? { paidAt: null, paymentMethod: null } : {}),
            },
          })
          await tx.cashEntry.delete({ where: { id: excluded.id } })
        }
      })
    }
    console.log(`${DRY_RUN ? '🔎' : '✅'} ${label}: ${usable.length} abono(s)${DRY_RUN ? ' (simulado)' : ' reconstruidos'}${excluded ? ' (+1 duplicado corregido)' : ''}`)
  }
}

async function main() {
  await backfillTruck('A02BK4F')
  await backfillTruck('43HLAC')
  await backfillTruck('72HLAC', { excludeCashEntryAmount: 3543.00, excludeCashEntryCurrency: 'EFECTIVO' })
  await prisma.$disconnect()
}
main()
