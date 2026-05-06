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

/** Fila sin ruta resuelta — para que el encargado la clasifique */
export type UnknownProveedorRow = {
  ticketNo: string
  date: string
  procedencia: string
  proveedor: string
  conductor: string
  plate: string
  material: string
  netWeightKg: number
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
  /** Choferes registrados en el sistema (rol CHOFER), para reconciliación */
  registeredDrivers: { id: string; name: string }[]
  /** Conductores de la romana que no coinciden exactamente con ningún chofer registrado */
  unknownConductors: string[]
  /** Proveedores del archivo que no son ni mina conocida ni viaje por horario */
  unknownProveedores: {
    name: string
    count: number
    rows: UnknownProveedorRow[]
    /** Rutas existentes con nombre similar al proveedor desconocido */
    suggestedRoutes: { id: string; name: string; distance: number }[]
    /** true si alguna fila tiene procedencia parecida a TRONCAL/H66/PLANTA */
    likelyHourly: boolean
  }[]
  /** Rutas DIAS INTERNOS disponibles para clasificar viajes por horario */
  diasInternosRoutes: { id: string; name: string; rate: number; rateType: string }[]
  /** Todas las rutas activas — para asignar proveedor a una ruta ya existente */
  allRoutes: { id: string; name: string; rate: number; rateType: string; clientName: string }[]
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

// Palabras clave en PROCEDENCIA que identifican viajes internos por horario
const HOURLY_KEYWORDS = ['TRONCAL', 'H66', 'PLANTA']

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

/**
 * Resuelve el nombre de ruta dado proveedor y procedencia.
 * Retorna null si el proveedor no es una mina conocida ni un viaje por horario.
 */
function resolveRoute(proveedor: string, procedencia: string): string | null {
  const prov = proveedor.trim().toUpperCase()
  const proc = procedencia.trim().toUpperCase()

  // Viaje por horario interno (TRONCAL, H66, PLANTA en procedencia)
  if (HOURLY_KEYWORDS.some(kw => proc === kw || proc.includes(kw))) {
    return 'DIAS INTERNOS (PLANTA)'
  }

  if (prov === 'OPERACIONES DEL CENTRO') {
    return proc.includes('FE') ? 'LA FE' : 'NUEVO CALLAO'
  }
  return PROVEEDOR_TO_ROUTE[prov] ?? null
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

  // Load routes, trucks, drivers and existing tickets from DB
  const [routes, trucks, existingTickets, registeredDrivers] = await Promise.all([
    prisma.route.findMany({ where: { active: true } }),
    prisma.truck.findMany({ include: { driver: { select: { id: true, name: true } } } }),
    prisma.trip.findMany({ select: { ticketNo: true }, where: { ticketNo: { not: null } } }),
    prisma.user.findMany({ where: { role: 'CHOFER', active: true }, select: { id: true, name: true } }),
  ])

  const routeMap = new Map(routes.map(r => [r.name.toUpperCase(), r]))
  const truckMap = new Map(trucks.map(t => [t.plate.toUpperCase(), t]))
  const ticketSet = new Set(existingTickets.map(t => t.ticketNo))

  const trips: RomanaTrip[] = []
  const unknownProveedorMap = new Map<string, UnknownProveedorRow[]>()
  let dateMin = '', dateMax = ''

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const codi = r[COL.ticket]
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

    const date = typeof dateSerial === 'number' ? excelDate(dateSerial) : new Date(String(dateSerial))
    if (isNaN(date.getTime())) continue
    const dateStr = date.toISOString()
    const dateKey = date.toISOString().slice(0, 10)

    const truck    = truckMap.get(plate)
    const truckId  = truck?.id ?? null
    const driverId = truck?.driver?.id ?? null
    const isDup    = ticketSet.has(ticketNo)

    const routeName = resolveRoute(proveedor, procedencia)

    // DIAS INTERNOS se registran manualmente — ignorar de la romana
    if (routeName !== null && routeName.toUpperCase().includes('DIAS INTERNOS')) continue

    if (routeName === null) {
      // Proveedor desconocido — guardar para que el encargado lo clasifique
      if (!unknownProveedorMap.has(proveedor)) unknownProveedorMap.set(proveedor, [])
      unknownProveedorMap.get(proveedor)!.push({
        ticketNo, date: dateStr, procedencia, proveedor, conductor,
        plate, material, netWeightKg: netoKg, truckId, driverId, duplicate: isDup,
      })
      continue
    }

    const route = routeMap.get(routeName.toUpperCase())
    if (!route) continue

    if (!dateMin || dateKey < dateMin) dateMin = dateKey
    if (!dateMax || dateKey > dateMax) dateMax = dateKey

    const tons   = netoKg / 1000
    const amount = route.rateType === 'PER_TON'
      ? Math.round(tons * route.rate * 100) / 100
      : route.rate

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
      duplicate: isDup,
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

  const byClient = Array.from(clientMap.entries()).map(([client, rm]) => {
    const clientRoutes = Array.from(rm.entries()).map(([name, d]) => ({
      name,
      trips: d.trips,
      tons: Math.round(d.tons * 100) / 100,
      amount: Math.round(d.amount * 100) / 100,
    }))
    return {
      client,
      routes: clientRoutes,
      totalTrips:  clientRoutes.reduce((s, r) => s + r.trips, 0),
      totalTons:   Math.round(clientRoutes.reduce((s, r) => s + r.tons, 0) * 100) / 100,
      totalAmount: Math.round(clientRoutes.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    }
  })

  const duplicates = trips.filter(t => t.duplicate).length
  const likelyAlreadyImported = trips.length > 0 && (duplicates / trips.length) >= 0.7

  const registeredNameSet = new Set(registeredDrivers.map(d => d.name.toUpperCase().trim()))
  const uniqueConductors = [...new Set(trips.map(t => t.conductor).filter(Boolean))]
  const unknownConductors = uniqueConductors.filter(c => !registeredNameSet.has(c.toUpperCase().trim()))

  const unknownProveedores = Array.from(unknownProveedorMap.entries()).map(([name, rows]) => {
    const nameNorm = name.toUpperCase().trim()
    const threshold = Math.max(2, Math.floor(nameNorm.length * 0.3))

    // Fuzzy match contra nombres de proveedores conocidos
    const seen = new Set<string>()
    const provSuggestions = Object.entries(PROVEEDOR_TO_ROUTE)
      .map(([prov, routeName]) => {
        const route = routeMap.get(routeName.toUpperCase())
        if (!route) return null
        return { id: route.id, name: prov, distance: levenshtein(nameNorm, prov.toUpperCase()) }
      })
      .filter((s): s is { id: string; name: string; distance: number } =>
        s !== null && s.distance <= threshold && s.distance > 0
      )

    // Fuzzy match contra nombres de rutas
    const routeSuggestions = routes
      .map(r => ({ id: r.id, name: r.name, distance: levenshtein(nameNorm, r.name.toUpperCase()) }))
      .filter(s => s.distance <= threshold && s.distance > 0)

    const suggestedRoutes = [...provSuggestions, ...routeSuggestions]
      .sort((a, b) => a.distance - b.distance)
      .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
      .slice(0, 3)

    // Detectar si alguna procedencia parece TRONCAL/H66/PLANTA (fuzzy)
    const likelyHourly = rows.some(row => {
      const proc = row.procedencia.toUpperCase().replace(/\s+/g, '')
      return ['TRONCAL', 'H66', 'PLANTA'].some(kw =>
        proc.includes(kw) || levenshtein(proc, kw) <= 2
      )
    })

    return { name, count: rows.length, rows, suggestedRoutes, likelyHourly }
  })

  const diasInternosRoutes = routes
    .filter(r => r.name.toUpperCase().includes('DIAS INTERNOS'))
    .map(r => ({ id: r.id, name: r.name, rate: r.rate, rateType: r.rateType }))

  return {
    period: `${dateMin} al ${dateMax}`,
    totalTrips: trips.length,
    byClient,
    trips,
    duplicates,
    newTrips: trips.filter(t => !t.duplicate).length,
    likelyAlreadyImported,
    registeredTrucks: trucks.map(t => ({ id: t.id, plate: t.plate })).sort((a, b) => a.plate.localeCompare(b.plate)),
    registeredDrivers: registeredDrivers.sort((a, b) => a.name.localeCompare(b.name)),
    unknownConductors,
    unknownProveedores,
    diasInternosRoutes,
    allRoutes: routes.map(r => ({ id: r.id, name: r.name, rate: r.rate, rateType: r.rateType, clientName: r.clientName })),
  }
}

export async function crearRutaDesdeRomana(data: {
  name: string
  rateType: 'PER_TON' | 'PER_TRIP'
  rate: number
  driverWage: number
  fuelLitersPerTrip: number
  bidirectional: boolean
  hasViatico: boolean
  viaticoSingle: number
  viaticoDouble: number
}) {
  const route = await prisma.route.create({
    data: { ...data, active: true },
  })
  revalidatePath('/rutas')
  return { id: route.id, name: route.name, rate: route.rate, rateType: route.rateType }
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
