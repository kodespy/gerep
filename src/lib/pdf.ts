import jsPDF, { type jsPDFOptions } from 'jspdf'
/** Inline (data URL): evita 404/CORS en Hostinger y file:// en Electron. */
import logoDataUrl from '../assets/logo-gobierno-py.png?inline'
import { ensurePdfFonts, PDF_TABLE_BODY_SIZE, PDF_TABLE_FONT } from './pdfFonts'

/** Folio — 216 × 330 mm (8,5″ × 13″), formato estándar para informes. */
export const PDF_PAGE_WIDTH_MM = 216
export const PDF_PAGE_HEIGHT_MM = 330
export const PDF_PAGE_SIZE: [number, number] = [PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM]

export const PDF_MARGIN_MM = 16
/** Ancho del logo: 85% del área útil, centrado y sin estirar al ancho completo. */
export const PDF_LOGO_WIDTH_RATIO = 0.85
export const PDF_HEADER_TOP_MM = 10
export const PDF_HEADER_LINE_GAP_MM = 3
export const PDF_CONTENT_GAP_MM = 6
export const PDF_FOOTER_LINE_FROM_BOTTOM_MM = 16
export const PDF_FOOTER_TEXT_FROM_BOTTOM_MM = 9
export const PDF_FOOTER_RESERVE_MM = 28

export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfLayout {
  contentTop: number
  contentBottom: number
  logoDataUrl: string
  logoWidthMm: number
  logoHeightMm: number
  headerLineY: number
  /** Se llama al insertar una página nueva (p. ej. para repetir logo de cabecera). */
  onAddPage?: (doc: jsPDF) => void
}

let logoCache: { dataUrl: string; aspect: number } | null = null

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar el logo del PDF'))
    img.src = src
  })
}

async function loadLogo(): Promise<{ dataUrl: string; aspect: number }> {
  if (logoCache) return logoCache
  const img = await loadHtmlImage(logoDataUrl)
  logoCache = {
    dataUrl: logoDataUrl,
    aspect: img.naturalWidth / Math.max(img.naturalHeight, 1),
  }
  return logoCache
}

/** Crea un documento PDF con el tamaño de hoja Folio configurado globalmente. */
export function createPdfDoc(
  options: Omit<jsPDFOptions, 'format' | 'unit'> & { orientation?: PdfOrientation } = {},
): jsPDF {
  const { orientation = 'portrait', ...rest } = options
  // Con formato personalizado [w,h], jsPDF no siempre aplica landscape:
  // invertimos explícitamente a 330 × 216 mm en horizontal.
  const format: [number, number] =
    orientation === 'landscape'
      ? [PDF_PAGE_HEIGHT_MM, PDF_PAGE_WIDTH_MM]
      : PDF_PAGE_SIZE
  return new jsPDF({
    unit: 'mm',
    format,
    orientation,
    ...rest,
  })
}

export function pdfPageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth()
}

export function pdfPageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight()
}

/** Calcula márgenes de contenido y carga el logo institucional. */
export async function preparePdfLayout(doc: jsPDF): Promise<PdfLayout> {
  await ensurePdfFonts()
  const logo = await loadLogo()
  const pageW = pdfPageWidth(doc)
  const pageH = pdfPageHeight(doc)
  const contentW = pageW - PDF_MARGIN_MM * 2
  const logoWidthMm = Math.min(contentW, Math.max(contentW * PDF_LOGO_WIDTH_RATIO, 135))
  const logoHeightMm = logoWidthMm / logo.aspect
  const headerLineY = PDF_HEADER_TOP_MM + logoHeightMm + PDF_HEADER_LINE_GAP_MM
  return {
    contentTop: headerLineY + PDF_CONTENT_GAP_MM,
    contentBottom: pageH - PDF_FOOTER_RESERVE_MM,
    logoDataUrl: logo.dataUrl,
    logoWidthMm,
    logoHeightMm,
    headerLineY,
  }
}

/** Dibuja cabecera (logo centrado + línea) y pie (línea + Pág. n/total). */
export function pdfDrawPageChrome(doc: jsPDF, layout: PdfLayout, page: number, total: number): void {
  const pageW = pdfPageWidth(doc)
  const pageH = pdfPageHeight(doc)
  const logoX = (pageW - layout.logoWidthMm) / 2

  doc.addImage(layout.logoDataUrl, 'PNG', logoX, PDF_HEADER_TOP_MM, layout.logoWidthMm, layout.logoHeightMm)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.35)
  doc.line(PDF_MARGIN_MM, layout.headerLineY, pageW - PDF_MARGIN_MM, layout.headerLineY)

  const footerLineY = pageH - PDF_FOOTER_LINE_FROM_BOTTOM_MM
  doc.line(PDF_MARGIN_MM, footerLineY, pageW - PDF_MARGIN_MM, footerLineY)

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(PDF_TABLE_BODY_SIZE)
  doc.setTextColor(40, 40, 40)
  doc.text(`Pág. ${page}/${total}`, pageW / 2, pageH - PDF_FOOTER_TEXT_FROM_BOTTOM_MM, { align: 'center' })
}

/** Aplica cabecera y pie en todas las páginas y descarga el archivo. */
export function pdfFinishAndSave(doc: jsPDF, layout: PdfLayout, filename: string): void {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    pdfDrawPageChrome(doc, layout, p, total)
  }
  doc.save(`${filename}.pdf`)
}

/** Agrega una página nueva respetando el formato Folio y la orientación actual. */
export function pdfAddPage(doc: jsPDF): void {
  const w = pdfPageWidth(doc)
  const h = pdfPageHeight(doc)
  const orientation = w > h ? 'l' : 'p'
  doc.addPage([w, h], orientation)
}

/** Verifica espacio vertical; inserta salto de página Folio si hace falta. */
export function pdfEnsureSpace(doc: jsPDF, y: number, needed: number, layout: PdfLayout): number {
  if (y + needed > layout.contentBottom) {
    pdfAddPage(doc)
    layout.onAddPage?.(doc)
    return layout.contentTop
  }
  return y
}
