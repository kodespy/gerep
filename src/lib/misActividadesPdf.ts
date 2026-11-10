import type jsPDF from 'jspdf'
import {
  createPdfDoc,
  PDF_MARGIN_MM,
  pdfAddPage,
  pdfEnsureSpace,
  pdfFinishAndSave,
  pdfPageWidth,
  preparePdfLayout,
} from './pdf'
import { drawPdfTable, pdfBodyText, pdfSectionHeading } from './pdfTable'
import { PDF_TABLE_FONT } from './pdfFonts'
import { fmtDate, fmtDateTime } from './format'
import { labelAccion, type AuditoriaRow } from './auditoria'

export type MisActividadesPdfMeta = {
  usuarioNombre?: string | null
  usuarioEmail?: string | null
  desde: string
  hasta: string
  accionLabel?: string | null
}

type Rgb = [number, number, number]

const BRAND: Rgb = [15, 118, 110]
const SLATE: Rgb = [51, 65, 85]
const MUTED: Rgb = [100, 116, 139]

const ACTION_COLORS: Record<string, Rgb> = {
  INSERT: [16, 185, 129],
  UPDATE: [59, 130, 246],
  DELETE: [244, 63, 94],
  LOGIN: [20, 184, 166],
  LOGOUT: [249, 115, 22],
}

const PALETTE: Rgb[] = [
  [15, 118, 110],
  [56, 189, 248],
  [124, 92, 252],
  [245, 158, 11],
  [236, 72, 153],
  [34, 197, 94],
  [99, 102, 241],
  [239, 68, 68],
  [14, 165, 233],
  [168, 85, 247],
]

function accionKey(accion: string | null | undefined): string {
  return labelAccion(accion).toUpperCase() || 'OTRO'
}

function countBy<T>(items: T[], keyFn: (item: T) => string): { label: string; value: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = keyFn(item) || '—'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function dayKey(iso: string): string {
  return (iso || '').slice(0, 10)
}

function weekdayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  const dt = new Date(y, m - 1, d)
  return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dt.getDay()] ?? isoDate
}

function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

function buildSummary(rows: AuditoriaRow[]) {
  const byAction = countBy(rows, r => accionKey(r.accion))
  const byTabla = countBy(rows, r => (r.tabla || 'sin_tabla').replace(/^public\./, ''))
  const byDay = countBy(rows, r => dayKey(r.created_at)).sort((a, b) => a.label.localeCompare(b.label))

  const actionMap = Object.fromEntries(byAction.map(x => [x.label, x.value]))
  const daysActive = byDay.filter(d => d.value > 0).length
  const peakDay = byDay.reduce<{ label: string; value: number } | null>(
    (best, cur) => (!best || cur.value > best.value ? cur : best),
    null,
  )
  const topModule = byTabla[0] ?? null
  const avgPerActiveDay = daysActive > 0 ? rows.length / daysActive : 0

  const byWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const r of rows) {
    const dk = dayKey(r.created_at)
    const [y, m, d] = dk.split('-').map(Number)
    if (!y || !m || !d) continue
    byWeekday[new Date(y, m - 1, d).getDay()] += 1
  }

  return {
    byAction,
    byTabla,
    byDay,
    byWeekday,
    actionMap,
    daysActive,
    peakDay,
    topModule,
    avgPerActiveDay,
    total: rows.length,
  }
}

function renderDonutDataUrl(
  slices: { label: string; value: number; color: Rgb }[],
  centerTitle: string,
  centerSub: string,
  sizePx = 560,
): string | null {
  if (typeof document === 'undefined') return null
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = sizePx
  canvas.height = sizePx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const cx = sizePx / 2
  const cy = sizePx / 2
  const r = sizePx * 0.38
  let angle = -Math.PI / 2

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
    ctx.lineWidth = 3
    ctx.stroke()
    angle += sweep
  }

  ctx.beginPath()
  ctx.fillStyle = '#ffffff'
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#0f766e'
  ctx.font = 'bold 42px Calibri, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(centerTitle, cx, cy - 14)
  ctx.font = '24px Calibri, Arial, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText(centerSub, cx, cy + 18)

  return canvas.toDataURL('image/png')
}

function renderBarChartDataUrl(
  bars: { label: string; value: number; color?: Rgb }[],
  opts?: { width?: number; height?: number; horizontal?: boolean },
): string | null {
  if (typeof document === 'undefined' || !bars.length) return null
  const width = opts?.width ?? 920
  const height = opts?.height ?? 420
  const horizontal = opts?.horizontal ?? true
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const max = Math.max(...bars.map(b => b.value), 1)
  const padL = 140
  const padR = 24
  const padT = 20
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const gy = padT + (plotH * i) / 4
    ctx.beginPath()
    ctx.moveTo(padL, gy)
    ctx.lineTo(padL + plotW, gy)
    ctx.stroke()
  }

  if (!horizontal) return null

  const rowH = plotH / bars.length
  bars.forEach((b, i) => {
    const barH = Math.max(10, rowH * 0.55)
    const y = padT + i * rowH + (rowH - barH) / 2
    const w = (b.value / max) * plotW
    const color = b.color ?? PALETTE[i % PALETTE.length]
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    roundRect(ctx, padL, y, Math.max(w, 2), barH, 6)
    ctx.fill()
    ctx.fillStyle = '#334155'
    ctx.font = '20px Calibri, Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const label = b.label.length > 18 ? `${b.label.slice(0, 17)}…` : b.label
    ctx.fillText(label, padL - 10, y + barH / 2)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#0f766e'
    ctx.font = 'bold 18px Calibri, Arial, sans-serif'
    ctx.fillText(String(b.value), padL + w + 8, y + barH / 2)
  })

  return canvas.toDataURL('image/png')
}

/** Área + línea suave para la actividad diaria (más limpia que barras con labels rotados). */
function renderTimelineAreaDataUrl(
  points: { date: string; value: number }[],
  width = 1400,
  height = 380,
): string | null {
  if (typeof document === 'undefined' || !points.length) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const padL = 48
  const padR = 28
  const padT = 36
  const padB = 52
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const max = Math.max(...points.map(p => p.value), 1)
  const n = points.length

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  // card background
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 8, 8, width - 16, height - 16, 18)
  ctx.fill()

  const xAt = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (v: number) => padT + plotH - (v / max) * plotH

  // horizontal grid + Y labels
  ctx.font = '18px Calibri, Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * (4 - i)) / 4)
    const gy = padT + (plotH * i) / 4
    ctx.strokeStyle = '#eef2f7'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(padL, gy)
    ctx.lineTo(padL + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(String(v), padL - 10, gy)
  }

  // baseline
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(padL, padT + plotH)
  ctx.lineTo(padL + plotW, padT + plotH)
  ctx.stroke()

  // smooth-ish path through points (catmull-rom-ish via quadratic midpoints)
  const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }))

  const area = new Path2D()
  area.moveTo(pts[0].x, padT + plotH)
  area.lineTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2
    const midY = (pts[i].y + pts[i + 1].y) / 2
    area.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
  }
  const last = pts[pts.length - 1]
  area.lineTo(last.x, last.y)
  area.lineTo(last.x, padT + plotH)
  area.closePath()

  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH)
  grad.addColorStop(0, 'rgba(20, 184, 166, 0.35)')
  grad.addColorStop(1, 'rgba(20, 184, 166, 0.02)')
  ctx.fillStyle = grad
  ctx.fill(area)

  // stroke line
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2
    const midY = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
  }
  ctx.lineTo(last.x, last.y)
  ctx.strokeStyle = '#0f766e'
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // peak marker
  let peakIdx = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > points[peakIdx].value) peakIdx = i
  }

  points.forEach((p, i) => {
    const x = pts[i].x
    const y = pts[i].y
    const isPeak = i === peakIdx && p.value > 0
    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.arc(x, y, isPeak ? 7 : 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = isPeak ? '#f59e0b' : '#0f766e'
    ctx.lineWidth = isPeak ? 3 : 2.5
    ctx.stroke()

    if (isPeak) {
      ctx.fillStyle = '#b45309'
      ctx.font = 'bold 18px Calibri, Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${p.value}`, x, y - 12)
    }
  })

  // X labels — sparse, never rotated
  const labelEvery = n <= 8 ? 1 : n <= 14 ? 2 : Math.ceil(n / 8)
  ctx.font = '17px Calibri, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  points.forEach((p, i) => {
    const show =
      i === 0 || i === n - 1 || i === peakIdx || i % labelEvery === 0
    if (!show) return
    ctx.fillStyle = i === peakIdx ? '#b45309' : '#64748b'
    ctx.fillText(shortDate(p.date), pts[i].x, padT + plotH + 10)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px Calibri, Arial, sans-serif'
    ctx.fillText(weekdayLabel(p.date), pts[i].x, padT + plotH + 28)
    ctx.font = '17px Calibri, Arial, sans-serif'
  })

  return canvas.toDataURL('image/png')
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawKpiCards(
  doc: jsPDF,
  y: number,
  pageW: number,
  cards: { label: string; value: string; accent: Rgb }[],
): number {
  const gap = 3.5
  const n = cards.length
  const usable = pageW - PDF_MARGIN_MM * 2
  const cardW = (usable - gap * (n - 1)) / n
  const cardH = 18

  cards.forEach((card, i) => {
    const x = PDF_MARGIN_MM + i * (cardW + gap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
    doc.setFillColor(...card.accent)
    doc.roundedRect(x, y, 1.4, cardH, 0.4, 0.4, 'F')

    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...MUTED)
    doc.text(card.label, x + 4, y + 5.5)

    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...SLATE)
    doc.text(card.value, x + 4, y + 13)
  })

  return y + cardH + 6
}

function drawLegend(
  doc: jsPDF,
  x: number,
  y: number,
  maxW: number,
  slices: { label: string; value: number; color: Rgb }[],
): number {
  const total = slices.reduce((s, v) => s + v.value, 0) || 1
  let ly = y
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(7)
  for (const slice of slices) {
    doc.setFillColor(...slice.color)
    doc.roundedRect(x, ly - 1.6, 2.8, 2.8, 0.5, 0.5, 'F')
    doc.setTextColor(...SLATE)
    const pct = ((slice.value / total) * 100).toFixed(0)
    const text = `${slice.label}: ${slice.value} (${pct}%)`
    const lines = doc.splitTextToSize(text, maxW - 5) as string[]
    doc.text(lines, x + 4.5, ly)
    ly += Math.max(4.2, lines.length * 3.2)
  }
  return ly
}

function topNWithOtros(
  rows: { label: string; value: number }[],
  max: number,
  colorFn: (label: string, i: number) => Rgb,
): { label: string; value: number; color: Rgb }[] {
  if (rows.length <= max) {
    return rows.map((r, i) => ({ ...r, color: colorFn(r.label, i) }))
  }
  const top = rows.slice(0, max - 1)
  const rest = rows.slice(max - 1)
  const otros = rest.reduce((s, r) => s + r.value, 0)
  return [
    ...top.map((r, i) => ({ ...r, color: colorFn(r.label, i) })),
    { label: `Otros (${rest.length})`, value: otros, color: [148, 163, 184] },
  ]
}

export async function exportMisActividadesPdf(
  rows: AuditoriaRow[],
  meta: MisActividadesPdfMeta,
): Promise<void> {
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop
  const summary = buildSummary(rows)

  // ── Portada / resumen ─────────────────────────────────────────────
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...BRAND)
  doc.text('Informe de mis actividades', pageW / 2, y, { align: 'center' })
  y += 6

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const usuario = meta.usuarioNombre || meta.usuarioEmail || 'Usuario'
  doc.text(
    `${usuario}${meta.usuarioEmail && meta.usuarioNombre ? ` · ${meta.usuarioEmail}` : ''}`,
    pageW / 2,
    y,
    { align: 'center' },
  )
  y += 4
  doc.text(
    `Periodo ${fmtDate(meta.desde)} — ${fmtDate(meta.hasta)}${meta.accionLabel ? ` · Filtro: ${meta.accionLabel}` : ''}`,
    pageW / 2,
    y,
    { align: 'center' },
  )
  y += 7

  y = drawKpiCards(doc, y, pageW, [
    { label: 'Eventos', value: String(summary.total), accent: BRAND },
    { label: 'Altas (INSERT)', value: String(summary.actionMap.INSERT ?? 0), accent: ACTION_COLORS.INSERT },
    { label: 'Cambios (UPDATE)', value: String(summary.actionMap.UPDATE ?? 0), accent: ACTION_COLORS.UPDATE },
    { label: 'Bajas (DELETE)', value: String(summary.actionMap.DELETE ?? 0), accent: ACTION_COLORS.DELETE },
    { label: 'Días activos', value: String(summary.daysActive), accent: [124, 92, 252] },
    {
      label: 'Prom. / día activo',
      value: summary.avgPerActiveDay.toFixed(1),
      accent: [14, 165, 233],
    },
  ])

  // Insights
  const insights: string[] = []
  if (summary.peakDay) {
    insights.push(
      `Día más activo: ${fmtDate(summary.peakDay.label)} (${summary.peakDay.value} eventos)`,
    )
  }
  if (summary.topModule) {
    insights.push(
      `Módulo más usado: ${summary.topModule.label} (${summary.topModule.value} eventos)`,
    )
  }
  if (summary.byAction[0]) {
    insights.push(
      `Acción predominante: ${summary.byAction[0].label} (${summary.byAction[0].value})`,
    )
  }
  if (insights.length) {
    y = pdfEnsureSpace(doc, y, 14, layout)
    doc.setFillColor(240, 253, 250)
    doc.setDrawColor(153, 246, 228)
    const boxH = 4 + insights.length * 4
    doc.roundedRect(PDF_MARGIN_MM, y - 2, pageW - PDF_MARGIN_MM * 2, boxH, 2, 2, 'FD')
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND)
    doc.text('Destacados', PDF_MARGIN_MM + 3, y + 2)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...SLATE)
    insights.forEach((line, i) => {
      doc.text(`• ${line}`, PDF_MARGIN_MM + 3, y + 6.5 + i * 4)
    })
    y += boxH + 5
  }

  if (!rows.length) {
    y = pdfBodyText(doc, layout, y, ['No hay actividades para el filtro seleccionado.'], 9)
    const stamp = new Date().toISOString().slice(0, 10)
    pdfFinishAndSave(doc, layout, `Mis_actividades_${stamp}`)
    return
  }

  // ── Gráficos ──────────────────────────────────────────────────────
  y = pdfSectionHeading(doc, layout, y, 'Resumen visual')
  const chartTop = y
  const colGap = 8
  const leftW = (pageW - PDF_MARGIN_MM * 2 - colGap) * 0.42
  const rightW = (pageW - PDF_MARGIN_MM * 2 - colGap) * 0.58
  const leftX = PDF_MARGIN_MM
  const rightX = PDF_MARGIN_MM + leftW + colGap

  // Donut por acción
  const actionSlices = topNWithOtros(
    summary.byAction,
    6,
    (label, i) => ACTION_COLORS[label] ?? PALETTE[i % PALETTE.length],
  )
  const donut = renderDonutDataUrl(actionSlices, String(summary.total), 'eventos')
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND)
  doc.text('Por tipo de acción', leftX, chartTop)

  let leftBottom = chartTop + 4
  if (donut) {
    const donutSize = 48
    doc.addImage(donut, 'PNG', leftX, leftBottom, donutSize, donutSize)
    leftBottom = drawLegend(doc, leftX + donutSize + 3, leftBottom + 4, leftW - donutSize - 4, actionSlices)
    leftBottom = Math.max(leftBottom, chartTop + 4 + donutSize) + 2
  }

  // Barras horizontales por módulo
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND)
  doc.text('Por módulo / tabla', rightX, chartTop)

  const moduleBars = topNWithOtros(summary.byTabla, 8, (_l, i) => PALETTE[i % PALETTE.length])
  const barsUrl = renderBarChartDataUrl(moduleBars, {
    width: 900,
    height: 420,
    horizontal: true,
  })
  let rightBottom = chartTop + 4
  if (barsUrl) {
    const barH = 50
    const barW = rightW
    doc.addImage(barsUrl, 'PNG', rightX, rightBottom, barW, barH)
    rightBottom += barH + 2
  }

  y = Math.max(leftBottom, rightBottom) + 4

  // Actividad diaria — área + línea (sin labels rotados)
  y = pdfEnsureSpace(doc, y, 58, layout)
  y = pdfSectionHeading(doc, layout, y, 'Actividad en el tiempo')

  const daySeries =
    summary.byDay.length > 21 ? summary.byDay.slice(-21) : summary.byDay
  const timelineUrl = renderTimelineAreaDataUrl(
    daySeries.map(d => ({ date: d.label, value: d.value })),
    1400,
    400,
  )
  if (timelineUrl) {
    const tw = pageW - PDF_MARGIN_MM * 2
    const th = 46
    doc.addImage(timelineUrl, 'PNG', PDF_MARGIN_MM, y, tw, th)
    y += th + 3
    if (summary.peakDay) {
      doc.setFont(PDF_TABLE_FONT, 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text(
        `Pico: ${fmtDate(summary.peakDay.label)} · ${summary.peakDay.value} evento${summary.peakDay.value === 1 ? '' : 's'}`,
        PDF_MARGIN_MM,
        y,
      )
      y += 5
    }
  }

  // Distribución por día de la semana
  y = pdfEnsureSpace(doc, y, 36, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND)
  doc.text('Distribución por día de la semana', PDF_MARGIN_MM, y)
  y += 4

  const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const wdMax = Math.max(...summary.byWeekday, 1)
  const wdUsable = pageW - PDF_MARGIN_MM * 2
  const wdGap = 3
  const wdW = (wdUsable - wdGap * 6) / 7
  const wdH = 22
  weekdayLabels.forEach((label, i) => {
    const x = PDF_MARGIN_MM + i * (wdW + wdGap)
    const value = summary.byWeekday[i]
    const barH = (value / wdMax) * 12
    doc.setFillColor(240, 253, 250)
    doc.roundedRect(x, y, wdW, wdH, 1.5, 1.5, 'F')
    doc.setFillColor(...BRAND)
    doc.roundedRect(x + 2, y + 12 - barH + 2, wdW - 4, Math.max(barH, 0.8), 0.8, 0.8, 'F')
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...SLATE)
    doc.text(label, x + wdW / 2, y + 4.5, { align: 'center' })
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...MUTED)
    doc.text(String(value), x + wdW / 2, y + wdH - 2, { align: 'center' })
  })

  // ── Detalle ───────────────────────────────────────────────────────
  pdfAddPage(doc)
  y = layout.contentTop
  y = pdfSectionHeading(doc, layout, y, 'Detalle de actividades')
  y = pdfBodyText(
    doc,
    layout,
    y,
    [`${rows.length} registro${rows.length === 1 ? '' : 's'} en el periodo seleccionado.`],
    8,
  )

  const body = rows.map(r => [
    fmtDateTime(r.created_at),
    r.tabla || '—',
    labelAccion(r.accion),
    (r.resumen || '—').replace(/\s+/g, ' ').trim(),
    r.ip_address || '—',
  ])

  const usableW = pageW - PDF_MARGIN_MM * 2
  drawPdfTable(
    doc,
    layout,
    y,
    [['Fecha y hora', 'Tabla', 'Acción', 'Descripción', 'IP']],
    body,
    undefined,
    {
      0: { cellWidth: usableW * 0.18 },
      1: { cellWidth: usableW * 0.16 },
      2: { cellWidth: usableW * 0.1 },
      3: { cellWidth: usableW * 0.42 },
      4: { cellWidth: usableW * 0.14 },
    },
    { fontSize: 7, gapAfter: 4 },
  )

  const stamp = new Date().toISOString().slice(0, 10)
  pdfFinishAndSave(doc, layout, `Mis_actividades_${stamp}`)
}
