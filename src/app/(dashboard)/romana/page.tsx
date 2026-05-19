import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import RomanaClient from './RomanaClient'
import { getSystemConfig } from '@/app/actions/systemConfig'

export default async function RomanaPage() {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const [openPeriod, systemConfig] = await Promise.all([
    prisma.period.findFirst({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } }),
    getSystemConfig(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Importar romana</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Importa el reporte Excel de la romana. El sistema detecta automáticamente las rutas, calcula montos y te avisa si hay placas o choferes sin registrar.</p>
        {openPeriod && (
          <p className="text-amber-400 text-xs mt-1">
            Período abierto: {new Date(openPeriod.startDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })} al {new Date(openPeriod.endDate).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            {' '}— los viajes se asociarán a este período
          </p>
        )}
      </div>
      <RomanaClient openPeriodId={openPeriod?.id} systemConfig={systemConfig} />
    </div>
  )
}
