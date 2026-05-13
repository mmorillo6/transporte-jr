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

// Nombre del clientName en DB para cada cliente
const CLIENT_NAME_MAP: Record<string, string> = {
  'AURUMIN':               'AURUMIN',
  'CHINO PEÑA (LUIS PEÑA)': 'LUIS PEÑA',
}

export async function previewRelacion(client: string, startDate: string, endDate: string, destinatario: 'EMPRESA' | 'JOSE' = 'JOSE') {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate + 'T00:00:00')
  end.setHours(23, 59, 59, 999)

  const clientName = CLIENT_NAME_MAP[client] ?? client

  const trips = await prisma.trip.findMany({
    where: {
      date: { gte: start, lte: end },
      route: { clientName },
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

  // DIAS INTERNOS: usar registros manuales de DiasInternosEntry (fuente de verdad)
  // Los trips de la romana se ignoran para billing; solo los registros manuales cuentan
  const diasInternosEntries = await prisma.diasInternosEntry.findMany({
    where: { fecha: { gte: start, lte: end } },
    include: { truck: { select: { plate: true, driver: { select: { name: true } } } } },
    orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
  })
  const totalHorasManual = diasInternosEntries.reduce((s, e) => s + e.totalHoras, 0)

  for (const entry of routeMap.values()) {
    if (entry.routeName.toUpperCase().includes('DIAS INTERNOS')) {
      // Representar cada registro manual como un "trip" en el detalle
      entry.trips = diasInternosEntries.map(e => ({
        tripId:      e.id,
        date:        e.fecha.toISOString(),
        ticketNo:    `${e.horaInicio}–${e.horaFin}`,
        plate:       e.truck.plate,
        conductor:   e.truck.driver?.name ?? e.conductor,
        netWeightKg: null,
        amount:      Math.round(e.totalHoras * entry.rate * 100) / 100,
      }))
      entry.quantity = Math.round(totalHorasManual * 100) / 100
      entry.amount   = Math.round(totalHorasManual * entry.rate * 100) / 100
      entry.unit     = 'Hora'
    }
  }

  // Si hay entradas manuales pero no hay trips de romana, crear la entrada DIAS INTERNOS
  if (totalHorasManual > 0 && !Array.from(routeMap.keys()).some(k => k.toUpperCase().includes('DIAS INTERNOS'))) {
    const diasRoute = await prisma.route.findFirst({
      where: { name: { contains: 'DIAS INTERNOS' }, clientName },
    })
    if (diasRoute) {
      routeMap.set(diasRoute.name, {
        routeName: diasRoute.name,
        rateType:  diasRoute.rateType,
        rate:      diasRoute.rate,
        unit:      'Hora',
        quantity:  Math.round(totalHorasManual * 100) / 100,
        amount:    Math.round(totalHorasManual * diasRoute.rate * 100) / 100,
        trips:     diasInternosEntries.map(e => ({
          tripId:      e.id,
          date:        e.fecha.toISOString(),
          ticketNo:    `${e.horaInicio}–${e.horaFin}`,
          plate:       e.truck.plate,
          conductor:   e.truck.driver?.name ?? e.conductor,
          netWeightKg: null,
          amount:      Math.round(e.totalHoras * diasRoute.rate * 100) / 100,
        })),
      })
    }
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
  revalidatePath('/nomina')
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
