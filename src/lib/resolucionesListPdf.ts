import type jsPDF from 'jspdf'
import { fmtDatePdf, fmtMoneyPdf, txtPdf } from './format'
import {
  createPdfDoc,
  PDF_MARGIN_MM,
  pdfEnsureSpace,
  pdfFinishAndSave,
  pdfPageWidth,
  preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, type PdfTableCell } from './pdfTable'
import { resolutionMontoPlan } from './resolutionSaldos'
import { isResolucionSoloAprobacion } from './resolucionTipo'

export type ResolucionesPdfFilters = {
  desde?: string
  hasta?: string
}

const HEAD_BLUE: [number, number, number] = [46, 117, 182]
const FOOT_GREEN: [number, number, number] = [84, 180, 81]
const WHITE: [number, number, number] = [255, 255, 255]
const BRAND: [number, number, number] = [47, 28, 106]
const MARGIN = PDF_MARGIN_MM

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function tipoLabel(tipo: unknown): string {
  return isResolucionSoloAprobacion(tipo) ? 'Solo aprobación' : 'Con plan'
}

function proyectosLabel(row: any): string {
  const links = Array.isArray(row.proyectos_link) ? row.proyectos_link : []
  if (!links.length) return '—'
  const labels = links.map((l: any) => {
    const p = nest(l.proyecto)
    const proy = String(p?.descripcion ?? '').trim() || 'Sin descripción'
    const comp = nest(p?.componente)
    const compLabel = String(comp?.descripcion ?? comp?.codigo ?? '').trim()
    return compLabel ? `${proy} - ${compLabel}` : proy
  })
  return labels.join('; ')
}

function moneyOrDash(row: any, value: number): string {
  if (isResolucionSoloAprobacion(row.tipo)) return '—'
  return fmtMoneyPdf(value)
}

function drawSectionTitle(doc: jsPDF, layout: PdfLayout, y: number, title: string): number {
  y = pdfEnsureSpace(doc, y, 10, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BRAND)
  doc.text(title, MARGIN, y)
  doc.setTextColor(0, 0, 0)
  return y + 5
}

export async function exportResolucionesListPdf(
  rows: any[],
  filters: ResolucionesPdfFilters = {},
): Promise<void> {
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('LISTADO DE RESOLUCIONES', pageW / 2, y + 4, { align: 'center' })
  y += 10
  doc.setTextColor(0, 0, 0)

  const filterLines: string[] = []
  if (filters.desde || filters.hasta) {
    const d = filters.desde ? fmtDatePdf(filters.desde) : '…'
    const h = filters.hasta ? fmtDatePdf(filters.hasta) : '…'
    filterLines.push(`Fecha resolución: ${d} — ${h}`)
  }
  if (!filterLines.length) filterLines.push('Filtros: Todos los registros')

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  for (const line of filterLines) {
    doc.text(line, MARGIN, y)
    y += 4
  }

  const planTotal = rows.reduce((s, r) => {
    if (isResolucionSoloAprobacion(r.tipo)) return s
    return s + (Number(r.monto_plan) || resolutionMontoPlan(r))
  }, 0)
  const ejecutadoTotal = rows.reduce((s, r) => {
    if (isResolucionSoloAprobacion(r.tipo)) return s
    return s + (Number(r.ejecutado_str) || 0)
  }, 0)
  const saldoTotal = rows.reduce((s, r) => {
    if (isResolucionSoloAprobacion(r.tipo)) return s
    if (r.saldo_str != null) return s + (Number(r.saldo_str) || 0)
    const plan = Number(r.monto_plan) || resolutionMontoPlan(r)
    return s + (plan - (Number(r.ejecutado_str) || 0))
  }, 0)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setTextColor(...BRAND)
  doc.text(
    `${rows.length} resolución${rows.length === 1 ? '' : 'es'}  ·  Plan ${fmtMoneyPdf(planTotal)}  ·  Ejecutado ${fmtMoneyPdf(ejecutadoTotal)}  ·  Saldo ${fmtMoneyPdf(saldoTotal)}`,
    MARGIN,
    y,
  )
  y += 6
  doc.setTextColor(0, 0, 0)

  y = drawSectionTitle(doc, layout, y, 'Detalle')
  const usable = pageW - MARGIN * 2

  const body: PdfTableCell[][] = rows.map((r, idx) => {
    const plan = Number(r.monto_plan) || resolutionMontoPlan(r)
    const ejecutado = Number(r.ejecutado_str) || 0
    const saldo = r.saldo_str != null ? Number(r.saldo_str) : plan - ejecutado
    return [
      String(idx + 1),
      txtPdf(r.numero),
      tipoLabel(r.tipo),
      txtPdf(proyectosLabel(r)),
      fmtDatePdf(r.fecha),
      fmtDatePdf(r.fecha_recepcion),
      moneyOrDash(r, plan),
      moneyOrDash(r, ejecutado),
      moneyOrDash(r, saldo),
    ]
  })

  const foot: PdfTableCell[][] = [[
    {
      content: 'TOTAL',
      colSpan: 6,
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(planTotal),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(ejecutadoTotal),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(saldoTotal),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
  ]]

  const weights = [3, 8, 10, 28, 8, 8, 11.5, 11.5, 12]
  const w = weights.map(p => (usable * p) / 100)

  drawPdfTable(
    doc,
    layout,
    y,
    [['Nro', 'N° Res.', 'Tipo', 'Proyectos', 'Fecha', 'Recepción', 'Plan', 'Ejecutado', 'Saldos']],
    body,
    foot,
    {
      0: { cellWidth: w[0], halign: 'center' },
      1: { cellWidth: w[1], halign: 'center' },
      2: { cellWidth: w[2], halign: 'left' },
      3: { cellWidth: w[3], halign: 'left' },
      4: { cellWidth: w[4], halign: 'center' },
      5: { cellWidth: w[5], halign: 'center' },
      6: { cellWidth: w[6], halign: 'right' },
      7: { cellWidth: w[7], halign: 'right' },
      8: { cellWidth: w[8], halign: 'right' },
    },
    {
      fontSize: 6.5,
      headFontSize: 7,
      gapAfter: 6,
      headFill: HEAD_BLUE,
      headText: WHITE,
      footFill: FOOT_GREEN,
      footText: WHITE,
      showFoot: 'lastPage',
      marginMm: MARGIN,
    },
  )

  pdfFinishAndSave(doc, layout, 'Listado_Resoluciones')
}
