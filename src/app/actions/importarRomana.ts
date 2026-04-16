'use server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type RomanaTrip = {
  ticketNo: string
  date: string
  procedencia: string
  proveedor: string
  conductor: string
  plate: string
  material: string
  netWeightKg: number
  // Resolved
  routeName: string
  routeId: string
  rateType: string
  rate: number
  amount: number
  clientLabel: string
  truckId: string | null
  driverId: string | null
  duplicate: boolean
}

export type RomanaPreview = {
  period: string
  totalTrips: number
  byClient: {
    client: string
    routes: { name: string; trips: number; tons: number; amount: number }[]
    totalTrips: number
    totalTons: number
    totalAmount: number
  }[]
  trips: RomanaTrip[]
  duplicates: number
  newTrips: number
  /** true when ≥70% of tickets in this file already exist — likely a re-upload */
  likelyAlreadyImported: boolean
  /** Camiones registrados en el sistema, para el remapeo de placas erróneas */
  registeredTrucks: { id: string; plate: string }[]
}

// Mapa PROVEEDOR → nombre de ruta en el sistema
const PROVEEDOR_TO_ROUTE: Record<string, string> = {
  'OPERACIONES DEL CENTRO': 'NUEVO CALLAO',   // Chino Peña
  'SOSA MENDEZ':            'SOSA MENDEZ',
  'FOSFORITO':              'FOSFORITO',
  'CHARLIE RICHARD':        'CHARLIE RICHARD',
  'LA GARRAPATA':           'LA GARRAPATA',
  'ROSCIO SUR':             'ROSCIO SUR',
  'MACKENCI':               'MACKENCI',
  'CH.R. - RUBEN MARIN':   'CH.R. - RUBEN MARIN',
  'LAS CLARITAS':           'LAS CLARITAS (SAN LUIS)',
}

// Si proveedor es Operaciones del Centro, procedencia LA FE → ruta LA FE
function resolveRoute(proveedor: string, procedencia: string): string {
  const prov = proveedor.trim().toUpperCase()
  const proc = procedencia.trim().toUpperCase()
  if (prov === 'OPERACIONES DEL CENTRO') {
    return proc.includes('FE') ? 'LA FE' : 'NUEVO CALLAO'
  }
  return PROVEEDOR_TO_ROUTE[prov] ?? prov
}

function clientOf(proveedor: string): string {
  const prov = proveedor.trim().toUpperCase()
  return prov === 'OPERACIONES DEL CENTRO' ? 'CHINO PEÑA (LUIS PEÑA)' : 'AURUMIN'
}

function excelDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000)
}

// Detecta el índice de una columna buscando palabras clave en la fila de cabecera
function colIdx(headers: (string | number)[], ...keywords: string[]): number {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => String(h).toUpperCase().includes(kw.toUpperCase()))
    if (idx !== -1) return idx
  }
  return -1
}

export async function parseRomana(base64: string): Promise<RomanaPreview> {
  const XLSX = await import('xlsx')
  const buf  = Buffer.from(base64, 'base64')
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][]

  // Encontrar la fila de cabecera (tiene PLACA)
  let headerRowIdx = -1
  for (let i = 0; i < 30; i++) {
    if (rows[i]?.some(c => String(c).toUpperCase().includes('PLACA'))) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx === -1) throw new Error('No se encontró la cabecera del archivo. Verifica que sea el Excel correcto de la romana.')

  const headers = rows[headerRowIdx]

  // Detectar columnas por nombre
  const iTicket     = colIdx(headers, 'CODI', 'CODIGO', 'TICKET', 'N°', 'NO.', 'NUM')
  const iFecha      = colIdx(headers, 'FECHA', 'DATE', 'DIA')
  const iProcedencia= colIdx(headers, 'PROCEDENCIA', 'PROC', 'ORIGEN', 'MINA')
  const iProveedor  = colIdx(headers, 'PROVEEDOR', 'EMPRESA', 'TRANSPORTE')
  const iConductor  = colIdx(headers, 'CONDUCTOR', 'CHOFER', 'OPERADOR')
  const iPlaca      = colIdx(headers, 'PLACA', 'VEHICULO', 'UNIDAD')
  const iMaterial   = colIdx(headers, 'MATERIAL', 'MAT', 'TIPO')
  const iNetoKg     = colIdx(headers, 'NETO', 'PESO N', 'NET')

  // Fallback a índices históricos si no encuentra por nombre
  const COL = {
    ticket:      iTicket      !== -1 ? iTicket      : 4,
    fecha:       iFecha       !== -1 ? iFecha       : 5,
    procedencia: iProcedencia !== -1 ? iProcedencia : 7,
    proveedor:   iProveedor   !== -1 ? iProveedor   : 10,
    conductor:   iConductor   !== -1 ? iConductor   : 13,
    placa:       iPlaca       !== -1 ? iPlaca       : 15,
    material:    iMaterial    !== -1 ? iMaterial    : 16,
    netoKg:      iNetoKg      !== -1 ? iNetoKg      : 20,
  }

  // Load routes and trucks from DB
  const [routes, trucks, existingTickets] = await Promise.all([
    prisma.route.findMany({ where: { active: true } }),
    prisma.truck.findMany({ include: { driver: { select: { id: true, name: true } } } }),
    prisma.trip.findMany({ select: { ticketNo: true }, where: { ticketNo: { not: null } } }),
  ])

  const routeMap = new Map(routes.map(r => [r.name.toUpperCase(), r]))
  const truckMap = new Map(trucks.map(t => [t.plate.toUpperCase(), t]))
  const ticketSet = new Set(existingTickets.map(t => t.ticketNo))

  const trips: RomanaTrip[] = []
  let dateMin = '', dateMax = ''

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const codi = r[COL.ticket]
    // Aceptar ticket numérico o texto, siempre que tenga valor
    if (!codi && codi !== 0) continue
    const ticketNo = String(codi).trim()
    if (!ticketNo) continue

    const dateSerial  = r[COL.fecha]
    const procedencia = String(r[COL.procedencia] ?? '').trim()
    const proveedor   = String(r[COL.proveedor]   ?? '').trim()
    const conductor   = String(r[COL.conductor]   ?? '').trim()
    const plate       = String(r[COL.placa]       ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const material    = String(r[COL.material]    ?? '').trim()
    const netoKg      = typeof r[COL.netoKg] === 'number' ? r[COL.netoKg] as number : 0

    if (!procedencia || !proveedor || !plate) continue

    const routeName = resolveRoute(proveedor, procedencia)
    const route     = routeMap.get(routeName.toUpperCase())
    if (!route) continue

    const date     = typeof dateSerial === 'number' ? excelDate(dateSerial) : new Date(String(dateSerial))
    if (isNaN(date.getTime())) continue
    const dateStr  = date.toISOString()
    const dateKey  = date.toISOString().slice(0, 10)
    if (!dateMin || dateKey < dateMin) dateMin = dateKey
    if (!dateMax || dateKey > dateMax) dateMax = dateKey

    const tons   = netoKg / 1000
    const amount = route.rateType === 'PER_TON'
      ? Math.round(tons * route.rate * 100) / 100
      : route.rate

    const truck    = truckMap.get(plate)
    const truckId  = truck?.id ?? null
    const driverId = truck?.driver?.id ?? null

    trips.push({
      ticketNo,
      date: dateStr,
      procedencia,
      proveedor,
      conductor,
      plate,
      material,
      netWeightKg: netoKg,
      routeName: route.name,
      routeId: route.id,
      rateType: route.rateType,
      rate: route.rate,
      amount,
      clientLabel: clientOf(proveedor),
      truckId,
      driverId,
      duplicate: ticketSet.has(ticketNo),
    })
  }

  // Group by client
  const clientMap = new Map<string, Map<string, { trips: number; tons: number; amount: number }>>()
  for (const t of trips) {
    if (!clientMap.has(t.clientLabel)) clientMap.set(t.clientLabel, new Map())
    const rm = clientMap.get(t.clientLabel)!
    if (!rm.has(t.routeName)) rm.set(t.routeName, { trips: 0, tons: 0, amount: 0 })
    const entry = rm.get(t.routeName)!
    entry.trips++
    entry.tons   += t.netWeightKg / 1000
    entry.amount += t.amount
  }

  const byClient = Array.from(clientMap.entries()).map(([client, routeMap]) => {
    const routes = Array.from(routeMap.entries()).map(([name, d]) => ({
      name,
      trips: d.trips,
      tons: Math.round(d.tons * 100) / 100,
      amount: Math.round(d.amount * 100) / 100,
    }))
    return {
      client,
      routes,
      totalTrips:  routes.reduce((s, r) => s + r.trips, 0),
      totalTons:   Math.round(routes.reduce((s, r) => s + r.tons, 0) * 100) / 100,
      totalAmount: Math.round(routes.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    }
  })

  const duplicates = trips.filter(t => t.duplicate).length
  const likelyAlreadyImported = trips.length > 0 && (duplicates / trips.length) >= 0.7

  return {
    period: `${dateMin} al ${dateMax}`,
    totalTrips: trips.length,
    byClient,
    trips,
    duplicates,
    newTrips: trips.filter(t => !t.duplicate).length,
    likelyAlreadyImported,
    registeredTrucks: trucks.map(t => ({ id: t.id, plate: t.plate })).sort((a, b) => a.plate.localeCompare(b.plate)),
  }
}

export async function confirmarImport(trips: RomanaTrip[], openPeriodId?: string) {
  // Only new, truck-matched trips; deduplicate ticketNo within the batch
  const seen = new Set<string>()
  const data = trips
    .filter(t => !t.duplicate && !!t.truckId)
    .filter(t => {
      if (seen.has(t.ticketNo)) return false
      seen.add(t.ticketNo)
      return true
    })
    .map(t => ({
      date:        new Date(t.date),
      ticketNo:    t.ticketNo,
      truckId:     t.truckId as string,
      routeId:     t.routeId,
      netWeightKg: t.rateType === 'PER_TON' ? t.netWeightKg : null,
      material:    t.material || null,
      origin:      t.procedencia || null,
      conductor:   t.conductor || null,
      amount:      t.amount,
      viatico:     0,
      periodId:    openPeriodId ?? null,
    }))

  if (data.length === 0) return { imported: 0 }

  await prisma.trip.createMany({ data })

  revalidatePath('/viajes')
  revalidatePath('/relaciones')
  revalidatePath('/dashboard')
  return { imported: data.length }
}
