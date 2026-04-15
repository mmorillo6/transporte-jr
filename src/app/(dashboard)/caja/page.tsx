import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import FinanzasClient from './FinanzasClient'

const CATEGORY_LABELS: Record<string, string> = {
  MECANICA: 'Mecánica', REPUESTO: 'Repuesto', ACEITE: 'Aceite',
  CAUCHO: 'Caucho', VIATICO: 'Viático', NOMINA: 'Nómina',
  OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Administrativo', NPR: 'NPR', OTRO: 'Otro',
}

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; truckId?: string; category?: string
    from?: string; to?: string; credit?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['DUENO', 'ENCARGADO'].includes(session.role)) redirect('/dashboard')

  const params = await searchParams
  const tab = params.tab ?? 'caja'

  // ── Caja ──────────────────────────────────────────────────────────────────
  const cashEntries = await prisma.cashEntry.findMany({
    orderBy: { date: 'desc' },
    take: 100,
  })
  let balanceEfectivo = 0, balanceUsdt = 0
  for (const e of cashEntries) {
    const sign = e.type === 'INGRESO' ? 1 : -1
    if (e.currency === 'EFECTIVO') balanceEfectivo += sign * e.amount
    else balanceUsdt += sign * e.amount
  }

  // ── Gastos ────────────────────────────────────────────────────────────────
  const gastosWhere: any = {}
  if (params.truckId) gastosWhere.truckId = params.truckId
  if (params.category) gastosWhere.category = params.category
  if (params.credit === '1') gastosWhere.isCredit = true
  if (params.from || params.to) {
    gastosWhere.date = {}
    if (params.from) gastosWhere.date.gte = new Date(params.from)
    if (params.to) { const d = new Date(params.to); d.setHours(23, 59, 59, 999); gastosWhere.date.lte = d }
  }

  const [expenses, trucks, loans, drivers, cuentas] = await Promise.all([
    prisma.expense.findMany({
      where: gastosWhere,
      orderBy: { date: 'desc' },
      take: 100,
      include: { truck: { select: { plate: true, driver: { select: { name: true } } } } },
    }),
    prisma.truck.findMany({
      where: { active: true },
      select: { id: true, plate: true, driver: { select: { name: true } } },
      orderBy: { plate: 'asc' },
    }),
    // ── Préstamos ──────────────────────────────────────────────────────────
    prisma.loan.findMany({ orderBy: { date: 'desc' } }),
    prisma.user.findMany({
      where: { role: 'CHOFER', active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // ── Por cobrar ─────────────────────────────────────────────────────────
    prisma.cuentaPorCobrar.findMany({
      orderBy: { date: 'desc' },
      include: { payments: { orderBy: { date: 'desc' } } },
    }),
  ])

  const totalLoaned  = loans.reduce((s, l) => s + l.amount, 0)
  const totalPending = loans.filter(l => l.balance > 0).reduce((s, l) => s + l.balance, 0)
  const totalPaidLoans = loans.filter(l => l.balance === 0).length
  const totalExpPaid = expenses.reduce((s, e) => s + (e.amountPaid ?? 0), 0)
  const totalExpOwed = expenses.filter(e => e.isCredit).reduce((s, e) => s + (e.amount - (e.amountPaid ?? 0)), 0)

  const cuentasData = cuentas.map(c => ({
    ...c,
    date: c.date.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    payments: c.payments.map(p => ({
      ...p,
      date: p.date.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
  }))
  const totalPorCobrar = cuentas.filter(c => c.status !== 'PAID').reduce((s, c) => s + c.balance, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-1 h-10 rounded-full bg-amber-500 flex-shrink-0" />
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight leading-none">Finanzas</h1>
          <p className="text-zinc-500 text-sm mt-1">Caja · Gastos operativos · Préstamos</p>
        </div>
      </div>

      <FinanzasClient
        tab={tab}
        // caja
        cashEntries={cashEntries as any}
        balanceEfectivo={balanceEfectivo}
        balanceUsdt={balanceUsdt}
        // gastos
        expenses={expenses as any}
        trucks={trucks}
        gastosParams={params}
        categoryLabels={CATEGORY_LABELS}
        totalExpPaid={totalExpPaid}
        totalExpOwed={totalExpOwed}
        // prestamos
        loans={loans as any}
        drivers={drivers}
        totalLoaned={totalLoaned}
        totalPending={totalPending}
        totalPaidLoans={totalPaidLoans}
        // por cobrar
        cuentas={cuentasData as any}
        totalPorCobrar={totalPorCobrar}
      />
    </div>
  )
}
