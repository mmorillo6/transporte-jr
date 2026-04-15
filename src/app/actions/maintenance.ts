'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// ─── ESTADO DE FLOTA ──────────────────────────────────────────────────────────

export async function updateTruckStatus(truckId: string, status: string, notes: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO', 'MECANICO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.truckStatus.upsert({
    where: { truckId },
    create: { truckId, status: status as any, notes: notes || null, updatedById: session.userId },
    update: { status: status as any, notes: notes || null, updatedById: session.userId },
  })

  revalidatePath('/mantenimiento')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── ALERTAS ─────────────────────────────────────────────────────────────────

export async function createAlert(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO', 'MECANICO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const truckId = formData.get('truckId') as string
  const type = formData.get('type') as string
  const dueDate = formData.get('dueDate') as string

  if (!truckId || !type || !dueDate) return { error: 'Camión, tipo y fecha son requeridos' }

  await prisma.maintenanceAlert.create({
    data: { truckId, type: type as any, dueDate: new Date(dueDate), status: 'PENDING' },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function resolveAlert(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO', 'MECANICO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.maintenanceAlert.update({
    where: { id },
    data: { status: 'RESOLVED' },
  })

  revalidatePath('/mantenimiento')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── HISTORIAL DE MANTENIMIENTO ───────────────────────────────────────────────

export async function createLog(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO', 'MECANICO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const truckId = formData.get('truckId') as string
  const type = formData.get('type') as string
  const date = formData.get('date') as string
  const description = formData.get('description') as string
  const cost = parseFloat(formData.get('cost') as string) || 0
  const mechanicId = formData.get('mechanicId') as string

  if (!truckId || !type || !date) return { error: 'Camión, tipo y fecha son requeridos' }

  await prisma.maintenanceLog.create({
    data: {
      truckId,
      type: type as any,
      date: new Date(date),
      description: description || null,
      cost,
      mechanicId: mechanicId || null,
    },
  })

  revalidatePath('/mantenimiento')
  return { ok: true }
}

export async function deleteLog(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.maintenanceLog.delete({ where: { id } })
  revalidatePath('/mantenimiento')
  return { ok: true }
}
