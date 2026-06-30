import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://postgres.vttekznfewhwircuqpjh:!W-*8gZAsny63KE@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
const pool = new Pool({ connectionString: DIRECT })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)
const PERIOD_ID = 'cmqn41pg2003804kwj7yqtgni'

async function main() {
  const period = await prisma.period.findUnique({
    where: { id: PERIOD_ID },
    select: {
      status: true, startDate: true, endDate: true,
      trips: { select: { amount: true, route: { select: { clientName: true } } } }
    }
  })
  if (!period) throw new Error('Período no encontrado')
  if (period.status === 'CLOSED') throw new Error('Ya está cerrado')

  // Resumen de negativos
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: PERIOD_ID },
    include: { truck: { include: { owner: true } } }
  })
  const negativos = entries.filter(e => e.netAmount < 0 && !e.cashEntryId)
  console.log('\nEntradas negativas (todas → SIGUIENTE / arrastra):')
  for (const e of negativos) {
    console.log(`  ${e.truck.plate} (${e.truck.owner.name}): $${e.netAmount.toFixed(2)}`)
  }

  // Calcular bruto Aurumin (todos los viajes son Aurumin en P1 Jun)
  const grossAurumin = period.trips
    .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
    .reduce((s, t) => s + t.amount, 0)
  const grossLP = period.trips
    .filter(t => (t.route as any)?.clientName === 'LUIS PEÑA')
    .reduce((s, t) => s + t.amount, 0)

  console.log(`\nTrip totals: Aurumin=$${grossAurumin.toFixed(2)}  LP=$${grossLP.toFixed(2)}`)

  // Crear CxC Aurumin si no existe
  const fmtD = (d: Date) =>
    new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  const periodLabel = `${fmtD(period.startDate)} al ${fmtD(period.endDate)}`
  console.log(`\nPeriod label: "${periodLabel}"`)

  for (const [clientName, gross] of [['AURUMIN', grossAurumin], ['LUIS PEÑA', grossLP]] as [string, number][]) {
    if (gross <= 0) continue
    const existing = await prisma.cuentaPorCobrar.findFirst({ where: { clientName, periodLabel } })
    if (existing) {
      console.log(`CxC ${clientName}: ya existe ($${existing.totalAmount.toFixed(2)}) — no se crea de nuevo`)
    } else {
      await prisma.cuentaPorCobrar.create({
        data: {
          clientName,
          concept: `Facturación ${periodLabel}`,
          periodLabel,
          date: period.endDate,
          totalAmount: gross,
          amountPaid: 0,
          balance: gross,
          status: 'PENDING',
        }
      })
      console.log(`CxC ${clientName} creada: $${gross.toFixed(2)}`)
    }
  }

  // Cerrar período
  await prisma.period.update({ where: { id: PERIOD_ID }, data: { status: 'CLOSED' } })
  console.log('\n✓ Período P1 Jun cerrado correctamente')
  console.log(`  Negativos: ${negativos.length} camiones arrastran al siguiente período`)
}

main().catch(console.error).finally(() => pool.end())
