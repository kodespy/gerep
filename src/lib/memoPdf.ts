import { txtPdf, fmtDate } from './format'
import {
  createPdfDoc,
  PDF_MARGIN_MM,
  PDF_HEADER_TOP_MM,
  pdfEnsureSpace,
  pdfPageWidth,
  pdfPageHeight,
  preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { PDF_TABLE_FONT } from './pdfFonts'
import { memoTitulo } from './memoNumero'
import { writeRichTextToPdf } from './richTextPdf'
import { isEmptyRichText } from './richText'
import { parseCcPersonas, personaLineas } from './memoPersonas'
import { supabase } from './supabase'

const MEMO_FONT = PDF_TABLE_FONT
const MEMO_BODY_SIZE = 12
const MEMO_TITLE_SIZE = 16

const MISION =
  'Misión: Ente rector que promueve las políticas del deporte, la actividad física y recreativa a nivel nacional a través de planes, programas y proyectos, tendientes a mejorar la calidad de vida de la población paraguaya.'

const VISION =
  'Visión: Ser una institución reconocida por su liderazgo de políticas públicas deportivas a nivel nacional e internacional, con calidez humana y solidaria para el bienestar de la sociedad.'

const PIE_DIR =
  'Avenida Eusebio Ayala y R.I. 6 Boqueron Km. 4 1/2  -  Tel.: (595-21) 520-672/3 - Fax: (595-21) 520-671 / 520-675'
const PIE_WEB = 'www.snd.gov.py  - Asuncion - Paraguay'

type FuncionarioPdf = {
  id: string
  nombre_completo: string | null
  cargo: string | null
}

function drawMemoLogo(doc: ReturnType<typeof createPdfDoc>, layout: PdfLayout): void {
  const pageW = pdfPageWidth(doc)
  const logoX = (pageW - layout.logoWidthMm) / 2
  try {
    doc.addImage(
      layout.logoDataUrl,
      'PNG',
      logoX,
      PDF_HEADER_TOP_MM,
      layout.logoWidthMm,
      layout.logoHeightMm,
      'uep-gov-logo',
      'FAST',
    )
  } catch {
    doc.addImage(layout.logoDataUrl, 'PNG', logoX, PDF_HEADER_TOP_MM, layout.logoWidthMm, layout.logoHeightMm)
  }
}

function drawMemoChrome(doc: ReturnType<typeof createPdfDoc>, layout: PdfLayout, page: number, total: number): void {
  const pageW = pdfPageWidth(doc)
  const pageH = pdfPageHeight(doc)
  doc.setFont(MEMO_FONT, 'normal')
  drawMemoLogo(doc, layout)

  const misionTop = PDF_HEADER_TOP_MM + layout.logoHeightMm + 2.2
  doc.setFont(MEMO_FONT, 'normal')
  doc.setFontSize(6.4)
  doc.setTextColor(70, 70, 70)
  const misionLines = doc.splitTextToSize(txtPdf(MISION), pageW - PDF_MARGIN_MM * 2) as string[]
  doc.text(misionLines, pageW / 2, misionTop, { align: 'center' })

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.35)
  doc.line(PDF_MARGIN_MM, layout.headerLineY, pageW - PDF_MARGIN_MM, layout.headerLineY)

  const footerLineY = pageH - 22
  doc.line(PDF_MARGIN_MM, footerLineY, pageW - PDF_MARGIN_MM, footerLineY)
  doc.setFont(MEMO_FONT, 'normal')
  doc.setFontSize(6.2)
  doc.setTextColor(70, 70, 70)
  const visionLines = doc.splitTextToSize(txtPdf(VISION), pageW - PDF_MARGIN_MM * 2) as string[]
  let fy = footerLineY + 3.2
  doc.text(visionLines, PDF_MARGIN_MM, fy)
  fy += visionLines.length * 2.5 + 0.6
  doc.setFontSize(6)
  doc.text(txtPdf(PIE_DIR), pageW / 2, fy, { align: 'center' })
  fy += 2.8
  doc.text(txtPdf(PIE_WEB), pageW / 2, fy, { align: 'center' })
  doc.setFontSize(7)
  doc.setTextColor(40, 40, 40)
  doc.text(`Pag. ${page}/${total}`, pageW - PDF_MARGIN_MM, pageH - 5, { align: 'right' })
}

function drawMetaRow(
  doc: ReturnType<typeof createPdfDoc>,
  layout: PdfLayout,
  y: number,
  label: string,
  valueLines: string[],
  pageW: number,
  opts?: { boldFirstLine?: boolean; afterMm?: number },
): number {
  const labelW = 22
  const valueX = PDF_MARGIN_MM + labelW
  const valueW = pageW - PDF_MARGIN_MM - valueX
  const lineH = 5.2
  const boldFirst = Boolean(opts?.boldFirstLine)
  const nameSrc = txtPdf(valueLines[0] ?? '---')
  const restSrc = valueLines.slice(1)

  doc.setFontSize(MEMO_BODY_SIZE)
  let nameLines: string[] = []
  let restLines: string[] = []
  if (boldFirst) {
    doc.setFont(MEMO_FONT, 'bold')
    nameLines = doc.splitTextToSize(nameSrc, valueW) as string[]
    doc.setFont(MEMO_FONT, 'normal')
    for (const line of restSrc) {
      restLines.push(...(doc.splitTextToSize(txtPdf(line), valueW) as string[]))
    }
  } else {
    doc.setFont(MEMO_FONT, 'normal')
    for (const line of valueLines) {
      restLines.push(...(doc.splitTextToSize(txtPdf(line), valueW) as string[]))
    }
    if (!restLines.length) restLines.push('---')
  }

  const wrapped = boldFirst ? [...nameLines, ...restLines] : restLines
  if (!wrapped.length) wrapped.push('---')
  const h = Math.max(lineH, wrapped.length * lineH)
  y = pdfEnsureSpace(doc, y, h + 1.5, layout)

  doc.setFont(MEMO_FONT, 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(label, PDF_MARGIN_MM, y)
  doc.setFont(MEMO_FONT, 'normal')
  doc.text(':', PDF_MARGIN_MM + labelW - 4, y)

  let ly = y
  if (boldFirst && nameLines.length) {
    doc.setFont(MEMO_FONT, 'bold')
    doc.text(nameLines, valueX, ly)
    ly += nameLines.length * lineH
  }
  if (restLines.length) {
    doc.setFont(MEMO_FONT, 'normal')
    doc.text(restLines, valueX, ly)
  }
  return y + h + (opts?.afterMm ?? 1.2)
}

export async function exportMemoPdf(memoId: string): Promise<void> {
  const { data: memo, error } = await supabase
    .from('memos')
    .select('*')
    .eq('id', memoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!memo) throw new Error('No se encontró el memorándum.')

  const ccIds: string[] = Array.isArray(memo.cc_funcionario_ids)
    ? (memo.cc_funcionario_ids as unknown[]).map(id => String(id)).filter(Boolean)
    : []
  const funcIds = [
    ...new Set(
      [memo.de_funcionario_id, memo.para_funcionario_id, ...ccIds]
        .map(id => (id == null ? '' : String(id)))
        .filter(Boolean),
    ),
  ]
  let byId: Record<string, FuncionarioPdf> = {}
  if (funcIds.length) {
    const { data, error: funcErr } = await supabase
      .from('funcionarios')
      .select('id, nombre_completo, cargo')
      .in('id', funcIds)
    if (funcErr) throw new Error(funcErr.message)
    byId = Object.fromEntries((data ?? []).map(f => [String(f.id), f as FuncionarioPdf]))
  }
  const ccFuncs = ccIds.map(id => byId[id]).filter((f): f is FuncionarioPdf => Boolean(f))

  const doc = createPdfDoc()
  const base = await preparePdfLayout(doc)
  const misionProbe = (() => {
    doc.setFont(MEMO_FONT, 'normal')
    doc.setFontSize(6.4)
    return (doc.splitTextToSize(txtPdf(MISION), pdfPageWidth(doc) - PDF_MARGIN_MM * 2) as string[]).length
  })()
  const headerLineY = PDF_HEADER_TOP_MM + base.logoHeightMm + 2.2 + misionProbe * 2.45 + 2.2
  const layout: PdfLayout = {
    ...base,
    headerLineY,
    contentTop: headerLineY + 8,
    contentBottom: pdfPageHeight(doc) - 38,
  }
  layout.onAddPage = d => drawMemoChrome(d, layout, 1, 1)

  drawMemoChrome(doc, layout, 1, 1)

  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(MEMO_FONT, 'bold')
  doc.setFontSize(MEMO_TITLE_SIZE)
  doc.setTextColor(0, 0, 0)
  const titulo = txtPdf(memoTitulo(memo.numero))
  doc.text(titulo, pageW / 2, y, { align: 'center' })
  const tituloW = doc.getTextWidth(titulo)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.45)
  doc.line((pageW - tituloW) / 2, y + 1.4, (pageW + tituloW) / 2, y + 1.4)
  y += 12

  const deCat = byId[String(memo.de_funcionario_id)] ?? null
  const paraCat = byId[String(memo.para_funcionario_id)] ?? null
  const de = {
    nombre: String(memo.de_nombre || deCat?.nombre_completo || '').trim(),
    cargo: String(memo.de_cargo || deCat?.cargo || '').trim(),
  }
  const para = {
    nombre: String(memo.para_nombre || paraCat?.nombre_completo || '').trim(),
    cargo: String(memo.para_cargo || paraCat?.cargo || '').trim(),
  }

  y = drawMetaRow(doc, layout, y, 'De', personaLineas(de), pageW, { boldFirstLine: true, afterMm: 6.5 })
  y = drawMetaRow(doc, layout, y, 'Para', personaLineas(para), pageW, { boldFirstLine: true, afterMm: 6.5 })

  const ccPeople = parseCcPersonas(memo.cc_personas, memo.cc_otros)
  if (!ccPeople.length) {
    for (const f of ccFuncs) {
      ccPeople.push({
        nombre: (f.nombre_completo ?? '').trim(),
        cargo: (f.cargo ?? '').trim(),
      })
    }
  }
  const ccLines: string[] = []
  for (const p of ccPeople) ccLines.push(...personaLineas(p))
  if (ccLines.length) y = drawMetaRow(doc, layout, y, 'CC', ccLines, pageW)

  y = drawMetaRow(doc, layout, y, 'Asunto', [(memo.asunto ?? '').trim() || '---'], pageW, { afterMm: 6.5 })
  y = drawMetaRow(doc, layout, y, 'Fecha', [fmtDate(memo.fecha)], pageW)
  y += 3
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.line(PDF_MARGIN_MM, y, pageW - PDF_MARGIN_MM, y)
  y += 5

  doc.setFont(MEMO_FONT, 'normal')
  doc.setFontSize(MEMO_BODY_SIZE)
  doc.setTextColor(0, 0, 0)
  const cuerpoHtml = isEmptyRichText(String(memo.cuerpo ?? ''))
    ? '<p class="ql-align-justify">Me dirijo a Usted, y por su intermedio a quienes corresponda, a fin de...</p>'
    : String(memo.cuerpo ?? '')
  y = writeRichTextToPdf(doc, layout, y, cuerpoHtml, pageW, 6.5, 1.5)

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    drawMemoChrome(doc, layout, p, total)
  }

  const safeNum = String(memo.numero ?? 'memo').replace(/[^\d/]+/g, '_')
  doc.save(`Memorandum_UEP_${safeNum}.pdf`)
}
