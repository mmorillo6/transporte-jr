import 'server-only'
import { prisma } from '@/lib/prisma'
import { createSession, deleteSession, getSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

export async function login(identifier: string, password: string) {
  // Accept email or phone number
  const isPhone = /^[\d\s\+\-\(\)]{7,}$/.test(identifier.trim())

  const user = isPhone
    ? await prisma.user.findFirst({ where: { phone: identifier.trim() } })
    : await prisma.user.findUnique({ where: { email: identifier.trim().toLowerCase() } })

  if (!user || !user.active) return { error: 'Credenciales inválidas' }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return { error: 'Credenciales inválidas' }

  await createSession(user.id, user.role, user.name)
  return { ok: true, role: user.role }
}

export async function logout() {
  await deleteSession()
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, phone: true, ownerId: true },
  })
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}
