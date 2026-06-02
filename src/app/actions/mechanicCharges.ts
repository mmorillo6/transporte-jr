'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function addPendingMechanicCharge(data: {
  description: string
  amount: number
  truckId: string | null
  ownerId: string | null
  targetPeriodId: string
  notes?: string
}) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.pendingMechanicCharge.create({
    data: {
      description: data.description.trim().toUpperCase(),
      amount:      data.amount,
      truckId:     data.truckId  || null,
      ownerId:     data.ownerId  || null,
      targetPeriodId: data.targetPeriodId,
      notes:       data.notes?.trim() || null,
    },
  })

  revalidatePath(`/nomina/${data.targetPeriodId}`)
  return { ok: true }
}

export async function markMechanicChargeApplied(id: string, periodId: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.pendingMechanicCharge.update({
    where: { id },
    data: { appliedAt: new Date() },
  })

  revalidatePath(`/nomina/${periodId}`)
  return { ok: true }
}

export async function updatePeriodAdminFee(periodId: string, adminFeeBase: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.period.update({
    where: { id: periodId },
    data: { adminFeeBase },
  })

  revalidatePath(`/nomina/${periodId}`)
  return { ok: true }
}

export async function updatePeriodMechanicFee(periodId: string, mechanicFeeBase: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.period.update({
    where: { id: periodId },
    data: { mechanicFeeBase: mechanicFeeBase > 0 ? mechanicFeeBase : null },
  })

  revalidatePath(`/nomina/${periodId}`)
  return { ok: true }
}

export async function updateActivePropioOverride(periodId: string, override: number | null) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.period.update({
    where: { id: periodId },
    data: { activePropioOverride: override && override > 0 ? override : null },
  })

  revalidatePath(`/nomina/${periodId}`)
  return { ok: true }
}
