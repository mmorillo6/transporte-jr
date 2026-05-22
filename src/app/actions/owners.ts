'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type OwnerParam = {
  id: string
  name: string
  type: string
  nprPercent: number
}

export async function getActiveOwners(): Promise<OwnerParam[]> {
  const owners = await prisma.owner.findMany({
    where: { trucks: { some: { active: true } } },
    select: { id: true, name: true, type: true, nprPercent: true },
    orderBy: { name: 'asc' },
  })
  return owners
}

export async function updateOwnerNpr(ownerId: string, nprPercent: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.owner.update({ where: { id: ownerId }, data: { nprPercent } })
  revalidatePath('/nomina')
  revalidatePath('/romana')
  return { ok: true }
}
