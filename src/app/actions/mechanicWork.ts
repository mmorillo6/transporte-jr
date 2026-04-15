'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function createMechanicWork(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const truckId = formData.get('truckId') as string
  const mechanicId = formData.get('mechanicId') as string
  const description = (formData.get('description') as string)?.trim()
  const costStr = formData.get('cost') as string
  const workshopCutStr = formData.get('workshopCut') as string
  const mechanicCutStr = formData.get('mechanicCut') as string
  const dateStr = formData.get('date') as string

  if (!truckId || !mechanicId || !description || !dateStr) {
    return { error: 'Camión, mecánico, descripción y fecha son requeridos' }
  }

  const cost = parseFloat(costStr) || 0
  const workshopCut = parseFloat(workshopCutStr) || 0
  const mechanicCut = parseFloat(mechanicCutStr) || 0

  await prisma.mechanicWork.create({
    data: {
      truckId, mechanicId, description,
      cost, workshopCut, mechanicCut,
      date: new Date(dateStr),
    },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function deleteMechanicWork(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.mechanicWork.delete({ where: { id } })
  revalidatePath('/mantenimiento')
  return { ok: true }
}
