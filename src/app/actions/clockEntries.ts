'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function clockIn(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const userId = formData.get('userId') as string
  const truckId = formData.get('truckId') as string
  const clockInStr = formData.get('clockIn') as string
  const notes = formData.get('notes') as string

  if (!userId || !clockInStr) return { error: 'Usuario y hora de entrada son requeridos' }

  // Check no open entry for this user
  const open = await prisma.clockEntry.findFirst({
    where: { userId, clockOut: null },
  })
  if (open) return { error: 'Este usuario ya tiene una entrada abierta' }

  await prisma.clockEntry.create({
    data: {
      userId,
      truckId: truckId || null,
      clockIn: new Date(clockInStr),
      notes: notes || null,
    },
  })

  revalidatePath('/asistencia')
  return { ok: true }
}

export async function clockOut(id: string, clockOutStr: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.clockEntry.update({
    where: { id },
    data: { clockOut: new Date(clockOutStr) },
  })

  revalidatePath('/asistencia')
  return { ok: true }
}

export async function deleteClockEntry(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.clockEntry.delete({ where: { id } })
  revalidatePath('/asistencia')
  return { ok: true }
}
