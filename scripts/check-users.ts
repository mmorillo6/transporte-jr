import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
dotenv.config({ path: '.env' })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'encargado@transportejr.com' }, select: { password: true } })
  const candidates = ['Transporte2024!', 'transporte2024!', 'fernando123', 'encargado123', 'admin123', 'Fernando2024!', 'transporte123', 'Transporte123!', 'JR2024!', '123456']
  for (const c of candidates) {
    const ok = await bcrypt.compare(c, user!.password)
    if (ok) console.log('MATCH:', c)
    else console.log('no:', c)
  }
  await prisma.$disconnect()
  await pool.end()
}
main()
