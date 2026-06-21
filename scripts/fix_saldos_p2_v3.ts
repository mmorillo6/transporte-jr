import { prisma } from '../src/lib/prisma'

// Saldos correctos según Fernando — quincena 2 de mayo
const FIXES: Record<string, number> = {
  '43HLAC':  0,
  '72HLAC':  0,
  '731XJP':  0,
  'A02BK4F': 0,
  'A11AG8U': 0.98,
  'A17BZ9K': 38.68,
  'A18AZ6C': -2292.60,
  'A31AA2L': 148.78,
  'A36AA2T': 30.77,
  'A42AD7G': 44.67,
  'A55BH6D': 19715,
  'A58DR3A': 63.40,
  'A70AI7C': 48.88,
}

const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'

async function main() {
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: { id: true, saldoInicial: true, netAmount: true, truck: { select: { plate: true } } },
  })

  for (const e of entries) {
    const plate = e.truck?.plate ?? ''
    if (!(plate in FIXES)) { console.log(`SKIP ${plate} — no está en la lista`); continue }
    const newSaldo = FIXES[plate]
    const newNet   = Math.round((e.netAmount - e.saldoInicial + newSaldo) * 100) / 100
    await prisma.payrollEntry.update({
      where: { id: e.id },
      data: { saldoInicial: newSaldo, netAmount: newNet },
    })
    console.log(`✓ ${plate.padEnd(10)} saldoInicial: ${String(e.saldoInicial).padStart(10)} → ${String(newSaldo).padStart(10)}   netAmount: ${String(e.netAmount).padStart(10)} → ${String(newNet).padStart(10)}`)
  }

  // Re-crear entry de Mary (A31CX2A, sin viajes en P2)
  const maryTruck = await prisma.truck.findFirst({ where: { plate: 'A31CX2A' }, select: { id: true } })
  if (maryTruck) {
    const existing = await prisma.payrollEntry.findFirst({ where: { periodId: P2_ID, truckId: maryTruck.id } })
    if (existing) {
      await prisma.payrollEntry.update({ where: { id: existing.id }, data: { saldoInicial: 0.61, netAmount: 0.61, notes: 'No trabajó esta quincena' } })
      console.log(`✓ A31CX2A (Mary) entry actualizado saldoInicial=0.61 netAmount=0.61`)
    } else {
      await prisma.payrollEntry.create({
        data: {
          periodId: P2_ID, truckId: maryTruck.id,
          totalTons: 0, grossAmount: 0, viaticos: 0, driverWage: 0,
          commissionFee: 0, nprFee: 0, mechanicFee: 0, adminFee: 0,
          deductions: 0, saldoInicial: 0.61, abono: 0,
          netAmount: 0.61, notes: 'No trabajó esta quincena',
        },
      })
      console.log(`✓ A31CX2A (Mary) entry creado saldoInicial=0.61 netAmount=0.61`)
    }
  } else {
    console.log('✗ Camión A31CX2A no encontrado')
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
