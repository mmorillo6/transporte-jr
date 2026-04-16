import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import UsuariosClient from './UsuariosClient'

export default async function UsuariosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const [users, owners] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: { owner: { select: { id: true, name: true } } },
    }),
    prisma.owner.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Gestiona los accesos al sistema: choferes, mecánicos, encargados y dueños. Asigna roles y vincula cada usuario a su camión o dueño.</p>
          <p className="text-zinc-600 text-xs mt-1">{users.filter(u => u.active).length} activos · {users.length} total</p>
        </div>
      </div>

      <UsuariosClient users={users as any} owners={owners} currentUserId={session.userId} currentUserRole={session.role} />
    </div>
  )
}
