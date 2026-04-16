import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import RelacionesClient from './RelacionesClient'

export default async function RelacionesPage() {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const openPeriod = await prisma.period.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startDate: 'desc' },
  })

  const defaultStart = openPeriod ? openPeriod.startDate.toISOString().split('T')[0] : ''
  const defaultEnd   = openPeriod ? openPeriod.endDate.toISOString().split('T')[0]   : ''

  return (
    <div className="space-y-5">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 print-hide">
        <div className="w-1 h-10 rounded-full bg-amber-500 flex-shrink-0" />
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight leading-none">Relaciones</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Genera y exporta la relación quincenal
          </p>
        </div>
      </div>

      <RelacionesClient defaultStart={defaultStart} defaultEnd={defaultEnd} />
    </div>
  )
}
