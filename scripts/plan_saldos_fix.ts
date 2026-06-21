import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      id: true, netAmount: true, saldoInicial: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { owner: { name: 'asc' } } }
  })

  // Fernando's desired saldoInicial values
  const desired: Record<string, number> = {
    'A31AA2L': 148.78,   // Carlos
    'A11AG8U': 0.98,     // Fernando
    'A58DR3A': 63.40,    // De Freita
    '43HLAC':  0,        // Joaquín
    'A02BK4F': 0,        // José (saldo en A55BH6D)
    'A55BH6D': 19715,    // José (todo el saldo aquí)
    '731XJP':  -1387.67, // Leo
    'A18AZ6C': -2292.60, // Mauro
    '72HLAC':  0,        // Pablo
    // San Casimiro: 163 total, distribuido proporcional al base
  }

  // San Casimiro: calcular proporcional
  const sanCas = entries.filter(e => e.truck.owner?.name === 'Luis Alejandro Rivas')
  const totalBaseSanCas = sanCas.reduce((s, e) => s + (e.netAmount - e.saldoInicial), 0)
  const TARGET_SC = 163
  const scDesired: Record<string, number> = {}
  let remaining = TARGET_SC
  sanCas.slice(0, -1).forEach(e => {
    const base = e.netAmount - e.saldoInicial
    const d = Math.round(TARGET_SC * base / totalBaseSanCas * 100) / 100
    scDesired[e.truck.plate] = d
    remaining = Math.round((remaining - d) * 100) / 100
  })
  scDesired[sanCas[sanCas.length - 1].truck.plate] = remaining

  console.log('plate      owner                     current_saldo  current_net  desired_saldo  base      new_net')
  console.log('─'.repeat(110))
  for (const e of entries) {
    const plate = e.truck.plate
    const base = Math.round((e.netAmount - e.saldoInicial) * 100) / 100
    const ds = plate in desired ? desired[plate] : (scDesired[plate] ?? '?')
    const newNet = typeof ds === 'number' ? Math.round((base + ds) * 100) / 100 : '?'
    const change = typeof ds === 'number' && ds !== e.saldoInicial ? ' ← CHANGE' : ''
    console.log(`${plate.padEnd(10)} ${(e.truck.owner?.name ?? '?').padEnd(25)} ${String(e.saldoInicial).padStart(13)} ${String(e.netAmount).padStart(12)} ${String(ds).padStart(13)} ${String(base).padStart(9)} ${String(newNet).padStart(9)}${change}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
