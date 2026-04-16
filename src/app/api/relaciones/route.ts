// v2 — estilos profesionales navy, filas dinámicas, firma compacta
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import type { RelacionPreview } from '@/app/actions/generarRelacion'

function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ── Paleta de colores profesional ────────────────────────────────────────────
const COL = {
  NAVY:        'FF1E3A5F',  // azul oscuro — headers principales
  NAVY_MID:    'FF2C5282',  // azul medio — subheaders
  NAVY_LIGHT:  'FFD6E4F0',  // azul pálido — totales / highlight
  SLATE:       'FF64748B',  // gris pizarra — texto secundario
  OFF_WHITE:   'FFF8FAFC',  // blanco cálido — filas alternas
  WHITE:       'FFFFFFFF',
  GOLD:        'FFFBBF24',  // ámbar — acento totales
  GOLD_LIGHT:  'FFFEF3C7',
  BORDER:      'FFCBD5E1',  // borde suave
  BORDER_MED:  'FF94A3B8',
}

type ArgbColor = string

function fill(argb: ArgbColor): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function border(
  style: ExcelJS.BorderStyle = 'thin',
  sides: ('top'|'left'|'bottom'|'right')[] = ['top','left','bottom','right'],
): Partial<ExcelJS.Borders> {
  return Object.fromEntries(sides.map(s => [s, { style, color: { argb: COL.BORDER_MED } }]))
}

function mediumBorder(sides: ('top'|'left'|'bottom'|'right')[] = ['top','left','bottom','right']): Partial<ExcelJS.Borders> {
  return Object.fromEntries(sides.map(s => [s, { style: 'medium' as const, color: { argb: COL.NAVY } }]))
}

// ── Mapa de nombres de ruta ───────────────────────────────────────────────────
function routeDisplayName(routeName: string, destino: string): string {
  const map: Record<string, string> = {
    'FOSFORITO':              `Fosforito (La Tomy) - ${destino}`,
    'CHARLIE RICHARD':        `Charlie Richard (La Tomy) - ${destino}`,
    'SOSA MENDEZ':            `Sosa Mendez - ${destino}`,
    'LA GARRAPATA':           `La Garrapata (La Tomy) - ${destino}`,
    'MACKENCI':               `Mackenci (La Tomy) - ${destino}`,
    'LAS CLARITAS (SAN LUIS)': `Las Claritas (San Luis) - ${destino}`,
    'ROSCIO SUR':             `Roscio Sur - ${destino}`,
    'POZO AURUVEN':           `Pozo Auruven - ${destino}`,
    'LA FE':                  `La Fe - ${destino}`,
    'NUEVO CALLAO':           `Nuevo Callao - ${destino}`,
    'CH.R. - RUBEN MARIN':   `Ch. Richard Rubén Marín - ${destino}`,
    'DIAS INTERNOS':          `Días Internos - ${destino}`,
  }
  return map[routeName] ?? `${routeName} - ${destino}`
}

function routeOrigin(routeName: string): string {
  const map: Record<string, string> = {
    'FOSFORITO':              'Fosforito - La Tomy',
    'CHARLIE RICHARD':        'La Tomy - Charlie Richard',
    'SOSA MENDEZ':            'Sosa Mendez',
    'LA GARRAPATA':           'La Tomy - La Garrapata',
    'MACKENCI':               'Makenci - La Tomy',
    'LAS CLARITAS (SAN LUIS)': 'Las Claritas (San Luis)',
    'ROSCIO SUR':             'Pozo Auruven - Roscio Sur',
    'POZO AURUVEN':           'Pozo Auruven',
    'LA FE':                  'La Fe',
    'NUEVO CALLAO':           'Nuevo Callao',
    'CH.R. - RUBEN MARIN':   'La Tomy - Ch. Richard Rubén Marín',
    'DIAS INTERNOS':          'Días Internos',
  }
  return map[routeName] ?? routeName
}

// ── Helpers de celda ─────────────────────────────────────────────────────────
function setCell(
  ws: ExcelJS.Worksheet,
  addr: string,
  val: string | number | null,
  opts: {
    bold?: boolean; size?: number; color?: string; bg?: string
    halign?: ExcelJS.Alignment['horizontal']; valign?: ExcelJS.Alignment['vertical']
    wrap?: boolean; border?: Partial<ExcelJS.Borders>; numFmt?: string; italic?: boolean
  } = {},
) {
  const c = ws.getCell(addr)
  c.value = val
  c.font = {
    bold:   opts.bold  ?? false,
    size:   opts.size  ?? 10,
    color:  { argb: opts.color ?? 'FF111827' },
    italic: opts.italic ?? false,
  }
  if (opts.bg)     c.fill   = fill(opts.bg)
  if (opts.border) c.border = opts.border
  if (opts.numFmt) c.numFmt = opts.numFmt
  c.alignment = {
    horizontal: opts.halign ?? 'left',
    vertical:   opts.valign ?? 'middle',
    wrapText:   opts.wrap   ?? false,
  }
  return c
}

// ── NOTA DE ENTREGA ──────────────────────────────────────────────────────────
function addNotaSheet(
  wb: ExcelJS.Workbook,
  preview: RelacionPreview,
  abono: number,
  clientLabel: string,
  clientRif: string | null,
  clientAddress: string,
  destinoLabel: string,
) {
  const ws = wb.addWorksheet('NOTA DE ENTREGA')

  // Anchos de columna optimizados
  ws.columns = [
    { width: 1  },  // A: margen
    { width: 7  },  // B: Item
    { width: 20 },  // C: Fecha
    { width: 11 },  // D: Total Viajes
    { width: 30 },  // E: Descripción
    { width: 8  },  // F: Placa
    { width: 8  },  // G: Und
    { width: 13 },  // H: Cantidad
    { width: 14 },  // I: Precio Unitario
    { width: 15 },  // J: Monto a Cobrar
  ]

  // ── Encabezado empresa ────────────────────────────────────────────────────
  ws.mergeCells('B1:J1')
  setCell(ws, 'B1', 'Acarreos José Rodríguez', {
    bold: true, size: 15, halign: 'center', valign: 'middle', color: COL.NAVY,
  })
  ws.getRow(1).height = 24

  ws.mergeCells('B2:J2')
  setCell(ws, 'B2', 'RIF: V-11.352.305  ·  Valencia, Edo. Carabobo', {
    size: 10, halign: 'center', color: COL.SLATE, italic: true,
  })
  ws.getRow(2).height = 14

  // Separador visual
  ws.mergeCells('B3:J3')
  ws.getCell('B3').fill   = fill(COL.NAVY)
  ws.getCell('B3').border = border('thin', ['top','bottom'])
  ws.getRow(3).height = 3

  // ── Título ────────────────────────────────────────────────────────────────
  ws.mergeCells('B5:J5')
  setCell(ws, 'B5', 'NOTA DE ENTREGA', {
    bold: true, size: 13, halign: 'center', valign: 'middle', color: COL.NAVY,
  })
  ws.getRow(5).height = 22

  ws.mergeCells('B6:J6')
  setCell(ws, 'B6', preview.periodLabel, {
    size: 10, halign: 'center', color: COL.SLATE, italic: true,
  })
  ws.getRow(6).height = 14

  // ── Info lateral (Fecha / Nro / Corte) ───────────────────────────────────
  const labelStyle = { bold: true, size: 10, halign: 'right' as const, color: COL.NAVY }
  const valStyle   = { size: 10, color: 'FF111827' }

  setCell(ws, 'I8',  'Fecha:',  labelStyle)
  setCell(ws, 'J8',  fmtDate(preview.endDate), valStyle)
  ws.getRow(8).height = 16

  let metaRow = 9
  if (preview.client === 'AURUMIN') {
    setCell(ws, `I${metaRow}`, 'Nro.',   labelStyle)
    setCell(ws, `J${metaRow}`, preview.relationNo, valStyle)
    metaRow++
  }
  setCell(ws, `I${metaRow}`, 'Corte:', labelStyle)
  setCell(ws, `J${metaRow}`, preview.periodLabel, { ...valStyle, size: 9 })
  ws.getRow(metaRow).height = 16

  // ── Info cliente ──────────────────────────────────────────────────────────
  let r = 8

  ws.mergeCells(`B${r}:H${r}`)
  setCell(ws, `B${r}`, `Cliente: ${clientLabel}`, { bold: true, size: 11, color: COL.NAVY })
  ws.getRow(r).height = 18
  r++

  if (clientRif) {
    ws.mergeCells(`B${r}:D${r}`)
    setCell(ws, `B${r}`, `RIF: ${clientRif}`, { bold: true, size: 10, color: COL.NAVY })
    ws.getRow(r).height = 16
    r++
  }

  ws.getCell(`B${r}`).value = 'Dirección:'
  ws.getCell(`B${r}`).font  = { size: 9, color: { argb: COL.SLATE }, bold: true }
  ws.mergeCells(`C${r}:H${r}`)
  setCell(ws, `C${r}`, clientAddress, { size: 9, color: COL.SLATE, wrap: true })
  ws.getRow(r).height = 14
  r += 2

  ws.getCell(`B${r}`).value = 'Destino:'
  ws.getCell(`B${r}`).font  = { size: 10, bold: true, color: { argb: COL.SLATE } }
  ws.mergeCells(`C${r}:H${r}`)
  setCell(ws, `C${r}`, destinoLabel, { size: 10, bold: true, color: 'FF111827' })
  ws.getRow(r).height = 16
  r += 2

  // ── Encabezado de tabla ───────────────────────────────────────────────────
  const tableHeaders = ['Item', 'Fecha', 'Total Viajes', 'Descripción', 'Placa', 'Und', 'Cantidad', 'Precio Unit.', 'Monto']
  const hRow = ws.getRow(r)
  tableHeaders.forEach((h, i) => {
    const cell = hRow.getCell(i + 2)
    cell.value     = h
    cell.font      = { bold: true, size: 10, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hRow.height = 28
  r++

  // ── Filas de datos (solo rutas reales — sin filas vacías) ─────────────────
  const periodStr = `${fmtDate(preview.startDate)} al ${fmtDate(preview.endDate)}`

  preview.byRoute.forEach((route, i) => {
    const qty = Math.round(route.quantity * 100) / 100
    const amt = Math.round(route.amount   * 100) / 100
    const row = ws.getRow(r)
    const isEven = i % 2 === 1

    const rowData: Array<{ val: string | number | null; align: ExcelJS.Alignment['horizontal']; numFmt?: string; wrap?: boolean }> = [
      { val: i + 1,                                              align: 'center' },
      { val: periodStr,                                          align: 'center', wrap: true },
      { val: '—',                                               align: 'center' },
      { val: routeDisplayName(route.routeName, destinoLabel),   align: 'left',   wrap: true },
      { val: '—',                                               align: 'center' },
      { val: route.unit,                                        align: 'center' },
      { val: qty,                                               align: 'right',  numFmt: '#,##0.000' },
      { val: route.rate,                                        align: 'right',  numFmt: '#,##0.00'  },
      { val: amt,                                               align: 'right',  numFmt: '#,##0.00'  },
    ]

    rowData.forEach((d, idx) => {
      const cell = row.getCell(idx + 2)
      cell.value     = d.val
      cell.font      = { size: 10, bold: idx === 0, color: { argb: 'FF111827' } }
      cell.fill      = fill(isEven ? COL.OFF_WHITE : COL.WHITE)
      cell.border    = border('thin')
      cell.alignment = { horizontal: d.align, vertical: 'middle', wrapText: d.wrap ?? false }
      if (d.numFmt) cell.numFmt = d.numFmt
    })
    row.height = 22
    r++
  })

  // ── Total a Cancelar ──────────────────────────────────────────────────────
  r++
  const totRow = ws.getRow(r)

  // Merge etiqueta
  ws.mergeCells(`B${r}:I${r}`)
  const totLabelCell = totRow.getCell(2)
  totLabelCell.value     = 'TOTAL A CANCELAR'
  totLabelCell.font      = { bold: true, size: 11, color: { argb: COL.NAVY } }
  totLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }
  totLabelCell.fill      = fill(COL.NAVY_LIGHT)
  totLabelCell.border    = mediumBorder(['top','bottom','left'])

  const totValCell = totRow.getCell(10)
  totValCell.value     = Math.round(preview.totalFacturado * 100) / 100
  totValCell.font      = { bold: true, size: 12, color: { argb: COL.NAVY } }
  totValCell.numFmt    = '#,##0.00'
  totValCell.alignment = { horizontal: 'right', vertical: 'middle' }
  totValCell.fill      = fill(COL.NAVY_LIGHT)
  totValCell.border    = mediumBorder(['top','bottom','right'])
  ws.getRow(r).height  = 22

  // ── Firmas ────────────────────────────────────────────────────────────────
  r += 2  // 1 fila en blanco

  // Etiqueta
  ws.mergeCells(`B${r}:F${r}`)
  const entCell = ws.getCell(`B${r}`)
  entCell.value     = 'Entregado'
  entCell.font      = { bold: true, size: 10, color: { argb: COL.NAVY } }
  entCell.alignment = { horizontal: 'center', vertical: 'middle' }
  entCell.fill      = fill(COL.NAVY_LIGHT)
  entCell.border    = mediumBorder(['top','left','right','bottom'])

  ws.mergeCells(`G${r}:J${r}`)
  const recCell = ws.getCell(`G${r}`)
  recCell.value     = 'Recibe Conforme'
  recCell.font      = { bold: true, size: 10, color: { argb: COL.NAVY } }
  recCell.alignment = { horizontal: 'center', vertical: 'middle' }
  recCell.fill      = fill(COL.NAVY_LIGHT)
  recCell.border    = mediumBorder(['top','left','right','bottom'])
  ws.getRow(r).height = 20
  r++

  // Espacio de firma — 2 filas
  const sigEnd = r + 1
  ws.mergeCells(`B${r}:F${sigEnd}`)
  ws.getCell(`B${r}`).border = mediumBorder(['left','right','bottom'])
  ws.mergeCells(`G${r}:J${sigEnd}`)
  ws.getCell(`G${r}`).border = mediumBorder(['left','right','bottom'])
  for (let i = r; i <= sigEnd; i++) ws.getRow(i).height = 20
}

// ── HOJA POR RUTA ─────────────────────────────────────────────────────────────
function addRouteSheet(wb: ExcelJS.Workbook, route: RelacionPreview['byRoute'][0]) {
  const ws = wb.addWorksheet(route.routeName.slice(0, 31))
  ws.columns = [
    { width: 6  },  // Item
    { width: 14 },  // Ticket
    { width: 13 },  // Fecha
    { width: 24 },  // Origen
    { width: 16 },  // Material
    { width: 18 },  // Transportista
    { width: 22 },  // Conductor
    { width: 12 },  // Placa
    { width: 14 },  // Peso Neto
  ]

  // Fila 1 en blanco
  ws.addRow([])

  // Título
  ws.mergeCells('A2:I2')
  setCell(ws, 'A2', `RELACIÓN DE ACARREO — ${route.routeName}`, {
    bold: true, size: 12, halign: 'center', color: COL.NAVY,
  })
  ws.getRow(2).height = 22

  ws.addRow([])

  // Headers
  const headers = ['Item', 'Nro. Ticket', 'Fecha', 'Origen', 'Material', 'Transportista', 'Conductor', 'Placa', 'Peso Neto (kg)']
  const hRow = ws.getRow(4)
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1)
    cell.value     = h
    cell.font      = { bold: true, size: 10, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY_MID)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hRow.height = 28

  // Datos
  route.trips.forEach((t, i) => {
    const isEven = i % 2 === 1
    const row = ws.addRow([
      i + 1,
      t.ticketNo ?? '—',
      fmtDate(t.date),
      routeOrigin(route.routeName),
      'A Granel',
      'José Rodríguez',
      t.conductor,
      t.plate,
      t.netWeightKg ?? '—',
    ])
    row.height = 18
    row.eachCell({ includeEmpty: false }, (cell, colN) => {
      cell.fill      = fill(isEven ? COL.OFF_WHITE : COL.WHITE)
      cell.border    = border('thin')
      cell.alignment = { horizontal: colN === 1 || colN >= 9 ? 'right' : 'left', vertical: 'middle' }
      cell.font      = { size: 10, bold: colN === 1 }
      if (colN === 9 && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
    })
  })

  // Total
  ws.addRow([])
  const totalKg = route.trips.reduce((s, t) => s + (t.netWeightKg ?? 0), 0)
  const totRow = ws.addRow(['', '', '', '', '', '', '', 'TOTAL KG', totalKg])
  totRow.height = 20
  ;[8, 9].forEach(col => {
    const cell = totRow.getCell(col)
    cell.font      = { bold: true, size: 11, color: { argb: COL.NAVY } }
    cell.fill      = fill(COL.NAVY_LIGHT)
    cell.border    = border('medium')
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (col === 9) cell.numFmt = '#,##0.00'
  })

  // Elaborado
  ws.addRow([])
  const sigRow = ws.lastRow!.number + 1
  const sigItems: [number, string, boolean][] = [
    [1, 'Elaborado por:', true], [2, 'FERNANDO PÉREZ', false],
    [4, 'Revisado por:', true],  [6, 'Autorizado por:', true],
  ]
  const row = ws.getRow(sigRow)
  sigItems.forEach(([col, val, bold]) => {
    row.getCell(col).value = val
    row.getCell(col).font  = { bold, size: 10, color: { argb: bold ? COL.NAVY : 'FF374151' } }
  })
  row.height = 18
}

// ── RELACIÓN FINAL ────────────────────────────────────────────────────────────
function addRelacionFinalSheet(wb: ExcelJS.Workbook, preview: RelacionPreview, abono: number) {
  const ws = wb.addWorksheet('RELACION FINAL')
  const saldo    = Math.max(0, preview.subTotal - abono)
  const numCols  = preview.byRoute.length
  const totalCols = numCols + 5

  ws.columns = [
    { width: 5 },
    ...preview.byRoute.map(() => ({ width: 20 })),
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
  ]

  for (let i = 0; i < 5; i++) ws.addRow([])

  // Título
  const endCol = String.fromCharCode(65 + totalCols)
  ws.mergeCells(`B6:${endCol}6`)
  setCell(ws, 'B6', `RELACIÓN DE CAMIONES — ${preview.relationNo}`, {
    bold: true, size: 14, halign: 'center', color: COL.NAVY,
  })
  ws.getRow(6).height = 26

  ws.mergeCells(`B7:${endCol}7`)
  setCell(ws, 'B7', `Período: ${preview.periodLabel}`, {
    size: 10, halign: 'center', color: COL.SLATE, italic: true,
  })
  ws.getRow(7).height = 16

  ws.addRow([])

  // Headers
  const routeHeaders = preview.byRoute.map(r => `${r.routeName}\n(${r.unit} × $${r.rate})`)
  const allHeaders = ['', ...routeHeaders, 'TOTAL', 'ACUMULADO', 'SUB-TOTAL', 'ABONO', 'SALDO']
  const hRow = ws.addRow(allHeaders)
  hRow.height = 40
  hRow.eachCell({ includeEmpty: false }, (cell, colN) => {
    if (colN === 1) return
    cell.font      = { bold: true, size: 10, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  // Cantidades
  const qtys: (string | number)[] = ['',
    ...preview.byRoute.map(r => Math.round(r.quantity * 100) / 100),
    Math.round(preview.totalFacturado * 100) / 100,
    Math.round(preview.acumulado      * 100) / 100,
    Math.round(preview.subTotal       * 100) / 100,
    abono,
    Math.round(saldo * 100) / 100,
  ]
  const qRow = ws.addRow(qtys)
  qRow.height = 22
  qRow.eachCell({ includeEmpty: false }, (cell, colN) => {
    if (colN === 1) return
    cell.font      = { bold: true, size: 11, color: { argb: COL.NAVY } }
    cell.fill      = fill(COL.NAVY_LIGHT)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.numFmt    = '#,##0.000'
  })

  // Montos
  const amts: (string | number)[] = ['', ...preview.byRoute.map(r => Math.round(r.amount * 100) / 100)]
  const aRow = ws.addRow(amts)
  aRow.height = 20
  aRow.eachCell({ includeEmpty: false }, (cell, colN) => {
    if (colN === 1) return
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.numFmt    = '"$"#,##0.00'
    cell.font      = { size: 10, bold: true, color: { argb: COL.NAVY_MID } }
  })

  ws.addRow([])
  const sigRow = ws.addRow(['', 'Elaborado Por: FERNANDO PÉREZ'])
  sigRow.getCell(2).font = { bold: true, size: 10, color: { argb: COL.NAVY } }
  ws.getRow(ws.rowCount).getCell(numCols + 3).value = 'AUTORIZADO por:'
  ws.getRow(ws.rowCount).getCell(numCols + 3).font  = { bold: true, size: 10, color: { argb: COL.NAVY } }
}

// ── ESTADO DE CUENTA ─────────────────────────────────────────────────────────
function addEstadoCuentaSheet(wb: ExcelJS.Workbook, preview: RelacionPreview) {
  if (!preview.estadoCuenta.length) return
  const ws = wb.addWorksheet('ESTADO DE CUENTA')
  ws.columns = [
    { width: 3  },
    { width: 26 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ]

  ws.addRow([])

  // Título
  ws.mergeCells('B2:F2')
  setCell(ws, 'B2', `ESTADO DE CUENTA — ${preview.client}`, {
    bold: true, size: 13, halign: 'center', color: COL.NAVY,
  })
  ws.getRow(2).height = 24

  ws.mergeCells('B3:F3')
  setCell(ws, 'B3', `Generado al ${fmtDate(preview.endDate)}`, {
    size: 9, halign: 'center', color: COL.SLATE, italic: true,
  })
  ws.getRow(3).height = 14

  // Separador
  ws.mergeCells('B4:F4')
  ws.getCell('B4').fill = fill(COL.NAVY)
  ws.getRow(4).height = 3

  ws.addRow([])

  // Headers
  const ecHeaders = ['', 'Período', 'Fecha', 'Facturado', 'Abono', 'Saldo']
  const hRow = ws.getRow(6)
  ecHeaders.forEach((h, i) => {
    const cell = hRow.getCell(i + 1)
    cell.value     = h
    cell.font      = { bold: true, size: 10, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY_MID)
    cell.border    = border('thin')
    cell.alignment = { horizontal: i > 1 ? 'right' : 'center', vertical: 'middle' }
  })
  hRow.height = 24

  // Datos
  preview.estadoCuenta.forEach((row, i) => {
    const isEven = i % 2 === 1
    const dr = ws.addRow(['', row.periodLabel, fmtDate(row.fecha), row.total, row.abono, row.saldo])
    dr.height = 18
    dr.eachCell({ includeEmpty: false }, (cell, colN) => {
      cell.border    = border('thin')
      cell.fill      = fill(isEven ? COL.OFF_WHITE : COL.WHITE)
      cell.font      = { size: 10 }
      cell.alignment = { horizontal: colN > 2 ? 'right' : 'left', vertical: 'middle' }
      if (colN > 2) cell.numFmt = '#,##0.00'
    })
  })

  // Total
  ws.addRow([])
  const last = preview.estadoCuenta[preview.estadoCuenta.length - 1]
  const totRow = ws.addRow(['', 'SALDO TOTAL PENDIENTE', '', '', '', last?.saldo ?? 0])
  totRow.height = 22
  ;[2, 6].forEach(col => {
    const cell = totRow.getCell(col)
    cell.font      = { bold: true, size: 11, color: { argb: COL.NAVY } }
    cell.fill      = fill(COL.NAVY_LIGHT)
    cell.border    = mediumBorder(['top','bottom', col === 2 ? 'left' : 'right'])
    cell.alignment = { horizontal: col === 2 ? 'left' : 'right', vertical: 'middle' }
    if (col === 6) cell.numFmt = '#,##0.00'
  })
  // Fill middle cells of total row
  for (let c = 3; c <= 5; c++) {
    const cell = totRow.getCell(c)
    cell.fill   = fill(COL.NAVY_LIGHT)
    cell.border = mediumBorder(['top','bottom'])
  }
}

// ── RELACIÓN POR CAMIONES ─────────────────────────────────────────────────────
function addRelacionPorCarrosSheet(wb: ExcelJS.Workbook, preview: RelacionPreview) {
  type PlateData = { conductor: string; byRoute: Map<string, { tons: number; amount: number }> }
  const plateMap = new Map<string, PlateData>()

  for (const route of preview.byRoute) {
    for (const trip of route.trips) {
      const plate = trip.plate || '—'
      if (!plateMap.has(plate)) plateMap.set(plate, { conductor: trip.conductor || '—', byRoute: new Map() })
      const pd = plateMap.get(plate)!
      if ((pd.conductor === '—' || !pd.conductor) && trip.conductor) pd.conductor = trip.conductor
      if (!pd.byRoute.has(route.routeName)) pd.byRoute.set(route.routeName, { tons: 0, amount: 0 })
      const rd = pd.byRoute.get(route.routeName)!
      rd.tons   += (trip.netWeightKg ?? 0) / 1000
      rd.amount += trip.amount
    }
  }

  if (plateMap.size === 0) return

  const routes    = preview.byRoute
  const fixedCols = 3  // TRANSPORTISTA, (vacío), PLACA
  const routeCols = routes.length * 2  // TON + $ per route
  const totalCols = fixedCols + routeCols + 1

  const ws = wb.addWorksheet('REL. POR CARROS')
  ws.columns = [
    { width: 22 }, // TRANSPORTISTA
    { width: 10 }, // (space / nro)
    { width: 10 }, // PLACA
    ...routes.flatMap(() => [{ width: 10 }, { width: 13 }] as {width:number}[]),
    { width: 14 }, // TOTAL
  ]

  // ── Título ────────────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getRow(1).getCell(1)
  titleCell.value     = `RELACIÓN POR CAMIONES — ${preview.periodLabel}`
  titleCell.font      = { bold: true, size: 12, color: { argb: COL.NAVY } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill      = fill(COL.NAVY_LIGHT)
  ws.getRow(1).height = 24

  ws.addRow([])

  // ── Fila de encabezado: nombre de ruta (2 columnas cada una) ──────────────
  const hRow1 = ws.getRow(3)
  hRow1.height = 34

  const fixedLabels: [number, string][] = [[1, 'TRANSPORTISTA'], [2, ''], [3, 'PLACA']]
  fixedLabels.forEach(([col, val]) => {
    if (col === 2) return
    ws.mergeCells(3, col, 4, col)
    const cell = hRow1.getCell(col)
    cell.value     = val
    cell.font      = { bold: true, size: 9, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  routes.forEach((route, i) => {
    const col = fixedCols + 1 + i * 2
    ws.mergeCells(3, col, 3, col + 1)
    const cell = hRow1.getCell(col)
    cell.value     = route.routeName
    cell.font      = { bold: true, size: 9, color: { argb: COL.WHITE } }
    cell.fill      = fill(COL.NAVY)
    cell.border    = border('thin')
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  ws.mergeCells(3, totalCols, 4, totalCols)
  const totHCell = hRow1.getCell(totalCols)
  totHCell.value     = 'TOTAL'
  totHCell.font      = { bold: true, size: 9, color: { argb: COL.WHITE } }
  totHCell.fill      = fill(COL.NAVY)
  totHCell.border    = border('thin')
  totHCell.alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Sub-encabezado: TON | $ ───────────────────────────────────────────────
  const hRow2 = ws.getRow(4)
  hRow2.height = 18
  routes.forEach((_, i) => {
    const col = fixedCols + 1 + i * 2
    ;(['TON', '$'] as const).forEach((label, j) => {
      const cell = hRow2.getCell(col + j)
      cell.value     = label
      cell.font      = { bold: true, size: 8, color: { argb: COL.WHITE } }
      cell.fill      = fill(COL.NAVY_MID)
      cell.border    = border('thin')
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })

  // ── Filas de datos ────────────────────────────────────────────────────────
  let rowN = 5
  let grandTotal = 0
  const routeTotals = new Map<string, number>()

  Array.from(plateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([plate, pd], idx) => {
      const isEven = idx % 2 === 1
      const row    = ws.getRow(rowN++)
      row.height   = 18

      row.getCell(1).value = pd.conductor
      row.getCell(3).value = plate

      let rowTotal = 0
      routes.forEach((route, ri) => {
        const col = fixedCols + 1 + ri * 2
        const rd  = pd.byRoute.get(route.routeName)
        const tonCell = row.getCell(col)
        const amtCell = row.getCell(col + 1)
        if (rd) {
          tonCell.value  = Math.round(rd.tons   * 1000) / 1000
          amtCell.value  = Math.round(rd.amount * 100)  / 100
          tonCell.numFmt = '#,##0.000'
          amtCell.numFmt = '#,##0.00'
          rowTotal += rd.amount
          routeTotals.set(route.routeName, (routeTotals.get(route.routeName) ?? 0) + rd.amount)
        }
      })

      grandTotal += rowTotal
      const tc    = row.getCell(totalCols)
      tc.value    = Math.round(rowTotal * 100) / 100
      tc.numFmt   = '#,##0.00'
      tc.font     = { bold: true, size: 9 }

      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.fill      = fill(isEven ? COL.OFF_WHITE : COL.WHITE)
        cell.border    = border('thin')
        if (!cell.font?.bold) cell.font = { size: 9 }
        if (!cell.alignment) cell.alignment = {}
        cell.alignment.vertical = 'middle'
      })
    })

  // ── Fila de totales ───────────────────────────────────────────────────────
  const totRow = ws.getRow(rowN)
  totRow.height = 22
  ws.mergeCells(rowN, 1, rowN, 3)
  totRow.getCell(1).value = 'TOTAL'

  routes.forEach((route, ri) => {
    const col     = fixedCols + 1 + ri * 2 + 1 // only $ column
    const cell    = totRow.getCell(col)
    cell.value    = Math.round((routeTotals.get(route.routeName) ?? 0) * 100) / 100
    cell.numFmt   = '#,##0.00'
  })

  totRow.getCell(totalCols).value  = Math.round(grandTotal * 100) / 100
  totRow.getCell(totalCols).numFmt = '#,##0.00'

  totRow.eachCell({ includeEmpty: false }, (cell) => {
    cell.font      = { bold: true, size: 10, color: { argb: COL.NAVY } }
    cell.fill      = fill(COL.GOLD_LIGHT)
    cell.border    = mediumBorder(['top', 'bottom'])
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  })
  totRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
}

// ── Builders ─────────────────────────────────────────────────────────────────
async function buildAuruminExcel(preview: RelacionPreview, abono: number, hasEstadoCuenta = false): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Transporte JR'
  wb.modified = new Date()
  addNotaSheet(wb, preview, abono, 'AURUMIN, C.A', 'J-500165994',
    'Aurumin A 4km Desde la Entrada de El Callao, Vía Tumeremo Edo. Bolívar.', 'Planta Aurumin')
  for (const route of preview.byRoute) addRouteSheet(wb, route)
  addRelacionFinalSheet(wb, preview, abono)
  addRelacionPorCarrosSheet(wb, preview)
  if (hasEstadoCuenta) addEstadoCuentaSheet(wb, preview)
  return wb.xlsx.writeBuffer()
}

async function buildChinoExcel(preview: RelacionPreview, abono: number): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Transporte JR'
  wb.modified = new Date()
  addNotaSheet(wb, preview, abono, 'Luis Peña', null,
    'El Callao, Edo. Bolívar.', 'La Fe / Nuevo Callao')
  for (const route of preview.byRoute) addRouteSheet(wb, route)
  if (preview.destinatario === 'JOSE') addRelacionFinalSheet(wb, preview, abono)
  return wb.xlsx.writeBuffer()
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { preview: RelacionPreview; abono: number; hasEstadoCuenta?: boolean }
    const { preview, abono, hasEstadoCuenta } = body

    const buf = preview.client === 'AURUMIN'
      ? await buildAuruminExcel(preview, abono, hasEstadoCuenta)
      : await buildChinoExcel(preview, abono)

    const dest       = preview.destinatario === 'EMPRESA' ? 'Empresa' : 'Jose'
    const clientSlug = preview.client === 'AURUMIN' ? 'Aurumin' : 'LuisPena'
    const filename   = `Relacion-${clientSlug}-${dest}-${preview.periodLabel.replace(/\//g,'-').replace(/\s/g,'_')}.xlsx`

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generando Excel:', err)
    return new NextResponse(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
