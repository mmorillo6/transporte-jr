import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { generatePayroll } from '../src/app/actions/payroll'

async function main() {
  const periods = await prisma.period.findMany({
    orderBy: { startDate: 'desc' },
    take: 5,
    select: { id: true, startDate: true, endDate: true, status: true, mechanicFeeBase: true, adminFeeBase: true }
  })
  console.log('Períodos:')
  periods.forEach(p => console.log(
    ' ', p.id,
    new Date(p.startDate).toISOString().slice(0,10), '→',
    new Date(p.endDate).toISOString().slice(0,10),
    p.status, 'admin:', p.adminFeeBase, 'mec:', p.mechanicFeeBase
  ))

  // P2 = segundo período más reciente OPEN o el más reciente
  const p2 = periods.find(p => p.status === 'OPEN') ?? periods[0]
  console.log('\nRegenerando:', p2.id)
  // generatePayroll requiere sesión — llamar directo a Prisma
  await prisma.payrollEntry.deleteMany({ where: { periodId: p2.id } })
  console.log('Entries eliminadas. Usa el botón de la app para regenerar (necesita sesión).')
  await prisma.$disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
