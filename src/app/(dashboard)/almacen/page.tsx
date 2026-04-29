import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import AlmacenClient from './AlmacenClient'

export default async function AlmacenPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [items, trucks] = await Promise.all([
    prisma.almacenItem.findMany({
      include: { usedByTruck: { select: { id: true, plate: true } } },
      orderBy: [{ usedByTruckId: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true },
      orderBy: { plate: 'asc' },
    }),
  ])

  const serialized = items.map(i => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    usedDate: i.usedDate?.toISOString() ?? null,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Almacén</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Repuestos comprados en bulk. Cuando se asigna un ítem a un camión, se descuenta de la nómina de ese período.
          Los ítems sin asignar reducen la deuda de Aurumin.
        </p>
      </div>
      <AlmacenClient items={serialized} trucks={trucks} />
    </div>
  )
}
