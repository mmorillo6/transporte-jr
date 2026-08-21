'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type ConfigKey =
  | 'adminFeePerTruck'
  | 'laFeViatico'
  | 'nuevoCallaoDoubleViatico'
  | 'diasInternosRate'
  | 'diasInternosChoferRate'

export type GastoDefault = { description: string; category: string; amount: string; includeAfiliados: boolean }

const GASTOS_KEY = 'gastosComunes_defaults'
const FACTORY_GASTOS: GastoDefault[] = [
  { description: 'NOMINA MECANICOS', category: 'MECANICA',      amount: '',      includeAfiliados: false },
  { description: 'STARLINK',         category: 'ADMINISTRATIVO', amount: '10.91', includeAfiliados: true  },
  { description: 'GASTOS COMUNES',   category: 'OPERATIVO',      amount: '3.80',  includeAfiliados: false },
]

export async function getGastosComunesDefaults(): Promise<GastoDefault[]> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: GASTOS_KEY } })
  if (!cfg) return FACTORY_GASTOS
  try { return JSON.parse(cfg.value) } catch { return FACTORY_GASTOS }
}

export async function saveGastosComunesDefaults(items: GastoDefault[]) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }
  await prisma.systemConfig.upsert({
    where:  { key: GASTOS_KEY },
    update: { value: JSON.stringify(items) },
    create: { key: GASTOS_KEY, value: JSON.stringify(items), label: 'Gastos comunes predeterminados', description: 'Valores por defecto del panel de gastos comunes' },
  })
  return { ok: true }
}

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
