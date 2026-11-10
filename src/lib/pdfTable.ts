import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  PDF_MARGIN_MM, PDF_FOOTER_RESERVE_MM, pdfEnsureSpace, pdfPageHeight, type PdfLayout,
} from './pdf'
import {
  pdfTableBodyStyles, pdfTableFootStyles, pdfTableHeadStyles,
  PDF_TABLE_BODY_SIZE, PDF_TABLE_FONT, PDF_TABLE_HEAD_SIZE,
} from './pdfFonts'

export {
  PDF_TABLE_BODY_SIZE, PDF_TABLE_FONT, PDF_TABLE_HEAD_SIZE,
  pdfTableBodyStyles, pdfTableFootStyles, pdfTableHeadStyles,
} from './pdfFonts'

/** Cabecera y totales en #F2F2F2; bordes visibles al imprimir. */
export const PDF_TABLE_HEAD_BG: [number, number, number] = [242, 242, 242]   // #F2F2F2
export const PDF_TABLE_HEAD_TEXT: [number, number, number] = [0, 0, 0]
export const PDF_TABLE_BODY_TEXT: [number, number, number] = [0, 0, 0]
export const PDF_TABLE_FOOT_BG: [number, number, number] = [242, 242, 242]   // #F2F2F2
export const PDF_TABLE_BORDER: [number, number, number] = [192, 192, 192]    // #C0C0C0
export const PDF_TABLE_LINE_WIDTH = 0.15

export const PDF_TABLE_MARGIN = {
  left: PDF_MARGIN_MM,
  right: PDF_MARGIN_MM,
  top: 0,
  bottom: PDF_FOOTER_RESERVE_MM,
}

export interface PdfTableColStyle {
  halign?: 'left' | 'right' | 'center'
  cellWidth?: number
}

export function pdfTableFinalY(doc: jsPDF): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0
}

/** Detecta celdas de monto en pie de tabla PDF. */
function isPdfMoneyCell(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && (/\d[\d.]*\s*Gs\./.test(t) || /^-?\d[\d.]*$/.test(t))
}

export type PdfTableCell =
  | string
  | {
      content: string
      colSpan?: number
      rowSpan?: number
      /** Ícono de estado dibujado a la izquierda del texto (Informe Técnico). */
      estadoIcon?: string
      styles?: {
        halign?: 'left' | 'right' | 'center'
        fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic'
        fillColor?: false | [number, number, number]
        textColor?: [number, number, number]
        fontSize?: number
      }
    }

/** Colores de ícono/texto para estados Cumple / No cumple / etc. en PDF. */
export const PDF_ESTADO_RGB: Record<string, [number, number, number]> = {
  cumple: [5, 150, 105],
  no_cumple: [225, 29, 72],
  requiere_autorizacion: [124, 58, 237],
  no_aplica: [100, 116, 139],
}

const PDF_ESTADO_LABEL: Record<string, string> = {
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  requiere_autorizacion: 'Requiere autorización',
  no_aplica: 'No aplica',
}

/** Normaliza valores de UI/DB (Cumple, No cumple, No Aplica, si/no, etc.) a clave de ícono. */
export function pdfNormalizeEstado(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'cumple' || s === 'si' || s === 'sí' || s === 'yes') return 'cumple'
  if (
    s === 'no cumple' || s === 'no_cumple' || s === 'nocumple' || s === 'no'
  ) return 'no_cumple'
  if (
    s === 'no aplica' || s === 'no_aplica' || s === 'noaplica' ||
    s === 'n/a' || s === 'na'
  ) return 'no_aplica'
  if (
    s === 'requiere autorizacion' || s === 'requiere autorización' ||
    s === 'requiere_autorizacion'
  ) return 'requiere_autorizacion'
  return ''
}

/**
 * Celda con palabra + ícono circular coloreado (Cumple / No cumple / No aplica).
 * Cumple (verde) / No cumple (rojo) / No aplica (gris).
 */
export function pdfEstadoCell(
  raw: string | null | undefined,
  empty: PdfTableCell = '—',
): PdfTableCell {
  const key = pdfNormalizeEstado(raw)
  if (!key) return empty
  const rgb = PDF_ESTADO_RGB[key] ?? [100, 116, 139]
  return {
    content: PDF_ESTADO_LABEL[key] ?? String(raw ?? '').trim(),
    estadoIcon: key,
    styles: {
      textColor: rgb,
      fontStyle: 'bold',
      halign: 'left',
    },
  }
}

/** Marca de columna (solo ícono centrado) para tablas Cumple | No Cumple | No Aplica. */
export function pdfEstadoMarkCell(estado: 'cumple' | 'no_cumple' | 'no_aplica' | null): PdfTableCell {
  if (!estado) return ''
  const rgb = PDF_ESTADO_RGB[estado] ?? [100, 116, 139]
  return {
    content: ' ',
    estadoIcon: estado,
    styles: {
      textColor: rgb,
      halign: 'center',
    },
  }
}

export type PdfPageSumsOpts = {
  /** Valor numérico por [fila del body][columna]; null = columna no sumable en esa fila. */
  values: (number | null)[][]
  format: (n: number) => string
  /** Columna de la etiqueta SUBTOTAL/TOTAL (default 1). */
  labelCol?: number
  pageLabel?: string
  grandLabel?: string
  pageFill?: [number, number, number]
  grandFill?: [number, number, number]
}

export function drawPdfTable(
  doc: jsPDF,
  layout: PdfLayout,
  startY: number,
  head: PdfTableCell[][],
  body: PdfTableCell[][],
  foot?: PdfTableCell[][],
  colStyles?: Record<number, PdfTableColStyle>,
  sizeOpts?: {
    fontSize?: number
    headFontSize?: number
    gapAfter?: number
    headFill?: [number, number, number]
    headText?: [number, number, number]
    footFill?: [number, number, number]
    footText?: [number, number, number]
    /** Por defecto everyPage; usar 'lastPage' para totales solo al final. */
    showFoot?: 'everyPage' | 'lastPage'
    /** Margen horizontal (mm). Por defecto PDF_MARGIN_MM. */
    marginMm?: number
    /** Evita salto de página de la tabla (p. ej. acta en una sola hoja). */
    pageBreak?: 'auto' | 'avoid'
    /**
     * Subtotal de columnas numéricas en cada página + total general al final.
     * Cuando está activo, el `foot` externo se ignora (se genera automáticamente).
     */
    pageSums?: PdfPageSumsOpts
  },
): number {
  const bodySize = sizeOpts?.fontSize ?? PDF_TABLE_BODY_SIZE
  const headSize = sizeOpts?.headFontSize ?? PDF_TABLE_HEAD_SIZE
  const gapAfter = sizeOpts?.gapAfter ?? 8
  const marginMm = sizeOpts?.marginMm ?? PDF_MARGIN_MM
  const pageSums = sizeOpts?.pageSums
  // Preferir body/foot: head[0] con colSpan tiene menos celdas que columnas reales
  const colCount = Math.max(
    body[0]?.length ?? 0,
    foot?.[0]?.length ?? 0,
    head[0]?.length ?? 0,
  )
  const labelCol = pageSums?.labelCol ?? 1
  const pageLabel = pageSums?.pageLabel ?? 'SUBTOTAL PÁGINA'
  const grandLabel = pageSums?.grandLabel ?? 'TOTAL GENERAL'
  const pageRowIndexes = new Map<number, number[]>()

  const placeholderFoot: PdfTableCell[][] | undefined = pageSums
    ? [Array.from({ length: colCount }, () => '')]
    : foot

  const y = sizeOpts?.pageBreak === 'avoid'
    ? startY
    : pdfEnsureSpace(doc, startY, 14, layout)
  const footerReserve = sizeOpts?.pageBreak === 'avoid'
    ? Math.max(PDF_FOOTER_RESERVE_MM, pdfPageHeight(doc) - layout.contentBottom)
    : PDF_FOOTER_RESERVE_MM
  autoTable(doc, {
    startY: y,
    head,
    body,
    foot: placeholderFoot,
    pageBreak: sizeOpts?.pageBreak ?? 'auto',
    showFoot: pageSums
      ? 'everyPage'
      : (sizeOpts?.showFoot ?? (foot ? 'everyPage' : undefined)),
    margin: { left: marginMm, right: marginMm, top: layout.contentTop, bottom: footerReserve },
    styles: {
      ...pdfTableBodyStyles,
      fontSize: bodySize,
      textColor: PDF_TABLE_BODY_TEXT,
      cellPadding: bodySize <= 7 ? 1.0 : 2,
      overflow: 'linebreak',
      lineColor: PDF_TABLE_BORDER,
      lineWidth: PDF_TABLE_LINE_WIDTH,
    },
    headStyles: {
      ...pdfTableHeadStyles,
      fontSize: headSize,
      fillColor: sizeOpts?.headFill ?? PDF_TABLE_HEAD_BG,
      textColor: sizeOpts?.headText ?? PDF_TABLE_HEAD_TEXT,
    },
    footStyles: {
      ...pdfTableFootStyles,
      fontSize: headSize,
      fillColor: pageSums?.pageFill ?? sizeOpts?.footFill ?? PDF_TABLE_FOOT_BG,
      textColor: sizeOpts?.footText ?? PDF_TABLE_BODY_TEXT,
      fontStyle: 'bold',
    },
    columnStyles: colStyles,
    theme: 'grid',
    didDrawCell: (hook) => {
      if (pageSums && hook.section === 'body' && hook.column.index === 0) {
        const page = hook.pageNumber
        const list = pageRowIndexes.get(page) ?? []
        if (!list.includes(hook.row.index)) list.push(hook.row.index)
        pageRowIndexes.set(page, list)
      }
      if (hook.section !== 'body') return
      const raw = hook.cell.raw
      if (typeof raw !== 'object' || !raw || !('estadoIcon' in raw)) return
      const cellObj = raw as { estadoIcon?: string; content?: string }
      const key = String(cellObj.estadoIcon ?? '')
      if (!key) return
      const markOnly = !String(cellObj.content ?? '').trim()
      const cx = markOnly
        ? hook.cell.x + hook.cell.width / 2
        : hook.cell.x + 4.2
      drawEstadoIconPdf(doc, cx, hook.cell.y + hook.cell.height / 2, key)
    },
    willDrawCell: (hook) => {
      if (!pageSums || hook.section !== 'foot') return
      const idxs = pageRowIndexes.get(hook.pageNumber) ?? []
      const col = hook.column.index
      if (col === labelCol) {
        hook.cell.text = [pageLabel]
        return
      }
      let sum = 0
      let any = false
      for (const ri of idxs) {
        const v = pageSums.values[ri]?.[col]
        if (v == null || Number.isNaN(Number(v))) continue
        sum += Number(v) || 0
        any = true
      }
      hook.cell.text = [any ? pageSums.format(sum) : '']
      if (any || colStyles?.[col]?.halign === 'right') {
        hook.cell.styles.halign = 'right'
      }
    },
    didParseCell: (hook) => {
      const idx = hook.column.index
      const raw = hook.cell.raw
      const text = typeof raw === 'string'
        ? raw
        : String(
            (typeof raw === 'object' && raw && 'content' in raw
              ? (raw as { content?: unknown }).content
              : null) ?? hook.cell.text?.[0] ?? '',
          )
      const cellObj = typeof raw === 'object' && raw !== null
        ? raw as {
            content?: string
            styles?: {
              halign?: string
              textColor?: [number, number, number]
              fontStyle?: string
              fillColor?: false | [number, number, number]
              fontSize?: number
            }
            estadoIcon?: string
          }
        : null
      const cellStyles = cellObj?.styles
      const explicitHalign = cellStyles?.halign
      const isTotalLabel = /^TOTAL(\s|$)/i.test(text.trim())

      if (cellStyles?.textColor) {
        hook.cell.styles.textColor = cellStyles.textColor
      }
      if (cellStyles?.fontStyle) {
        hook.cell.styles.fontStyle = cellStyles.fontStyle as typeof hook.cell.styles.fontStyle
      }
      if (cellStyles?.fillColor !== undefined) {
        hook.cell.styles.fillColor = cellStyles.fillColor
      }
      if (cellStyles?.fontSize != null) {
        hook.cell.styles.fontSize = cellStyles.fontSize
      }
      if (cellObj?.estadoIcon && hook.section === 'body') {
        const pad = typeof hook.cell.styles.cellPadding === 'number'
          ? hook.cell.styles.cellPadding
          : 1.5
        const markOnly = !String(cellObj.content ?? '').trim()
        // Margen izquierdo extra para que el ícono no quede pegado al borde (texto + ícono).
        hook.cell.styles.cellPadding = markOnly
          ? { top: pad, right: pad, bottom: pad, left: pad }
          : { top: pad, right: pad, bottom: pad, left: pad + 7.5 }
      }

      if (hook.section === 'foot') {
        if (!cellStyles?.textColor) {
          hook.cell.styles.textColor = sizeOpts?.footText ?? PDF_TABLE_BODY_TEXT
        }
        if (explicitHalign) {
          hook.cell.styles.halign = explicitHalign as typeof hook.cell.styles.halign
          return
        }
        if (
          colStyles?.[idx]?.halign === 'right' ||
          isPdfMoneyCell(text) ||
          isTotalLabel
        ) {
          hook.cell.styles.halign = 'right'
        } else if (colStyles?.[idx]?.halign) {
          hook.cell.styles.halign = colStyles[idx].halign!
        }
        return
      }
      if (explicitHalign) {
        hook.cell.styles.halign = explicitHalign as typeof hook.cell.styles.halign
        return
      }
      if (colStyles?.[idx]?.halign) {
        hook.cell.styles.halign = colStyles[idx].halign!
      }
    },
  })

  let endY = pdfTableFinalY(doc)

  // Fila de TOTAL GENERAL (todas las filas) debajo de la tabla con subtotales por página.
  if (pageSums && colCount > 0 && body.length > 0) {
    const grandRow: PdfTableCell[] = Array.from({ length: colCount }, (_, col) => {
      if (col === labelCol) {
        return {
          content: grandLabel,
          styles: { fontStyle: 'bold', halign: 'left' },
        }
      }
      let sum = 0
      let any = false
      for (let ri = 0; ri < pageSums.values.length; ri++) {
        const v = pageSums.values[ri]?.[col]
        if (v == null || Number.isNaN(Number(v))) continue
        sum += Number(v) || 0
        any = true
      }
      if (!any) return ''
      return {
        content: pageSums.format(sum),
        styles: { fontStyle: 'bold', halign: 'right' },
      }
    })
    autoTable(doc, {
      startY: endY + 0.4,
      body: [grandRow],
      showHead: 'never',
      margin: { left: marginMm, right: marginMm, top: layout.contentTop, bottom: PDF_FOOTER_RESERVE_MM },
      styles: {
        ...pdfTableBodyStyles,
        fontSize: headSize,
        fontStyle: 'bold',
        textColor: sizeOpts?.footText ?? PDF_TABLE_BODY_TEXT,
        fillColor: pageSums.grandFill ?? [180, 180, 180],
        cellPadding: bodySize <= 7 ? 1.2 : 2,
        overflow: 'linebreak',
        lineColor: PDF_TABLE_BORDER,
        lineWidth: PDF_TABLE_LINE_WIDTH,
      },
      columnStyles: colStyles,
      theme: 'grid',
      didParseCell: (hook) => {
        const idx = hook.column.index
        const raw = hook.cell.raw
        const cellObj = typeof raw === 'object' && raw !== null
          ? raw as { styles?: { halign?: string } }
          : null
        if (cellObj?.styles?.halign) {
          hook.cell.styles.halign = cellObj.styles.halign as typeof hook.cell.styles.halign
        } else if (colStyles?.[idx]?.halign) {
          hook.cell.styles.halign = colStyles[idx].halign!
        }
      },
    })
    endY = pdfTableFinalY(doc)
  }

  return endY + gapAfter
}

/** Badge circular con tilde / X / símbolo para estados (Cumple verde, No cumple rojo). */
function drawEstadoIconPdf(doc: jsPDF, cx: number, cy: number, estado: string): void {
  const r = 2.15
  const rgb = PDF_ESTADO_RGB[estado] ?? [100, 116, 139]
  doc.setFillColor(...rgb)
  doc.circle(cx, cy, r, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.38)
  doc.setLineCap('round')

  if (estado === 'cumple') {
    doc.line(cx - 1.05, cy + 0.15, cx - 0.25, cy + 1.05)
    doc.line(cx - 0.25, cy + 1.05, cx + 1.2, cy - 0.95)
  } else if (estado === 'no_cumple') {
    doc.line(cx - 0.95, cy - 0.95, cx + 0.95, cy + 0.95)
    doc.line(cx + 0.95, cy - 0.95, cx - 0.95, cy + 0.95)
  } else if (estado === 'requiere_autorizacion') {
    doc.setFillColor(255, 255, 255)
    doc.circle(cx, cy, 0.85, 'F')
    doc.setFillColor(...rgb)
    doc.circle(cx, cy, 0.4, 'F')
  } else if (estado === 'no_aplica') {
    doc.setLineWidth(0.45)
    doc.line(cx - 0.95, cy, cx + 0.95, cy)
  }
}

export function pdfSectionHeading(doc: jsPDF, layout: PdfLayout, y: number, title: string): number {
  y = pdfEnsureSpace(doc, y, 10, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(PDF_TABLE_HEAD_SIZE)
  doc.setTextColor(0, 0, 0)
  doc.text(title, PDF_MARGIN_MM, y)
  return y + 5
}

export function pdfBodyText(doc: jsPDF, layout: PdfLayout, y: number, lines: string[], fontSize = PDF_TABLE_BODY_SIZE): number {
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor(...PDF_TABLE_BODY_TEXT)
  const maxW = doc.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2
  const lineH = fontSize * 0.38
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxW)
    y = pdfEnsureSpace(doc, y, wrapped.length * lineH + 2, layout)
    doc.text(wrapped, PDF_MARGIN_MM, y)
    y += wrapped.length * lineH + 2
  }
  return y
}

export function pdfSetBodyStyle(doc: jsPDF, fontSize = PDF_TABLE_BODY_SIZE): void {
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor(...PDF_TABLE_BODY_TEXT)
}

export function pdfSetHeadStyle(doc: jsPDF, fontSize = PDF_TABLE_HEAD_SIZE): void {
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(fontSize)
  doc.setTextColor(0, 0, 0)
}
