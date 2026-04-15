'use server'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// ── Paleta de marca ───────────────────────────────────────────────────────────
const C = {
  dark:    '18181B', // zinc-900  — títulos y totales
  amber:   'F59E0B', // amber-500 — cabeceras
  amberDk: 'B45309', // amber-700 — borde de cabecera
  slate:   '3F3F46', // zinc-700  — subtítulos
  white:   'FFFFFF',
  row0:    'FFFFFF', // fila par
  row1:    'FAFAFA', // fila impar (gris muy suave)
  border:  'E4E4E7', // zinc-200
  totalBg: '27272A', // zinc-800
}

type Align = 'left' | 'center' | 'right'
type ColDef = { label: string; align?: Align }

// ── Helpers de estilo ─────────────────────────────────────────────────────────
function solidFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }
}

function thinBorder(hex: string): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = 'thin'
  const c = { argb: 'FF' + hex }
  return { top: { style: s, color: c }, bottom: { style: s, color: c }, left: { style: s, color: c }, right: { style: s, color: c } }
}

function addTitleRow(ws: ExcelJS.Worksheet, text: string, span: number, rowNum = 1) {
  if (span > 1) ws.mergeCells(rowNum, 1, rowNum, span)
  const row = ws.getRow(rowNum)
  row.height = 36
  const cell = row.getCell(1)
  cell.value = text
  cell.fill = solidFill(C.dark)
  cell.font = { name: 'Calibri', bold: true, size: 15, color: { argb: 'FF' + C.white } }
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  for (let c = 2; c <= span; c++) row.getCell(c).fill = solidFill(C.dark)
}

function addSubtitleRow(ws: ExcelJS.Worksheet, text: string, span: number, rowNum = 2) {
  if (span > 1) ws.mergeCells(rowNum, 1, rowNum, span)
  const row = ws.getRow(rowNum)
  row.height = 20
  const cell = row.getCell(1)
  cell.value = text
  cell.fill = solidFill(C.slate)
  cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + C.white } }
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  for (let c = 2; c <= span; c++) row.getCell(c).fill = solidFill(C.slate)
}

function addHeaderRow(ws: ExcelJS.Worksheet, cols: ColDef[], rowNum: number) {
  const row = ws.getRow(rowNum)
  row.height = 24
  cols.forEach((col, i) => {
    const cell = row.getCell(i + 1)
    cell.value = col.label
    cell.fill = solidFill(C.amber)
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF' + C.dark } }
    cell.alignment = { horizontal: col.align ?? 'center', vertical: 'middle' }
    cell.border = thinBorder(C.amberDk)
  })
}

function addDataRow(
  ws: ExcelJS.Worksheet,
  values: (string | number | null)[],
  rowNum: number,
  alt: boolean,
  aligns: Align[],
  numFmts?: (string | null)[],
) {
  const row = ws.getRow(rowNum)
  row.height = 18
  const bg = alt ? C.row1 : C.row0
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1)
    cell.value = v
    cell.fill = solidFill(bg)
    cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + C.dark } }
    cell.alignment = { horizontal: aligns[i] ?? 'left', vertical: 'middle' }
    cell.border = thinBorder(C.border)
    if (numFmts?.[i]) cell.numFmt = numFmts[i]!
  })
}

function addTotalRow(
  ws: ExcelJS.Worksheet,
  values: (string | number | null)[],
  rowNum: number,
  aligns: Align[],
  numFmts?: (string | null)[],
) {
  const row = ws.getRow(rowNum)
  row.height = 26
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1)
    cell.value = v
    cell.fill = solidFill(C.totalBg)
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF' + C.white } }
    cell.alignment = { horizontal: aligns[i] ?? 'left', vertical: 'middle' }
    cell.border = thinBorder('52525B')
    if (numFmts?.[i]) cell.numFmt = numFmts[i]!
  })
}

function addSpacer(ws: ExcelJS.Worksheet, rowNum: number) {
  ws.getRow(rowNum).height = 6
}

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })

async function toBase64(wb: ExcelJS.Workbook): Promise<string> {
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf).toString('base64')
}

// ─── Relación de acarreo ──────────────────────────────────────────────────────

export async function exportTripRelacion(from: string, to: string, routeId: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const where: any = {}
  if (from) where.date = { ...where.date, gte: new Date(from) }
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.date = { ...where.date, lte: d } }
  if (routeId) where.routeId = routeId

  const trips = await prisma.trip.findMany({
    where,
    orderBy: { date: 'asc' },
    include: {
      truck: { select: { plate: true, driver: { select: { name: true } }, owner: { select: { name: true } } } },
      route: { select: { name: true, rate: true, rateType: true } },
    },
  })

  const routeName = trips[0]?.route?.name ?? (routeId ? '' : 'TODAS LAS MINAS')
  const rangeLabel = `${from ? fmtDate(new Date(from)) : '—'}  al  ${to ? fmtDate(new Date(to)) : '—'}`

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Transporte JR'

  // ── Hoja 1: Detalle de viajes ─────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Relación de viajes')
  ws1.columns = [
    { width: 6 }, { width: 13 }, { width: 12 }, { width: 18 }, { width: 18 },
    { width: 26 }, { width: 26 }, { width: 12 }, { width: 15 },
  ]

  const COLS1 = 9
  addTitleRow(ws1, `RELACIÓN DE ACARREO  —  ${routeName}`, COLS1, 1)
  addSubtitleRow(ws1, `Período: ${rangeLabel}   ·   ${trips.length} viajes registrados`, COLS1, 2)
  addSpacer(ws1, 3)

  const heads1: ColDef[] = [
    { label: 'Item', align: 'center' },
    { label: 'Nro. Ticket', align: 'center' },
    { label: 'Fecha', align: 'center' },
    { label: 'Origen', align: 'left' },
    { label: 'Tipo de Material', align: 'left' },
    { label: 'Transportista', align: 'left' },
    { label: 'Conductor', align: 'left' },
    { label: 'Placa', align: 'center' },
    { label: 'Peso Neto (Ton)', align: 'right' },
  ]
  addHeaderRow(ws1, heads1, 4)

  const aligns1: Align[] = ['center', 'center', 'center', 'left', 'left', 'left', 'left', 'center', 'right']
  const numFmts1 = [null, null, null, null, null, null, null, null, '#,##0.000']

  trips.forEach((t, i) => {
    addDataRow(ws1, [
      i + 1,
      t.ticketNo ?? '—',
      fmtDate(t.date),
      t.origin ?? '—',
      t.material ?? '—',
      t.truck?.owner?.name ?? '—',
      t.truck?.driver?.name ?? '—',
      t.truck?.plate ?? '—',
      t.netWeightKg ? t.netWeightKg / 1000 : 0,
    ], i + 5, i % 2 === 1, aligns1, numFmts1)
  })

  addSpacer(ws1, trips.length + 5)
  addTotalRow(ws1,
    ['', '', '', '', '', '', '', 'TOTAL TONELADAS',
      trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000],
    trips.length + 6, aligns1, numFmts1,
  )

  // ── Hoja 2: Resumen por conductor ─────────────────────────────────────────
  const ws2 = wb.addWorksheet('Resumen por conductor')
  ws2.columns = [
    { width: 28 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 14 }, { width: 16 },
  ]

  const COLS2 = 6
  addTitleRow(ws2, `RESUMEN POR CONDUCTOR  —  ${routeName}`, COLS2, 1)
  addSubtitleRow(ws2, `Período: ${rangeLabel}`, COLS2, 2)
  addSpacer(ws2, 3)

  addHeaderRow(ws2, [
    { label: 'Conductor', align: 'left' },
    { label: 'Placa', align: 'center' },
    { label: 'Nro. Viajes', align: 'center' },
    { label: 'Ton Totales', align: 'right' },
    { label: 'Tarifa $/Ton', align: 'right' },
    { label: 'Monto Total $', align: 'right' },
  ], 4)

  const aligns2: Align[] = ['left', 'center', 'center', 'right', 'right', 'right']
  const numFmts2 = [null, null, null, '#,##0.000', '$#,##0.00', '$#,##0.00']

  const byDriver = new Map<string, { plate: string; trips: typeof trips }>()
  for (const t of trips) {
    const key = t.truck?.driver?.name ?? t.truck?.plate ?? t.truckId
    if (!byDriver.has(key)) byDriver.set(key, { plate: t.truck?.plate ?? '—', trips: [] })
    byDriver.get(key)!.trips.push(t)
  }

  const driverEntries = Array.from(byDriver.entries())
  driverEntries.forEach(([driver, { plate, trips: ts }], i) => {
    const tons = ts.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000
    const monto = ts.reduce((s, t) => s + t.amount, 0)
    const rate = ts[0]?.route?.rate ?? 0
    addDataRow(ws2, [driver, plate, ts.length, tons, rate, monto], i + 5, i % 2 === 1, aligns2, numFmts2)
  })

  addSpacer(ws2, driverEntries.length + 5)
  addTotalRow(ws2, [
    'TOTAL', '', trips.length,
    trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000,
    '',
    trips.reduce((s, t) => s + t.amount, 0),
  ], driverEntries.length + 6, aligns2, numFmts2)

  const safeName = routeName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  return { data: await toBase64(wb), filename: `relacion-${safeName}-${from ?? 'inicio'}.xlsx` }
}

// ─── Gastos por categoría ─────────────────────────────────────────────────────

export async function exportExpensesReport(from: string, to: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const where: any = {}
  if (from) where.date = { ...where.date, gte: new Date(from) }
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.date = { ...where.date, lte: d } }

  const expenses = await prisma.expense.findMany({
    where, orderBy: { date: 'asc' },
    include: { truck: { select: { plate: true } } },
  })

  const CATEGORY_LABELS: Record<string, string> = {
    MECANICA: 'Mecánica', REPUESTO: 'Repuesto', ACEITE: 'Aceite', CAUCHO: 'Caucho',
    VIATICO: 'Viático', NOMINA: 'Nómina', OPERATIVO: 'Operativo',
    ADMINISTRATIVO: 'Administrativo', NPR: 'NPR', OTRO: 'Otro',
  }

  const rangeLabel = `${from ? fmtDate(new Date(from)) : '—'}  al  ${to ? fmtDate(new Date(to)) : '—'}`
  const totalAmt = expenses.reduce((s, e) => s + e.amount, 0)

  const byCategory = new Map<string, number>()
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Transporte JR'

  // ── Hoja 1: Resumen por categoría ─────────────────────────────────────────
  const ws1 = wb.addWorksheet('Resumen')
  ws1.columns = [{ width: 22 }, { width: 16 }, { width: 12 }]

  const COLS1 = 3
  addTitleRow(ws1, 'RESUMEN DE GASTOS POR CATEGORÍA', COLS1, 1)
  addSubtitleRow(ws1, `Período: ${rangeLabel}   ·   ${expenses.length} registros`, COLS1, 2)
  addSpacer(ws1, 3)
  addHeaderRow(ws1, [
    { label: 'Categoría', align: 'left' },
    { label: 'Total $', align: 'right' },
    { label: '% del Total', align: 'center' },
  ], 4)

  const aligns1: Align[] = ['left', 'right', 'center']
  const catEntries = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])
  catEntries.forEach(([cat, total], i) => {
    addDataRow(ws1, [
      CATEGORY_LABELS[cat] ?? cat,
      total,
      totalAmt > 0 ? `${((total / totalAmt) * 100).toFixed(1)}%` : '0%',
    ], i + 5, i % 2 === 1, aligns1, [null, '$#,##0.00', null])
  })

  addSpacer(ws1, catEntries.length + 5)
  addTotalRow(ws1, ['TOTAL', totalAmt, '100%'], catEntries.length + 6, aligns1, [null, '$#,##0.00', null])

  // ── Hoja 2: Detalle completo ───────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Detalle')
  ws2.columns = [
    { width: 12 }, { width: 16 }, { width: 34 }, { width: 11 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 11 },
  ]

  const COLS2 = 8
  addTitleRow(ws2, 'DETALLE DE GASTOS', COLS2, 1)
  addSubtitleRow(ws2, `Período: ${rangeLabel}`, COLS2, 2)
  addSpacer(ws2, 3)
  addHeaderRow(ws2, [
    { label: 'Fecha', align: 'center' },
    { label: 'Categoría', align: 'left' },
    { label: 'Descripción', align: 'left' },
    { label: 'Camión', align: 'center' },
    { label: 'Monto $', align: 'right' },
    { label: 'Pagado $', align: 'right' },
    { label: 'Debe $', align: 'right' },
    { label: 'Estado', align: 'center' },
  ], 4)

  const aligns2: Align[] = ['center', 'left', 'left', 'center', 'right', 'right', 'right', 'center']
  const numFmts2 = [null, null, null, null, '$#,##0.00', '$#,##0.00', '$#,##0.00', null]

  expenses.forEach((e, i) => {
    const paid = e.amountPaid ?? 0
    const owed = e.amount - paid
    const status = !e.isCredit ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente'
    addDataRow(ws2, [
      fmtDate(e.date),
      CATEGORY_LABELS[e.category] ?? e.category,
      e.description,
      e.truck?.plate ?? '—',
      e.amount,
      paid,
      owed > 0 ? owed : 0,
      status,
    ], i + 5, i % 2 === 1, aligns2, numFmts2)
  })

  addSpacer(ws2, expenses.length + 5)
  const totalPaid = expenses.reduce((s, e) => s + (e.amountPaid ?? 0), 0)
  const totalOwed = expenses.filter(e => e.isCredit).reduce((s, e) => s + (e.amount - (e.amountPaid ?? 0)), 0)
  addTotalRow(ws2, ['', '', '', 'TOTALES', totalAmt, totalPaid, totalOwed, ''],
    expenses.length + 6, aligns2, numFmts2)

  return { data: await toBase64(wb), filename: `gastos-${from ?? 'inicio'}-${to ?? 'hoy'}.xlsx` }
}

// ─── Historial de nóminas ─────────────────────────────────────────────────────

export async function exportPayrollHistory() {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const periods = await prisma.period.findMany({
    orderBy: { startDate: 'asc' },
    include: { payroll: true },
  })

  const allTruckIds = [...new Set(periods.flatMap(p => p.payroll.map(e => e.truckId)))]
  const trucks = await prisma.truck.findMany({
    where: { id: { in: allTruckIds } },
    select: { id: true, plate: true, driver: { select: { name: true } }, owner: { select: { name: true, type: true } } },
  })
  const truckMap = new Map(trucks.map(t => [t.id, t]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Transporte JR'

  // ── Hoja 1: Comparativo de períodos ───────────────────────────────────────
  const ws1 = wb.addWorksheet('Comparativo')
  ws1.columns = [
    { width: 28 }, { width: 10 }, { width: 10 }, { width: 12 },
    { width: 13 }, { width: 13 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 13 },
  ]

  const COLS1 = 12
  addTitleRow(ws1, 'HISTORIAL DE NÓMINAS', COLS1, 1)
  addSubtitleRow(ws1, `${periods.length} períodos registrados`, COLS1, 2)
  addSpacer(ws1, 3)
  addHeaderRow(ws1, [
    { label: 'Período', align: 'left' },
    { label: 'Estado', align: 'center' },
    { label: 'Camiones', align: 'center' },
    { label: 'Toneladas', align: 'right' },
    { label: 'Bruto $', align: 'right' },
    { label: 'Viáticos $', align: 'right' },
    { label: 'Comisiones $', align: 'right' },
    { label: '5% NPR $', align: 'right' },
    { label: 'Mecánicos $', align: 'right' },
    { label: 'Admin $', align: 'right' },
    { label: 'Deducciones $', align: 'right' },
    { label: 'Neto $', align: 'right' },
  ], 4)

  const aligns1: Align[] = ['left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']
  const numFmts1 = [null, null, null, '#,##0.000', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00']

  periods.forEach((p, i) => {
    const tons = p.payroll.reduce((s, e) => s + e.totalTons, 0)
    const gross = p.payroll.reduce((s, e) => s + e.grossAmount, 0)
    const viat = p.payroll.reduce((s, e) => s + e.viaticos, 0)
    const comm = p.payroll.reduce((s, e) => s + e.commissionFee, 0)
    const npr = p.payroll.reduce((s, e) => s + (e.nprFee ?? 0), 0)
    const mec = p.payroll.reduce((s, e) => s + (e.mechanicFee ?? 0), 0)
    const adm = p.payroll.reduce((s, e) => s + (e.adminFee ?? 0), 0)
    const ded = p.payroll.reduce((s, e) => s + e.deductions, 0)
    const net = p.payroll.reduce((s, e) => s + e.netAmount, 0)
    addDataRow(ws1, [
      `${fmtDate(p.startDate)} — ${fmtDate(p.endDate)}`,
      p.status === 'OPEN' ? 'Abierto' : 'Cerrado',
      p.payroll.length, tons, gross, viat, comm, npr, mec, adm, ded, net,
    ], i + 5, i % 2 === 1, aligns1, numFmts1)
  })

  // ── Una hoja por período ──────────────────────────────────────────────────
  for (const p of periods) {
    if (p.payroll.length === 0) continue
    const label = `${fmtDate(p.startDate).replace(/\//g, '-')}`

    const ws = wb.addWorksheet(label.slice(0, 31))
    ws.columns = [
      { width: 24 }, { width: 11 }, { width: 22 }, { width: 9 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 },
      { width: 11 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 12 },
    ]

    const COLSP = 13
    addTitleRow(ws, `NÓMINA  —  ${label}`, COLSP, 1)
    addSubtitleRow(ws, `${p.payroll.length} unidades   ·   Estado: ${p.status === 'OPEN' ? 'Abierto' : 'Cerrado'}`, COLSP, 2)
    addSpacer(ws, 3)
    addHeaderRow(ws, [
      { label: 'Conductor', align: 'left' },
      { label: 'Placa', align: 'center' },
      { label: 'Propietario', align: 'left' },
      { label: 'Ton', align: 'right' },
      { label: 'Bruto $', align: 'right' },
      { label: 'Viáticos $', align: 'right' },
      { label: 'Chofer $', align: 'right' },
      { label: 'Comisión $', align: 'right' },
      { label: '5% NPR $', align: 'right' },
      { label: 'Mecánicos $', align: 'right' },
      { label: 'Admin $', align: 'right' },
      { label: 'Deduc. $', align: 'right' },
      { label: 'Neto $', align: 'right' },
    ], 4)

    const alignsP: Align[] = ['left', 'center', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']
    const numFmtsP = [null, null, null, '#,##0.000', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00', '$#,##0.00']

    p.payroll.forEach((e, i) => {
      const truck = truckMap.get(e.truckId)
      addDataRow(ws, [
        truck?.driver?.name ?? '—',
        truck?.plate ?? '—',
        truck?.owner?.name ?? '—',
        e.totalTons, e.grossAmount, e.viaticos, e.driverWage, e.commissionFee,
        e.nprFee ?? 0, e.mechanicFee ?? 0, e.adminFee ?? 0, e.deductions, e.netAmount,
      ], i + 5, i % 2 === 1, alignsP, numFmtsP)
    })

    addSpacer(ws, p.payroll.length + 5)
    addTotalRow(ws, [
      'TOTAL', `${p.payroll.length} uds`, '',
      p.payroll.reduce((s, e) => s + e.totalTons, 0),
      p.payroll.reduce((s, e) => s + e.grossAmount, 0),
      p.payroll.reduce((s, e) => s + e.viaticos, 0),
      p.payroll.reduce((s, e) => s + e.driverWage, 0),
      p.payroll.reduce((s, e) => s + e.commissionFee, 0),
      p.payroll.reduce((s, e) => s + (e.nprFee ?? 0), 0),
      p.payroll.reduce((s, e) => s + (e.mechanicFee ?? 0), 0),
      p.payroll.reduce((s, e) => s + (e.adminFee ?? 0), 0),
      p.payroll.reduce((s, e) => s + e.deductions, 0),
      p.payroll.reduce((s, e) => s + e.netAmount, 0),
    ], p.payroll.length + 6, alignsP, numFmtsP)
  }

  return { data: await toBase64(wb), filename: 'historial-nominas.xlsx' }
}

// ─── Rendimiento por camión ───────────────────────────────────────────────────

export async function exportTrucksReport(from: string, to: string) {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const where: any = {}
  if (from) where.date = { ...where.date, gte: new Date(from) }
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.date = { ...where.date, lte: d } }

  const trips = await prisma.trip.findMany({
    where,
    include: {
      truck: { select: { plate: true, driver: { select: { name: true } }, owner: { select: { name: true } } } },
      route: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  const rangeLabel = `${from ? fmtDate(new Date(from)) : '—'}  al  ${to ? fmtDate(new Date(to)) : '—'}`

  const byTruck = new Map<string, { plate: string; driver: string; owner: string; trips: typeof trips }>()
  for (const t of trips) {
    if (!byTruck.has(t.truckId)) byTruck.set(t.truckId, {
      plate: t.truck?.plate ?? '—',
      driver: t.truck?.driver?.name ?? '—',
      owner: t.truck?.owner?.name ?? '—',
      trips: [],
    })
    byTruck.get(t.truckId)!.trips.push(t)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Transporte JR'

  // ── Hoja 1: Resumen por camión ────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Resumen')
  ws1.columns = [
    { width: 12 }, { width: 26 }, { width: 26 }, { width: 9 },
    { width: 14 }, { width: 16 }, { width: 13 },
  ]

  const COLS1 = 7
  addTitleRow(ws1, 'RENDIMIENTO POR CAMIÓN', COLS1, 1)
  addSubtitleRow(ws1, `Período: ${rangeLabel}   ·   ${byTruck.size} unidades`, COLS1, 2)
  addSpacer(ws1, 3)
  addHeaderRow(ws1, [
    { label: 'Placa', align: 'center' },
    { label: 'Conductor', align: 'left' },
    { label: 'Propietario', align: 'left' },
    { label: 'Viajes', align: 'center' },
    { label: 'Toneladas', align: 'right' },
    { label: 'Monto Bruto $', align: 'right' },
    { label: 'Viáticos $', align: 'right' },
  ], 4)

  const aligns1: Align[] = ['center', 'left', 'left', 'center', 'right', 'right', 'right']
  const numFmts1 = [null, null, null, null, '#,##0.000', '$#,##0.00', '$#,##0.00']

  const truckEntries = Array.from(byTruck.values())
  truckEntries.forEach(({ plate, driver, owner, trips: ts }, i) => {
    addDataRow(ws1, [
      plate, driver, owner,
      ts.length,
      ts.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000,
      ts.reduce((s, t) => s + t.amount, 0),
      ts.reduce((s, t) => s + t.viatico, 0),
    ], i + 5, i % 2 === 1, aligns1, numFmts1)
  })

  addSpacer(ws1, truckEntries.length + 5)
  addTotalRow(ws1, [
    '', 'TOTAL', '',
    trips.length,
    trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000,
    trips.reduce((s, t) => s + t.amount, 0),
    trips.reduce((s, t) => s + t.viatico, 0),
  ], truckEntries.length + 6, aligns1, numFmts1)

  // ── Hoja 2: Detalle de viajes ─────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Detalle viajes')
  ws2.columns = [
    { width: 12 }, { width: 11 }, { width: 26 }, { width: 22 },
    { width: 13 }, { width: 13 }, { width: 12 }, { width: 12 },
  ]

  const COLS2 = 8
  addTitleRow(ws2, 'DETALLE DE VIAJES POR CAMIÓN', COLS2, 1)
  addSubtitleRow(ws2, `Período: ${rangeLabel}`, COLS2, 2)
  addSpacer(ws2, 3)
  addHeaderRow(ws2, [
    { label: 'Fecha', align: 'center' },
    { label: 'Placa', align: 'center' },
    { label: 'Conductor', align: 'left' },
    { label: 'Ruta / Mina', align: 'left' },
    { label: 'Nro. Ticket', align: 'center' },
    { label: 'Toneladas', align: 'right' },
    { label: 'Monto $', align: 'right' },
    { label: 'Viático $', align: 'right' },
  ], 4)

  const aligns2: Align[] = ['center', 'center', 'left', 'left', 'center', 'right', 'right', 'right']
  const numFmts2 = [null, null, null, null, null, '#,##0.000', '$#,##0.00', '$#,##0.00']

  trips.forEach((t, i) => {
    addDataRow(ws2, [
      fmtDate(t.date),
      t.truck?.plate ?? '—',
      t.truck?.driver?.name ?? '—',
      t.route?.name ?? '—',
      t.ticketNo ?? '—',
      t.netWeightKg ? t.netWeightKg / 1000 : 0,
      t.amount,
      t.viatico,
    ], i + 5, i % 2 === 1, aligns2, numFmts2)
  })

  addSpacer(ws2, trips.length + 5)
  addTotalRow(ws2, [
    '', '', '', '', `${trips.length} viajes`,
    trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0) / 1000,
    trips.reduce((s, t) => s + t.amount, 0),
    trips.reduce((s, t) => s + t.viatico, 0),
  ], trips.length + 6, aligns2, numFmts2)

  return { data: await toBase64(wb), filename: `camiones-${from ?? 'inicio'}-${to ?? 'hoy'}.xlsx` }
}
