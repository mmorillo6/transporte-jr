import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const updates = [
    { id: 'cmpyi8rtn000004kzumte4wrf', saldoInicial: 148.78,    netAmount: 242.92    }, // Carlos A31AA2L
    { id: 'cmpyi8ru4000104kzanjfz592', saldoInicial: 0.98,      netAmount: 520.00    }, // Fernando A11AG8U
    { id: 'cmpyi8ry0000c04kz090k8gm5', saldoInicial: 63.40,     netAmount: 663.54    }, // De Freita A58DR3A
    { id: 'cmpyi8rxj000a04kzzyspkpsc', saldoInicial: 0,         netAmount: 841.00    }, // Joaquín 43HLAC
    { id: 'cmpyi8rwz000804kz2g7yr7q0', saldoInicial: 0,         netAmount: 47.85     }, // José A02BK4F (sin cambio)
    { id: 'cmpyi8rxv000b04kzfx3plw89', saldoInicial: 19715,     netAmount: 20122.28  }, // José A55BH6D
    { id: 'cmpyi8ruo000204kz01clivk4', saldoInicial: -1387.67,  netAmount: -1360.38  }, // Leo 731XJP
    { id: 'cmpyi8rx6000904kz8snyc6cf', saldoInicial: -2292.60,  netAmount: -2429.28  }, // Mauro A18AZ6C
    { id: 'cmpyi8ruv000304kzakke0lmf', saldoInicial: 0,         netAmount: 1078.07   }, // Pablo 72HLAC
    { id: 'cmpyi8rvz000504kz67is4kf4', saldoInicial: 38.68,     netAmount: 995.49    }, // San Cas A17BZ9K
    { id: 'cmpyi8rwq000704kz9r1bsecb', saldoInicial: 30.77,     netAmount: 791.92    }, // San Cas A36AA2T
    { id: 'cmpyi8rvf000404kz4qdzf0su', saldoInicial: 44.67,     netAmount: 1149.76   }, // San Cas A42AD7G
    { id: 'cmpyi8rw7000604kzkdrd37hn', saldoInicial: 48.88,     netAmount: 1258.02   }, // San Cas A70AI7C
  ]

  for (const u of updates) {
    await prisma.payrollEntry.update({
      where: { id: u.id },
      data: { saldoInicial: u.saldoInicial, netAmount: u.netAmount }
    })
  }

  // Verificar resultado
  const P2_ID = 'cmppy0k0e0000tdsn288mjrq1'
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: P2_ID },
    select: {
      netAmount: true, saldoInicial: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } }
    },
    orderBy: { truck: { owner: { name: 'asc' } } }
  })

  console.log('plate      owner                     saldoInicial       netAmount')
  console.log('─'.repeat(75))
  for (const e of entries) {
    console.log(`${e.truck.plate.padEnd(10)} ${(e.truck.owner?.name ?? '?').padEnd(25)} ${String(e.saldoInicial).padStart(12)} ${String(e.netAmount).padStart(12)}`)
  }

  // Totales por dueño
  console.log('\nTotales combinados:')
  const jose = entries.filter(e => e.truck.owner?.name === 'José Rodríguez')
  console.log(`  José R (2 trucks): saldo=${jose.reduce((s,e)=>s+e.saldoInicial,0).toFixed(2)}  net=${jose.reduce((s,e)=>s+e.netAmount,0).toFixed(2)}`)
  const sc = entries.filter(e => e.truck.owner?.name === 'Luis Alejandro Rivas')
  console.log(`  San Casimiro (4):  saldo=${sc.reduce((s,e)=>s+e.saldoInicial,0).toFixed(2)}  net=${sc.reduce((s,e)=>s+e.netAmount,0).toFixed(2)}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
