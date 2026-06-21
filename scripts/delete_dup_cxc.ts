import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DIRECT = "postgresql://${DIRECT_URL}"
const pool = new Pool({ connectionString: DIRECT })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const all = await prisma.cuentaPorCobrar.findMany({
    where: {
      clientName: { contains: 'AURUMIN', mode: 'insensitive' },
      concept: { contains: '16' },
      totalAmount: { gte: 13700, lte: 13800 }
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, concept: true, date: true, createdAt: true, totalAmount: true, status: true }
  })
  console.log('Duplicate entries:')
  all.forEach(e => console.log({
    id: e.id,
    concept: e.concept,
    date: e.date.toISOString(),
    createdAt: e.createdAt.toISOString(),
    amount: e.totalAmount,
    status: e.status
  }))

  // Delete the OLDER one (created first = the manually inserted script entry)
  if (all.length >= 2) {
    const toDelete = all[0] // oldest by createdAt
    console.log('\nDeleting:', toDelete.id, toDelete.concept, toDelete.createdAt.toISOString())
    await prisma.cuentaPorCobrar.delete({ where: { id: toDelete.id } })
    console.log('Deleted successfully.')
  } else {
    console.log('Less than 2 entries found — nothing to delete.')
  }
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
