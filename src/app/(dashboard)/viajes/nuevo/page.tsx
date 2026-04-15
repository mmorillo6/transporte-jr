import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import TripForm from '@/components/TripForm'

export default async function NuevoViajePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const [trucks, routes] = await Promise.all([
    prisma.truck.findMany({
      where: { active: true },
      orderBy: { plate: 'asc' },
      include: {
        driver: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    prisma.route.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        rateType: true,
        rate: true,
        hasViatico: true,
        viaticoSingle: true,
        viaticoDouble: true,
      },
    }),
  ])

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/viajes"
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo viaje</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Registrar un viaje manualmente</p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <TripForm trucks={trucks as any} routes={routes} />
      </div>
    </div>
  )
}
