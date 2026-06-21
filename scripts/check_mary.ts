import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  // Find all owners with "mary" in name
  const owners = await prisma.owner.findMany({
    where: { name: { contains: 'ary', mode: 'insensitive' } },
    include: { trucks: { select: { plate: true, id: true } } }
  })
  console.log('Owners matching "mary":')
  for (const o of owners) {
    console.log(`  ${o.name} (${o.type}) — trucks: ${o.trucks.map(t => t.plate).join(', ')}`)
  }

  // Also check if any truck has "mary" related owner
  const allOwners = await prisma.owner.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' }
  })
  console.log('\nAll owners:')
  for (const o of allOwners) console.log(`  ${o.name} (${o.type})`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
