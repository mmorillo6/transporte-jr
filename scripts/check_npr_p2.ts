import { prisma } from '../src/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  
  // Entries con nprFee
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      id: true, grossAmount: true, nprFee: true, netAmount: true, commissionFee: true,
      truck: { select: { plate: true, owner: { select: { name: true, isNPROwner: true, nprPercent: true, type: true } } } }
    },
    orderBy: { truck: { plate: 'asc' } }
  })

  console.log('\n── Entries P2 con NPR ──')
  let totalNprCollected = 0
  for (const e of entries) {
    const o = e.truck?.owner
    const sign = o?.isNPROwner ? '+' : '-'
    if ((e.nprFee ?? 0) > 0) totalNprCollected += e.nprFee ?? 0
    console.log(`${e.truck?.plate?.padEnd(10)} ${(o?.name ?? '').padEnd(22)} type=${o?.type?.padEnd(8)} isNPROwner=${String(o?.isNPROwner).padEnd(5)} nprPct=${o?.nprPercent}%  nprFee=${sign}${(e.nprFee ?? 0).toFixed(2).padStart(7)}  gross=${e.grossAmount.toFixed(2).padStart(8)}`)
  }
  
  // Total NPR descontado de propios
  const nprFromPropios = entries
    .filter(e => !e.truck?.owner?.isNPROwner && (e.nprFee ?? 0) > 0)
    .reduce((s, e) => s + (e.nprFee ?? 0), 0)
  console.log(`\nTotal NPR descontado de propios: $${nprFromPropios.toFixed(2)}`)
  
  // Gastos categoría NPR en P2
  const nprExpenses = await prisma.expense.findMany({
    where: { periodId: P2_ID, category: 'NPR' },
    select: { amount: true, description: true, truckId: true, truck: { select: { plate: true } } }
  })
  const totalNprGastos = nprExpenses.reduce((s, e) => s + e.amount, 0)
  console.log(`Gastos NPR en P2: $${totalNprGastos.toFixed(2)}`)
  nprExpenses.forEach(e => console.log(`  ${e.truck?.plate ?? 'sin truck'}: $${e.amount} — ${e.description}`))
  
  console.log(`\nNPR neto para José = $${(nprFromPropios - totalNprGastos).toFixed(2)}`)
  console.log(`Fernando en Excel = $283.11`)
  
  // A15AE9Y tiene entry?
  const nprTruck = await prisma.truck.findFirst({ where: { plate: 'A15AE9Y' }, select: { id: true, plate: true } })
  if (nprTruck) {
    const nprEntry = await prisma.payrollEntry.findFirst({ where: { periodId: P2_ID, truckId: nprTruck.id } })
    console.log(`\nA15AE9Y entry en P2: ${nprEntry ? `SÍ — netAmount=${nprEntry.netAmount}` : 'NO (sin viajes → sin entry)'}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
