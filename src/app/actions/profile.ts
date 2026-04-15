'use server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function changePassword(currentPassword: string, newPassword: string) {
  const session = await getSession()
  if (!session) return { error: 'No autorizado' }

  if (!newPassword || newPassword.length < 6) {
    return { error: 'La nueva contraseña debe tener al menos 6 caracteres' }
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return { error: 'Usuario no encontrado' }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return { error: 'Contraseña actual incorrecta' }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

  return { ok: true }
}
