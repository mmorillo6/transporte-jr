import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

const P1JUN = 'cmqn41pg2003804kwj7yqtgni'

async function main() {
  const pe = await prisma.payrollEntry.findFirst({
    where: { periodId: P1JUN, truck: { plate: 'A31CX2A' } },
    include: { truck: { include: { owner: { select: { name: true } } } } },
  })
  if (!pe) { console.log('No entry'); return }

  console.log('=== A31CX2A (Mary) — P1 Jun verificado ===')
  console.log(`grossAmount:        $${pe.grossAmount.toFixed(2)}`)
  console.log(`- commFee:          $${pe.commissionFee.toFixed(2)}`)
  console.log(`- mechFee:          $${pe.mechanicFee.toFixed(2)}`)
  console.log(`- adminFee:         $${pe.adminFee.toFixed(2)}`)
  console.log(`- nprFee:           $${pe.nprFee.toFixed(2)}`)
  console.log(`- driverWage:       $${pe.driverWage.toFixed(2)} (override: ${pe.driverWageOverride ?? 'null'})`)
  console.log(`- abono:            $${pe.abono.toFixed(2)}`)
  console.log(`= netAmount:        $${pe.netAmount.toFixed(2)}`)

  const check = pe.grossAmount - pe.commissionFee - pe.mechanicFee - pe.adminFee - pe.nprFee - pe.driverWage + pe.viaticos - pe.deductions + pe.saldoInicial - pe.abono
  console.log(`  (verificación matemática: $${check.toFixed(2)})`)

  await prisma.$disconnect(); await pool.end()
}
main()
