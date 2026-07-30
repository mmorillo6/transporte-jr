import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DiasInternosClient from './DiasInternosClient'
import MaterialEsterilClient from './MaterialEsterilClient'
import FixCxCButton from './FixCxCButton'

export default async function DiasInternosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const { tab } = await searchParams
  const activeTab = tab === 'esteril' ? 'esteril' : 'internos'

  const [trucks, openPeriod] = await Promise.all([
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true, ownerId: true, driver: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
    prisma.period.findFirst({
      where: { status: 'OPEN' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { startDate: 'desc' },
    }),
  ])

  const openPeriodFormatted = openPeriod ? {
    id:        openPeriod.id,
    startDate: openPeriod.startDate.toISOString(),
    endDate:   openPeriod.endDate.toISOString(),
  } : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Registro Manual</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Días internos y material estéril — no pasan por la romana
          </p>
        </div>
        {session.role === 'DUENO' && <FixCxCButton />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        <a href="/dias-internos"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'internos' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}>
          ⏱ Días Internos
        </a>
        <a href="/dias-internos?tab=esteril"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'esteril' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}>
          🪨 Material Estéril
        </a>
      </div>

      {activeTab === 'internos' ? (
        <DiasInternosClient trucks={trucks} />
      ) : (
        <MaterialEsterilClient trucks={trucks} openPeriod={openPeriodFormatted} />
      )}
    </div>
  )
}
