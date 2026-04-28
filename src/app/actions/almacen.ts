'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function getAlmacenItems() {
  return prisma.almacenItem.findMany({
    include: { usedByTruck: { select: { plate: true } } },
    orderBy: [{ usedByTruckId: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function getTotalAlmacenPendiente() {
  const items = await prisma.almacenItem.findMany({ where: { usedByTruckId: null } })
  return items.reduce((s, i) => s + i.amount, 0)
}

export async function addAlmacenItem(data: FormData) {
  const name   = (data.get('name') as string)?.trim()
  const amount = parseFloat(data.get('amount') as string)
  const notes  = (data.get('notes') as string)?.trim() || null
  if (!name || isNaN(amount)) return { error: 'Nombre y monto son requeridos' }
  await prisma.almacenItem.create({ data: { name, amount, notes } })
  revalidatePath('/almacen')
  return {}
}

export async function asignarAlmacenItem(id: string, truckId: string) {
  await prisma.almacenItem.update({
    where: { id },
    data: { usedByTruckId: truckId, usedDate: new Date() },
  })
  revalidatePath('/almacen')
  revalidatePath('/nomina')
}

export async function devolverAlmacenItem(id: string) {
  await prisma.almacenItem.update({
    where: { id },
    data: { usedByTruckId: null, usedDate: null },
  })
  revalidatePath('/almacen')
  revalidatePath('/nomina')
}

export async function deleteAlmacenItem(id: string) {
  await prisma.almacenItem.delete({ where: { id } })
  revalidatePath('/almacen')
}
