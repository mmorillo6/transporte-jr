import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

const P1JUN = 'cmqn41pg2003804kwj7yqtgni'

async function main() {
  // Get A31CX2A payroll entry full detail
  const pe = await prisma.payrollEntry.findFirst({
    where: { periodId: P1JUN, truck: { plate: 'A31CX2A' } },
    include: { truck: { include: { owner: true } } },
  })
  if (!pe) { console.log('No entry'); return }
  console.log('=== PayrollEntry A31CX2A P1 Jun ===')
  console.log(`grossAmount:   $${pe.grossAmount.toFixed(2)}`)
  console.log(`commFee:       $${pe.commissionFee.toFixed(2)}`)
  console.log(`mechFee:       $${pe.mechanicFee.toFixed(2)}`)
  console.log(`adminFee:      $${pe.adminFee.toFixed(2)}`)
  console.log(`nprFee:        $${pe.nprFee.toFixed(2)}`)
  console.log(`driverWage:    $${pe.driverWage.toFixed(2)}`)
  console.log(`driverWageOverride: ${pe.driverWageOverride ?? 'null'}`)
  console.log(`viaticos:      $${pe.viaticos.toFixed(2)}`)
  console.log(`deductions:    $${pe.deductions.toFixed(2)}`)
  console.log(`saldoInicial:  $${pe.saldoInicial.toFixed(2)}`)
  console.log(`abono:         $${pe.abono.toFixed(2)}`)
  console.log(`netAmount:     $${pe.netAmount.toFixed(2)}`)

  // Trips breakdown
  const trips = await prisma.trip.findMany({
    where: { periodId: P1JUN, truckId: pe.truckId },
    include: { route: { select: { name: true, driverWage: true, clientName: true } } },
    orderBy: { date: 'asc' },
  })
  console.log(`\n=== Viajes A31CX2A (${trips.length} total) ===`)
  let tripDriverWage = 0
  for (const t of trips) {
    const dw = (t.route as any)?.driverWage ?? 0
    tripDriverWage += dw
    console.log(`  ${t.date.toISOString().slice(0,10)} ${(t.route as any)?.name} | amount=$${t.amount} driverWage=$${dw}`)
  }
  console.log(`  Total driver wage de viajes: $${tripDriverWage.toFixed(2)}`)

  // Días internos en P1 Jun para A31CX2A
  const internos = await prisma.diasInternosEntry.findMany({
    where: {
      truckId: pe.truckId,
      fecha: { gte: new Date('2026-06-01T00:00:00'), lte: new Date('2026-06-15T23:59:59') },
    },
  })
  const diasHoras = internos.reduce((s, e) => s + e.totalHoras, 0)
  const diasDriverWage = diasHoras * 2.5
  console.log(`\nDías internos: ${diasHoras}h × $2.50 = $${diasDriverWage.toFixed(2)}`)
  console.log(`TOTAL driverWage calculado: $${(tripDriverWage + diasDriverWage).toFixed(2)}`)
  console.log(`Stored driverWage: $${pe.driverWage.toFixed(2)}`)
  console.log(`\nSi driverWage = $150.00, netAmount sería: $${(pe.netAmount + pe.driverWage - 150).toFixed(2)}`)

  await prisma.$disconnect(); await pool.end()
}
main()
