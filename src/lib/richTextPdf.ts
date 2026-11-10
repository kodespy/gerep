import type jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { PDF_FOOTER_RESERVE_MM, PDF_MARGIN_MM, pdfEnsureSpace, type PdfLayout } from './pdf'
import {
  PDF_TABLE_BORDER,
  PDF_TABLE_HEAD_BG,
  PDF_TABLE_LINE_WIDTH,
  pdfTableFinalY,
} from './pdfTable'
import { richTextToBlocks, type RichTextAlign, type RichTextRun, type RichTextTableCell } from './richText'

type PdfPiece = {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
  kind: 'word' | 'space' | 'break'
}

function fittedImageSize(
  doc: jsPDF,
  src: string,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  try {
    const props = doc.getImageProperties(src)
    const ratio = props.width / Math.max(1, props.height)
    let w = Math.min(maxW, maxH * ratio)
    let h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
    if (w > maxW) {
      w = maxW
      h = w / ratio
    }
    return { w: Math.max(8, w), h: Math.max(8, h) }
  } catch {
    return { w: Math.min(maxW, 70), h: Math.min(maxH, 40) }
  }
}

function applyRunFont(doc: jsPDF, fontName: string, run: { bold: boolean; italic: boolean }): void {
  const style = run.bold ? 'bold' : 'normal'
  const names = [fontName, 'helvetica'].filter((n, i, arr) => n && arr.indexOf(n) === i)
  for (const name of names) {
    try {
      doc.setFont(name, style)
      return
    } catch {
      /* probar siguiente familia */
    }
  }
  try {
    doc.setFont(fontName || 'helvetica', 'normal')
  } catch {
    /* conserva la fuente actual */
  }
}

function pieceWidth(doc: jsPDF, fontName: string, piece: PdfPiece): number {
  applyRunFont(doc, fontName, piece)
  return doc.getTextWidth(piece.kind === 'space' ? ' ' : piece.text)
}

function tokenizeRuns(runs: RichTextRun[]): PdfPiece[] {
  const pieces: PdfPiece[] = []
  for (const run of runs) {
    const parts = run.text.split(/(\n|[ \t]+)/)
    for (const part of parts) {
      if (!part) continue
      if (part === '\n') {
        pieces.push({ ...run, text: '\n', kind: 'break' })
      } else if (/^[ \t]+$/.test(part)) {
        pieces.push({ ...run, text: ' ', kind: 'space' })
      } else {
        pieces.push({ ...run, text: part, kind: 'word' })
      }
    }
  }
  return pieces
}

function wrapPieces(doc: jsPDF, fontName: string, pieces: PdfPiece[], maxW: number): PdfPiece[][] {
  const lines: PdfPiece[][] = []
  let current: PdfPiece[] = []
  let currentW = 0

  const flush = () => {
    while (current.length && current[current.length - 1].kind === 'space') current.pop()
    lines.push(current)
    current = []
    currentW = 0
  }

  for (const piece of pieces) {
    if (piece.kind === 'break') {
      flush()
      continue
    }
    const w = pieceWidth(doc, fontName, piece)
    if (piece.kind === 'space') {
      if (!current.length) continue
      current.push(piece)
      currentW += w
      continue
    }
    if (current.length && currentW + w > maxW) {
      flush()
    }
    current.push(piece)
    currentW += w
  }
  if (current.length) flush()
  return lines.length ? lines : [[]]
}

function lineContentWidth(doc: jsPDF, fontName: string, line: PdfPiece[]): number {
  return line.reduce((sum, p) => sum + pieceWidth(doc, fontName, p), 0)
}

function drawPiece(doc: jsPDF, fontName: string, piece: PdfPiece, x: number, y: number): number {
  if (piece.kind === 'break') return x
  applyRunFont(doc, fontName, piece)
  const text = piece.kind === 'space' ? ' ' : piece.text
  const w = doc.getTextWidth(text)
  if (piece.kind === 'word') {
    doc.text(text, x, y)
    if (piece.underline) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.18)
      doc.line(x, y + 0.55, x + w, y + 0.55)
    }
  }
  return x + w
}

function drawPiecesLine(
  doc: jsPDF,
  fontName: string,
  line: PdfPiece[],
  x: number,
  y: number,
  maxW: number,
  align: RichTextAlign,
  isLastLine: boolean,
): void {
  const content = line.filter(p => p.kind !== 'break')
  if (!content.length) return

  if (align === 'justify' && !isLastLine) {
    const words = content.filter(p => p.kind === 'word')
    if (words.length > 1) {
      const wordsW = words.reduce((sum, p) => sum + pieceWidth(doc, fontName, p), 0)
      const gap = (maxW - wordsW) / (words.length - 1)
      let cx = x
      for (let i = 0; i < words.length; i++) {
        cx = drawPiece(doc, fontName, words[i], cx, y)
        if (i < words.length - 1) cx += gap
      }
      return
    }
  }

  let startX = x
  if (align === 'center' || align === 'right') {
    const w = lineContentWidth(doc, fontName, content)
    startX = align === 'center' ? x + (maxW - w) / 2 : x + maxW - w
  }
  let cx = startX
  for (const piece of content) cx = drawPiece(doc, fontName, piece, cx, y)
}

function writeHtmlTableToPdf(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  rows: RichTextTableCell[][],
  fontName: string,
): number {
  if (!rows.length) return y
  const useHead = rows.length > 1 && rows[0].some(c => c.header || c.runs.some(r => r.bold))
  const toRow = (row: RichTextTableCell[]) => row.map(c => c.text || ' ')
  const head = useHead ? [toRow(rows[0])] : undefined
  const body = (useHead ? rows.slice(1) : rows).map(toRow)
  const startY = pdfEnsureSpace(doc, y, 12, layout)
  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    margin: {
      left: PDF_MARGIN_MM,
      right: PDF_MARGIN_MM,
      top: layout.contentTop,
      bottom: PDF_FOOTER_RESERVE_MM,
    },
    styles: {
      font: fontName,
      fontSize: 10,
      cellPadding: 1.4,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: PDF_TABLE_BORDER,
      lineWidth: PDF_TABLE_LINE_WIDTH,
      textColor: [0, 0, 0],
    },
    headStyles: {
      font: fontName,
      fontStyle: 'bold',
      fillColor: PDF_TABLE_HEAD_BG,
      textColor: [0, 0, 0],
    },
  })
  const endY = pdfTableFinalY(doc)
  return (endY > 0 ? endY : startY) + 3
}

/** Escribe HTML enriquecido (negrita, subrayado, alineación, sangría, tablas) en el PDF. */
export function writeRichTextToPdf(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  html: string,
  pageW: number,
  lineH = 4.8,
  defaultLineHeight = 1.5,
  fontName?: string,
): number {
  const blocks = richTextToBlocks(html)
  const fullW = pageW - PDF_MARGIN_MM * 2
  const baseX = PDF_MARGIN_MM
  const unit = lineH / Math.max(defaultLineHeight, 1)
  const resolvedFont = fontName || doc.getFont()?.fontName || 'helvetica'

  if (!blocks.length) {
    y = pdfEnsureSpace(doc, y, lineH + 1, layout)
    applyRunFont(doc, resolvedFont, { bold: false, italic: false })
    doc.text('---', baseX, y)
    return y + lineH + 2
  }

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]
    const factor = block.lineHeight > 0 ? block.lineHeight : defaultLineHeight
    const rowH = unit * factor
    const indentMm = Math.min(48, (block.indent || 0) * 8)
    const x = baseX + indentMm
    const maxW = Math.max(40, fullW - indentMm)

    if (block.table?.length) {
      y = writeHtmlTableToPdf(doc, layout, y, block.table, resolvedFont)
      continue
    }
    if (block.imageSrc) {
      const { w: imgW, h: imgH } = fittedImageSize(doc, block.imageSrc, maxW, 92)
      y = pdfEnsureSpace(doc, y, imgH + 2, layout)
      let imgX = x
      if (block.align === 'center') imgX = x + Math.max(0, (maxW - imgW) / 2)
      if (block.align === 'right') imgX = x + Math.max(0, maxW - imgW)
      const fmt = /jpe?g/i.test(block.imageSrc) ? 'JPEG' : 'PNG'
      try {
        doc.addImage(block.imageSrc, fmt, imgX, y, imgW, imgH)
      } catch {
        try {
          doc.addImage(block.imageSrc, imgX, y, imgW, imgH)
        } catch {
          /* si la imagen no se puede incrustar, se sigue con el texto */
        }
      }
      y += imgH + 3
      if (!block.text?.trim()) {
        if (b < blocks.length - 1) y += Math.max(1.8, rowH * 0.25)
        continue
      }
    }
    const runs =
      block.runs?.length > 0
        ? block.runs
        : [{ text: block.text, bold: false, italic: false, underline: false }]
    const lines = wrapPieces(doc, resolvedFont, tokenizeRuns(runs), maxW)
    for (let i = 0; i < lines.length; i++) {
      y = pdfEnsureSpace(doc, y, rowH + 1, layout)
      drawPiecesLine(doc, resolvedFont, lines[i], x, y, maxW, block.align, i === lines.length - 1)
      y += rowH
    }
    if (b < blocks.length - 1) y += Math.max(1.8, rowH * 0.25)
  }
  applyRunFont(doc, resolvedFont, { bold: false, italic: false })
  return y
}
