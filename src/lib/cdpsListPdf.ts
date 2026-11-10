import { fmtDateTimePdf, fmtMoneyPdf, txtPdf } from './format'
import { proyectoConComponenteLabel } from './proyectoLabel'
import {
  createPdfDoc,
  PDF_MARGIN_MM,
  pdfDrawPageChrome,
  pdfFinishAndSave,
  pdfPageWidth,
  preparePdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, type PdfTableCell } from './pdfTable'
import { cdpCompAnterior, cdpEstaAnulado, cdpMontoVigente } from './cdpUtils'
import { cdpProyectoSaldoOf, fetchCdpProyectoSaldos, sumUniqueProyectoSaldos } from './cdpsListSaldos'

const HEAD_BLUE: [number, number, number] = [46, 117, 182]
const FOOT_GREEN: [number, number, number] = [84, 180, 81]
const WHITE: [number, number, number] = [255, 255, 255]
const BRAND: [number, number, number] = [47, 28, 106]
const MUTED: [number, number, number] = [120, 120, 120]
const MARGIN = PDF_MARGIN_MM

export type CdpsListPdfOpts = {
  subtitle?: string
  filename?: string
  /** Abre el visor e intenta el diálogo de impresión. Si el popup se bloquea, descarga el PDF. */
  print?: boolean
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function proyectoLabel(row: any): string {
  const label = proyectoConComponenteLabel(nest(row.proyecto))
  return label === '—' ? '' : label
}

function usuarioLabel(row: any): string {
  const u = nest(row.usuario)
  return String(u?.name ?? '').trim()
}

function applyChrome(doc: ReturnType<typeof createPdfDoc>, layout: Awaited<ReturnType<typeof preparePdfLayout>>) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    pdfDrawPageChrome(doc, layout, p, total)
  }
}

function printPdfBlob(blob: Blob, fallbackSave: () => void) {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    fallbackSave()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const trigger = () => {
    try {
      win.focus()
      win.print()
    } catch {
      fallbackSave()
    }
  }
  win.addEventListener('load', trigger)
  window.setTimeout(trigger, 700)
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function moneyOrDash(v: number | null | undefined): string {
  if (v == null) return '---'
  return fmtMoneyPdf(v)
}

export async function exportCdpsListPdf(rows: any[], opts: CdpsListPdfOpts = {}): Promise<void> {
  if (!rows.length) throw new Error('No hay CDP para imprimir.')

  const saldos = await fetchCdpProyectoSaldos(rows)
  const totalesProy = sumUniqueProyectoSaldos(rows, saldos)

  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('LISTADO DE CDP', pageW / 2, y + 4, { align: 'center' })
  y += 10
  doc.setTextColor(0, 0, 0)

  if (opts.subtitle) {
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text(txtPdf(opts.subtitle), MARGIN, y)
    y += 5
  }

  const totalVigente = rows.reduce((s, r) => s + cdpMontoVigente(r), 0)
  const anulados = rows.filter(cdpEstaAnulado).length

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setTextColor(...BRAND)
  doc.setFontSize(7.5)
  const extra = anulados ? `  ·  ${anulados} anulado${anulados === 1 ? '' : 's'} (no suman)` : ''
  doc.text(
    `${rows.length} CDP  ·  Comprometido ${fmtMoneyPdf(totalVigente)}  ·  Ejecutado STR ${fmtMoneyPdf(totalesProy.ejecutadoStr)}  ·  Saldo proyecto ${fmtMoneyPdf(totalesProy.saldoProyecto)}${extra}`,
    MARGIN,
    y,
  )
  y += 7
  doc.setTextColor(0, 0, 0)

  const body: PdfTableCell[][] = rows.map((r, idx) => {
    const anulado = cdpEstaAnulado(r)
    const muted = anulado ? { textColor: MUTED, fontStyle: 'italic' as const } : {}
    const saldo = cdpProyectoSaldoOf(r, saldos)
    return [
      String(idx + 1),
      { content: txtPdf(r.cdp_numero) || 's/n', styles: muted },
      { content: fmtDateTimePdf(r.cdp_date), styles: muted },
      { content: txtPdf(proyectoLabel(r)), styles: muted },
      { content: txtPdf(usuarioLabel(r)), styles: muted },
      {
        content: fmtMoneyPdf(cdpCompAnterior(r, rows)),
        styles: { ...muted, halign: 'right' },
      },
      {
        content: fmtMoneyPdf(Number(r.monto_comprometido) || 0),
        styles: { ...muted, halign: 'right', fontStyle: anulado ? 'italic' : 'bold' },
      },
      {
        content: moneyOrDash(saldo?.ejecutadoStr),
        styles: { ...muted, halign: 'right' },
      },
      {
        content: moneyOrDash(saldo?.saldoProyecto),
        styles: { ...muted, halign: 'right' },
      },
      { content: anulado ? 'Anulado' : 'Activo', styles: muted },
    ]
  })

  const footFill = { fontStyle: 'bold' as const, halign: 'right' as const, textColor: WHITE, fillColor: FOOT_GREEN }
  const foot: PdfTableCell[][] = [[
    {
      content: 'TOTAL (ejec./saldo por proyecto y OG, sin duplicar)',
      colSpan: 6,
      styles: footFill,
    },
    { content: fmtMoneyPdf(totalVigente), styles: footFill },
    { content: fmtMoneyPdf(totalesProy.ejecutadoStr), styles: footFill },
    { content: fmtMoneyPdf(totalesProy.saldoProyecto), styles: footFill },
    { content: '', styles: { fillColor: FOOT_GREEN } },
  ]]

  const usable = pageW - MARGIN * 2
  const weights = [3.5, 10, 10, 22, 11, 8.5, 8.5, 10, 10, 6.5]
  const w = weights.map(p => (usable * p) / 100)

  drawPdfTable(
    doc,
    layout,
    y,
    [['Nro', 'CDP #', 'Fecha CDP', 'Proyecto', 'Usuario', 'Comp. ant.', 'Monto', 'Ejecutado del proyecto (STR)', 'Saldos del proyecto', 'Estado']],
    body,
    foot,
    {
      0: { cellWidth: w[0], halign: 'center' },
      1: { cellWidth: w[1], halign: 'left' },
      2: { cellWidth: w[2], halign: 'left' },
      3: { cellWidth: w[3], halign: 'left' },
      4: { cellWidth: w[4], halign: 'left' },
      5: { cellWidth: w[5], halign: 'right' },
      6: { cellWidth: w[6], halign: 'right' },
      7: { cellWidth: w[7], halign: 'right' },
      8: { cellWidth: w[8], halign: 'right' },
      9: { cellWidth: w[9], halign: 'center' },
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

  const filename = opts.filename || 'Listado_CDP'
  if (opts.print) {
    applyChrome(doc, layout)
    printPdfBlob(doc.output('blob'), () => doc.save(`${filename}.pdf`))
  } else {
    pdfFinishAndSave(doc, layout, filename)
  }
}

export function planAdminPdfLabel(plan: any): string {
  const codigo = String(plan?.objeto?.codigo ?? '').trim()
  const desc = String(plan?.objeto?.descripcion ?? plan?.descripcion ?? '').trim()
  const anio = plan?.anio != null ? ` · Año ${plan.anio}` : ''
  if (codigo && desc) return `[${codigo}] ${desc}${anio}`
  if (desc) return `${desc}${anio}`
  if (codigo) return `[${codigo}]${anio}`
  return `Plan administrativo${anio}`
}
