'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// ─── Obtener o crear período activo ───────────────────────────────────────────

async function getOrCreateActivePeriod(date: Date) {
  const day = date.getDate()
  const month = date.getMonth()
  const year = date.getFullYear()

  const isFirstHalf = day <= 15
  const startDay = isFirstHalf ? 1 : 16
  const endDay   = isFirstHalf ? 15 : new Date(year, month + 1, 0).getDate()
  const startDate = new Date(Date.UTC(year, month, startDay, 0, 0, 0))
  const endDate   = new Date(Date.UTC(year, month, endDay,   23, 59, 59))

  let period = await prisma.period.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      status: 'OPEN',
    },
  })

  if (!period) {
    period = await prisma.period.create({
      data: { startDate, endDate, status: 'OPEN' },
    })
  }

  return period
}

// ─── Calcular monto del viaje ─────────────────────────────────────────────────

function calcAmount(rateType: string, rate: number, netWeightKg: number | null, hours?: number) {
  if (rateType === 'PER_TON') return ((netWeightKg ?? 0) / 1000) * rate
  if (rateType === 'PER_HOUR') return (hours ?? 0) * rate
  return rate
}

// ─── Calcular viático ─────────────────────────────────────────────────────────

async function calcViatico(
  route: { hasViatico: boolean; viaticoSingle: number; viaticoDouble: number },
  truckId: string,
  date: Date
) {
  if (!route.hasViatico) return 0

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const tripsToday = await prisma.trip.count({
    where: { truckId, date: { gte: dayStart, lte: dayEnd } },
  })

  return tripsToday >= 1 ? route.viaticoDouble : route.viaticoSingle
}

// ─── Crear viaje ──────────────────────────────────────────────────────────────

export async function createTrip(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const truckId = formData.get('truckId') as string
  const routeId = formData.get('routeId') as string
  const dateStr = formData.get('date') as string
  const netWeightKgStr = formData.get('netWeightKg') as string
  const ticketNo = formData.get('ticketNo') as string
  const material = formData.get('material') as string
  const origin = formData.get('origin') as string
  const notes = formData.get('notes') as string
  const hoursStr = formData.get('hours') as string

  if (!truckId || !routeId || !dateStr) {
    return { error: 'Camión, ruta y fecha son requeridos' }
  }

  const date = new Date(dateStr)
  const netWeightKg = netWeightKgStr ? parseFloat(netWeightKgStr) : null
  const hours = hoursStr ? parseFloat(hoursStr) : undefined

  const route = await prisma.route.findUnique({ where: { id: routeId } })
  if (!route) return { error: 'Ruta no encontrada' }

  const amount = calcAmount(route.rateType, route.rate, netWeightKg, hours)
  const viatico = await calcViatico(route, truckId, date)
  const period = await getOrCreateActivePeriod(date)

  await prisma.trip.create({
    data: {
      date,
      ticketNo: ticketNo || null,
      truckId,
      routeId,
      netWeightKg,
      material: material || null,
      origin: origin || null,
      viatico,
      amount,
      periodId: period.id,
      notes: notes || null,
    },
  })

  revalidatePath('/viajes')
  revalidatePath('/dashboard')
  redirect('/viajes')
}

// ─── Actualizar viaje ────────────────────────────────────────────────────────

export async function updateTrip(id: string, formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const truckId = formData.get('truckId') as string
  const routeId = formData.get('routeId') as string
  const dateStr = formData.get('date') as string
  const netWeightKgStr = formData.get('netWeightKg') as string
  const ticketNo = formData.get('ticketNo') as string
  const material = formData.get('material') as string
  const origin = formData.get('origin') as string
  const notes = formData.get('notes') as string

  if (!truckId || !routeId || !dateStr) {
    return { error: 'Camión, ruta y fecha son requeridos' }
  }

  const date = new Date(dateStr)
  const netWeightKg = netWeightKgStr ? parseFloat(netWeightKgStr) : null

  const route = await prisma.route.findUnique({ where: { id: routeId } })
  if (!route) return { error: 'Ruta no encontrada' }

  const amount = calcAmount(route.rateType, route.rate, netWeightKg)

  // El viático depende de si este viaje fue el PRIMERO en crearse ese día para
  // este camión (single) o no (double) — se usa el orden de creación (createdAt),
  // no si "hay otros viajes ese día", para que editar el primer viaje del día
  // (ej. corregir un dato) no lo convierta en double solo porque después se
  // creó un segundo viaje.
  let viatico = 0
  if (route.hasViatico) {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    const earliestTripToday = await prisma.trip.findFirst({
      where: { truckId, date: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    const isFirstOfDay = !earliestTripToday || earliestTripToday.id === id
    viatico = isFirstOfDay ? route.viaticoSingle : route.viaticoDouble
  }

  const period = await getOrCreateActivePeriod(date)

  await prisma.trip.update({
    where: { id },
    data: {
      date, truckId, routeId, netWeightKg, amount, viatico,
      ticketNo: ticketNo || null,
      material: material || null,
      origin: origin || null,
      notes: notes || null,
      periodId: period.id,
    },
  })

  revalidatePath('/viajes')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Eliminar viaje ───────────────────────────────────────────────────────────

export async function deleteTrip(id: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  await prisma.trip.delete({ where: { id } })
  revalidatePath('/viajes')
  revalidatePath('/dashboard')
}

// ─── Importar desde Excel ─────────────────────────────────────────────────────

// Mapeo de PROVEEDOR de la romana → nombre de ruta en el sistema
function resolveRouteName(supplier: string, origin: string): string | null {
  const s = supplier.toUpperCase().trim()
  if (s === 'OPERACIONES DEL CENTRO') {
    if (origin.toUpperCase().includes('LA FE')) return 'LA FE'
    return 'NUEVO CALLAO'
  }
  const MAP: Record<string, string> = {
    'FOSFORITO':          'FOSFORITO',
    'CHARLIE RICHARD':    'CHARLIE RICHARD',
    'SOSA MENDEZ':        'SOSA MENDEZ',
    'LA GARRAPATA':       'LA GARRAPATA',
    'ROSCIO SUR':         'ROSCIO SUR',
    'MACKENCI':           'MACKENCI',
    'POZO AURUVEN':       'POZO AURUVEN',
    'LAS CLARITAS':       'LAS CLARITAS (SAN LUIS)',
    'LA FE':              'LA FE',
    'NUEVO CALLAO':       'NUEVO CALLAO',
  }
  return MAP[s] ?? null
}

// Normaliza nombres de conductor para comparar (mayúsculas, sin acentos, espacios colapsados)
function normDriverName(s: string): string {
  return s.toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

export async function importTripsFromExcel(formData: FormData) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { error: 'No autorizado' }
  }

  const file = formData.get('file') as File
  if (!file) return { error: 'Archivo no encontrado' }

  const confirmed = formData.get('confirmed') === 'true'

  const buffer = Buffer.from(await file.arrayBuffer())
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Solo camiones y rutas activos — se necesitan tanto para el pre-scan como para la importación
  const [trucks, routes] = await Promise.all([
    prisma.truck.findMany({ where: { active: true }, select: { id: true, plate: true, driver: { select: { name: true } } } }),
    prisma.route.findMany({ where: { active: true }, select: { id: true, name: true, rateType: true, rate: true, hasViatico: true, viaticoSingle: true, viaticoDouble: true } }),
  ])
  const truckByPlate = new Map(trucks.map(t => [t.plate.toUpperCase().replace(/\s+/g, ''), t]))

  // ── Pre-scan: archivo duplicado + placas que no coinciden con el chofer asignado ──
  if (!confirmed) {
    const scanRows: any[] = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { header: 1, defval: null }
    )
    const dataRows = scanRows.slice(10).filter((r: any[]) => r[4] && r[5])
    const tickets = dataRows.map((r: any[]) => String(r[4]).trim()).filter(Boolean)

    const existing = tickets.length > 0
      ? await prisma.trip.count({ where: { ticketNo: { in: tickets } } })
      : 0
    const pct = tickets.length > 0 ? Math.round((existing / tickets.length) * 100) : 0

    // Placa trocada: el conductor que trae el archivo no es el chofer asignado a esa placa
    // (así se detectaron los casos reales de tickets con la placa de otro camión muy parecida)
    const mismatches: { ticketNo: string; date: string; plate: string; driverInFile: string; assignedDriver: string }[] = []
    for (const r of dataRows) {
      const plate = r[15] ? String(r[15]).toUpperCase().replace(/\s+/g, '').trim() : null
      const driverInFile = r[13] ? String(r[13]).trim() : ''
      if (!plate || !driverInFile) continue
      const truck = truckByPlate.get(plate)
      if (!truck?.driver?.name) continue
      if (normDriverName(driverInFile) !== normDriverName(truck.driver.name)) {
        const rawDate = r[5]
        let dateLabel = String(rawDate)
        if (typeof rawDate === 'number') {
          const d = XLSX.SSF.parse_date_code(rawDate)
          dateLabel = `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`
        }
        mismatches.push({
          ticketNo: r[4] ? String(r[4]).trim() : '',
          date: dateLabel,
          plate,
          driverInFile,
          assignedDriver: truck.driver.name,
        })
      }
    }

    if (pct >= 30 || mismatches.length > 0) {
      const dates = dataRows
        .map((r: any[]) => {
          const v = r[5]
          if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v)
            return new Date(d.y, d.m - 1, d.d)
          }
          return v instanceof Date ? v : new Date(String(v))
        })
        .filter((d: Date) => !isNaN(d.getTime())) as Date[]

      const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
      const dateRange = dates.length > 0
        ? `${fmt(new Date(Math.min(...dates.map(d => d.getTime()))))} — ${fmt(new Date(Math.max(...dates.map(d => d.getTime()))))}`
        : ''

      return {
        warning: true,
        existingCount: existing,
        totalCount: tickets.length,
        pct,
        dateRange,
        mismatches,
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const routeByName = new Map(routes.map(r => [r.name.toUpperCase().trim(), r]))

  let created = 0
  let skipped = 0
  const errors: string[] = []

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Romana JR: datos desde fila 11 (índice 10 en header:1)
  // Cols: E=4 ticket | F=5 fecha | H=7 procedencia | K=10 proveedor/mina
  //        N=13 conductor | P=15 placa | Q=16 material | U=20 neto kg
  for (let i = 10; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[4] || !row[5]) continue

    try {
      const ticketNo    = row[4] ? String(row[4]).trim() : null
      const rawDate     = row[5]
      const origin      = row[7]  ? String(row[7]).trim()  : ''
      const supplier    = row[10] ? String(row[10]).trim()  : null
      const plate       = row[15] ? String(row[15]).toUpperCase().replace(/\s+/g, '').trim() : null
      const material    = row[16] ? String(row[16]).trim()  : null
      const netWeightKg = row[20] ? Number(row[20])         : null

      if (!plate || !supplier || !ticketNo) continue

      // Camión activo
      const truck = truckByPlate.get(plate)
      if (!truck) { skipped++; continue } // no es nuestro, ignorar silenciosamente

      // Resolver ruta
      const routeName = resolveRouteName(supplier, origin)
      if (!routeName) { skipped++; continue }
      const route = routeByName.get(routeName.toUpperCase())
      if (!route) { skipped++; continue }

      // Parsear fecha (puede ser serial de Excel o Date)
      let date: Date
      if (typeof rawDate === 'number') {
        const parsed = XLSX.SSF.parse_date_code(rawDate)
        date = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H ?? 0, parsed.M ?? 0)
      } else if (rawDate instanceof Date) {
        date = rawDate
      } else {
        date = new Date(String(rawDate))
      }
      if (isNaN(date.getTime())) continue

      // Deduplicación: mismo ticket + ventana de ±1 hora
      const exists = await prisma.trip.findFirst({
        where: {
          ticketNo,
          date: {
            gte: new Date(date.getTime() - 3_600_000),
            lte: new Date(date.getTime() + 3_600_000),
          },
        },
      })
      if (exists) { skipped++; continue }

      const amount  = calcAmount(route.rateType, route.rate, netWeightKg ?? 0)
      const viatico = await calcViatico(route, truck.id, date)
      const period  = await getOrCreateActivePeriod(date)

      await prisma.trip.create({
        data: {
          date,
          ticketNo,
          truckId:     truck.id,
          routeId:     route.id,
          netWeightKg: netWeightKg ?? 0,
          material,
          origin:      origin || null,
          viatico,
          amount,
          periodId:    period.id,
        },
      })
      created++
    } catch {
      errors.push(`Fila ${i + 1}: Error al procesar`)
    }
  }

  revalidatePath('/viajes')
  revalidatePath('/dashboard')

  return { created, skipped, errors, total: rows.length - 10 }
}
