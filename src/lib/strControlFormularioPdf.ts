import { supabase } from './supabase'
import { fmtDate, fmtMoneyPdf, txtPdf } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, pdfEstadoCell, pdfTableFinalY } from './pdfTable'
import { sortStrControlByPredefOrden } from './strControlOrden'
import { resolveStrOgTransferencia } from './ogTransferencia'

type ControlItem = {
  documento: string | null
  si_no: string | null
  observaciones: string | null
  created_at?: string | null
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'STR'
}

/** Fecha DD/MM/YYYY como en la plantilla institucional STR. */
function d(v: string | null | undefined): string {
  const s = fmtDate(v)
  return s === '—' ? '' : s
}

function moneyGs(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return ''
  // Plantilla: "Gs. 79.442.000"
  return `Gs. ${fmtMoneyPdf(v).replace(/\s*Gs\.\s*$/, '').trim()}`
}

function sectionHeading(
  doc: import('jspdf').jsPDF,
  layout: import('./pdf').PdfLayout,
  y: number,
  title: string,
): number {
  y = pdfEnsureSpace(doc, y, 10, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(title, PDF_MARGIN_MM, y)
  y += 2
  const pageW = pdfPageWidth(doc)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(PDF_MARGIN_MM, y, pageW - PDF_MARGIN_MM, y)
  return y + 5
}

/** Línea con pares etiqueta/valor (1 o 2 columnas). */
function metaLine(
  doc: import('jspdf').jsPDF,
  layout: import('./pdf').PdfLayout,
  y: number,
  left: [string, string],
  right?: [string, string],
): number {
  y = pdfEnsureSpace(doc, y, 6, layout)
  const pageW = pdfPageWidth(doc)
  const mid = PDF_MARGIN_MM + (pageW - PDF_MARGIN_MM * 2) * 0.55

  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.text(`${left[0]} `, PDF_MARGIN_MM, y)
  const leftLabelW = doc.getTextWidth(`${left[0]} `)
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.text(txtPdf(left[1]) === '---' ? '' : txtPdf(left[1]), PDF_MARGIN_MM + leftLabelW, y)

  if (right) {
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.text(`${right[0]} `, mid, y)
    const rightLabelW = doc.getTextWidth(`${right[0]} `)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.text(txtPdf(right[1]) === '---' ? '' : txtPdf(right[1]), mid + rightLabelW, y)
  }

  return y + 5
}

function metaBlockLine(
  doc: import('jspdf').jsPDF,
  layout: import('./pdf').PdfLayout,
  y: number,
  label: string,
  value: string,
  maxW?: number,
): number {
  y = pdfEnsureSpace(doc, y, 6, layout)
  const pageW = pdfPageWidth(doc)
  const labelText = `${label} `
  doc.setFontSize(9)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.text(labelText, PDF_MARGIN_MM, y)
  const lx = PDF_MARGIN_MM + doc.getTextWidth(labelText)
  doc.setFont(PDF_TABLE_FONT, 'normal')
  const usable = maxW ?? (pageW - PDF_MARGIN_MM - lx)
  const lines = doc.splitTextToSize(value || '', usable) as string[]
  doc.text(lines, lx, y)
  return y + Math.max(5, lines.length * 4.2 + 1)
}

/**
 * PDF de control documental del STR, alineado a la plantilla:
 * SOLICITUD DE TRANSFERENCIA DE RECURSOS Nº · datos STR · proyecto/financiamiento · checklist.
 */
export async function exportStrControlFormularioPdf(strId: string): Promise<void> {
  if (!strId) throw new Error('Falta el STR.')

  const [strRes, itemsRes, predefRes] = await Promise.all([
    supabase
      .from('strs')
      .select(`
        numero, fecha, nivel, monto, proyecto_id, acta_id, resolution_item_id, og_id,
        nro_resolucion, fecha_resolucion,
        numero_obligacion, fecha_obligacion,
        numero_factura, nro_ot,
        fecha_desembolso, fecha_rendicion,
        acta:actas(id, numero, fecha, proyecto_id),
        fuente:fuentes_financiamiento(descripcion, detalle),
        og:objetos_de_gastos(id, codigo, descripcion, og_principal_id),
        plan_item:resolution_items(id, og_id),
        proyecto:proyectos(descripcion)
      `)
      .eq('id', strId)
      .maybeSingle(),
    supabase
      .from('str_documento_control')
      .select('documento, si_no, observaciones, created_at')
      .eq('str_id', strId)
      .order('created_at', { ascending: true }),
    supabase
      .from('str_control_items_predefinidos')
      .select('orden, descripcion')
      .order('orden', { ascending: true }),
  ])

  if (strRes.error) throw strRes.error
  if (itemsRes.error) throw itemsRes.error
  if (predefRes.error) throw predefRes.error
  if (!strRes.data) throw new Error('STR no encontrado.')

  const items = sortStrControlByPredefOrden(
    (itemsRes.data ?? []) as ControlItem[],
    (predefRes.data ?? []) as { orden: number | null; descripcion: string | null }[],
  )
  if (!items.length) throw new Error('El STR no tiene ítems de control documental.')

  const str = strRes.data as any
  const acta = nest(str.acta)
  const fuente = nest(str.fuente)
  const planItem = nest(str.plan_item)
  const transfer = await resolveStrOgTransferencia({
    proyectoId: str.proyecto_id ?? acta?.proyecto_id,
    itemOgId: planItem?.og_id ?? str.og_id,
    actaId: str.acta_id ?? acta?.id,
  })
  const og = transfer ?? nest(str.og)
  const proyecto = nest(str.proyecto)

  const strLabel = String(str.numero ?? '').trim() || strId.slice(0, 8)
  const fuenteLabel = (fuente?.descripcion ?? fuente?.detalle ?? '').trim()
  const ogCodigo = (og?.codigo ?? '').trim()
  const ogDesc = (og?.descripcion ?? '').trim()
  const ogLabel = ogCodigo
    ? `[${ogCodigo}]${ogDesc ? ` ${ogDesc}` : ''}`
    : ogDesc
  const proyectoLabel = (proyecto?.descripcion ?? '').trim()

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  // Título
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  const title = `SOLICITUD DE TRANSFERENCIA DE RECURSOS Nº: ${strLabel}`
  const titleLines = doc.splitTextToSize(title, pageW - PDF_MARGIN_MM * 2) as string[]
  doc.text(titleLines, pageW / 2, y, { align: 'center' })
  y += titleLines.length * 5.5 + 4

  // Datos del STR / acta
  const actaNum = (acta?.numero ?? '').trim()
  const actaFecha = d(acta?.fecha)
  y = metaLine(
    doc, layout, y,
    ['Número de Acta:', actaNum ? `${actaNum}${actaFecha ? ` | Fecha: ${actaFecha}` : ''}` : ''],
  )
  y = metaLine(doc, layout, y, ['Fecha:', d(str.fecha)], ['Nivel:', txtPdf(str.nivel) === '---' ? '' : String(str.nivel ?? '')])
  y = metaLine(
    doc, layout, y,
    ['Nº Resolución:', txtPdf(str.nro_resolucion) === '---' ? '' : String(str.nro_resolucion ?? '')],
    ['Fecha Resolución:', d(str.fecha_resolucion)],
  )
  y = metaLine(
    doc, layout, y,
    ['Nº Obligación:', txtPdf(str.numero_obligacion) === '---' ? '' : String(str.numero_obligacion ?? '')],
    ['Fecha Obligación:', d(str.fecha_obligacion)],
  )
  y = metaLine(
    doc, layout, y,
    ['Nº Factura:', txtPdf(str.numero_factura) === '---' ? '' : String(str.numero_factura ?? '')],
    ['Nº OT:', txtPdf(str.nro_ot) === '---' ? '' : String(str.nro_ot ?? '')],
  )
  y = metaLine(
    doc, layout, y,
    ['Fecha Desembolso:', d(str.fecha_desembolso)],
    ['Fecha Límite a Rendir:', d(str.fecha_rendicion)],
  )

  y += 3
  y = sectionHeading(doc, layout, y, 'Detalles del Proyecto y Financiamiento')
  y = metaBlockLine(doc, layout, y, 'Proyecto:', proyectoLabel)
  y = metaBlockLine(doc, layout, y, 'Fuente:', fuenteLabel)
  y = metaBlockLine(doc, layout, y, 'Objeto Gasto:', ogLabel)
  y = metaBlockLine(doc, layout, y, 'Monto Total:', moneyGs(str.monto))

  y += 2
  y = sectionHeading(doc, layout, y, 'Control Documental')

  const body = items.map((it, idx) => [
    String(idx + 1),
    txtPdf(it.documento) === '---' ? '' : txtPdf(it.documento),
    pdfEstadoCell(it.si_no, ''),
    (it.observaciones ?? '').trim(),
  ])

  drawPdfTable(
    doc,
    layout,
    y,
    [['#', 'Documento', 'ESTADO', 'Observaciones']],
    body,
    undefined,
    {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 90 },
      2: { halign: 'left', cellWidth: 32 },
      3: { halign: 'left' },
    },
    { fontSize: 8, headFontSize: 8, gapAfter: 10 },
  )

  y = pdfTableFinalY(doc) + 14
  y = pdfEnsureSpace(doc, y, 18, layout)

  const colW = (pageW - PDF_MARGIN_MM * 2) / 2
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(9)
  doc.text('Verificado por:', PDF_MARGIN_MM, y)
  doc.text('V°B°:', PDF_MARGIN_MM + colW, y)
  y += 12
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.line(PDF_MARGIN_MM, y, PDF_MARGIN_MM + colW - 10, y)
  doc.line(PDF_MARGIN_MM + colW, y, pageW - PDF_MARGIN_MM, y)

  const filename = `STR_${slugify(strLabel)}`
  pdfFinishAndSave(doc, layout, filename)
}
