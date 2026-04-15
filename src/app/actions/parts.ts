'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function createPart(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = (formData.get('name') as string)?.trim()
  const quantityStr = formData.get('quantity') as string
  const costStr = formData.get('cost') as string
  const truckId = formData.get('truckId') as string
  const notes = formData.get('notes') as string
  const purchasedAtStr = formData.get('purchasedAt') as string

  if (!name || !costStr) return { error: 'Nombre y costo son requeridos' }

  await prisma.part.create({
    data: {
      name,
      quantity: parseInt(quantityStr) || 1,
      cost: parseFloat(costStr),
      truckId: truckId || null,
      notes: notes || null,
      purchasedAt: purchasedAtStr ? new Date(purchasedAtStr) : new Date(),
      status: 'IN_STOCK',
    },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function markPartUsed(id: string, truckId: string | null) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.part.update({
    where: { id },
    data: { status: 'USED', usedAt: new Date(), truckId: truckId || undefined },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function deletePart(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.part.delete({ where: { id } })
  revalidatePath('/mantenimiento')
  return { ok: true }
}
