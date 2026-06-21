import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const id = 'cmpyi8ruo000204kz01clivk4' // Leo 731XJP
  // base = netAmount - saldoInicial = -1360.38 - (-1387.67) = 27.29
  await prisma.payrollEntry.update({
    where: { id },
    data: { saldoInicial: 0, netAmount: 27.29 }
  })
  const e = await prisma.payrollEntry.findUnique({
    where: { id },
    select: { saldoInicial: true, netAmount: true, truck: { select: { plate: true } } }
  })
  console.log(`${e?.truck.plate}  saldoInicial=${e?.saldoInicial}  netAmount=${e?.netAmount}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
