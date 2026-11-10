import { supabase } from './supabase'
import { fmtDatePdf, fmtMoneyPdf, txtPdf } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, pdfEstadoCell, type PdfTableCell } from './pdfTable'
import { writeRichTextToPdf } from './richTextPdf'
import {
  calcOfertaTotales,
  filasConcepto,
  formatObjetosGasto,
  parseMontoOferta,
  type InformeTecnicoDraft,
  type ItemVerif,
  type VerifFinanciera,
} from './informeTecnicoTypes'

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
  // Título + subtítulo + un poco de contenido: evita quedar pegado al pie
  const needed = (sub ? 18 : 12) + 16
  if (layout) y = pdfEnsureSpace(doc, y, needed, layout)

  doc.setFillColor(47, 28, 106)
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

export async function exportInformeTecnicoPdf(
  proyectoId: string,
  draft: InformeTecnicoDraft,
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
  doc.setTextColor(47, 28, 106)
  doc.text('Formulario de Control - Aprobación de Proyecto', pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text('Gestión Operacional · UEP-SND', pageW / 2, y, { align: 'center' })
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
    ...(draft.es_infraestructura
      ? [['Modalidad', 'Proyecto de Infraestructura · Anexos XIX A/B (llamado y adjudicado)']]
      : []),
    ['Entidad Proponente', txtPdf(draft.entidad_proponente)],
    ['Monto Solicitado', draft.monto_solicitado ? fmtMoneyPdf(Number(draft.monto_solicitado)) : '---'],
    ['Objeto del Gasto', txtPdf(formatObjetosGasto(draft.objetos_gasto))],
    ['Marco Normativo', txtPdf(draft.marco_normativo)],
    ['Fecha de Verificación en Gestión Operacional - UEP', fmtDatePdf(draft.fecha_verificacion)],
    ['Verificado por', txtPdf(draft.verificado_por)],
  ]

  y = drawPdfTable(
    doc, layout, y,
    [['Ítem', 'Detalle']],
    metaRows,
    undefined,
    { 0: { cellWidth: 70 }, 1: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 70 } },
    { fontSize: 8, headFontSize: 8, gapAfter: 6 },
  )

  y = sectionTitle(doc, pageW, y, '2. VERIFICACIÓN DOCUMENTAL', '(Artículo 7° de la Resolución SND N.º 227/2026)', layout)
  y = drawPdfTable(
    doc, layout, y,
    [['Documento Verificado', 'Estado', 'Observaciones']],
    draft.verificacion_documental.map(i => [
      txtPdf(i.aspecto),
      estadoCell(i),
      txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
    ]),
    undefined,
    { 0: { cellWidth: 62 }, 1: { cellWidth: 38 }, 2: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 100 } },
    { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
  )

  if (draft.es_infraestructura) {
    y = drawInfraSections(doc, layout, pageW, y, draft)
  }

  y = sectionTitle(doc, pageW, y, '3. VERIFICACIÓN FINANCIERA', '(Artículo 8°, inciso b)', layout)
  y = drawOfertasTable(doc, layout, y, draft.verificacion_financiera, pageW)

  if (draft.verificacion_financiera.notas.trim()) {
    y = pdfEnsureSpace(doc, y, 12, layout)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(draft.verificacion_financiera.notas.trim(), pageW - PDF_MARGIN_MM * 2) as string[]
    doc.text(lines, PDF_MARGIN_MM, y)
    y += lines.length * 3.8 + 4
  }

  y = pdfEnsureSpace(doc, y, 20, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.text('Análisis Técnico', PDF_MARGIN_MM, y)
  y += 4
  y = drawPdfTable(
    doc, layout, y,
    [['Aspecto Verificado', 'Resultado', 'Observaciones']],
    draft.verificacion_financiera.analisis.map(i => [
      txtPdf(i.aspecto), estadoCell(i),
      txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
    ]),
    undefined,
    { 0: { cellWidth: 62 }, 1: { cellWidth: 38 }, 2: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 100 } },
    { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
  )

  y = sectionTitle(doc, pageW, y, '4. VERIFICACIÓN DE TIEMPO Y FORMA', undefined, layout)
  y = drawPdfTable(
    doc, layout, y,
    [['Aspecto Verificado', 'Estado', 'Observaciones']],
    draft.verificacion_tiempo.map(i => [
      txtPdf(i.aspecto), estadoCell(i),
      txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
    ]),
    undefined,
    { 0: { cellWidth: 62 }, 1: { cellWidth: 40 }, 2: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 102 } },
    { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
  )

  y = sectionTitle(doc, pageW, y, '5. OTROS ASPECTOS TÉCNICOS', undefined, layout)
  y = drawPdfTable(
    doc, layout, y,
    [['Aspecto', 'Estado', 'Observaciones']],
    draft.otros_aspectos.map(i => [
      txtPdf(i.aspecto), estadoCell(i),
      txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
    ]),
    undefined,
    { 0: { cellWidth: 62 }, 1: { cellWidth: 40 }, 2: { cellWidth: pageW - PDF_MARGIN_MM * 2 - 102 } },
    { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
  )

  const TITLE_TEXT_GAP_MM = 3.5
  const TEXT_LINE_H = 5.2

  // Mismo orden que el formulario (cierre): Resultado → 6. Conclusión → 7. Recomendación
  if (draft.resultado_verificacion.trim()) {
    y = pdfEnsureSpace(doc, y, 10, layout)
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(8)
    const resText = `Resultado de la Verificación: ${draft.resultado_verificacion.trim()}`
    const maxW = pageW - PDF_MARGIN_MM * 2
    const resLines = doc.splitTextToSize(resText, maxW) as string[]
    y = pdfEnsureSpace(doc, y, resLines.length * TEXT_LINE_H + 2, layout)
    for (let i = 0; i < resLines.length; i++) {
      doc.text(resLines[i], PDF_MARGIN_MM, y)
      y += TEXT_LINE_H
    }
    y += 4
  }

  y = sectionTitle(doc, pageW, y, '6. CONCLUSIÓN TÉCNICA', undefined, layout)
  y += TITLE_TEXT_GAP_MM
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  y = writeRichTextToPdf(doc, layout, y, draft.conclusion, pageW, TEXT_LINE_H, 1.5, PDF_TABLE_FONT)

  y = sectionTitle(doc, pageW, y, '7. RECOMENDACIÓN', undefined, layout)
  y += TITLE_TEXT_GAP_MM
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  y = writeRichTextToPdf(doc, layout, y, draft.recomendacion, pageW, TEXT_LINE_H, 1.5, PDF_TABLE_FONT)

  y = pdfEnsureSpace(doc, y, 28, layout)
  y += 10
  const sigX = pageW - PDF_MARGIN_MM - 40
  doc.setDrawColor(120, 120, 120)
  doc.line(sigX - 35, y, sigX + 35, y)
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('Verificado por', sigX, y + 5, { align: 'center' })

  const slug = (draft.numero || 'informe').replace(/[^\w.-]+/g, '_')
  pdfFinishAndSave(doc, layout, `Informe_Tecnico_${slug}`)
}

/** Secciones Anexo XIX · infraestructura (mismo estilo que el resto del informe). */
function drawInfraSections(
  doc: import('jspdf').default,
  layout: PdfLayout,
  pageW: number,
  y: number,
  draft: InformeTecnicoDraft,
): number {
  const sections: Array<{ title: string; sub: string; items: ItemVerif[] }> = [
    {
      title: '2.1 VERIFICACIÓN DOCUMENTAL DEL PROCESO DE LLAMADO',
      sub: '(Anexo XIX · Sección A · Arts. 8° y 11°, Resolución SND N.º 227/2026)',
      items: draft.verificacion_infra_llamado,
    },
    {
      title: '2.2 VERIFICACIÓN DOCUMENTAL DEL ADJUDICADO',
      sub: '(Anexo XIX · Sección B)',
      items: draft.verificacion_infra_adjudicado,
    },
  ]

  const usable = pageW - PDF_MARGIN_MM * 2
  const colReq = usable * 0.34
  const colNorm = usable * 0.22
  const colEst = usable * 0.16
  const colObs = usable - colReq - colNorm - colEst

  for (const section of sections) {
    y = sectionTitle(doc, pageW, y, section.title, section.sub, layout)
    y = drawPdfTable(
      doc, layout, y,
      [['Requisito / Documento', 'Base normativa', 'Estado', 'Observaciones']],
      section.items.map(i => {
        const req = [txtPdf(i.aspecto), i.detalle ? txtPdf(i.detalle) : ''].filter(Boolean).join('\n')
        return [
          req,
          txtPdf(i.referencia || '—'),
          estadoCell(i),
          txtPdf(i.observaciones) === '---' ? '' : txtPdf(i.observaciones),
        ]
      }),
      undefined,
      {
        0: { cellWidth: colReq },
        1: { cellWidth: colNorm },
        2: { cellWidth: colEst },
        3: { cellWidth: colObs },
      },
      { fontSize: 7.5, headFontSize: 8, gapAfter: 6 },
    )
  }

  return y
}

/** Justifica una línea repartiendo el espacio entre palabras (última línea a la izquierda). */
function drawJustifiedLine(
  doc: import('jspdf').default,
  line: string,
  x: number,
  y: number,
  maxW: number,
  isLastLine: boolean,
): void {
  const text = String(line ?? '').trim()
  if (!text) return
  const words = text.split(/\s+/).filter(Boolean)
  if (isLastLine || words.length <= 1) {
    doc.text(text, x, y)
    return
  }
  const wordsWidth = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0)
  const gap = (maxW - wordsWidth) / (words.length - 1)
  let cx = x
  for (const word of words) {
    doc.text(word, cx, y)
    cx += doc.getTextWidth(word) + gap
  }
}

function writeBlock(
  doc: import('jspdf').default,
  layout: import('./pdf').PdfLayout,
  y: number,
  text: string,
  pageW: number,
  justify = false,
  lineH = 5.2,
): number {
  const body = (text || '').trim() || '---'
  const maxW = pageW - PDF_MARGIN_MM * 2
  const lines = doc.splitTextToSize(body, maxW) as string[]
  y = pdfEnsureSpace(doc, y, Math.min(lines.length * lineH + 2, 50), layout)
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  for (let i = 0; i < lines.length; i++) {
    y = pdfEnsureSpace(doc, y, lineH + 1, layout)
    if (justify && body !== '---') {
      drawJustifiedLine(doc, lines[i], PDF_MARGIN_MM, y, maxW, i === lines.length - 1)
    } else {
      doc.text(lines[i], PDF_MARGIN_MM, y)
    }
    y += lineH
  }
  return y + 4
}

function drawOfertasTable(
  doc: import('jspdf').default,
  layout: import('./pdf').PdfLayout,
  y: number,
  fin: VerifFinanciera,
  pageW: number,
): number {
  const usable = pageW - PDF_MARGIN_MM * 2
  const oferentes = fin.oferentes.length ? fin.oferentes : [{ id: 'x', nombre: 'Oferente' }]
  const conceptoW = Math.min(48, usable * 0.28)
  const rest = usable - conceptoW
  const colW = rest / oferentes.length
  const totales = calcOfertaTotales(fin)
  const filas = filasConcepto(fin)

  const head = [['Concepto', ...oferentes.map(o => o.nombre)]]
  const body: PdfTableCell[][] = filas.map(f => [
    txtPdf(f.concepto),
    ...oferentes.map(o => {
      const raw = f.montos[o.id] ?? ''
      const n = parseMontoOferta(raw)
      return n != null ? fmtMoneyPdf(n) : (raw.trim() || '')
    }),
  ])

  const foot: PdfTableCell[][] = [[
    { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'left' } },
    ...oferentes.map(o => ({
      content: fmtMoneyPdf(totales[o.id] ?? 0),
      styles: { fontStyle: 'bold' as const, halign: 'right' as const },
    })),
  ]]

  const colStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number }> = {
    0: { halign: 'left', cellWidth: conceptoW },
  }
  oferentes.forEach((_, i) => {
    colStyles[i + 1] = { halign: 'right', cellWidth: colW }
  })

  return drawPdfTable(doc, layout, y, head, body, foot, colStyles, {
    fontSize: 7.5, headFontSize: 8, gapAfter: 5,
  })
}
