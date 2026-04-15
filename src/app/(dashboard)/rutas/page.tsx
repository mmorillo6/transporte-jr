import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import RutasClient from './RutasClient'

export default async function RutasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const routes = await prisma.route.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { trips: true } } },
  })

  const canEdit = ['DUENO', 'ENCARGADO'].includes(session.role)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rutas / Minas</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {routes.filter(r => r.active).length} activas · {routes.length} total
          </p>
        </div>
      </div>

      <RutasClient routes={routes as any} canEdit={canEdit} />
    </div>
  )
}
