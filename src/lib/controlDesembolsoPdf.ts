import { supabase } from './supabase'
import { fmtDatePdf, fmtMoneyPdf, txtPdf } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, pdfEstadoCell, pdfTableFinalY } from './pdfTable'
import { writeRichTextToPdf } from './richTextPdf'
import {
  formatObjetosGasto,
  type ControlDesembolsoDraft,
  type ItemVerif,
} from './controlDesembolsoTypes'

function estadoCell(item: ItemVerif) {
  return pdfEstadoCell(item.estado)
}

function sectionTitle(
  doc: import('jspdf').default,
  pageW: number,
  y: number,
  title: string,
  sub?: string,
  layout?: PdfLayout,
): number {
  const needed = (sub ? 18 : 12) + 16
  if (layout) y = pdfEnsureSpace(doc, y, needed, layout)

  doc.setFillColor(15, 118, 110)
  doc.rect(PDF_MARGIN_MM, y, pageW - PDF_MARGIN_MM * 2, 7, 'F')
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(title, PDF_MARGIN_MM + 2.5, y + 4.7)
  y += 10
  if (sub) {
    doc.setFont(PDF_TABLE_FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text(sub, PDF_MARGIN_MM, y)
    y += 5
  }
  doc.setTextColor(0, 0, 0)
  return y
}

function moneyOrDash(v: string): string {
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  if (!String(v).trim() || !Number.isFinite(n)) return '---'
  return fmtMoneyPdf(n)
}

function docLabel(item: ItemVerif): string {
  const title = (item.aspecto ?? '').trim()
  const detalle = (item.detalle ?? '').trim()
  const parts = [title]
  if (detalle) parts.push(detalle)
  return parts.join('\n')
}

/** PDF institucional · Control de Desembolsos (formato de aprobación). */
export async function exportControlDesembolsoPdf(
  proyectoId: string,
  draft: ControlDesembolsoDraft,
): Promise<void> {
  const { data: proy } = await supabase
    .from('proyectos')
    .select(`
      descripcion,
      componente:componentes_programa(
        codigo,
        descripcion,
        programa:programas(codigo, descripcion)
      )
    `)
    .eq('id', proyectoId)
    .maybeSingle()

  const proyectoLabel = (proy as any)?.descripcion || '—'
  const comp = Array.isArray((proy as any)?.componente)
    ? (proy as any).componente[0]
    : (proy as any)?.componente
  const prog = Array.isArray(comp?.programa) ? comp.programa[0] : comp?.programa
  const programaNombre = (prog?.descripcion || prog?.codigo || '').trim()
  const componenteNombre = (comp?.descripcion || comp?.codigo || '').trim()
  const programaComponente = [programaNombre, componenteNombre].filter(Boolean).join(' - ') || '—'

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 118, 110)
  doc.text('Formulario de Control - Control de Desembolso', pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text('Aprobación de desembolso · Gestión Operacional · UEP-SND', pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(`N° ${txtPdf(draft.numero)}`, pageW / 2, y, { align: 'center' })
  y += 8

  y = sectionTitle(doc, pageW, y, '1. DATOS GENERALES DEL PROYECTO', undefined, layout)

  const metaRows = [
    ['Proyecto', txtPdf(proyectoLabel)],
    ['Programa / Componente', txtPdf(programaComponente)],
    ['Entidad Proponente', txtPdf(draft.entidad_proponente)],
    ['Monto Total del Proyecto', moneyOrDash(draft.monto_total)],
    ['Monto Desembolsado a la Fecha', moneyOrDash(draft.monto_desembolsado)],
    ['Monto Solicitado Actualmente', moneyOrDash(draft.monto_solicitado)],
    ['Objeto del Gasto', txtPdf(formatObjetosGasto(draft.objetos_gasto))],
    ['Marco Normativo', txtPdf(draft.marco_normativo)],
    ['Fecha de verificación en Gestión Operacional - UEP', fmtDatePdf(draft.fecha_verificacion)],
  ]

  y = drawPdfTable(
    doc, layout, y,
    [['Ítem', 'Detalle']],
    metaRows,
    undefined,
    { 0: { cellWidth: 72 }, 1: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 72 } },
    { fontSize: 8, headFontSize: 8, gapAfter: 6 },
  )

  y = sectionTitle(
    doc, pageW, y,
    '2. VERIFICACIÓN DOCUMENTAL',
    undefined,
    layout,
  )

  y = drawPdfTable(
    doc, layout, y,
    [['Documento Verificado', 'Estado', 'Observaciones Técnicas']],
    draft.verificacion_documental.map(i => [
      docLabel(i),
      estadoCell(i),
      txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
    ]),
    undefined,
    {
      0: { cellWidth: 78 },
      1: { cellWidth: 34 },
      2: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 112 },
    },
    { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
  )

  y = pdfTableFinalY(doc) + 8
  y = sectionTitle(doc, pageW, y, '3. OBSERVACIONES', undefined, layout)
  y += 2
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  writeRichTextToPdf(doc, layout, y, draft.observaciones, pageW, 5.2, 1.5, PDF_TABLE_FONT)

  const slug = String(draft.numero || 'control').replace(/[^\w.-]+/g, '_')
  pdfFinishAndSave(doc, layout, `Control_Desembolso_${slug}`)
}
