import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import AceiteClient from './AceiteClient'

export default async function AceitePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const [batches, trucks] = await Promise.all([
    prisma.oilBatch.findMany({
      orderBy: { date: 'desc' },
      include: {
        usages: {
          include: { truck: { select: { plate: true, driver: { select: { name: true } } } } },
          orderBy: { date: 'asc' },
        },
      },
    }),
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true, driver: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
  ])

  // Per-truck total oil cost across all batches
  const truckCostMap = new Map<string, number>()
  for (const batch of batches) {
    const costPerLiter = batch.cost / batch.liters
    for (const usage of batch.usages) {
      const prev = truckCostMap.get(usage.truckId) ?? 0
      truckCostMap.set(usage.truckId, prev + usage.liters * costPerLiter)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Aceite</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Registra las compras de aceite por tipo y el uso en cada camión. Controla el inventario de lubricantes del taller.</p>
      </div>
      <AceiteClient batches={batches as any} trucks={trucks} truckCosts={Object.fromEntries(truckCostMap)} />
    </div>
  )
}
