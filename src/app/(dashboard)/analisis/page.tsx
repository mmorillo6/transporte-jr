import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getOwnersAndPeriods } from '@/app/actions/analisis'
import AnalisisClient from './AnalisisClient'

export default async function AnalisisPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const { owners, periods } = await getOwnersAndPeriods()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Análisis Financiero</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Desglose por dueño de camión — separado por cliente (Aurumin / Chino Peña)
        </p>
      </div>
      <AnalisisClient owners={owners} periods={periods} />
    </div>
  )
}
