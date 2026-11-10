import type jsPDF from 'jspdf'
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
import { supabase } from './supabase'
import { supabaseFetchAll } from './supabaseFetchAll'

export type StrsPdfFilters = {
  actividadLabel?: string
  programaLabel?: string
  componenteLabel?: string
  ogPrincipalLabel?: string
  desde?: string
  hasta?: string
}

type AggRow = {
  key: string
  label: string
  sub?: string
  count: number
  monto: number
}

const HEAD_BLUE: [number, number, number] = [46, 117, 182]
const FOOT_GREEN: [number, number, number] = [84, 180, 81]
const WHITE: [number, number, number] = [255, 255, 255]
const BRAND: [number, number, number] = [47, 28, 106]
/** Mismo margen que la línea del encabezado institucional. */
const STR_MARGIN_MM = PDF_MARGIN_MM

const PIE_COLORS: [number, number, number][] = [
  [46, 117, 182],
  [84, 180, 81],
  [245, 158, 11],
  [239, 68, 68],
  [139, 92, 246],
  [14, 165, 233],
  [236, 72, 153],
  [20, 184, 166],
  [100, 116, 139],
]

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function resolucionNumero(r: any): string {
  const res = nest(r.resolucion)
  return String(res?.numero ?? r.nro_resolucion ?? '').trim()
}

function resolucionFecha(r: any): string {
  const res = nest(r.resolucion)
  const raw = String(res?.fecha ?? r.fecha_resolucion ?? '').trim()
  return raw ? raw.slice(0, 10) : ''
}

function actaNumero(r: any): string {
  const acta = nest(r.acta)
  return String(acta?.numero ?? '').trim()
}

function actaFecha(r: any): string {
  const acta = nest(r.acta)
  const raw = String(acta?.fecha ?? '').trim()
  return raw ? raw.slice(0, 10) : ''
}

type ConvenioInfo = { numero: string; fecha: string }

/** Convenio más reciente por proyecto (tabla convenios). */
async function fetchConvenioByProyectoIds(proyectoIds: string[]): Promise<Map<string, ConvenioInfo>> {
  const out = new Map<string, ConvenioInfo>()
  const ids = [...new Set(proyectoIds.map(String).filter(Boolean))]
  if (!ids.length) return out

  const IN = 80
  for (let i = 0; i < ids.length; i += IN) {
    const chunk = ids.slice(i, i + IN)
    const { data, error } = await supabaseFetchAll<{
      proyecto_id: string
      number: string | null
      fecha_convenio: string | null
    }>(
      () => supabase
        .from('convenios')
        .select('id, proyecto_id, number, fecha_convenio', { count: 'exact' })
        .in('proyecto_id', chunk)
        .order('fecha_convenio', { ascending: false }),
    )
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const pid = String(c.proyecto_id ?? '')
      if (!pid || out.has(pid)) continue
      out.set(pid, {
        numero: String(c.number ?? '').trim(),
        fecha: String(c.fecha_convenio ?? '').slice(0, 10),
      })
    }
  }
  return out
}

function convenioFromRow(
  r: any,
  byProy: Map<string, ConvenioInfo>,
): ConvenioInfo {
  const proy = nest(r.proyecto)
  const pid = String(proy?.id ?? r.proyecto_id ?? '').trim()
  const fromTable = pid ? byProy.get(pid) : undefined
  const numero =
    (fromTable?.numero ?? '').trim()
    || String(proy?.convenio ?? '').trim()
  const fecha = (fromTable?.fecha ?? '').trim()
  return { numero, fecha }
}

function catalogLabel(codigo?: string | null, descripcion?: string | null): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `${c} — ${d}`
  return c || d || '—'
}

function normalizeFf(fuente: any): string {
  const desc = (fuente?.descripcion ?? '').trim()
  const det = (fuente?.detalle ?? '').trim()
  // Prefer codes like "10-001" when present in either field.
  const joined = [desc, det].filter(Boolean).join(' ')
  const m = joined.match(/\b\d{1,3}\s*[-/]\s*\d{2,4}\b/)
  if (m) return m[0].replace(/\s*/g, '')
  return desc || det || 'Sin FF/OF'
}

function aggregate(
  rows: any[],
  keyFn: (r: any) => { key: string; label: string; sub?: string },
): AggRow[] {
  const map = new Map<string, AggRow>()
  for (const r of rows) {
    const { key, label, sub } = keyFn(r)
    const k = key || '—'
    const cur = map.get(k) ?? { key: k, label: label || '—', sub, count: 0, monto: 0 }
    cur.count += 1
    cur.monto += Number(r.monto) || 0
    if (!cur.sub && sub) cur.sub = sub
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.monto - a.monto || a.label.localeCompare(b.label, 'es'))
}

function summaryTheme() {
  return {
    fontSize: 7.5,
    headFontSize: 8,
    gapAfter: 8,
    headFill: HEAD_BLUE,
    headText: WHITE,
    footFill: FOOT_GREEN,
    footText: WHITE,
    marginMm: STR_MARGIN_MM,
  }
}

function drawSectionTitle(doc: jsPDF, layout: PdfLayout, y: number, title: string): number {
  y = pdfEnsureSpace(doc, y, 10, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BRAND)
  doc.text(title, STR_MARGIN_MM, y)
  doc.setTextColor(0, 0, 0)
  return y + 5
}

function drawSummaryTable(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  pageW: number,
  title: string,
  head: string[],
  rows: AggRow[],
  mode: 'og' | 'simple' | 'comp',
): number {
  y = drawSectionTitle(doc, layout, y, title)
  const usable = pageW - STR_MARGIN_MM * 2
  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const totalMonto = rows.reduce((s, r) => s + r.monto, 0)

  let body: PdfTableCell[][]
  let foot: PdfTableCell[][]
  let colStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number }>

  if (mode === 'og') {
    body = rows.map(r => [
      txtPdf(r.key === '—' ? '' : r.key),
      txtPdf(r.sub || r.label),
      String(r.count),
      fmtMoneyPdf(r.monto),
    ])
    foot = [[
      { content: '', styles: { fillColor: FOOT_GREEN } },
      { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: String(totalCount), styles: { fontStyle: 'bold', halign: 'center', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: fmtMoneyPdf(totalMonto), styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
    ]]
    colStyles = {
      0: { cellWidth: usable * 0.12, halign: 'center' },
      1: { cellWidth: usable * 0.48, halign: 'left' },
      2: { cellWidth: usable * 0.15, halign: 'center' },
      3: { cellWidth: usable * 0.25, halign: 'right' },
    }
  } else if (mode === 'comp') {
    body = rows.map(r => [
      txtPdf(r.label),
      String(r.count),
      fmtMoneyPdf(r.monto),
    ])
    foot = [[
      { content: 'TOTAL', styles: { fontStyle: 'bold', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: String(totalCount), styles: { fontStyle: 'bold', halign: 'center', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: fmtMoneyPdf(totalMonto), styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
    ]]
    colStyles = {
      0: { cellWidth: usable * 0.62, halign: 'left' },
      1: { cellWidth: usable * 0.13, halign: 'center' },
      2: { cellWidth: usable * 0.25, halign: 'right' },
    }
  } else {
    body = rows.map(r => [
      txtPdf(r.label),
      String(r.count),
      fmtMoneyPdf(r.monto),
    ])
    foot = [[
      { content: 'TOTAL', styles: { fontStyle: 'bold', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: String(totalCount), styles: { fontStyle: 'bold', halign: 'center', textColor: WHITE, fillColor: FOOT_GREEN } },
      { content: fmtMoneyPdf(totalMonto), styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
    ]]
    colStyles = {
      0: { cellWidth: usable * 0.45, halign: mode === 'simple' ? 'center' : 'left' },
      1: { cellWidth: usable * 0.2, halign: 'center' },
      2: { cellWidth: usable * 0.35, halign: 'right' },
    }
  }

  return drawPdfTable(doc, layout, y, [head], body, foot, colStyles, summaryTheme())
}

/** Gráfico de torta en canvas → dataURL PNG. */
function renderPieChartDataUrl(
  slices: { label: string; value: number; color: [number, number, number] }[],
  sizePx = 520,
): string | null {
  if (typeof document === 'undefined') return null
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0 || slices.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = sizePx
  canvas.height = sizePx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const cx = sizePx / 2
  const cy = sizePx / 2
  const r = sizePx * 0.36
  let angle = -Math.PI / 2

  ctx.clearRect(0, 0, sizePx, sizePx)
  ctx.beginPath()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sizePx, sizePx)

  for (const slice of slices) {
    const sweep = (slice.value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + sweep)
    ctx.closePath()
    ctx.fillStyle = `rgb(${slice.color[0]}, ${slice.color[1]}, ${slice.color[2]})`
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    angle += sweep
  }

  // Donut hole for a modern look
  ctx.beginPath()
  ctx.fillStyle = '#ffffff'
  ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#1e293b'
  ctx.font = 'bold 28px Calibri, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('STR', cx, cy - 10)
  ctx.font = '22px Calibri, Arial, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText(`${slices.length} ítems`, cx, cy + 16)

  return canvas.toDataURL('image/png')
}

function topSlicesForPie(rows: AggRow[], max = 7): { label: string; value: number; color: [number, number, number] }[] {
  if (rows.length <= max) {
    return rows.map((r, i) => ({
      label: r.label,
      value: r.monto,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }
  const top = rows.slice(0, max - 1)
  const rest = rows.slice(max - 1)
  const otrosMonto = rest.reduce((s, r) => s + r.monto, 0)
  return [
    ...top.map((r, i) => ({
      label: r.label,
      value: r.monto,
      color: PIE_COLORS[i % PIE_COLORS.length],
    })),
    {
      label: `Otros (${rest.length})`,
      value: otrosMonto,
      color: PIE_COLORS[(max - 1) % PIE_COLORS.length],
    },
  ]
}

function drawPieInColumn(
  doc: jsPDF,
  y: number,
  x: number,
  colW: number,
  title: string,
  rows: AggRow[],
): number {
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND)
  const titleLines = doc.splitTextToSize(title, colW) as string[]
  doc.text(titleLines, x, y)
  let cy = y + titleLines.length * 4 + 2
  doc.setTextColor(0, 0, 0)

  const slices = topSlicesForPie(rows)
  const dataUrl = renderPieChartDataUrl(slices)
  const chartSize = Math.min(44, colW * 0.42)

  if (dataUrl) {
    doc.addImage(dataUrl, 'PNG', x, cy, chartSize, chartSize)
  }

  const legendX = x + chartSize + 4
  const legendW = Math.max(20, colW - chartSize - 6)
  const total = slices.reduce((s, v) => s + v.value, 0) || 1
  let ly = cy + 2
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(6.5)
  for (const slice of slices) {
    doc.setFillColor(...slice.color)
    doc.roundedRect(legendX, ly - 1.8, 2.6, 2.6, 0.5, 0.5, 'F')
    doc.setTextColor(30, 41, 59)
    const pct = ((slice.value / total) * 100).toFixed(1)
    const label = doc.splitTextToSize(
      `${slice.label} · ${pct}%`,
      legendW - 4,
    ) as string[]
    doc.text(label, legendX + 4, ly)
    ly += Math.max(4.2, label.length * 3.1)
  }
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  // Monto debajo del gráfico si la leyenda quedó corta
  const bottom = Math.max(cy + chartSize, ly) + 2
  doc.setTextColor(0, 0, 0)
  return bottom + 4
}

function drawPieGrid(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  pageW: number,
  charts: { title: string; data: AggRow[] }[],
): number {
  const gap = 8
  const colW = (pageW - STR_MARGIN_MM * 2 - gap) / 2
  const rowH = 62

  for (let i = 0; i < charts.length; i += 2) {
    y = pdfEnsureSpace(doc, y, rowH, layout)
    const left = charts[i]
    const right = charts[i + 1]
    const y0 = y
    const leftBottom = drawPieInColumn(doc, y0, STR_MARGIN_MM, colW, left.title, left.data)
    let rightBottom = y0
    if (right) {
      rightBottom = drawPieInColumn(doc, y0, STR_MARGIN_MM + colW + gap, colW, right.title, right.data)
    }
    y = Math.max(leftBottom, rightBottom) + 4
  }
  return y
}

export async function exportStrsListPdf(
  rows: any[],
  filters: StrsPdfFilters = {},
): Promise<void> {
  const convenioByProy = await fetchConvenioByProyectoIds(
    rows.map(r => String(nest(r.proyecto)?.id ?? r.proyecto_id ?? '')),
  )

  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  // ── Título (sin fondo) ──
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('LISTADO DE STR · Solicitudes de transferencia de recursos', pageW / 2, y + 4, { align: 'center' })
  y += 10
  doc.setTextColor(0, 0, 0)

  const filterLines: string[] = []
  if (filters.actividadLabel) filterLines.push(`Actividad: ${filters.actividadLabel}`)
  if (filters.programaLabel) filterLines.push(`Programa: ${filters.programaLabel}`)
  if (filters.componenteLabel) filterLines.push(`Componente: ${filters.componenteLabel}`)
  if (filters.ogPrincipalLabel) filterLines.push(`OG principal: ${filters.ogPrincipalLabel}`)
  if (filters.desde || filters.hasta) {
    const d = filters.desde ? fmtDatePdf(filters.desde) : '…'
    const h = filters.hasta ? fmtDatePdf(filters.hasta) : '…'
    filterLines.push(`Fecha STR: ${d} — ${h}`)
  }
  if (!filterLines.length) filterLines.push('Filtros: Todos los registros')

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  for (const line of filterLines) {
    doc.text(line, STR_MARGIN_MM, y)
    y += 4
  }
  const grandTotal = rows.reduce((s, r) => s + (Number(r.monto) || 0), 0)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setTextColor(...BRAND)
  doc.text(`${rows.length} STR  ·  Monto acumulado ${fmtMoneyPdf(grandTotal)}`, STR_MARGIN_MM, y)
  y += 6
  doc.setTextColor(0, 0, 0)

  // ── Detalle ──
  y = drawSectionTitle(doc, layout, y, '1. Detalle de STRs')
  const usable = pageW - STR_MARGIN_MM * 2
  const body: PdfTableCell[][] = rows.map((r, idx) => {
    const proy = nest(r.proyecto)
    const og = nest(r.og)
    const fuente = nest(r.fuente)
    const conv = convenioFromRow(r, convenioByProy)
    return [
      String(idx + 1),
      txtPdf(r.numero),
      fmtDatePdf(r.fecha),
      txtPdf(resolucionNumero(r)) || '—',
      resolucionFecha(r) ? fmtDatePdf(resolucionFecha(r)) : '—',
      txtPdf(proy?.descripcion),
      txtPdf(conv.numero) || '—',
      conv.fecha ? fmtDatePdf(conv.fecha) : '—',
      txtPdf(r.nivel),
      txtPdf(og?.codigo),
      txtPdf(normalizeFf(fuente)),
      txtPdf(actaNumero(r)) || '—',
      actaFecha(r) ? fmtDatePdf(actaFecha(r)) : '—',
      txtPdf(r.numero_factura),
      r.monto != null ? fmtMoneyPdf(Number(r.monto)) : '—',
    ]
  })

  const foot: PdfTableCell[][] = [[
    { content: 'TOTAL', colSpan: 14, styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
    { content: fmtMoneyPdf(grandTotal), styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
  ]]

  // Pesos que suman 100% del ancho útil. Monto al final.
  const weights = [2.5, 4.5, 5, 5, 5, 28, 6, 5.5, 3, 3, 5, 5.5, 5.5, 7.5, 9]
  const w = weights.map(p => (usable * p) / 100)

  y = drawPdfTable(
    doc, layout, y,
    [[
      'Nro',
      'Nro STR',
      'Fecha',
      'N° Resolución',
      'Fecha Resolución',
      'Proyecto',
      'N° Convenio',
      'Fecha Convenio',
      'Nivel',
      'OG',
      'FF-OF',
      'N° Acta',
      'Fecha de Acta',
      'Nº Factura',
      'Monto',
    ]],
    body,
    foot,
    {
      0: { cellWidth: w[0], halign: 'center' },
      1: { cellWidth: w[1], halign: 'center' },
      2: { cellWidth: w[2], halign: 'center' },
      3: { cellWidth: w[3], halign: 'center' },
      4: { cellWidth: w[4], halign: 'center' },
      5: { cellWidth: w[5], halign: 'left' },
      6: { cellWidth: w[6], halign: 'center' },
      7: { cellWidth: w[7], halign: 'center' },
      8: { cellWidth: w[8], halign: 'center' },
      9: { cellWidth: w[9], halign: 'center' },
      10: { cellWidth: w[10], halign: 'center' },
      11: { cellWidth: w[11], halign: 'center' },
      12: { cellWidth: w[12], halign: 'center' },
      13: { cellWidth: w[13], halign: 'left' },
      14: { cellWidth: w[14], halign: 'right' },
    },
    {
      fontSize: 5.2,
      headFontSize: 5.6,
      gapAfter: 8,
      headFill: HEAD_BLUE,
      headText: WHITE,
      footFill: FOOT_GREEN,
      footText: WHITE,
      showFoot: 'lastPage',
      marginMm: STR_MARGIN_MM,
    },
  )

  // ── Agregaciones ──
  const byOg = aggregate(rows, r => {
    const og = nest(r.og)
    const codigo = String(og?.codigo ?? '').trim() || '—'
    return { key: codigo, label: codigo, sub: (og?.descripcion ?? '').trim() || 'Sin descripción' }
  })
  const byNivel = aggregate(rows, r => {
    const n = String(r.nivel ?? '').trim() || 'Sin nivel'
    return { key: n, label: n }
  })
  const byFf = aggregate(rows, r => {
    const label = normalizeFf(nest(r.fuente))
    return { key: label, label }
  })
  const byActividad = aggregate(rows, r => {
    const act = nest(nest(nest(r.proyecto)?.componente)?.actividad)
    const label = catalogLabel(act?.codigo, act?.descripcion)
    return { key: String(act?.id ?? label), label: label === '—' ? 'Sin actividad' : label }
  })
  const byComponente = aggregate(rows, r => {
    const comp = nest(nest(r.proyecto)?.componente)
    const codigo = (comp?.codigo ?? '').trim()
    const desc = (comp?.descripcion ?? '').trim()
    const label = codigo && desc ? `[${codigo}] ${desc}` : (desc || codigo || 'Sin componente')
    return { key: String(comp?.id ?? label), label }
  })

  // Nueva página para resúmenes
  doc.addPage()
  y = layout.contentTop
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('2. Resúmenes analíticos', STR_MARGIN_MM, y)
  y += 8
  doc.setTextColor(0, 0, 0)

  y = drawSummaryTable(
    doc, layout, y, pageW,
    'Resumen por Objeto de Gasto (OG)',
    ['Código OG', 'Descripción OG', 'Cantidad STRs', 'Monto Total'],
    byOg,
    'og',
  )
  y = drawSummaryTable(
    doc, layout, y, pageW,
    'Resumen por Nivel',
    ['Nivel', 'Cantidad', 'Monto Total'],
    byNivel,
    'simple',
  )
  y = drawSummaryTable(
    doc, layout, y, pageW,
    'Resumen por Fuente de Financiamiento (FF/OF)',
    ['Fuente de Financiamiento', 'Cantidad', 'Monto Total'],
    byFf,
    'simple',
  )
  y = drawSummaryTable(
    doc, layout, y, pageW,
    'Resumen por Actividad',
    ['Actividad', 'Cantidad', 'Monto Total'],
    byActividad,
    'comp',
  )
  y = drawSummaryTable(
    doc, layout, y, pageW,
    'Resumen por Componentes',
    ['Componente', 'Cantidad', 'Monto Total'],
    byComponente,
    'comp',
  )

  // ── Gráficos de torta (2 por fila) ──
  doc.addPage()
  y = layout.contentTop
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('3. Distribución del monto (gráficos de torta)', STR_MARGIN_MM, y)
  y += 5
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Participación porcentual según el monto de los STRs filtrados. Categorías menores se agrupan en “Otros”.', STR_MARGIN_MM, y)
  y += 8
  doc.setTextColor(0, 0, 0)

  drawPieGrid(doc, layout, y, pageW, [
    { title: 'Por Objeto de Gasto (OG)', data: byOg },
    { title: 'Por Nivel', data: byNivel },
    { title: 'Por FF/OF', data: byFf },
    { title: 'Por Actividad', data: byActividad },
    { title: 'Por Componentes', data: byComponente },
  ])

  pdfFinishAndSave(doc, layout, 'Listado_STR')
}
