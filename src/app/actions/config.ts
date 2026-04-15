'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { hashPassword } from '@/lib/auth'

// ─── CAMIONES ─────────────────────────────────────────────────────────────────

export async function createTruck(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const plate = (formData.get('plate') as string)?.toUpperCase().trim()
  const driverId = formData.get('driverId') as string
  const ownerId = formData.get('ownerId') as string

  if (!plate || !ownerId) return { error: 'Placa y dueño son requeridos' }

  const existing = await prisma.truck.findUnique({ where: { plate } })
  if (existing) return { error: `La placa ${plate} ya existe` }

  await prisma.truck.create({
    data: { plate, driverId: driverId || null, ownerId, active: true },
  })

  revalidatePath('/camiones')
  return { ok: true }
}

export async function updateTruck(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const plate = (formData.get('plate') as string)?.toUpperCase().trim()
  const driverId = formData.get('driverId') as string
  const ownerId = formData.get('ownerId') as string
  const active = formData.get('active') === 'true'

  await prisma.truck.update({
    where: { id },
    data: { plate, driverId: driverId || null, ownerId, active },
  })

  revalidatePath('/camiones')
  return { ok: true }
}

export async function toggleTruckStatus(id: string, active: boolean) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.truck.update({ where: { id }, data: { active } })
  revalidatePath('/camiones')
  return { ok: true }
}

export async function deleteTruck(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const truck = await prisma.truck.findUnique({ where: { id } })
  if (!truck) return { error: 'Camión no encontrado' }

  // Delete related records in order before deleting truck
  await prisma.truckStatus.deleteMany({ where: { truckId: id } })
  await prisma.maintenanceAlert.deleteMany({ where: { truckId: id } })
  await prisma.maintenanceLog.deleteMany({ where: { truckId: id } })
  await prisma.mechanicWork.deleteMany({ where: { truckId: id } })
  await prisma.clockEntry.deleteMany({ where: { truckId: id } })
  await prisma.expense.deleteMany({ where: { truckId: id } })
  await prisma.trip.deleteMany({ where: { truckId: id } })
  await prisma.part.deleteMany({ where: { truckId: id } })
  await prisma.truck.delete({ where: { id } })

  revalidatePath('/camiones')
  revalidatePath('/viajes')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── RUTAS / MINAS ────────────────────────────────────────────────────────────

export async function createRoute(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = (formData.get('name') as string)?.toUpperCase().trim()
  const rateType = formData.get('rateType') as string
  const rate = parseFloat(formData.get('rate') as string)
  const hasViatico = formData.get('hasViatico') === 'true'
  const viaticoSingle = parseFloat(formData.get('viaticoSingle') as string) || 0
  const viaticoDouble = parseFloat(formData.get('viaticoDouble') as string) || 0
  const driverWage = parseFloat(formData.get('driverWage') as string) || 0
  const fuelLitersPerTrip = parseFloat(formData.get('fuelLitersPerTrip') as string) || 0
  const bidirectional = formData.get('bidirectional') === 'true'

  if (!name || !rateType || isNaN(rate)) return { error: 'Nombre, tipo y tarifa son requeridos' }

  const existing = await prisma.route.findUnique({ where: { name } })
  if (existing) return { error: `La ruta "${name}" ya existe` }

  await prisma.route.create({
    data: { name, rateType: rateType as any, rate, driverWage, fuelLitersPerTrip, hasViatico, viaticoSingle, viaticoDouble, bidirectional, active: true },
  })

  revalidatePath('/rutas')
  return { ok: true }
}

export async function updateRoute(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = (formData.get('name') as string)?.toUpperCase().trim()
  const rateType = formData.get('rateType') as string
  const rate = parseFloat(formData.get('rate') as string)
  const hasViatico = formData.get('hasViatico') === 'true'
  const viaticoSingle = parseFloat(formData.get('viaticoSingle') as string) || 0
  const viaticoDouble = parseFloat(formData.get('viaticoDouble') as string) || 0
  const driverWage = parseFloat(formData.get('driverWage') as string) || 0
  const fuelLitersPerTrip = parseFloat(formData.get('fuelLitersPerTrip') as string) || 0
  const bidirectional = formData.get('bidirectional') === 'true'
  const active = formData.get('active') === 'true'

  await prisma.route.update({
    where: { id },
    data: { name, rateType: rateType as any, rate, driverWage, fuelLitersPerTrip, hasViatico, viaticoSingle, viaticoDouble, bidirectional, active },
  })

  revalidatePath('/rutas')
  return { ok: true }
}

export async function deleteRoute(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const tripCount = await prisma.trip.count({ where: { routeId: id } })
  if (tripCount > 0) {
    return { error: `Esta ruta tiene ${tripCount} viaje${tripCount > 1 ? 's' : ''} registrado${tripCount > 1 ? 's' : ''}. Desactívala en lugar de eliminarla.` }
  }

  await prisma.route.delete({ where: { id } })
  revalidatePath('/rutas')
  return { ok: true }
}

export async function toggleRouteActive(id: string, active: boolean) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.route.update({ where: { id }, data: { active } })
  revalidatePath('/rutas')
  return { ok: true }
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

export async function createUser(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const email = (formData.get('email') as string)?.toLowerCase().trim()
  const password = formData.get('password') as string
  const role = formData.get('role') as string
  const phone = formData.get('phone') as string
  const ownerId = formData.get('ownerId') as string

  if (!name || !email || !password || !role) return { error: 'Nombre, email, contraseña y rol son requeridos' }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'Ya existe un usuario con ese email' }

  const hashed = await hashPassword(password)

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: role as any,
      phone: phone || null,
      ownerId: ownerId || null,
      active: true,
    },
  })

  revalidatePath('/usuarios')
  return { ok: true }
}

export async function updateUser(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const role = formData.get('role') as string
  const ownerId = formData.get('ownerId') as string
  const active = formData.get('active') === 'true'
  const newPassword = formData.get('newPassword') as string

  const data: any = { name, phone: phone || null, role, ownerId: ownerId || null, active }
  if (newPassword) data.password = await hashPassword(newPassword)

  await prisma.user.update({ where: { id }, data })
  revalidatePath('/usuarios')
  return { ok: true }
}

export async function toggleUserActive(id: string, active: boolean) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  await prisma.user.update({ where: { id }, data: { active } })
  revalidatePath('/usuarios')
  return { ok: true }
}

export async function deleteUser(id: string) {
  const session = await getSession()
  if (!session || session.role !== 'DUENO') return { error: 'No autorizado' }
  if (id === session.userId) return { error: 'No puedes eliminarte a ti mismo' }

  // Desasignar camiones que tenga este chofer
  await prisma.truck.updateMany({ where: { driverId: id }, data: { driverId: null } })
  await prisma.clockEntry.deleteMany({ where: { userId: id } })
  await prisma.user.delete({ where: { id } })
  revalidatePath('/usuarios')
  return { ok: true }
}

// ─── DUEÑOS ────────────────────────────────────────────────────────────────────

export async function updateOwner(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const nprPercent = parseFloat(formData.get('nprPercent') as string) || (type === 'AFILIADO' ? 10 : 5)
  const isNPROwner = formData.get('isNPROwner') === 'true'
  const phone = formData.get('phone') as string

  if (!name || !type) return { error: 'Nombre y tipo son requeridos' }

  await prisma.owner.update({
    where: { id },
    data: { name, type: type as any, nprPercent, isNPROwner, phone: phone || null },
  })

  revalidatePath('/duenos')
  revalidatePath('/camiones')
  return { ok: true }
}

export async function deleteOwner(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const truckCount = await prisma.truck.count({ where: { ownerId: id } })
  if (truckCount > 0) {
    return { error: `Este dueño tiene ${truckCount} camión${truckCount > 1 ? 'es' : ''} asignado${truckCount > 1 ? 's' : ''}. Reasígnalos o elimínalos primero.` }
  }

  // Desasociar usuarios vinculados antes de borrar
  await prisma.user.updateMany({ where: { ownerId: id }, data: { ownerId: null } })
  await prisma.owner.delete({ where: { id } })

  revalidatePath('/duenos')
  revalidatePath('/camiones')
  return { ok: true }
}

export async function createOwner(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const nprPercent = parseFloat(formData.get('nprPercent') as string) || (type === 'AFILIADO' ? 10 : 5)
  const isNPROwner = formData.get('isNPROwner') === 'true'
  const phone = formData.get('phone') as string

  if (!name || !type) return { error: 'Nombre y tipo son requeridos' }

  await prisma.owner.create({
    data: { name, type: type as any, nprPercent, isNPROwner, phone: phone || null, active: true },
  })

  revalidatePath('/camiones')
  return { ok: true }
}
