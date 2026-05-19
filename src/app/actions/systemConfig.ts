'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type ConfigKey = 'adminFeePerTruck' | 'laFeViatico' | 'nuevoCallaoDoubleViatico'

export type SystemConfigItem = {
  key: string
  value: string
  label: string
  description: string
}

export async function getSystemConfig(): Promise<SystemConfigItem[]> {
  return prisma.systemConfig.findMany({ orderBy: { key: 'asc' } })
}

export async function getConfigValue(key: ConfigKey): Promise<number> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key } })
  return cfg ? parseFloat(cfg.value) : 0
}

export async function updateSystemConfig(key: string, value: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.systemConfig.update({ where: { key }, data: { value } })
  revalidatePath('/nomina')
  revalidatePath('/romana')
  return { ok: true }
}
