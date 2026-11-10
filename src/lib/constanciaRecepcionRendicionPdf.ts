import QRCode from 'qrcode'
import { supabase } from './supabase'
import {
  createPdfDoc,
  PDF_FOOTER_LINE_FROM_BOTTOM_MM,
  PDF_MARGIN_MM,
  pdfEnsureSpace,
  pdfFinishAndSave,
  pdfPageHeight,
  pdfPageWidth,
  preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { PDF_TABLE_FONT } from './pdfFonts'
import { drawPdfTable } from './pdfTable'
import { fmtDatePdf, fmtDateTimePdf, fmtMoneyPdf, txtPdf } from './format'
import { isRendicionExpediente, observacionesFromStr, type DatosRendicion } from './expedienteRendicion'

const FONT = PDF_TABLE_FONT
const BODY = 11
/** Margen lateral de este documento (un poco más holgado que el chrome). */
const SIDE = PDF_MARGIN_MM + 4
const BOX_LINE: [number, number, number] = [200, 200, 200]

const P1 =
  'La Mesa de Entrada de la Unidad Ejecutora de Proyectos (UEP) de la Secretaría Nacional de Deportes (SND), deja constancia que ha recepcionado la Rendición de Cuentas presentada por el [ENTIDAD], en su carácter de Organización Sin Fines de Lucro beneficiaria de transferencias de recursos públicos en el marco de los Eventos Deportivos de Relevancia Internacional (EDRI).'

const P2 =
  'La presente recepción tiene carácter estrictamente formal, se recepciona según lo establecido en la Res. SND 227/2026, en carácter de declaración jurada, los documentos que sustentan la Rendición de Cuentas de los recursos públicos, transferidos a las Entidades sin Fines de Lucro. La recepción de los mismos por parte de la UEP/SND servirá al solo efecto de Constancias de presentación y no constituirá aprobación de la Rendición de Cuentas, encontrándose sujetas a posterior evaluaciones y análisis según los procesos de control que correspondan.'

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function proyectoLabel(proyecto: {
  descripcion?: string | null
  componente?: { codigo?: string | null; descripcion?: string | null } | { codigo?: string | null; descripcion?: string | null }[] | null
} | null): string {
  if (!proyecto) return ''
  const nombre = String(proyecto.descripcion ?? '').trim()
  const comp = asOne(proyecto.componente)
  const compNombre = String(comp?.descripcion ?? comp?.codigo ?? '').trim()
  if (nombre && compNombre) return `${nombre} - ${compNombre}`
  return nombre || compNombre
}

function contentWidth(doc: ReturnType<typeof createPdfDoc>): number {
  return pdfPageWidth(doc) - SIDE * 2
}

function writePara(
  doc: ReturnType<typeof createPdfDoc>,
  layout: PdfLayout,
  y: number,
  text: string,
  opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'justify'; after?: number },
): number {
  const pageW = pdfPageWidth(doc)
  const maxW = contentWidth(doc)
  const size = opts?.size ?? BODY
  const lineH = size * 0.42
  doc.setFont(FONT, opts?.bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.setTextColor(0, 0, 0)
  const src = txtPdf(text)
  const lines = doc.splitTextToSize(src, maxW) as string[]
  const h = lines.length * lineH
  y = pdfEnsureSpace(doc, y, h + 2, layout)
  const align = opts?.align ?? 'left'
  if (align === 'center') {
    doc.text(lines, pageW / 2, y, { align: 'center', maxWidth: maxW })
  } else if (align === 'justify') {
    doc.text(src, SIDE, y, { align: 'justify', maxWidth: maxW })
  } else {
    doc.text(lines, SIDE, y, { maxWidth: maxW })
  }
  return y + h + (opts?.after ?? 3.2)
}

function paraHeight(doc: ReturnType<typeof createPdfDoc>, text: string, maxW: number, size = BODY): number {
  doc.setFont(FONT, 'normal')
  doc.setFontSize(size)
  const lines = doc.splitTextToSize(txtPdf(text), maxW) as string[]
  return lines.length * (size * 0.42)
}

function writeTitleBanner(doc: ReturnType<typeof createPdfDoc>, layout: PdfLayout, titles: string[]): number {
  const pageW = pdfPageWidth(doc)
  const boxX = PDF_MARGIN_MM
  const boxW = pageW - PDF_MARGIN_MM * 2
  const sizes = [15, 13]
  const padY = 4
  const gap = 2.2
  const heights = titles.map((t, i) => {
    const size = sizes[i] ?? 13
    doc.setFont(FONT, 'bold')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(txtPdf(t), boxW - 8) as string[]
    return { lines, size, lineH: size * 0.42, h: lines.length * (size * 0.42) }
  })
  const boxH = padY * 2 + heights.reduce((s, r) => s + r.h, 0) + gap * Math.max(0, titles.length - 1)
  const boxTop = layout.headerLineY
  doc.setFillColor(230, 230, 230)
  doc.setDrawColor(...BOX_LINE)
  doc.setLineWidth(0.3)
  doc.rect(boxX, boxTop, boxW, boxH, 'FD')
  doc.setTextColor(0, 0, 0)
  let ty = boxTop + padY + heights[0].lineH * 0.85
  heights.forEach((row, i) => {
    doc.setFont(FONT, 'bold')
    doc.setFontSize(row.size)
    doc.text(row.lines, pageW / 2, ty, { align: 'center', maxWidth: boxW - 8 })
    ty += row.h + (i < heights.length - 1 ? gap : 0)
  })
  return boxTop + boxH
}

function writeBoxedParagraphs(
  doc: ReturnType<typeof createPdfDoc>,
  layout: PdfLayout,
  y: number,
  p1: string,
  p2: string,
): number {
  const pageW = pdfPageWidth(doc)
  const pad = 4
  const boxX = PDF_MARGIN_MM
  const boxW = pageW - PDF_MARGIN_MM * 2
  const innerX = boxX + pad
  const innerW = boxW - pad * 2
  const afterPara = 3.2

  const innerH = paraHeight(doc, p1, innerW) + afterPara + paraHeight(doc, p2, innerW) + 1.2
  const boxH = innerH + pad * 2

  const boxTop = y
  doc.setDrawColor(...BOX_LINE)
  doc.setLineWidth(0.35)
  doc.rect(boxX, boxTop, boxW, boxH)

  let ty = boxTop + pad + 3.2
  doc.setFont(FONT, 'normal')
  doc.setFontSize(BODY)
  doc.setTextColor(0, 0, 0)
  doc.text(txtPdf(p1), innerX, ty, { align: 'justify', maxWidth: innerW })
  ty += paraHeight(doc, p1, innerW) + afterPara
  doc.text(txtPdf(p2), innerX, ty, { align: 'justify', maxWidth: innerW })
  return boxTop + boxH
}

function writeDatosTable(
  doc: ReturnType<typeof createPdfDoc>,
  layout: PdfLayout,
  y: number,
  rows: { label: string; value: string; bold?: boolean }[],
): number {
  const labelStyle = {
    fontStyle: 'bold' as const,
    fillColor: [230, 230, 230] as [number, number, number],
  }
  return drawPdfTable(
    doc,
    layout,
    y - 0.2,
    [[{ content: 'Datos de la rendición', colSpan: 2, styles: { halign: 'center' } }]],
    rows.map(r => [
      { content: txtPdf(r.label), styles: labelStyle },
      r.bold
        ? { content: txtPdf(r.value || '---'), styles: { fontStyle: 'bold' } }
        : txtPdf(r.value || '---'),
    ]),
    undefined,
    { 0: { cellWidth: 58 } },
    {
      fontSize: 10,
      headFontSize: 10,
      marginMm: PDF_MARGIN_MM,
      headFill: [80, 80, 80],
      headText: [255, 255, 255],
      gapAfter: 3,
      pageBreak: 'avoid',
    },
  )
}

function qrBoxHeight(lineCount: number): number {
  const qrSize = 26
  const pad = 3
  const lineH = 3.9
  const captionH = 4 + 5.2 + lineCount * lineH
  return Math.max(qrSize + pad * 2, captionH + pad * 2)
}

function diasLimiteVsPresentacion(
  fechaLimite: string | null | undefined,
  fechaPresentacion: string | null | undefined,
): number | null {
  const lim = String(fechaLimite ?? '').trim()
  const pres = String(fechaPresentacion ?? '').trim()
  if (!lim || !pres) return null
  const mLim = lim.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const mPres = pres.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!mLim || !mPres) return null
  const limite = new Date(Number(mLim[1]), Number(mLim[2]) - 1, Number(mLim[3]))
  const presentacion = new Date(Number(mPres[1]), Number(mPres[2]) - 1, Number(mPres[3]))
  return Math.round((limite.getTime() - presentacion.getTime()) / 86_400_000)
}

function labelDiasAtrasoOAntes(dias: number | null): string {
  if (dias == null) return '---'
  if (dias < 0) {
    const n = Math.abs(dias)
    return `${n} ${n === 1 ? 'día' : 'días'} de atraso`
  }
  if (dias === 0) return 'En fecha'
  return `${dias} ${dias === 1 ? 'día' : 'días'} antes`
}

async function writeQrBox(
  doc: ReturnType<typeof createPdfDoc>,
  _layout: PdfLayout,
  payloadLines: string[],
  printedLines: string[],
): Promise<void> {
  const pageW = pdfPageWidth(doc)
  const footerLineY = pdfPageHeight(doc) - PDF_FOOTER_LINE_FROM_BOTTOM_MM
  const payload = payloadLines.map(l => txtPdf(l)).join('\n')
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const qrSize = 26
  const pad = 3
  const boxX = PDF_MARGIN_MM
  const boxW = pageW - PDF_MARGIN_MM * 2
  const textX = boxX + pad + qrSize + 5
  const textW = boxW - qrSize - pad * 3
  const lineH = 3.9
  const boxH = qrBoxHeight(printedLines.length)
  const boxTop = footerLineY - boxH

  doc.setDrawColor(...BOX_LINE)
  doc.setLineWidth(0.35)
  doc.rect(boxX, boxTop, boxW, boxH)
  doc.addImage(dataUrl, 'PNG', boxX + pad, boxTop + (boxH - qrSize) / 2, qrSize, qrSize)

  let ty = boxTop + pad + 4
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text('Verificación', textX, ty)
  ty += 5.2
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8)
  for (const line of printedLines) {
    const wrapped = doc.splitTextToSize(txtPdf(line), textW) as string[]
    doc.text(wrapped, textX, ty, { maxWidth: textW })
    ty += wrapped.length * lineH
  }
}

export async function exportConstanciaRecepcionRendicionPdf(
  expedienteId: string,
): Promise<void> {
  const { data: exp, error } = await supabase
    .from('expedientes')
    .select(`
      id, numero_expediente, tipo, fecha_recepcion, datos_rendicion,
      entidad:entidades(razon_social)
    `)
    .eq('id', expedienteId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!exp) throw new Error('Expediente no encontrado.')
  if (!isRendicionExpediente(exp.tipo)) {
    throw new Error('La constancia solo aplica a expedientes de Rendición de Cuentas.')
  }

  const rc: DatosRendicion =
    exp.datos_rendicion && typeof exp.datos_rendicion === 'object' && !Array.isArray(exp.datos_rendicion)
      ? exp.datos_rendicion as DatosRendicion
      : {}

  let str: {
    numero?: string | null
    monto?: number | null
    nro_ot?: string | null
    fecha?: string | null
    fecha_desembolso?: string | null
    fecha_rendicion?: string | null
    proyecto?: {
      descripcion?: string | null
      componente?: { codigo?: string | null; descripcion?: string | null } | { codigo?: string | null; descripcion?: string | null }[] | null
    } | {
      descripcion?: string | null
      componente?: { codigo?: string | null; descripcion?: string | null } | { codigo?: string | null; descripcion?: string | null }[] | null
    }[] | null
  } | null = null

  if (rc.str_id) {
    const { data } = await supabase
      .from('strs')
      .select('id, numero, monto, nro_ot, fecha, fecha_desembolso, fecha_rendicion, proyecto:proyectos(descripcion, componente:componentes_programa(codigo, descripcion))')
      .eq('id', rc.str_id)
      .maybeSingle()
    str = data
  } else if (rc.str_numero) {
    const { data } = await supabase
      .from('strs')
      .select('id, numero, monto, nro_ot, fecha, fecha_desembolso, fecha_rendicion, proyecto:proyectos(descripcion, componente:componentes_programa(codigo, descripcion))')
      .ilike('numero', String(rc.str_numero))
      .limit(1)
      .maybeSingle()
    str = data
  }

  const entidad = asOne(exp.entidad as { razon_social?: string | null } | { razon_social?: string | null }[] | null)
  const entidadNombre = String(entidad?.razon_social ?? '').trim() || '---'
  const proyecto = asOne(str?.proyecto ?? null)
  const proyectoNombre = proyectoLabel(proyecto).toUpperCase() || '---'
  const strNumero = String(str?.numero ?? rc.str_numero ?? '').trim() || '---'
  const montoStr = str?.monto != null ? fmtMoneyPdf(str.monto) : '---'
  const montoRendido = rc.monto != null ? fmtMoneyPdf(rc.monto) : '---'
  const observaciones = observacionesFromStr(str ?? {}, rc.observaciones, fmtDatePdf) || '---'
  const fechaHora = exp.fecha_recepcion
    ? fmtDateTimePdf(exp.fecha_recepcion)
    : fmtDateTimePdf(new Date().toISOString())
  const fechaRendicion = str?.fecha_rendicion ? fmtDatePdf(str.fecha_rendicion) : '---'
  const dias = diasLimiteVsPresentacion(str?.fecha_rendicion, exp.fecha_recepcion)
  const diasLabel = labelDiasAtrasoOAntes(dias)

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  let y = writeTitleBanner(doc, layout, ['CONSTANCIA DE RECEPCIÓN', 'RENDICIÓN DE CUENTAS'])

  y = writeBoxedParagraphs(
    doc,
    layout,
    y,
    P1.replace('[ENTIDAD]', entidadNombre.toUpperCase()),
    P2,
  )

  y = writeDatosTable(doc, layout, y, [
    { label: 'Denominación del Proyecto', value: proyectoNombre, bold: true },
    { label: 'STR N°', value: strNumero },
    { label: 'Monto STR', value: montoStr },
    { label: 'Monto Rendido', value: montoRendido },
    { label: 'Observaciones', value: observaciones },
  ])

  const qrPrinted = [
    `Expediente N°: ${String(exp.numero_expediente ?? '').trim() || '---'}`,
    `STR N°: ${strNumero}`,
    `Proyecto: ${proyectoNombre}`,
    `Monto Rendido: ${montoRendido}`,
    `Fecha/Hora de presentación: ${fechaHora}`,
  ]
  await writeQrBox(doc, layout, [
    ...qrPrinted,
    `Fecha Límite de Rendición: ${fechaRendicion}`,
    `Plazo: ${diasLabel}`,
  ], qrPrinted)

  const nro = String(exp.numero_expediente ?? '').replace(/[^\w.-]+/g, '_') || 'expediente'
  pdfFinishAndSave(doc, layout, `constancia-recepcion-rc-${nro}`)
}
