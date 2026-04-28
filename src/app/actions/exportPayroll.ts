'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function exportPeriodExcel(periodId: string): Promise<{ error: string } | { data: string; filename: string }> {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  // Get payroll entries with truck details
  const period = await prisma.period.findUnique({ where: { id: periodId } })
  if (!period) return { error: 'Período no encontrado' }

  const entries = await prisma.payrollEntry.findMany({ where: { periodId } })
  if (entries.length === 0) return { error: 'Genera la nómina primero' }

  const truckIds = [...new Set(entries.map(e => e.truckId))]
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: { driver: { select: { name: true } }, owner: { select: { name: true, type: true, commissionRate: true } } },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  const fmt = (d: Date) => { const [y,m,day] = new Date(d).toISOString().slice(0,10).split('-').map(Number); return new Date(y,m-1,day,12).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'numeric'}) }
  const periodLabel = `${fmt(period.startDate)} al ${fmt(period.endDate)}`

  // Build rows
  const headers = ['Transportista', 'Placa', 'Dueño', 'Tipo', 'Toneladas', 'Monto Bruto', 'Viáticos', 'Comisión', 'Deducciones', 'Neto a Pagar']
  const rows = entries.map(e => {
    const truck = truckMap.get(e.truckId)
    return [
      truck?.driver?.name ?? '—',
      truck?.plate ?? '—',
      truck?.owner?.name ?? '—',
      truck?.owner?.type === 'AFILIADO' ? `Afiliado ${truck.owner.commissionRate}%` : 'Propio',
      e.totalTons,
      e.grossAmount,
      e.viaticos,
      e.commissionFee,
      e.deductions,
      e.netAmount,
    ]
  })

  const totals = [
    'TOTALES', '', '', '',
    entries.reduce((s, e) => s + e.totalTons, 0),
    entries.reduce((s, e) => s + e.grossAmount, 0),
    entries.reduce((s, e) => s + e.viaticos, 0),
    entries.reduce((s, e) => s + e.commissionFee, 0),
    entries.reduce((s, e) => s + e.deductions, 0),
    entries.reduce((s, e) => s + e.netAmount, 0),
  ]

  // Use xlsx to build workbook
  const XLSX = await import('xlsx')
  const wsData = [
    [`RELACIÓN DE NÓMINA — ${periodLabel}`],
    [],
    headers,
    ...rows,
    [],
    totals,
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Nómina')

  const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  const filename = `nomina-${periodLabel.replace(/\//g, '-')}.xlsx`

  return { data: buffer, filename }
}
