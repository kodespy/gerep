import ExcelJS from 'exceljs'
import { fmtDate, fmtDatePdf, fmtMoneyPdf, nowDateInputValue, txtPdf } from './format'
import { createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout } from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, type PdfTableCell } from './pdfTable'
import { BRAND, cols, drawKpiRow, HEAD, sectionTitle } from './resumenPagosSaldosPdf'
import {
  esParticipacionParcial,
  totalesProveedor,
  type ProveedorRef,
  type ProyectoVinculado,
} from './proveedorProyectos'

function fileBase(proveedor: ProveedorRef): string {
  const name = (proveedor.razon_social ?? 'proveedor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)
  return `Proyectos_vinculados_${name || 'proveedor'}`
}

function proveedorSubtitle(proveedor: ProveedorRef): string {
  const ruc = (proveedor.documento ?? '').trim()
  return [proveedor.razon_social ?? 'Proveedor', ruc ? `RUC ${ruc}` : ''].filter(Boolean).join(' · ')
}

export async function exportProveedorProyectosPdf(
  proveedor: ProveedorRef,
  proyectos: ProyectoVinculado[],
): Promise<void> {
  const totales = totalesProveedor(proyectos)
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  const usableW = pageW - PDF_MARGIN_MM * 2
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('PROYECTOS VINCULADOS AL PROVEEDOR', pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(txtPdf(proveedorSubtitle(proveedor)), pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(`Generado: ${fmtDatePdf(nowDateInputValue())}`, pageW / 2, y, { align: 'center' })
  y += 8
  doc.setTextColor(0, 0, 0)

  y = sectionTitle(doc, layout, y, 'TOTALES DEL PROVEEDOR')
  y = drawKpiRow(doc, layout, y, pageW, [
    { label: 'Proyectos', value: String(proyectos.length) },
    { label: 'Monto total (plan vigente)', value: fmtMoneyPdf(totales.monto) },
    { label: 'Ejecutado (STR neto)', value: fmtMoneyPdf(totales.ejecutado) },
    { label: 'Saldo', value: fmtMoneyPdf(totales.saldo) },
  ])

  y = sectionTitle(doc, layout, y, 'RESUMEN POR PROYECTO')
  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Proyecto', 'Monto', 'Ejecutado', 'Saldo', 'Avance', 'STR']],
    proyectos.map(p => [
      txtPdf(p.descripcion),
      fmtMoneyPdf(p.planVigente),
      fmtMoneyPdf(p.strNeto),
      fmtMoneyPdf(p.saldo),
      `${p.avancePct}%`,
      String(p.strs.length),
    ]),
    [[
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: fmtMoneyPdf(totales.monto), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: fmtMoneyPdf(totales.ejecutado), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: fmtMoneyPdf(totales.saldo), styles: { fontStyle: 'bold', halign: 'right' } },
      '',
      { content: String(proyectos.reduce((s, p) => s + p.strs.length, 0)), styles: { fontStyle: 'bold', halign: 'right' } },
    ]],
    cols(pageW, [
      { w: 120 },
      { w: 36, halign: 'right' },
      { w: 36, halign: 'right' },
      { w: 36, halign: 'right' },
      { w: 18, halign: 'right' },
      { w: 14, halign: 'right' },
    ]),
    { fontSize: 7, headFontSize: 7.5, headFill: HEAD, headText: [255, 255, 255], gapAfter: 6, marginMm: PDF_MARGIN_MM, showFoot: 'lastPage' },
  )

  proyectos.forEach((p, i) => {
    y = sectionTitle(doc, layout, y, `PROYECTO ${i + 1} DE ${proyectos.length} · DETALLE POR STR`)

    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(15, 23, 42)
    const nameLines = doc.splitTextToSize(txtPdf(p.descripcion), usableW) as string[]
    y = pdfEnsureSpace(doc, y, nameLines.length * 4.5 + 10, layout)
    doc.text(nameLines, PDF_MARGIN_MM, y)
    y += nameLines.length * 4.3 + 1

    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(71, 85, 105)
    const resumen = [
      `Monto: ${fmtMoneyPdf(p.planVigente)}`,
      `Ejecutado: ${fmtMoneyPdf(p.strNeto)}`,
      `Saldo: ${fmtMoneyPdf(p.saldo)}`,
      `Avance: ${p.avancePct}%`,
      ...(esParticipacionParcial(p) ? [`Lineas del proveedor en el plan: ${fmtMoneyPdf(p.montoProveedor)}`] : []),
    ].join('   ·   ')
    doc.text(resumen, PDF_MARGIN_MM, y + 1)
    doc.setTextColor(0, 0, 0)
    y += 5

    const body: PdfTableCell[][] = p.strs.map(s => [
      txtPdf(s.numero),
      fmtDatePdf(s.fecha) || '—',
      txtPdf(s.og),
      txtPdf(s.fuente),
      fmtMoneyPdf(s.monto),
      s.devoluciones ? fmtMoneyPdf(s.devoluciones) : '—',
      fmtMoneyPdf(s.neto),
      fmtMoneyPdf(s.saldo),
    ])
    if (!body.length) body.push(['Sin STR registrados', '', '', '', '', '', '', fmtMoneyPdf(p.saldo)])

    y = drawPdfTable(
      doc,
      layout,
      y,
      [['N° STR', 'Fecha', 'OG', 'Fuente', 'Monto STR', 'Devoluciones', 'Ejecutado', 'Saldo']],
      body,
      [[
        { content: `TOTAL (${p.strs.length})`, styles: { fontStyle: 'bold' } },
        '',
        '',
        '',
        { content: fmtMoneyPdf(p.strBruto), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: p.devoluciones ? fmtMoneyPdf(p.devoluciones) : '—', styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMoneyPdf(p.strNeto), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMoneyPdf(p.saldo), styles: { fontStyle: 'bold', halign: 'right' } },
      ]],
      cols(pageW, [
        { w: 24 },
        { w: 20 },
        { w: 16 },
        { w: 36 },
        { w: 34, halign: 'right' },
        { w: 30, halign: 'right' },
        { w: 34, halign: 'right' },
        { w: 34, halign: 'right' },
      ]),
      { fontSize: 7, headFontSize: 7.5, headFill: HEAD, headText: [255, 255, 255], gapAfter: 8, marginMm: PDF_MARGIN_MM, showFoot: 'lastPage' },
    )
  })

  pdfFinishAndSave(doc, layout, fileBase(proveedor))
}

const MONEY_FMT = '#,##0'
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }
const HEAD_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
const FOOT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFC0C0C0' } }
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

function addSheetTitle(ws: ExcelJS.Worksheet, colCount: number, title: string, subtitle: string): void {
  ws.mergeCells(1, 1, 1, colCount)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: 'FF2F1C6A' } }
  ws.getRow(1).height = 22
  ws.mergeCells(2, 1, 2, colCount)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { size: 10, color: { argb: 'FF475569' } }
}

function addHeadRow(ws: ExcelJS.Worksheet, labels: string[], moneyFrom: number): void {
  const row = ws.getRow(4)
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1)
    cell.value = label
    cell.font = HEAD_FONT
    cell.fill = HEAD_FILL
    cell.border = BORDER
    cell.alignment = { horizontal: i + 1 >= moneyFrom ? 'right' : 'center', vertical: 'middle', wrapText: true }
  })
  row.height = 24
}

function styleRow(row: ExcelJS.Row, moneyCols: number[], foot = false): void {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = BORDER
    cell.font = { size: 10, bold: foot }
    if (foot) cell.fill = FOOT_FILL
    if (moneyCols.includes(col)) {
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: 'right' }
    }
  })
}

export async function exportProveedorProyectosExcel(
  proveedor: ProveedorRef,
  proyectos: ProyectoVinculado[],
): Promise<void> {
  const totales = totalesProveedor(proyectos)
  const subtitle = `${proveedorSubtitle(proveedor)} · Generado: ${fmtDate(nowDateInputValue())}`
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GEREP'

  const resumen = wb.addWorksheet('Proyectos', { views: [{ state: 'frozen', ySplit: 4 }] })
  resumen.columns = [{ width: 60 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 8 }]
  addSheetTitle(resumen, 7, 'PROYECTOS VINCULADOS AL PROVEEDOR', subtitle)
  addHeadRow(resumen, ['Proyecto', 'Monto del proyecto', 'Líneas del proveedor', 'Ejecutado (STR neto)', 'Saldo', 'Avance %', 'STR'], 2)
  for (const p of proyectos) {
    styleRow(resumen.addRow([p.descripcion, p.planVigente, p.montoProveedor, p.strNeto, p.saldo, p.avancePct, p.strs.length]), [2, 3, 4, 5])
  }
  styleRow(
    resumen.addRow(['TOTAL', totales.monto, proyectos.reduce((s, p) => s + p.montoProveedor, 0), totales.ejecutado, totales.saldo, null, proyectos.reduce((s, p) => s + p.strs.length, 0)]),
    [2, 3, 4, 5],
    true,
  )

  const detalle = wb.addWorksheet('Detalle por STR', { views: [{ state: 'frozen', ySplit: 4 }] })
  detalle.columns = [{ width: 50 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 18 }]
  addSheetTitle(detalle, 9, 'DETALLE DE SALDOS POR STR', `${subtitle} · Saldo = monto del proyecto − ejecutado acumulado`)
  addHeadRow(detalle, ['Proyecto', 'N° STR', 'Fecha', 'OG', 'Fuente', 'Monto STR', 'Devoluciones', 'Ejecutado', 'Saldo'], 6)
  const detalleMoney = [6, 7, 8, 9]
  for (const p of proyectos) {
    if (!p.strs.length) {
      styleRow(detalle.addRow([p.descripcion, 'Sin STR', null, null, null, null, null, null, p.saldo]), detalleMoney)
      continue
    }
    for (const s of p.strs) {
      styleRow(
        detalle.addRow([p.descripcion, s.numero, fmtDate(s.fecha), s.og, s.fuente, s.monto, s.devoluciones || null, s.neto, s.saldo]),
        detalleMoney,
      )
    }
    styleRow(
      detalle.addRow([`Subtotal · ${p.descripcion}`, `${p.strs.length} STR`, null, null, null, p.strBruto, p.devoluciones || null, p.strNeto, p.saldo]),
      detalleMoney,
      true,
    )
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase(proveedor)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
