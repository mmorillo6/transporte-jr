import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  // Find the bombillo expense
  const exp = await prisma.expense.findFirst({
    where: { description: { contains: 'ombillo', mode: 'insensitive' } },
    select: { id: true, date: true, description: true, category: true, amount: true, truckId: true, periodId: true, createdAt: true,
      truck: { select: { plate: true, owner: { select: { name: true } } } },
      period: { select: { startDate: true, endDate: true } }
    }
  })
  if (!exp) { console.log('Expense not found'); return }
  console.log('Bombillo expense:')
  console.log(`  Description: ${exp.description}`)
  console.log(`  Amount: $${exp.amount}`)
  console.log(`  Category: ${exp.category}`)
  console.log(`  Date: ${new Date(exp.date).toISOString().slice(0,10)}`)
  console.log(`  Truck: ${exp.truck?.plate} (owner: ${exp.truck?.owner?.name})`)
  console.log(`  Period: ${new Date(exp.period?.startDate!).toISOString().slice(0,10)} → ${new Date(exp.period?.endDate!).toISOString().slice(0,10)}`)
  console.log(`  Created: ${new Date(exp.createdAt).toISOString()}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
