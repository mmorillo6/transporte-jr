'use server'
import { prisma } from '@/lib/prisma'

export type ClientStats = {
  clientName:   string
  trips:        number
  tons:         number
  billing:      number
  nprFee:       number   // billing × nprPercent/100
  driverShare:  number   // (billing - nprFee) × 0.20 para afiliados; 0 para propios
}

export type TruckAnalysis = {
  truckId:      string
  plate:        string
  driverName:   string
  byClient:     ClientStats[]
  totalBilling: number
  // Deducciones de nómina (del PayrollEntry — solo propios)
  driverWage:   number
  nprFee:       number
  mechanicFee:  number
  adminFee:     number
  deductions:   number
  netAmount:    number
  // Préstamos
  loans:        number
}

export type OwnerAnalysis = {
  owner: {
    id:         string
    name:       string
    type:       string
    nprPercent: number
  }
  trucks:           TruckAnalysis[]
  totalBilling:     number
  totalByClient:    ClientStats[]
  totalNet:         number
  totalLoans:       number
  periodLabel:      string
}

export async function getOwnerAnalysis(
  ownerId: string,
  periodId: string,
): Promise<OwnerAnalysis | null> {
  const [owner, period] = await Promise.all([
    prisma.owner.findUnique({
      where: { id: ownerId },
      include: {
        trucks: {
          where: { active: true },
          include: { driver: { select: { name: true } } },
          orderBy: { plate: 'asc' },
        },
      },
    }),
    prisma.period.findUnique({ where: { id: periodId } }),
  ])
  if (!owner || !period) return null

  const truckIds    = owner.trucks.map(t => t.id)
  const driverNames = owner.trucks.map(t => t.driver?.name).filter(Boolean) as string[]

  const [trips, payrollEntries, loans] = await Promise.all([
    truckIds.length > 0
      ? prisma.trip.findMany({
          where: { periodId, truckId: { in: truckIds } },
          select: {
            truckId:    true,
            amount:     true,
            netWeightKg: true,
            route: { select: { clientName: true } },
          },
        })
      : Promise.resolve([]),

    truckIds.length > 0
      ? prisma.payrollEntry.findMany({
          where: { periodId, truckId: { in: truckIds } },
        })
      : Promise.resolve([]),

    driverNames.length > 0
      ? prisma.loan.findMany({
          where: { balance: { gt: 0 }, driverName: { in: driverNames } },
          select: { balance: true, driverName: true },
        })
      : Promise.resolve([]),
  ])

  const isAfiliado = owner.type === 'AFILIADO'
  const nprPct     = owner.nprPercent / 100

  const trucksAnalysis: TruckAnalysis[] = owner.trucks.map(truck => {
    const truckTrips    = trips.filter(t => t.truckId === truck.id)
    const payrollEntry  = payrollEntries.find(e => e.truckId === truck.id)
    const truckLoans    = loans
      .filter(l => l.driverName === truck.driver?.name)
      .reduce((s, l) => s + l.balance, 0)

    // Billing por cliente
    const clientMap = new Map<string, { trips: number; tons: number; billing: number }>()
    for (const t of truckTrips) {
      const cn = t.route?.clientName ?? 'AURUMIN'
      const ex = clientMap.get(cn) ?? { trips: 0, tons: 0, billing: 0 }
      clientMap.set(cn, {
        trips:   ex.trips + 1,
        tons:    ex.tons + (t.netWeightKg ?? 0) / 1000,
        billing: ex.billing + (t.amount ?? 0),
      })
    }

    const byClient: ClientStats[] = Array.from(clientMap.entries()).map(([cn, d]) => {
      const nprFee    = Math.round(d.billing * nprPct * 100) / 100
      const driverShare = isAfiliado
        ? Math.round((d.billing - nprFee) * 0.20 * 100) / 100
        : 0
      return {
        clientName:  cn,
        trips:       d.trips,
        tons:        Math.round(d.tons * 100) / 100,
        billing:     Math.round(d.billing * 100) / 100,
        nprFee,
        driverShare,
      }
    }).sort((a, b) => b.billing - a.billing)

    const totalBilling = byClient.reduce((s, c) => s + c.billing, 0)

    return {
      truckId:      truck.id,
      plate:        truck.plate,
      driverName:   truck.driver?.name ?? '—',
      byClient,
      totalBilling: Math.round(totalBilling * 100) / 100,
      driverWage:   payrollEntry?.driverWage   ?? 0,
      nprFee:       payrollEntry?.nprFee       ?? 0,
      mechanicFee:  payrollEntry?.mechanicFee  ?? 0,
      adminFee:     payrollEntry?.adminFee     ?? 0,
      deductions:   payrollEntry?.deductions   ?? 0,
      netAmount:    payrollEntry?.netAmount     ?? 0,
      loans:        Math.round(truckLoans * 100) / 100,
    }
  })

  // Totales por cliente (todos los camiones del dueño)
  const totalClientMap = new Map<string, ClientStats>()
  for (const truck of trucksAnalysis) {
    for (const c of truck.byClient) {
      const ex = totalClientMap.get(c.clientName) ?? {
        clientName: c.clientName, trips: 0, tons: 0,
        billing: 0, nprFee: 0, driverShare: 0,
      }
      totalClientMap.set(c.clientName, {
        clientName:  c.clientName,
        trips:       ex.trips       + c.trips,
        tons:        Math.round((ex.tons + c.tons) * 100) / 100,
        billing:     Math.round((ex.billing + c.billing) * 100) / 100,
        nprFee:      Math.round((ex.nprFee + c.nprFee) * 100) / 100,
        driverShare: Math.round((ex.driverShare + c.driverShare) * 100) / 100,
      })
    }
  }

  const totalBilling = trucksAnalysis.reduce((s, t) => s + t.totalBilling, 0)
  const totalNet     = trucksAnalysis.reduce((s, t) => s + t.netAmount, 0)
  const totalLoans   = trucksAnalysis.reduce((s, t) => s + t.loans, 0)

  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return {
    owner:         { id: owner.id, name: owner.name, type: owner.type, nprPercent: owner.nprPercent },
    trucks:        trucksAnalysis,
    totalBilling:  Math.round(totalBilling * 100) / 100,
    totalByClient: Array.from(totalClientMap.values()).sort((a, b) => b.billing - a.billing),
    totalNet:      Math.round(totalNet * 100) / 100,
    totalLoans:    Math.round(totalLoans * 100) / 100,
    periodLabel:   `${fmt(period.startDate)} al ${fmt(period.endDate)}`,
  }
}

export type OwnerSummaryRow = {
  ownerId:      string
  ownerName:    string
  ownerType:    string
  aurumin:      number
  chinoPane:    number
  otherClients: number
  saldoAnterior: number
  netAmount:    number
}

export async function getAllOwnersSummary(periodId: string): Promise<OwnerSummaryRow[]> {
  const period = await prisma.period.findUnique({ where: { id: periodId } })
  if (!period) return []

  const [owners, trips, payrollEntries, diasRoute, diasEntries] = await Promise.all([
    prisma.owner.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.trip.findMany({
      where: { periodId },
      select: {
        amount:  true,
        truckId: true,
        route:   { select: { clientName: true } },
        truck:   { select: { ownerId: true } },
      },
    }),
    prisma.payrollEntry.findMany({
      where: { periodId },
      select: { truckId: true, netAmount: true, saldoInicial: true, truck: { select: { ownerId: true } } },
    }),
    prisma.route.findFirst({ where: { name: { contains: 'DIAS INTERNOS' }, clientName: 'AURUMIN' }, select: { rate: true } }),
    prisma.diasInternosEntry.findMany({
      where: { fecha: { gte: period.startDate, lte: period.endDate } },
      select: { totalHoras: true, truckId: true, truck: { select: { ownerId: true } } },
    }),
  ])

  const diasRate = diasRoute?.rate ?? 20

  return owners.map(owner => {
    const ownerTrips   = trips.filter(t => t.truck.ownerId === owner.id)
    const ownerEntries = payrollEntries.filter(e => e.truck.ownerId === owner.id)
    const ownerDias    = diasEntries.filter((d: any) => d.truck.ownerId === owner.id)

    let aurumin = 0, chinoPane = 0, otherClients = 0
    for (const t of ownerTrips) {
      const cn = t.route?.clientName ?? 'AURUMIN'
      if (cn === 'AURUMIN')         aurumin      += t.amount
      else if (cn === 'LUIS PEÑA')  chinoPane    += t.amount
      else                          otherClients += t.amount
    }

    // DiasInternos se facturan a Aurumin
    const diasTotal = ownerDias.reduce((s: number, d: any) => s + d.totalHoras * diasRate, 0)
    aurumin += diasTotal

    const saldoAnterior = ownerEntries.reduce((s, e) => s + (e.saldoInicial ?? 0), 0)
    const netAmount     = ownerEntries.reduce((s, e) => s + e.netAmount, 0)

    return {
      ownerId:       owner.id,
      ownerName:     owner.name,
      ownerType:     owner.type,
      aurumin:       Math.round(aurumin      * 100) / 100,
      chinoPane:     Math.round(chinoPane    * 100) / 100,
      otherClients:  Math.round(otherClients * 100) / 100,
      saldoAnterior: Math.round(saldoAnterior * 100) / 100,
      netAmount:     Math.round(netAmount    * 100) / 100,
    }
  }).filter(r => r.aurumin > 0 || r.chinoPane > 0 || r.netAmount !== 0)
}

export async function getOwnersAndPeriods() {
  const [owners, periods] = await Promise.all([
    prisma.owner.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.period.findMany({
      orderBy: { startDate: 'desc' },
      take: 12,
      select: { id: true, startDate: true, endDate: true, status: true },
    }),
  ])
  return { owners, periods }
}
