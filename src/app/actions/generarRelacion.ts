'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type EstadoCuentaRow = {
  periodLabel: string
  fecha: string
  total: number
  abono: number
  saldo: number
}

export type RelacionTrip = {
  tripId: string
  date: string
  ticketNo: string | null
  plate: string
  conductor: string
  netWeightKg: number | null
  amount: number
}

export type RelacionPreview = {
  client: string
  destinatario: 'EMPRESA' | 'JOSE'
  startDate: string
  endDate: string
  periodLabel: string
  byRoute: {
    routeName: string
    rateType: string
    rate: number
    unit: string
    quantity: number   // tons or trips
    amount: number
    trips: RelacionTrip[]
  }[]
  totalFacturado: number
  acumulado: number
  subTotal: number
  relationNo: string
  estadoCuenta: EstadoCuentaRow[]
  negativeTrucks: { plate: string; netAmount: number }[]
}

// Rutas que pertenecen a cada cliente
const AURUMIN_ROUTES = ['FOSFORITO', 'CHARLIE RICHARD', 'SOSA MENDEZ', 'LAS CLARITAS (SAN LUIS)', 'LA GARRAPATA', 'CH.R. - RUBEN MARIN', 'DIAS INTERNOS', 'MACKENCI', 'POZO AURUVEN', 'ROSCIO SUR']
const CHINO_ROUTES   = ['LA FE', 'NUEVO CALLAO']

export async function previewRelacion(client: string, startDate: string, endDate: string, destinatario: 'EMPRESA' | 'JOSE' = 'JOSE') {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate + 'T00:00:00')
  end.setHours(23, 59, 59, 999)

  const routeNames = client === 'AURUMIN' ? AURUMIN_ROUTES : CHINO_ROUTES

  const trips = await prisma.trip.findMany({
    where: {
      date: { gte: start, lte: end },
      route: { name: { in: routeNames } },
    },
    include: {
      route: true,
      truck: { include: { driver: { select: { name: true } } } },
    },
    orderBy: [{ route: { name: 'asc' } }, { date: 'asc' }],
  })

  // Group by route
  const routeMap = new Map<string, RelacionPreview['byRoute'][0]>()
  for (const trip of trips) {
    const key = trip.route.name
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        routeName: key,
        rateType: trip.route.rateType,
        rate: trip.route.rate,
        unit: trip.route.rateType === 'PER_TON' ? 'Ton' : 'Viaje',
        quantity: 0,
        amount: 0,
        trips: [],
      })
    }
    const entry = routeMap.get(key)!
    const qty = trip.route.rateType === 'PER_TON'
      ? (trip.netWeightKg ?? 0) / 1000
      : 1
    entry.quantity += qty
    entry.amount   += trip.amount
    entry.trips.push({
      tripId:      trip.id,
      date:        trip.date.toISOString(),
      ticketNo:    trip.ticketNo,
      plate:       trip.truck.plate,
      conductor:   trip.truck.driver?.name ?? '—',
      netWeightKg: trip.netWeightKg,
      amount:      trip.amount,
    })
  }

  const byRoute = Array.from(routeMap.values())
  const totalFacturado = byRoute.reduce((s, r) => s + r.amount, 0)

  // Acumulado: saldo pendiente de relaciones anteriores del mismo cliente
  const acumuladoAgg = await prisma.cuentaPorCobrar.aggregate({
    where: {
      clientName: client,
      status: { not: 'PAID' },
      date: { lt: start },
    },
    _sum: { balance: true },
  })
  const acumulado = acumuladoAgg._sum.balance ?? 0

  // Número de relación: cuántas relaciones tiene este cliente + 1
  const count = await prisma.cuentaPorCobrar.count({ where: { clientName: client } })
  const relationNo = `R-${count + 1}`

  // Camiones en negativo: períodos que se solapan con el rango seleccionado
  const negEntries = await prisma.payrollEntry.findMany({
    where: {
      netAmount: { lt: 0 },
      period: { startDate: { lte: end }, endDate: { gte: start } },
    },
  })
  const negTruckIds = [...new Set(negEntries.map(e => e.truckId))]
  const negTrucks = negTruckIds.length > 0
    ? await prisma.truck.findMany({ where: { id: { in: negTruckIds } }, select: { id: true, plate: true } })
    : []
  const negPlateMap = new Map(negTrucks.map(t => [t.id, t.plate]))
  const negativeTrucks = negEntries.map(e => ({
    plate: negPlateMap.get(e.truckId) ?? e.truckId,
    netAmount: e.netAmount,
  }))

  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`
  const periodLabel = `Del ${fmtDate(start)} al ${fmtDate(end)}`

  // Estado de cuenta: historial de todas las relaciones del cliente (para la empresa)
  const historial = await prisma.cuentaPorCobrar.findMany({
    where: { clientName: client },
    orderBy: { date: 'asc' },
  })

  let saldoAcumulado = 0
  const estadoCuenta: EstadoCuentaRow[] = historial.map(h => {
    saldoAcumulado += h.totalAmount - h.amountPaid
    return {
      periodLabel: h.periodLabel ?? '—',
      fecha: h.date.toISOString(),
      total: h.totalAmount,
      abono: h.amountPaid,
      saldo: Math.round(saldoAcumulado * 100) / 100,
    }
  })

  return {
    client,
    destinatario,
    startDate,
    endDate,
    periodLabel,
    byRoute,
    totalFacturado: Math.round(totalFacturado * 100) / 100,
    acumulado:      Math.round(acumulado * 100) / 100,
    subTotal:       Math.round((totalFacturado + acumulado) * 100) / 100,
    relationNo,
    estadoCuenta,
    negativeTrucks,
  } satisfies RelacionPreview
}

export async function updateTripInline(
  tripId: string,
  data: { ticketNo?: string; netWeightKg?: number; amount?: number },
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { route: true },
  })
  if (!trip) return { error: 'Viaje no encontrado' }

  // Recalcular monto si cambia el peso en rutas PER_TON
  let amount = data.amount ?? trip.amount
  if (data.netWeightKg !== undefined && trip.route.rateType === 'PER_TON') {
    amount = Math.round((data.netWeightKg / 1000) * trip.route.rate * 100) / 100
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      ticketNo:    data.ticketNo    ?? trip.ticketNo,
      netWeightKg: data.netWeightKg ?? trip.netWeightKg,
      amount,
    },
  })

  revalidatePath('/relaciones')
  revalidatePath('/viajes')
  return { ok: true }
}

export async function registrarRelacion(
  preview: RelacionPreview,
  abono: number,
) {
  const saldo = Math.max(0, preview.subTotal - abono)
  const status = saldo <= 0 ? 'PAID' : abono > 0 ? 'PARTIAL' : 'PENDING'
  const concept = preview.client === 'AURUMIN'
    ? `Relación ${preview.relationNo} — Planta Aurumin`
    : `Relación ${preview.relationNo} — La Fe / Nuevo Callao`

  await prisma.cuentaPorCobrar.create({
    data: {
      clientName:  preview.client,
      concept,
      periodLabel: preview.periodLabel,
      date:        new Date(preview.endDate),
      totalAmount: preview.subTotal,
      amountPaid:  abono,
      balance:     saldo,
      status:      status as 'PAID' | 'PARTIAL' | 'PENDING',
      notes:       `Facturado: $${preview.totalFacturado} | Acumulado: $${preview.acumulado}`,
    },
  })

  revalidatePath('/relaciones')
  revalidatePath('/cuentas-por-cobrar')
  return { ok: true }
}
