import type jsPDF from 'jspdf'
import { isActaSoloAprobacion } from './actaEstado'
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

export type ActasPdfFilters = {
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

function proyectoLabel(row: any): string {
  const p = nest(row.proyecto)
  if (!p) return '—'
  const proy = String(p.descripcion ?? '').trim() || 'Sin descripción'
  const comp = nest(p.componente)
  const compLabel = String(comp?.descripcion ?? comp?.codigo ?? '').trim()
  return compLabel ? `${proy} - ${compLabel}` : proy
}

function moneyActa(row: any, key: 'monto_solicitado' | 'monto_aprobado'): number {
  if (isActaSoloAprobacion(row.estado)) return 0
  return Number(row[key]) || 0
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

export async function exportActasListPdf(
  rows: any[],
  filters: ActasPdfFilters = {},
): Promise<void> {
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('LISTADO DE ACTAS', pageW / 2, y + 4, { align: 'center' })
  y += 10
  doc.setTextColor(0, 0, 0)

  const filterLines: string[] = []
  if (filters.desde || filters.hasta) {
    const d = filters.desde ? fmtDatePdf(filters.desde) : '…'
    const h = filters.hasta ? fmtDatePdf(filters.hasta) : '…'
    filterLines.push(`Fecha acta: ${d} — ${h}`)
  }
  if (!filterLines.length) filterLines.push('Filtros: Todos los registros')

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  for (const line of filterLines) {
    doc.text(line, MARGIN, y)
    y += 4
  }

  const totalSolic = rows.reduce((s, r) => s + moneyActa(r, 'monto_solicitado'), 0)
  const totalAprob = rows.reduce((s, r) => s + moneyActa(r, 'monto_aprobado'), 0)
  const totalSaldo = rows.reduce((s, r) => s + (Number(r.saldo) || 0), 0)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setTextColor(...BRAND)
  doc.text(
    `${rows.length} acta${rows.length === 1 ? '' : 's'}  ·  Solicitado ${fmtMoneyPdf(totalSolic)}  ·  Aprobado ${fmtMoneyPdf(totalAprob)}`,
    MARGIN,
    y,
  )
  y += 6
  doc.setTextColor(0, 0, 0)

  y = drawSectionTitle(doc, layout, y, 'Detalle')
  const usable = pageW - MARGIN * 2

  const body: PdfTableCell[][] = rows.map((r, idx) => [
    String(idx + 1),
    txtPdf(r.numero) + (
      Array.isArray(r._adendaNumeros) && r._adendaNumeros.length
        ? ` · Adenda ${r._adendaNumeros.join(', ')}`
        : ''
    ),
    txtPdf(proyectoLabel(r)),
    txtPdf(r.formulario_control) || '—',
    fmtDatePdf(r.fecha),
    r.numero_desembolso != null && r.numero_desembolso !== '' ? String(r.numero_desembolso) : '—',
    fmtMoneyPdf(moneyActa(r, 'monto_solicitado')),
    fmtMoneyPdf(moneyActa(r, 'monto_aprobado')),
    r.saldo == null ? '—' : fmtMoneyPdf(Number(r.saldo) || 0),
    txtPdf(r.estado) || '—',
  ])

  const foot: PdfTableCell[][] = [[
    {
      content: 'TOTAL',
      colSpan: 6,
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(totalSolic),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(totalAprob),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: fmtMoneyPdf(totalSaldo),
      styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
    },
    {
      content: '',
      styles: { fillColor: FOOT_GREEN },
    },
  ]]

  const weights = [3, 6, 24, 7, 7, 6, 11, 11, 11, 14]
  const w = weights.map(p => (usable * p) / 100)

  drawPdfTable(
    doc,
    layout,
    y,
    [['Nro', 'N° Acta', 'Proyecto', 'N° FC', 'Fecha', 'Desemb.', 'Solicitado', 'Aprobado', 'Saldo', 'Estado']],
    body,
    foot,
    {
      0: { cellWidth: w[0], halign: 'center' },
      1: { cellWidth: w[1], halign: 'center' },
      2: { cellWidth: w[2], halign: 'left' },
      3: { cellWidth: w[3], halign: 'center' },
      4: { cellWidth: w[4], halign: 'center' },
      5: { cellWidth: w[5], halign: 'center' },
      6: { cellWidth: w[6], halign: 'right' },
      7: { cellWidth: w[7], halign: 'right' },
      8: { cellWidth: w[8], halign: 'right' },
      9: { cellWidth: w[9], halign: 'left' },
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

  pdfFinishAndSave(doc, layout, 'Listado_Actas')
}
