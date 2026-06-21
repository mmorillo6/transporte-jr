import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const updates = [
    { id: 'cmpyi8rtn000004kzumte4wrf', saldoInicial: 54.64,      netAmount: 148.78    }, // Carlos A31AA2L
    { id: 'cmpyi8ru4000104kzanjfz592', saldoInicial: -518.04,    netAmount: 0.98      }, // Fernando A11AG8U
    { id: 'cmpyi8ry0000c04kz090k8gm5', saldoInicial: -536.74,    netAmount: 63.40     }, // De Freita A58DR3A
    { id: 'cmpyi8rxj000a04kzzyspkpsc', saldoInicial: -841.00,    netAmount: 0         }, // Joaquín 43HLAC
    { id: 'cmpyi8rwz000804kz2g7yr7q0', saldoInicial: 0,          netAmount: 47.85     }, // José A02BK4F (unchanged)
    { id: 'cmpyi8rxv000b04kzfx3plw89', saldoInicial: 19259.87,   netAmount: 19667.15  }, // José A55BH6D
    { id: 'cmpyi8ruo000204kz01clivk4', saldoInicial: -1414.96,   netAmount: -1387.67  }, // Leo 731XJP
    { id: 'cmpyi8rx6000904kz8snyc6cf', saldoInicial: -2155.92,   netAmount: -2292.60  }, // Mauro A18AZ6C
    { id: 'cmpyi8ruv000304kzakke0lmf', saldoInicial: -1078.07,   netAmount: 0         }, // Pablo 72HLAC
    { id: 'cmpyi8rvz000504kz67is4kf4', saldoInicial: -918.11,    netAmount: 38.70     }, // San Cas A17BZ9K
    { id: 'cmpyi8rwq000704kz9r1bsecb', saldoInicial: -730.36,    netAmount: 30.79     }, // San Cas A36AA2T
    { id: 'cmpyi8rvf000404kz4qdzf0su', saldoInicial: -1060.40,   netAmount: 44.69     }, // San Cas A42AD7G
    { id: 'cmpyi8rw7000604kzkdrd37hn', saldoInicial: -1160.32,   netAmount: 48.82     }, // San Cas A70AI7C
  ]

  for (const u of updates) {
    await prisma.payrollEntry.update({
      where: { id: u.id },
      data: { saldoInicial: u.saldoInicial, netAmount: u.netAmount }
    })
    console.log(`Updated ${u.id.slice(-8)} → saldo=${u.saldoInicial} net=${u.netAmount}`)
  }
  console.log('\nDone! Verifying...')

  // Verify
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      netAmount: true, saldoInicial: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { owner: { name: 'asc' } } }
  })
  for (const e of entries) {
    console.log(`${e.truck.plate.padEnd(10)} ${(e.truck.owner?.name ?? '?').padEnd(25)} net=${String(e.netAmount).padStart(10)} saldo=${String(e.saldoInicial).padStart(12)}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
