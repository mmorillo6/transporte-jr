// Relación Completa para José — Excel maestro (equivalente al Excel de Fernando)
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  NAVY:       'FF1E3A5F',
  NAVY_MID:   'FF2C5282',
  NAVY_LIGHT: 'FFD6E4F0',
  GOLD:       'FFFBBF24',
  GOLD_LIGHT: 'FFFEF3C7',
  SLATE:      'FF64748B',
  WHITE:      'FFFFFFFF',
  OFF_WHITE:  'FFF8FAFC',
  BORDER:     'FFCBD5E1',
  BORDER_MED: 'FF94A3B8',
  GREEN:      'FF059669',
  RED:        'FFDC2626',
  AMBER:      'FFF59E0B',
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}
function border(style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Borders> {
  const c = { argb: C.BORDER_MED }
  return { top: { style, color: c }, bottom: { style, color: c }, left: { style, color: c }, right: { style, color: c } }
}
function medBorder(): Partial<ExcelJS.Borders> {
  const c = { argb: C.NAVY }
  return { top: { style: 'medium', color: c }, bottom: { style: 'medium', color: c }, left: { style: 'medium', color: c }, right: { style: 'medium', color: c } }
}

function cell(
  ws: ExcelJS.Worksheet, addr: string, val: string | number | null,
  opts: { bold?: boolean; size?: number; color?: string; bg?: string; halign?: ExcelJS.Alignment['horizontal']; numFmt?: string; italic?: boolean; border?: Partial<ExcelJS.Borders> } = {}
) {
  const c = ws.getCell(addr)
  c.value = val
  c.font = { bold: opts.bold ?? false, size: opts.size ?? 10, color: { argb: opts.color ?? 'FF111827' }, italic: opts.italic ?? false }
  if (opts.bg) c.fill = fill(opts.bg)
  if (opts.border) c.border = opts.border
  if (opts.numFmt) c.numFmt = opts.numFmt
  c.alignment = { horizontal: opts.halign ?? 'left', vertical: 'middle' }
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const fmt$ = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── HOJA: NOMINA Y GASTOS OP. ─────────────────────────────────────────────────
function addNominaSheet(
  wb: ExcelJS.Workbook,
  payroll: Awaited<ReturnType<typeof fetchData>>['payroll'],
  periodLabel: string,
) {
  const ws = wb.addWorksheet('NOMINA Y GASTOS OP.')
  ws.columns = [
    { width: 22 }, // Transportista
    { width: 10 }, // Placa
    { width: 14 }, // Dueño
    { width: 12 }, // Ton
    { width: 13 }, // Bruto
    { width: 10 }, // Viático
    { width: 13 }, // Nómina
    { width: 13 }, // 5% NPR
    { width: 13 }, // Mecánicos
    { width: 12 }, // Admin
    { width: 13 }, // Saldo ini.
    { width: 10 }, // Abono
    { width: 13 }, // Saldo final
  ]

  // Título
  ws.mergeCells('A1:M1')
  cell(ws, 'A1', `NÓMINA Y GASTOS OPERATIVOS — ${periodLabel}`, { bold: true, size: 13, halign: 'center', color: C.WHITE, bg: C.NAVY })
  ws.getRow(1).height = 26

  // Headers
  const headers = ['Transportista','Placa','Dueño','Ton','Bruto $','Viático','Nómina','5% NPR','Mecánicos','Admin','Saldo ini.','Abono','Saldo final']
  const hRow = ws.getRow(3)
  hRow.height = 24
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1)
    c.value = h
    c.font = { bold: true, size: 9, color: { argb: C.WHITE } }
    c.fill = fill(C.NAVY_MID)
    c.border = border()
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  // Datos
  let r = 4
  const sorted = [...payroll].sort((a, b) => (a.truck.driver?.name ?? '').localeCompare(b.truck.driver?.name ?? ''))
  sorted.forEach((entry, i) => {
    const row = ws.getRow(r++)
    row.height = 18
    const isEven = i % 2 === 1
    const bg = isEven ? C.OFF_WHITE : C.WHITE
    const values = [
      entry.truck.driver?.name ?? '—',
      entry.truck.plate,
      entry.truck.owner?.name ?? '—',
      Math.round(entry.totalTons * 100) / 100,
      Math.round(entry.grossAmount * 100) / 100,
      Math.round(entry.viaticos * 100) / 100,
      Math.round(entry.driverWage * 100) / 100,
      Math.round(entry.nprFee * 100) / 100,
      Math.round(entry.mechanicFee * 100) / 100,
      Math.round(entry.adminFee * 100) / 100,
      Math.round(entry.saldoInicial * 100) / 100,
      Math.round(entry.abono * 100) / 100,
      Math.round(entry.netAmount * 100) / 100,
    ]
    values.forEach((val, idx) => {
      const c = row.getCell(idx + 1)
      c.value = val
      c.fill = fill(bg)
      c.border = border()
      c.font = { size: 9, bold: idx === 12, color: { argb: idx === 12 ? (Number(val) < 0 ? C.RED : C.NAVY) : 'FF111827' } }
      c.alignment = { horizontal: idx < 3 ? 'left' : 'right', vertical: 'middle' }
      if (idx >= 3) c.numFmt = idx === 3 ? '#,##0.000' : '#,##0.00'
    })
  })

  // Totales
  ws.getRow(r).height = 22
  ws.mergeCells(`A${r}:C${r}`)
  cell(ws, `A${r}`, 'TOTAL', { bold: true, size: 10, halign: 'right', bg: C.NAVY_LIGHT, color: C.NAVY, border: medBorder() })
  const totCols = [
    payroll.reduce((s, e) => s + e.totalTons, 0),
    payroll.reduce((s, e) => s + e.grossAmount, 0),
    payroll.reduce((s, e) => s + e.viaticos, 0),
    payroll.reduce((s, e) => s + e.driverWage, 0),
    payroll.reduce((s, e) => s + e.nprFee, 0),
    payroll.reduce((s, e) => s + e.mechanicFee, 0),
    payroll.reduce((s, e) => s + e.adminFee, 0),
    payroll.reduce((s, e) => s + e.saldoInicial, 0),
    payroll.reduce((s, e) => s + e.abono, 0),
    payroll.reduce((s, e) => s + e.netAmount, 0),
  ]
  totCols.forEach((val, idx) => {
    const c = ws.getRow(r).getCell(idx + 4)
    c.value = Math.round(val * 100) / 100
    c.font = { bold: true, size: 10, color: { argb: idx === 9 ? (val < 0 ? C.RED : C.NAVY) : C.NAVY } }
    c.fill = fill(C.NAVY_LIGHT)
    c.border = medBorder()
    c.alignment = { horizontal: 'right', vertical: 'middle' }
    c.numFmt = idx === 0 ? '#,##0.000' : '#,##0.00'
  })
}

// ── HOJA: RESUMEN DEUDA AURUMIN ───────────────────────────────────────────────
function addResumenDeudaSheet(
  wb: ExcelJS.Workbook,
  cuentas: Awaited<ReturnType<typeof fetchData>>['cuentasAurumin'],
) {
  if (!cuentas.length) return
  const ws = wb.addWorksheet('RESUMEN DEUDA AURUMIN')
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }]

  ws.mergeCells('A1:D1')
  cell(ws, 'A1', 'RESUMEN DEUDA — AURUMIN, C.A', { bold: true, size: 13, halign: 'center', color: C.WHITE, bg: C.NAVY })
  ws.getRow(1).height = 26

  const hRow = ws.getRow(3)
  hRow.height = 22
  ;['Período', 'Total / Subtotal', 'Abono', 'Saldo'].forEach((h, i) => {
    const c = hRow.getCell(i + 1)
    c.value = h; c.font = { bold: true, size: 10, color: { argb: C.WHITE } }
    c.fill = fill(C.NAVY_MID); c.border = border()
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' }
  })

  cuentas.forEach((row, i) => {
    const dr = ws.getRow(i + 4)
    dr.height = 18
    const isEven = i % 2 === 1
    const vals = [row.periodLabel ?? '—', row.totalAmount, row.amountPaid, row.balance]
    vals.forEach((v, idx) => {
      const c = dr.getCell(idx + 1)
      c.value = v; c.fill = fill(isEven ? C.OFF_WHITE : C.WHITE)
      c.border = border()
      c.font = { size: 10, bold: idx === 3, color: { argb: idx === 3 && Number(v) > 0 ? C.RED : 'FF111827' } }
      c.alignment = { horizontal: idx === 0 ? 'left' : 'right', vertical: 'middle' }
      if (idx > 0) c.numFmt = '#,##0.00'
    })
  })

  // Total pendiente
  const r = cuentas.length + 4
  ws.mergeCells(`A${r}:C${r}`)
  cell(ws, `A${r}`, 'SALDO TOTAL PENDIENTE', { bold: true, size: 11, halign: 'right', bg: C.GOLD_LIGHT, border: medBorder() })
  const pending = cuentas.filter(c => c.status !== 'PAID').reduce((s, c) => s + c.balance, 0)
  cell(ws, `D${r}`, Math.round(pending * 100) / 100, { bold: true, size: 11, halign: 'right', bg: C.GOLD_LIGHT, numFmt: '#,##0.00', border: medBorder() })
  ws.getRow(r).height = 22
}

// ── HOJA: CUENTA POR DUEÑO ───────────────────────────────────────────────────
function addOwnerSheet(
  wb: ExcelJS.Workbook,
  ownerName: string,
  entries: Awaited<ReturnType<typeof fetchData>>['payroll'],
) {
  if (!entries.length) return
  const ws = wb.addWorksheet(ownerName.slice(0, 31))

  ws.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }]

  ws.mergeCells('A1:G1')
  cell(ws, 'A1', `CUENTA — ${ownerName.toUpperCase()}`, { bold: true, size: 13, halign: 'center', color: C.WHITE, bg: C.NAVY })
  ws.getRow(1).height = 26

  // Resumen encabezado
  const truckCols = entries.map(e => e.truck.plate)
  const allCols = ['', ...truckCols, 'SUBTOTAL', 'ABONO', 'SALDO FINAL']
  // Dynamic columns
  ws.columns = [
    { width: 22 },
    ...entries.map(() => ({ width: 14 })),
    { width: 14 }, { width: 14 }, { width: 14 },
  ]

  // Header row
  const hRow = ws.getRow(3)
  hRow.height = 22
  allCols.forEach((h, i) => {
    const c = hRow.getCell(i + 1)
    c.value = h; c.font = { bold: true, size: 9, color: { argb: C.WHITE } }
    c.fill = fill(C.NAVY); c.border = border()
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Summary rows
  const summaryRows: [string, (e: typeof entries[0]) => number][] = [
    ['SALDO INICIAL',   e => e.saldoInicial],
    ['FACTURACIÓN',     e => e.grossAmount],
    ['GASTOS OP.',      e => e.deductions],
    ['NÓMINA CHOFER',   e => e.driverWage],
    ['MECÁNICOS',       e => e.mechanicFee],
    ['ADMINISTRATIVO',  e => e.adminFee],
    ['5% NPR',          e => e.nprFee],
    ['ABONO',           e => e.abono],
    ['SALDO FINAL',     e => e.netAmount],
  ]

  let r = 4
  summaryRows.forEach(([label, fn], si) => {
    const row = ws.getRow(r++)
    row.height = 18
    const isTotRow  = label === 'SALDO FINAL' || label === 'FACTURACIÓN'
    const bg = isTotRow ? C.NAVY_LIGHT : (si % 2 === 0 ? C.WHITE : C.OFF_WHITE)
    cell(ws, `A${r - 1}`, label, { bold: isTotRow, size: 9, bg, border: border() })

    let rowTotal = 0
    entries.forEach((e, ei) => {
      const val = Math.round(fn(e) * 100) / 100
      rowTotal += val
      const c = row.getCell(ei + 2)
      c.value = val; c.fill = fill(bg); c.border = border()
      c.font = { size: 9, bold: isTotRow, color: { argb: val < 0 ? C.RED : 'FF111827' } }
      c.alignment = { horizontal: 'right', vertical: 'middle' }
      c.numFmt = '#,##0.00'
    })

    // Subtotal col
    const subCol = entries.length + 2
    const subCell = row.getCell(subCol)
    const netTotal = Math.round(rowTotal * 100) / 100
    subCell.value = netTotal; subCell.fill = fill(bg); subCell.border = border()
    subCell.font = { size: 9, bold: true, color: { argb: netTotal < 0 ? C.RED : C.NAVY } }
    subCell.alignment = { horizontal: 'right', vertical: 'middle' }
    subCell.numFmt = '#,##0.00'

    // Abono & Saldo final cols only on last row
    if (label === 'ABONO') {
      const abonoTotal = entries.reduce((s, e) => s + e.abono, 0)
      const abonoCell = row.getCell(subCol)
      abonoCell.value = Math.round(abonoTotal * 100) / 100
    }
    if (label === 'SALDO FINAL') {
      const saldoTotal = entries.reduce((s, e) => s + e.netAmount, 0)
      const saldoCell = row.getCell(entries.length + 4)
      saldoCell.value = Math.round(saldoTotal * 100) / 100
      saldoCell.fill = fill(C.NAVY_LIGHT); saldoCell.border = medBorder()
      saldoCell.font = { bold: true, size: 11, color: { argb: saldoTotal < 0 ? C.RED : C.NAVY } }
      saldoCell.alignment = { horizontal: 'right', vertical: 'middle' }
      saldoCell.numFmt = '#,##0.00'
    }
  })

  // Detalle de gastos operativos por camión (si hay)
  r += 2
  ws.mergeCells(`A${r}:G${r}`)
  cell(ws, `A${r}`, 'DETALLE GASTOS OPERATIVOS', { bold: true, size: 10, halign: 'center', color: C.WHITE, bg: C.NAVY_MID })
  ws.getRow(r++).height = 20

  entries.forEach(e => {
    ws.getRow(r).height = 14
    cell(ws, `A${r}`, e.truck.plate, { bold: true, size: 9, bg: C.NAVY_LIGHT })
    cell(ws, `B${r}`, e.truck.driver?.name ?? '—', { size: 9, bg: C.NAVY_LIGHT })
    cell(ws, `C${r}`, 'Gastos Op.', { size: 9, bg: C.NAVY_LIGHT })
    cell(ws, `D${r}`, Math.round(e.deductions * 100) / 100, { size: 9, numFmt: '#,##0.00', halign: 'right', bg: C.NAVY_LIGHT })
    r++
    if (e.notes) {
      e.notes.split('\n').filter(Boolean).forEach(note => {
        ws.getRow(r).height = 14
        cell(ws, `B${r}`, note, { size: 8, italic: true })
        r++
      })
    }
  })
}

// ── HOJA: % AFILIADOS ─────────────────────────────────────────────────────────
function addAfiliadosSheet(
  wb: ExcelJS.Workbook,
  afiliados: Awaited<ReturnType<typeof fetchData>>['afiliados'],
  periodLabel: string,
) {
  if (!afiliados.length) return
  const ws = wb.addWorksheet('% AFILIADOS')

  const trucksUniq = [...new Set(afiliados.map(a => a.plate))]
  ws.columns = [
    { width: 20 }, // Período
    ...trucksUniq.map(() => ({ width: 12 })),
    { width: 12 }, // Total
    { width: 12 }, // 10% Fernando
    { width: 14 }, // Caja chica (90%)
  ]

  ws.mergeCells(1, 1, 1, trucksUniq.length + 4)
  cell(ws, 'A1', `% AFILIADOS — ${periodLabel}`, { bold: true, size: 12, halign: 'center', color: C.WHITE, bg: C.NAVY })
  ws.getRow(1).height = 24

  const hRow = ws.getRow(3)
  hRow.height = 22
  const hdrLabels = ['Período', ...trucksUniq, 'TOTAL', '10% Fernando', 'C.C. Afiliados']
  hdrLabels.forEach((h, i) => {
    const c = hRow.getCell(i + 1)
    c.value = h; c.font = { bold: true, size: 9, color: { argb: C.WHITE } }
    c.fill = fill(C.NAVY_MID); c.border = border()
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  // One row per quincena
  const byPeriod = new Map<string, { label: string; byPlate: Map<string, number> }>()
  for (const a of afiliados) {
    if (!byPeriod.has(a.periodId)) byPeriod.set(a.periodId, { label: a.periodLabel, byPlate: new Map() })
    byPeriod.get(a.periodId)!.byPlate.set(a.plate, (byPeriod.get(a.periodId)!.byPlate.get(a.plate) ?? 0) + a.grossAmount)
  }

  let r = 4
  Array.from(byPeriod.values()).forEach((period, i) => {
    const row = ws.getRow(r++)
    row.height = 18
    const bg = i % 2 === 0 ? C.WHITE : C.OFF_WHITE
    cell(ws, `A${r - 1}`, period.label, { size: 9, bg, border: border() })
    let total = 0
    trucksUniq.forEach((plate, pi) => {
      const amt = period.byPlate.get(plate) ?? 0
      total += amt
      const c = row.getCell(pi + 2)
      c.value = Math.round(amt * 100) / 100; c.fill = fill(bg); c.border = border()
      c.font = { size: 9 }; c.alignment = { horizontal: 'right', vertical: 'middle' }; c.numFmt = '#,##0.00'
    })
    const base = trucksUniq.length + 2
    const fernando10 = Math.round(total * 0.10 * 100) / 100
    ;[total, fernando10, Math.round((total - fernando10) * 100) / 100].forEach((v, vi) => {
      const c = row.getCell(base + vi)
      c.value = v; c.fill = fill(vi === 0 ? C.NAVY_LIGHT : bg); c.border = border()
      c.font = { size: 9, bold: vi === 0 }; c.alignment = { horizontal: 'right', vertical: 'middle' }; c.numFmt = '#,##0.00'
    })
  })
}

// ── Fetch de datos ─────────────────────────────────────────────────────────────
async function fetchData(start: Date, end: Date) {
  const [payroll, cuentasAurumin, owners, allPayrollAfiliados] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: {
        period: { startDate: { lte: end }, endDate: { gte: start } },
      },
      include: {
        truck: { include: { owner: true, driver: { select: { name: true } } } },
      },
      orderBy: { truck: { plate: 'asc' } },
    }),
    prisma.cuentaPorCobrar.findMany({
      where: { clientName: 'AURUMIN' },
      orderBy: { date: 'asc' },
    }),
    prisma.owner.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    // All payroll for afiliado trucks across all periods (for % afiliados history)
    prisma.payrollEntry.findMany({
      where: {
        truck: { owner: { type: 'AFILIADO' } },
        period: { endDate: { lte: end } },
      },
      include: {
        truck: { include: { owner: true } },
        period: { select: { startDate: true, endDate: true } },
      },
      orderBy: { period: { startDate: 'asc' } },
    }),
  ])

  // Build afiliados list
  const afiliados = allPayrollAfiliados.map(e => ({
    periodId:    e.periodId,
    periodLabel: `${fmtDate(e.period.startDate)} al ${fmtDate(e.period.endDate)}`,
    plate:       e.truck.plate,
    grossAmount: e.grossAmount,
  }))

  return { payroll, cuentasAurumin, owners, afiliados }
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { startDate: string; endDate: string }
    const start = new Date(body.startDate + 'T00:00:00')
    const end   = new Date(body.endDate   + 'T23:59:59')

    const { payroll, cuentasAurumin, owners, afiliados } = await fetchData(start, end)

    if (!payroll.length) {
      return new NextResponse(JSON.stringify({ error: 'No hay nómina para este período' }), { status: 400 })
    }

    const fmtD   = (d: Date) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`
    const periodLabel = `Del ${fmtD(start)} al ${fmtD(end)}`

    const wb = new ExcelJS.Workbook()
    wb.creator  = 'Transporte JR'
    wb.modified = new Date()

    // 1. Nómina y Gastos Operativos
    addNominaSheet(wb, payroll, periodLabel)

    // 2. Resumen Deuda Aurumin
    addResumenDeudaSheet(wb, cuentasAurumin)

    // 3. Hoja por dueño
    for (const owner of owners) {
      const ownerEntries = payroll.filter(e => e.truck.ownerId === owner.id)
      if (ownerEntries.length > 0) {
        addOwnerSheet(wb, owner.name, ownerEntries)
      }
    }

    // 4. % Afiliados
    addAfiliadosSheet(wb, afiliados, periodLabel)

    const buf = await wb.xlsx.writeBuffer()
    const safePeriod = periodLabel.replace(/\//g, '-').replace(/\s/g, '_')
    const filename   = `Relacion-Completa-${safePeriod}.xlsx`

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generando Relación Completa:', err)
    return new NextResponse(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
