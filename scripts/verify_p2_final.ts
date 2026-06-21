import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'

  // Saldos iniciales correctos según Fernando (lista actualizada)
  const expected: Record<string, number> = {
    'José Rodríguez':      19715,
    'Leo Rodríguez':       0,
    'Carlos Rodríguez':    148.78,
    'Mauro Garcia':        -2292.60,
    'Fernando':            0.98,
    'Mary Morillo':        0.61,
    'Gregorio de Freitas': 63.40,
    'Joaquín Neto':        0,
    'Pablo Neto':          0,
    'Luis Alejandro Rivas':163,   // combinado
  }

  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      saldoInicial: true, netAmount: true, notes: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { owner: { name: 'asc' } } }
  })

  // Agrupar por dueño
  const byOwner = new Map<string, { saldo: number; plates: string[] }>()
  for (const e of entries) {
    const owner = e.truck.owner?.name ?? '?'
    const cur = byOwner.get(owner) ?? { saldo: 0, plates: [] }
    cur.saldo = Math.round((cur.saldo + e.saldoInicial) * 100) / 100
    cur.plates.push(e.truck.plate)
    byOwner.set(owner, cur)
  }

  console.log('Dueño                     esperado   en DB      estado')
  console.log('─'.repeat(65))
  for (const [owner, { saldo, plates }] of byOwner) {
    const exp = expected[owner]
    const ok = exp !== undefined && Math.abs(saldo - exp) < 0.01
    const flag = ok ? '✓' : `← DIFF (expected ${exp})`
    console.log(`${owner.padEnd(25)} ${String(exp ?? '?').padStart(9)} ${String(saldo).padStart(9)}  ${flag}`)
  }

  // Mostrar Leo en detalle
  const leo = entries.find(e => e.truck.plate === '731XJP')
  if (leo) console.log(`\nLeo 731XJP: saldoInicial=${leo.saldoInicial}  netAmount=${leo.netAmount}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
