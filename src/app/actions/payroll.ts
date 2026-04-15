'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

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

export async function generatePayroll(periodId: string) {
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
          route: { select: { driverWage: true, name: true } },
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

  // ── Admin fee ────────────────────────────────────────────────────────────────
  // Pool = $50 × total carros PROPIO activos en la flota
  // Cada carro PROPIO activo este período paga: pool ÷ carros_activos_este_período
  const totalPropioFlota = await prisma.truck.count({
    where: { active: true, owner: { type: 'PROPIO' } },
  })
  const activePropioThisPeriod = trucks.filter(t => t.owner.type === 'PROPIO').length
  const adminPool = 50 * totalPropioFlota
  const adminFeePerTruck = activePropioThisPeriod > 0 ? adminPool / activePropioThisPeriod : 0

  // ── Mecánica por camión ───────────────────────────────────────────────────────
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

  // ── Préstamos por conductor ───────────────────────────────────────────────────
  const loans = await prisma.loan.findMany({ where: { balance: { gt: 0 } } })

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
    const isNPROner  = truck.owner.isNPROwner
    const nprPct     = truck.owner.nprPercent / 100

    // Facturación
    const totalTons   = trips.reduce((s, t) => s + (t.netWeightKg ?? 0) / 1000, 0)
    const grossAmount = trips.reduce((s, t) => s + t.amount, 0)
    const viaticos    = trips.reduce((s, t) => s + t.viatico, 0)  // viáticos de ruta

    // Nómina chofer (suma del wage por viaje según ruta)
    const driverWage = trips.reduce((s, t) => s + (t.route?.driverWage ?? 0), 0)

    // NPR — se calcula siempre; para isNPROwner no se descuenta del neto pero se guarda
    const nprFee = grossAmount * nprPct

    // Mecánica — solo PROPIO; AFILIADO paga por su cuenta
    const mechanicFee = isPropio ? (mechanicByTruck.get(truckId) ?? 0) : 0

    // Admin — solo PROPIO
    const adminFee = isPropio ? adminFeePerTruck : 0

    // Gastos operativos (Expense records) + viáticos de ruta
    const gastosOp = (gastosByTruck.get(truckId) ?? 0) + viaticos

    // Préstamos
    const driverName    = truck.driver?.name ?? ''
    const loanDeductions = loans
      .filter(l => l.driverName.toLowerCase().trim() === driverName.toLowerCase().trim())
      .reduce((s, l) => s + l.deductAmount, 0)

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
      - (isNPROner ? 0 : nprFee)   // José no paga NPR (es suyo)
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

  const entries = await prisma.payrollEntry.findMany({
    where: { periodId },
    include: {
      period: { select: { endDate: true } },
    },
  })
  if (entries.length === 0) return { error: 'Genera la nómina antes de cerrar el período' }

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

  await prisma.period.update({
    where: { id: periodId },
    data: { status: 'CLOSED' },
  })

  revalidatePath('/nomina')
  revalidatePath(`/nomina/${periodId}`)
  revalidatePath('/caja')
  return { ok: true, prestamos: negativos.length }
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
