'use server'
import { redirect } from 'next/navigation'
import { login, logout } from '@/lib/auth'

export async function loginAction(formData: FormData) {
  const identifier = (formData.get('identifier') as string)?.trim()
  const password = formData.get('password') as string

  if (!identifier || !password) return { error: 'Usuario y contraseña son requeridos' }

  const result = await login(identifier, password)
  if (result.error) return { error: result.error }

  if (result.role && ['CHOFER', 'MECANICO'].includes(result.role)) redirect('/mi-cuenta')
  redirect('/dashboard')
}

export async function logoutAction() {
  await logout()
  redirect('/login')
}
