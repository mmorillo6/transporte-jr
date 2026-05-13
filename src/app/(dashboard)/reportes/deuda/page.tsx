import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
}

export default async function ResumenDeudaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  // CxC de Aurumin, ordenadas por fecha ascendente
  const cxcAurumin = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: 'AURUMIN' },
    include: {
      payments: { orderBy: { date: 'asc' }, select: { amount: true, date: true, method: true, notes: true } },
    },
    orderBy: { date: 'asc' },
  })

  // CxC de Luis Peña (ambos nombres posibles)
  const cxcLuisPena = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: { in: ['LUIS PEÑA', 'CHINO PEÑA (LUIS PEÑA)'] } },
    include: {
      payments: { orderBy: { date: 'asc' }, select: { amount: true, date: true, method: true, notes: true } },
    },
    orderBy: { date: 'asc' },
  })

  function calcRunning(records: typeof cxcAurumin) {
    let running = 0
    return records.map(c => {
      running += c.balance
      return { ...c, runningBalance: running }
    })
  }

  const auruminRows  = calcRunning(cxcAurumin)
  const luisPenaRows = calcRunning(cxcLuisPena)

  const totalAurumin   = { facturado: cxcAurumin.reduce((s, c) => s + c.totalAmount, 0), pagado: cxcAurumin.reduce((s, c) => s + c.amountPaid, 0), saldo: cxcAurumin.reduce((s, c) => s + c.balance, 0) }
  const totalLuisPena  = { facturado: cxcLuisPena.reduce((s, c) => s + c.totalAmount, 0), pagado: cxcLuisPena.reduce((s, c) => s + c.amountPaid, 0), saldo: cxcLuisPena.reduce((s, c) => s + c.balance, 0) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/reportes" className="text-zinc-500 hover:text-white transition-colors text-sm">← Reportes</Link>
          </div>
          <h1 className="text-2xl font-bold text-white">Estado de cuenta — Deuda</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Historial de facturas y pagos por cliente</p>
        </div>
        <Link
          href="/caja?tab=cobrar"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm transition-colors"
        >
          + Registrar CxC →
        </Link>
      </div>

      {/* Resumen de saldos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-amber-300 text-xs font-medium">Aurumin — saldo pendiente</p>
          <p className="text-amber-400 font-bold text-2xl font-mono mt-1">${fmt(totalAurumin.saldo)}</p>
          <p className="text-zinc-500 text-xs mt-1">de ${fmt(totalAurumin.facturado)} facturado · ${fmt(totalAurumin.pagado)} cobrado</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
          <p className="text-blue-300 text-xs font-medium">Luis Peña — saldo pendiente</p>
          <p className="text-blue-400 font-bold text-2xl font-mono mt-1">${fmt(totalLuisPena.saldo)}</p>
          <p className="text-zinc-500 text-xs mt-1">de ${fmt(totalLuisPena.facturado)} facturado · ${fmt(totalLuisPena.pagado)} cobrado</p>
        </div>
      </div>

      {/* ── AURUMIN ── */}
      <ClientLedger
        title="Aurumin"
        rows={auruminRows}
        totals={totalAurumin}
        accentColor="amber"
      />

      {/* ── LUIS PEÑA ── */}
      <ClientLedger
        title="Luis Peña (Chino Peña)"
        rows={luisPenaRows}
        totals={totalLuisPena}
        accentColor="blue"
      />

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm 2cm; }
          body { background: white !important; }
          nav, header, aside, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

type Row = {
  id: string
  periodLabel: string | null
  date: Date
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  runningBalance: number
  payments: { amount: number; date: Date; method: string | null; notes: string | null }[]
}

function ClientLedger({
  title,
  rows,
  totals,
  accentColor,
}: {
  title: string
  rows: Row[]
  totals: { facturado: number; pagado: number; saldo: number }
  accentColor: 'amber' | 'blue'
}) {
  const accent = accentColor === 'amber'
    ? { header: 'text-amber-400', saldo: 'text-amber-400 print:text-amber-700', border: 'border-amber-500/20' }
    : { header: 'text-blue-400',  saldo: 'text-blue-400 print:text-blue-700',   border: 'border-blue-500/20'  }

  if (rows.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <p className="text-zinc-500 text-sm">{title} — sin registros de CxC</p>
        <Link href="/caja?tab=cobrar" className="text-xs text-zinc-600 hover:text-zinc-400 mt-1 block transition-colors">
          + Registrar primera factura →
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300 print:rounded-none">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 print:border-zinc-300 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className={`font-bold text-base ${accent.header} print:text-black`}>{title}</p>
          <p className="text-zinc-500 text-xs">{rows.length} registro{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-zinc-500 text-xs">Saldo pendiente</p>
          <p className={`font-bold text-xl font-mono ${accent.saldo}`}>${totals.saldo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs">
          <thead>
            <tr className="border-b border-zinc-800 print:border-zinc-300 bg-zinc-800/30 print:bg-zinc-50">
              <th className="text-left text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Período</th>
              <th className="text-left text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Fecha</th>
              <th className="text-right text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Facturado</th>
              <th className="text-right text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Cobrado</th>
              <th className="text-right text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Saldo</th>
              <th className="text-right text-zinc-500 font-semibold px-4 py-2.5 whitespace-nowrap print:text-zinc-800">Acumulado</th>
              <th className="text-left text-zinc-500 font-medium px-4 py-2.5 whitespace-nowrap print:text-zinc-600">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isPaid    = row.status === 'PAID'
              const isPartial = row.status === 'PARTIAL'
              const rowBg     = isPaid ? 'bg-emerald-500/5' : ''

              return (
                <>
                  <tr key={row.id} className={`border-b border-zinc-800/50 print:border-zinc-100 ${rowBg}`}>
                    <td className="px-4 py-2.5 text-zinc-300 print:text-zinc-700">
                      {row.periodLabel ?? `Registro ${idx + 1}`}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap print:text-zinc-600">
                      {new Date(row.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-white font-mono whitespace-nowrap print:text-black">
                      ${fmt(row.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {row.amountPaid > 0
                        ? <span className="text-emerald-400 print:text-emerald-700">${fmt(row.amountPaid)}</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {isPaid
                        ? <span className="text-zinc-500 print:text-zinc-400">$0.00</span>
                        : <span className="text-red-400 print:text-red-700">${fmt(row.balance)}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold font-mono whitespace-nowrap ${
                      row.runningBalance <= 0 ? 'text-emerald-400 print:text-emerald-700' : accent.saldo
                    }`}>
                      ${fmt(row.runningBalance)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isPaid ? (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full print:text-emerald-700">
                          ✓ Cobrado
                        </span>
                      ) : isPartial ? (
                        <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full print:text-amber-700">
                          Parcial
                        </span>
                      ) : (
                        <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full print:text-red-700">
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                  {/* Detalle de abonos */}
                  {row.payments.length > 0 && row.payments.map((p, pi) => (
                    <tr key={`${row.id}-p${pi}`} className="border-b border-zinc-800/30 print:border-zinc-50 bg-emerald-500/5 print:bg-emerald-50">
                      <td colSpan={2} className="px-4 py-1.5 pl-8 text-zinc-500 print:text-zinc-500">
                        ↳ Abono {new Date(p.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })}
                        {p.method && <span className="ml-1 text-zinc-600">· {p.method}</span>}
                        {p.notes  && <span className="ml-1 text-zinc-600">· {p.notes}</span>}
                      </td>
                      <td colSpan={5} className="px-4 py-1.5 text-right">
                        <span className="text-emerald-400 font-mono print:text-emerald-700">+${fmt(p.amount)}</span>
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-800/60 border-t border-zinc-700 print:bg-zinc-100 print:border-zinc-400">
              <td colSpan={2} className="px-4 py-2.5 text-zinc-400 font-semibold text-xs uppercase tracking-wide print:text-zinc-600">TOTAL</td>
              <td className="px-4 py-2.5 text-right text-white font-bold font-mono print:text-black">${fmt(totals.facturado)}</td>
              <td className="px-4 py-2.5 text-right text-emerald-400 font-bold font-mono print:text-emerald-700">${fmt(totals.pagado)}</td>
              <td className="px-4 py-2.5 text-right text-red-400 font-bold font-mono print:text-red-700">${fmt(totals.saldo)}</td>
              <td className={`px-4 py-2.5 text-right font-bold font-mono ${accent.saldo}`}>${fmt(totals.saldo)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Nota si no hay historial completo */}
      <div className="px-5 py-3 border-t border-zinc-800/50 print:hidden">
        <p className="text-zinc-600 text-xs">
          Saldo acumulado calculado desde los registros de Cuentas por Cobrar.
          Para ingresar deuda histórica anterior al sistema, registra una CxC con la fecha y monto correspondiente en{' '}
          <Link href="/caja?tab=cobrar" className="text-zinc-500 hover:text-zinc-300 underline transition-colors">
            Finanzas → Por cobrar
          </Link>.
        </p>
      </div>
    </div>
  )
}
