import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DiasInternosClient from './DiasInternosClient'

export default async function DiasInternosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const trucks = await prisma.truck.findMany({
    where: { active: true },
    select: { id: true, plate: true, driver: { select: { name: true } } },
    orderBy: { plate: 'asc' },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Días Internos</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Registro manual de horas — se usa en relaciones de Aurumin
        </p>
      </div>
      <DiasInternosClient trucks={trucks} />
    </div>
  )
}
