'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getConfigValue } from './systemConfig'

// ─── Generar / recalcular nómina de un período ────────────────────────────────
// Fórmula de Fernando por camión:
//   FACTURACIÓN - GASTOS_OP - NÓMINA_CHOFER - NÓMINA_MECÁNICOS - ADMIN - NPR
//   + SALDO_INICIAL - ABONO = SALDO_FINAL
//
// Reglas:
//  - ADMIN: ($50 × total carros PROPIO en flota) ÷ carros PROPIO activos este período
//  - NPR:   owner.nprPercent % del bruto  (5% PROPIO, 10% AFILIADO)
//           Si isNPROwner (José): NPR se calcula y guarda pero NO se descuenta del neto
//  - GASTOS_OP: Expense records del camión en el período (excluye NOMINA, ADMINISTRATIVO, NPR, MECANICA)
//  - SALDO_INICIAL: netAmount del período anterior (si negativo = deuda; si positivo y pagado = 0)
//  - AFILIADO: sin adminFee ni mechanicFee (pagan por su cuenta)

export type PayrollOptions = {
  skipLoanIds?: string[]
  adminFeeOverride?: number
}

export async function generatePayroll(periodId: string, options: PayrollOptions = {}) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: {
      trips: {
        include: {
          truck: { include: { owner: true } },
          route: { select: { driverWage: true, name: true, clientName: true } },
        },
      },
    },
  })

  if (!period) return { error: 'Período no encontrado' }
  if (period.status === 'CLOSED') return { error: 'El período está cerrado. Reabre primero para recalcular.' }

  // Agrupar viajes por camión
  const byTruck = new Map<string, typeof period.trips>()
  for (const trip of period.trips) {
    byTruck.set(trip.truckId, [...(byTruck.get(trip.truckId) ?? []), trip])
  }

  const truckIds = Array.from(byTruck.keys())

  // Info completa de los camiones activos en el período
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: {
      driver: { select: { id: true, name: true } },
      owner: true,
    },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  // ── Camiones PROPIO con viajes Aurumin este período ─────────────────────────
  // Solo se consideran activos para el pool los propios con viajes Aurumin
  // (excluye camiones que solo trabajaron rutas Luis Peña este período)
  const propiosConAurumin = new Set(
    period.trips
      .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
      .filter(t => truckMap.get(t.truckId)?.owner.type === 'PROPIO')
      .map(t => t.truckId)
  )
  const activePropioThisPeriod = propiosConAurumin.size

  // ── Admin fee ────────────────────────────────────────────────────────────────
  // Pool = $50 × propios de la flota que han trabajado recientemente
  // Se excluyen camiones sin viajes en los últimos 90 días (inactivos reales)
  // Flota Aurumin: propios con al menos 1 viaje Aurumin en los últimos 45 días
  // 45 días excluye camiones sin actividad reciente (A55BH6D, A15AE9Y) sin afectar
  // a los que rotaron a Luis Peña temporalmente (A18AZ6C que volvería al pool)
  const fortyFiveDaysAgo = new Date(period.startDate.getTime() - 45 * 24 * 60 * 60 * 1000)
  const propioFlotaActiva = await prisma.truck.count({
    where: {
      active: true,
      owner: { type: 'PROPIO' },
      trips: { some: { date: { gte: fortyFiveDaysAgo }, route: { clientName: { not: 'LUIS PEÑA' } } } },
    },
  })
  const adminFeeBase = options.adminFeeOverride ?? await getConfigValue('adminFeePerTruck')
  const adminPool = adminFeeBase * propioFlotaActiva
  const adminFeePerTruck = activePropioThisPeriod > 0 ? adminPool / activePropioThisPeriod : 0

  // ── Mecánica — pool dividido entre propios con viajes Aurumin ────────────────
  // Suma MechanicWork del período + Expenses categoría MECANICA por camión.
  // Fernando entra la nómina de mecánicos vía "Gastos comunes" como MECANICA;
  // el sistema la divide y crea un Expense por camión → se acumula aquí.
  const mechanicWorks = await prisma.mechanicWork.findMany({
    where: {
      truckId: { in: truckIds },
      date: { gte: period.startDate, lte: period.endDate },
    },
    select: { truckId: true, cost: true },
  })
  const mechanicByTruck = new Map<string, number>()
  for (const w of mechanicWorks) {
    mechanicByTruck.set(w.truckId, (mechanicByTruck.get(w.truckId) ?? 0) + w.cost)
  }
  // Expenses con categoría MECANICA por camión (incluye nómina de mecánicos distribuida)
  const mechanicExpenses = await prisma.expense.findMany({
    where: {
      truckId: { in: truckIds },
      periodId,
      category: 'MECANICA',
    },
    select: { truckId: true, amount: true },
  })
  for (const e of mechanicExpenses) {
    if (!e.truckId) continue
    mechanicByTruck.set(e.truckId, (mechanicByTruck.get(e.truckId) ?? 0) + e.amount)
  }

  // ── Gastos operativos por camión (Expense records, excluye nómina/admin/NPR/mecánica) ──
  const expenses = await prisma.expense.findMany({
    where: {
      truckId: { in: truckIds },
      date: { gte: period.startDate, lte: period.endDate },
      category: { notIn: ['NOMINA', 'ADMINISTRATIVO', 'NPR', 'MECANICA'] },
    },
    select: { truckId: true, amount: true },
  })
  const gastosByTruck = new Map<string, number>()
  for (const e of expenses) {
    if (!e.truckId) continue
    gastosByTruck.set(e.truckId, (gastosByTruck.get(e.truckId) ?? 0) + e.amount)
  }

  // ── Préstamos por conductor o por dueño ──────────────────────────────────────
  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } })
  // Préstamos cuyo driverName coincide con el nombre del DUEÑO se descuentan
  // solo al PRIMER camión de ese dueño (para no duplicar la deducción).
  const ownerLoanApplied = new Set<string>()

  // ── Saldo inicial: netAmount del período anterior por camión ──────────────────
  // Solo se hereda si era negativo (deuda) o si era positivo y no se ha pagado
  const allPrevEntries = await prisma.payrollEntry.findMany({
    where: {
      truckId: { in: truckIds },
      period: { endDate: { lt: period.startDate } },
    },
    include: { period: { select: { endDate: true } } },
    orderBy: { period: { endDate: 'desc' } },
  })
  // Tomar solo el más reciente por camión
  const prevByTruck = new Map<string, { netAmount: number; paidAt: Date | null }>()
  for (const e of allPrevEntries) {
    if (!prevByTruck.has(e.truckId)) {
      prevByTruck.set(e.truckId, { netAmount: e.netAmount, paidAt: e.paidAt })
    }
  }

  // ── Eliminar entradas existentes para regenerar ───────────────────────────────
  await prisma.payrollEntry.deleteMany({ where: { periodId } })

  const created = []

  for (const [truckId, trips] of byTruck) {
    const truck = truckMap.get(truckId)
    if (!truck) continue

    const isPropio   = truck.owner.type === 'PROPIO'
    const isNPROwner = truck.owner.isNPROwner
    const nprPct     = truck.owner.nprPercent / 100

    // Facturación
    const totalTons   = trips.reduce((s, t) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount = trips.reduce((s, t) => s + t.amount, 0)
    const viaticos    = trips.reduce((s, t) => s + t.viatico, 0)  // viáticos de ruta

    // Nómina chofer (suma del wage por viaje según ruta)
    const driverWage = trips.reduce((s, t) => s + (t.route?.driverWage ?? 0), 0)

    // NPR — se calcula siempre; para isNPROwner no se descuenta del neto pero se guarda
    const nprFee = grossAmount * nprPct

    // Mecánica y admin — solo PROPIO con viajes Aurumin; Luis Peña no lleva estos costos
    const tieneAurumin = propiosConAurumin.has(truckId)
    const mechanicFee = (isPropio && tieneAurumin) ? (mechanicByTruck.get(truckId) ?? 0) : 0
    const adminFee    = (isPropio && tieneAurumin) ? adminFeePerTruck : 0

    // Gastos operativos (Expense records) + viáticos de ruta
    const gastosOp = (gastosByTruck.get(truckId) ?? 0) + viaticos

    // Préstamos: match por nombre del chofer O por nombre del dueño
    // Se excluyen los préstamos en skipLoanIds (Fernando los deseleccionó en el modal)
    const skip = new Set(options.skipLoanIds ?? [])
    const driverName  = truck.driver?.name ?? ''
    const ownerName   = truck.owner.name.toLowerCase().trim()
    const driverLoans = loans.filter(l => !skip.has(l.id) && !!driverName && l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
    const ownerLoans  = loans.filter(l => {
      const lname = l.driverName.toLowerCase().trim()
      return !skip.has(l.id) && lname === ownerName && !ownerLoanApplied.has(l.id)
    })
    ownerLoans.forEach(l => ownerLoanApplied.add(l.id))
    const loanDeductions = [...driverLoans, ...ownerLoans].reduce((s, l) => s + l.deductAmount, 0)

    // Saldo inicial: negativo si debe, positivo si le deben y no pagaron
    const prev = prevByTruck.get(truckId)
    let saldoInicial = 0
    if (prev) {
      if (prev.netAmount < 0) {
        saldoInicial = prev.netAmount   // deuda que arrastra (negativo)
      } else if (!prev.paidAt) {
        saldoInicial = prev.netAmount   // positivo pendiente de pago (le deben)
      }
    }

    // Abono: se mantiene el que ya tenía si existía entrada anterior (no sobreescribir)
    // En la generación inicial = 0; Fernando lo ajusta después
    const abono = 0

    // Saldo final
    // isNPROwner (José): NPR no se descuenta del neto, solo se registra
    const netAmount = grossAmount
      - gastosOp
      - driverWage
      - (isNPROwner ? 0 : nprFee)   // José no paga NPR (es suyo)
      - mechanicFee
      - adminFee
      - loanDeductions
      + saldoInicial
      - abono

    const entry = await prisma.payrollEntry.create({
      data: {
        periodId,
        truckId,
        totalTons:    Math.round(totalTons    * 1000) / 1000,
        grossAmount:  Math.round(grossAmount  * 100)  / 100,
        viaticos:     Math.round(viaticos     * 100)  / 100,
        driverWage:   Math.round(driverWage   * 100)  / 100,
        commissionFee: Math.round(gastosOp    * 100)  / 100,  // gastosOp reutiliza commissionFee
        nprFee:       Math.round(nprFee       * 100)  / 100,
        mechanicFee:  Math.round(mechanicFee  * 100)  / 100,
        adminFee:     Math.round(adminFee     * 100)  / 100,
        deductions:   Math.round(loanDeductions * 100) / 100,
        saldoInicial: Math.round(saldoInicial * 100)  / 100,
        abono:        0,
        netAmount:    Math.round(netAmount    * 100)  / 100,
      },
    })
    created.push(entry)
  }

  revalidatePath('/nomina')
  revalidatePath(`/nomina/${periodId}`)
  return { ok: true, count: created.length }
}

// ─── Parámetros previos a generar nómina ────────────────────────────────────
export type LoanForPayroll = {
  id: string
  driverName: string
  balance: number
  deductAmount: number
  type: 'chofer' | 'dueno'
  truckId: string
  truckPlate: string
  ownerName: string
}

export type PayrollParams = {
  loans: LoanForPayroll[]
  adminFeeBase: number
  adminFeePerTruck: number
  fleetCount: number
  activeCount: number
  systemConfig: { key: string; value: string; label: string }[]
}

export async function getPayrollParams(periodId: string): Promise<PayrollParams | { error: string }> {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: {
      trips: { select: { truckId: true, route: { select: { clientName: true } } } },
    },
  })
  if (!period) return { error: 'Período no encontrado' }

  const truckIds = [...new Set(period.trips.map(t => t.truckId))]
  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    include: { driver: { select: { name: true } }, owner: { select: { name: true, type: true } } },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  // Calcular fleet/active para admin fee
  const propiosConAurumin = new Set(
    period.trips
      .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
      .filter(t => truckMap.get(t.truckId)?.owner.type === 'PROPIO')
      .map(t => t.truckId)
  )
  const fortyFiveDaysAgo = new Date(period.startDate.getTime() - 45 * 24 * 60 * 60 * 1000)
  const fleetCount = await prisma.truck.count({
    where: {
      active: true,
      owner: { type: 'PROPIO' },
      trips: { some: { date: { gte: fortyFiveDaysAgo }, route: { clientName: { not: 'LUIS PEÑA' } } } },
    },
  })
  const adminFeeBase = await getConfigValue('adminFeePerTruck')
  const activeCount = propiosConAurumin.size
  const adminFeePerTruck = activeCount > 0 ? (adminFeeBase * fleetCount) / activeCount : 0

  // Préstamos activos y a cuál camión se asignan
  const allLoans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } })
  const loans: LoanForPayroll[] = []
  const ownerLoanApplied = new Set<string>()

  for (const truck of trucks) {
    const driverName = truck.driver?.name ?? ''
    const ownerName  = truck.owner.name.toLowerCase().trim()

    if (driverName) {
      for (const l of allLoans.filter(l => l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())) {
        loans.push({ id: l.id, driverName: l.driverName, balance: l.balance, deductAmount: l.deductAmount, type: 'chofer', truckId: truck.id, truckPlate: truck.plate, ownerName: truck.owner.name })
      }
    }
    for (const l of allLoans.filter(l => l.driverName.toLowerCase().trim() === ownerName && !ownerLoanApplied.has(l.id))) {
      ownerLoanApplied.add(l.id)
      loans.push({ id: l.id, driverName: l.driverName, balance: l.balance, deductAmount: l.deductAmount, type: 'dueno', truckId: truck.id, truckPlate: truck.plate, ownerName: truck.owner.name })
    }
  }

  const systemConfig = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } })

  return { loans, adminFeeBase, adminFeePerTruck, fleetCount, activeCount, systemConfig }
}

// ─── Actualizar abono de un camión (Fernando lo entra antes de cerrar) ────────
export async function updatePayrollAbono(entryId: string, abono: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId } })
  if (!entry) return { error: 'Entrada no encontrada' }

  const truck = await prisma.truck.findUnique({
    where: { id: entry.truckId },
    include: { owner: { select: { isNPROwner: true } } },
  })
  const isNPROwner = truck?.owner?.isNPROwner ?? false

  const netAmount = entry.grossAmount
    - entry.commissionFee
    - entry.driverWage
    - (isNPROwner ? 0 : (entry.nprFee ?? 0))
    - (entry.mechanicFee ?? 0)
    - (entry.adminFee ?? 0)
    - entry.deductions
    + (entry.saldoInicial ?? 0)
    - abono

  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: {
      abono:     Math.round(abono * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
    },
  })

  revalidatePath(`/nomina/${entry.periodId}`)
  return { ok: true }
}

// ─── Cerrar período — crea CashEntry para carros negativos ────────────────────
export async function closePeriod(periodId: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const [entries, period] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId },
      include: { period: { select: { endDate: true } } },
    }),
    prisma.period.findUnique({
      where: { id: periodId },
      select: {
        startDate: true,
        endDate:   true,
        trips: { select: { amount: true, route: { select: { clientName: true } } } },
      },
    }),
  ])

  if (entries.length === 0) return { error: 'Genera la nómina antes de cerrar el período' }
  if (!period) return { error: 'Período no encontrado' }

  // Carros con saldo negativo → préstamo de caja chica
  const negativos = entries.filter(e => e.netAmount < 0 && !e.cashEntryId)

  for (const entry of negativos) {
    const truck = await prisma.truck.findUnique({
      where: { id: entry.truckId },
      select: { plate: true, owner: { select: { name: true } } },
    })

    const cashEntry = await prisma.cashEntry.create({
      data: {
        type:     'EGRESO',
        currency: 'EFECTIVO',
        amount:   Math.abs(entry.netAmount),
        concept:  `Préstamo CC — ${truck?.plate ?? entry.truckId} (${truck?.owner?.name ?? ''})`,
        source:   'NOMINA',
        notes:    `Período ${entry.period.endDate.toISOString().split('T')[0]} — carro quedó en negativo`,
        truckId:  entry.truckId,
      },
    })

    await prisma.payrollEntry.update({
      where: { id: entry.id },
      data: { cashEntryId: cashEntry.id },
    })
  }

  // Auto-crear CxC por cliente
  const fmtD = (d: Date) =>
    new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  const periodLabel = `${fmtD(period.startDate)} al ${fmtD(period.endDate)}`

  const grossAurumin  = period.trips
    .filter(t => (t.route as any)?.clientName !== 'LUIS PEÑA')
    .reduce((s, t) => s + t.amount, 0)
  const grossLuisPena = period.trips
    .filter(t => (t.route as any)?.clientName === 'LUIS PEÑA')
    .reduce((s, t) => s + t.amount, 0)

  const cxcCreadas: string[] = []
  for (const [clientName, gross] of [['AURUMIN', grossAurumin], ['LUIS PEÑA', grossLuisPena]] as const) {
    if (gross <= 0) continue
    const existing = await prisma.cuentaPorCobrar.findFirst({ where: { clientName, periodLabel } })
    if (existing) continue
    await prisma.cuentaPorCobrar.create({
      data: {
        clientName,
        concept:     `Facturación ${periodLabel}`,
        periodLabel,
        date:        period.endDate,
        totalAmount: gross,
        amountPaid:  0,
        balance:     gross,
        status:      'PENDING',
      },
    })
    cxcCreadas.push(clientName)
  }

  await prisma.period.update({
    where: { id: periodId },
    data: { status: 'CLOSED' },
  })

  revalidatePath('/nomina')
  revalidatePath(`/nomina/${periodId}`)
  revalidatePath('/caja')
  revalidatePath('/cuentas-por-cobrar')
  revalidatePath('/reportes/deuda')
  return { ok: true, prestamos: negativos.length, cxcCreadas }
}

// ─── Reabrir período ───────────────────────────────────────────────────────────
export async function reopenPeriod(periodId: string) {
  const session = await getSession()
  if (!session || session.role !== 'DUENO') {
    return { error: 'Solo el dueño puede reabrir períodos' }
  }

  await prisma.period.update({
    where: { id: periodId },
    data: { status: 'OPEN' },
  })

  revalidatePath('/nomina')
  return { ok: true }
}

// ─── Marcar un camión como pagado ────────────────────────────────────────────
export async function markPayrollEntryPaid(id: string, paymentMethod: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const entry = await prisma.payrollEntry.findUnique({ where: { id } })
  if (!entry) return { error: 'Entrada no encontrada' }

  await prisma.payrollEntry.update({
    where: { id },
    data: { paidAt: new Date(), paymentMethod },
  })

  revalidatePath(`/nomina/${entry.periodId}`)
  revalidatePath('/nomina/duenos')
  return { ok: true }
}

// ─── Registrar abono Aurumin (pago parcial contra saldo acumulado) ────────────
export async function recordAbonoAurumin(id: string, amount: number) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }
  if (amount <= 0) return { error: 'Monto inválido' }

  const entry = await prisma.payrollEntry.findUnique({ where: { id } })
  if (!entry) return { error: 'Entrada no encontrada' }

  await prisma.payrollEntry.update({
    where: { id },
    data: { abono: { increment: amount } },
  })

  revalidatePath('/nomina/duenos')
  revalidatePath(`/nomina/${entry.periodId}`)
  return { ok: true }
}

// ─── Marcar todos los camiones del período como pagados ───────────────────────
export async function markAllPeriodPaid(periodId: string, paymentMethod: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.payrollEntry.updateMany({
    where: { periodId, paidAt: null },
    data: { paidAt: new Date(), paymentMethod },
  })

  revalidatePath(`/nomina/${periodId}`)
  return { ok: true }
}

// ─── Ajustar deducción manual ────────────────────────────────────────────────
export async function updatePayrollEntry(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const deductions = parseFloat(formData.get('deductions') as string) || 0
  const notes      = formData.get('notes') as string

  const entry = await prisma.payrollEntry.findUnique({ where: { id } })
  if (!entry) return { error: 'Entrada no encontrada' }

  const truck = await prisma.truck.findUnique({
    where: { id: entry.truckId },
    include: { owner: { select: { isNPROwner: true } } },
  })
  const isNPROwner = truck?.owner?.isNPROwner ?? false

  const netAmount = entry.grossAmount
    - entry.commissionFee
    - entry.driverWage
    - (isNPROwner ? 0 : (entry.nprFee ?? 0))
    - (entry.mechanicFee ?? 0)
    - (entry.adminFee ?? 0)
    - deductions
    + (entry.saldoInicial ?? 0)
    - (entry.abono ?? 0)

  await prisma.payrollEntry.update({
    where: { id },
    data: { deductions: Math.round(deductions * 100) / 100, netAmount: Math.round(netAmount * 100) / 100, notes },
  })

  revalidatePath(`/nomina/${entry.periodId}`)
  return { ok: true }
}
