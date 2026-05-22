import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import PerfilClient from './PerfilClient'

export default async function PerfilPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, role: true, phone: true, whatsappApiKey: true },
  })
  if (!user) redirect('/login')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Mi perfil</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Información de tu cuenta</p>
      </div>
      <PerfilClient
        name={user.name}
        email={user.email}
        role={user.role}
        phone={user.phone ?? ''}
        whatsappApiKey={user.whatsappApiKey ?? ''}
      />
    </div>
  )
}
