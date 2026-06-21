import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'

  const truck = await prisma.truck.findFirst({
    where: { plate: 'A31CX2A' },
    select: { id: true, plate: true, owner: { select: { name: true } } }
  })
  if (!truck) { console.log('Camión A31CX2A no encontrado'); return }

  // Verificar que no exista ya
  const existing = await prisma.payrollEntry.findFirst({
    where: { truckId: truck.id, periodId: P2_ID }
  })
  if (existing) { console.log('Entry ya existe:', existing.id); return }

  const entry = await prisma.payrollEntry.create({
    data: {
      periodId:     P2_ID,
      truckId:      truck.id,
      totalTons:    0,
      grossAmount:  0,
      viaticos:     0,
      driverWage:   0,
      commissionFee:0,
      nprFee:       0,
      mechanicFee:  0,
      adminFee:     0,
      deductions:   0,
      saldoInicial: 0.61,
      abono:        0,
      netAmount:    0.61,
      notes:        'No trabajó esta quincena',
    }
  })

  console.log(`Entry creado: ${entry.id}`)
  console.log(`  Truck: ${truck.plate} (${truck.owner?.name})`)
  console.log(`  saldoInicial: ${entry.saldoInicial}`)
  console.log(`  netAmount: ${entry.netAmount}`)
  console.log(`  notes: ${entry.notes}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
