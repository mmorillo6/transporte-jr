import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Usar DIRECT_URL (puerto 5432, sin pgbouncer) para scripts
const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const cxc = await prisma.cuentaPorCobrar.findMany({
    orderBy: { date: 'desc' },
  })
  console.log(JSON.stringify(cxc, null, 2))
  await prisma.$disconnect()
  await pool.end()
}
main()
