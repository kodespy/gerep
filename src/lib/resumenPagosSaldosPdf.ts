import type jsPDF from 'jspdf'
import { supabase } from './supabase'
import { fmtDatePdf, fmtMoneyPdf, txtPdf, nowDateInputValue } from './format'
import { ajusteAdenda } from './planVigente'
import {
  calcAvanceDesembolso,
  calcSaldoDisponible,
  calcStrNeto,
} from './proyectoSaldos'
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

export const BRAND: [number, number, number] = [47, 28, 106]
export const HEAD: [number, number, number] = [46, 117, 182]
const COLOR_PAGADO: [number, number, number] = [16, 185, 129]
const COLOR_SALDO: [number, number, number] = [100, 116, 139]

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function sumKey(rows: any[] | null | undefined, key: string): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

function catalogLabel(codigo?: string | null, descripcion?: string | null): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `${c} — ${d}`
  return c || d || '—'
}

/** Anchos que suman exactamente el área útil (margen máximo). */
export function cols(pageW: number, specs: Array<{ w: number; halign?: 'left' | 'right' | 'center' }>) {
  const usable = pageW - PDF_MARGIN_MM * 2
  const sum = specs.reduce((s, c) => s + c.w, 0)
  const scale = sum > 0 ? usable / sum : 1
  const out: Record<number, { cellWidth: number; halign?: 'left' | 'right' | 'center' }> = {}
  specs.forEach((c, i) => {
    out[i] = {
      cellWidth: Math.round(c.w * scale * 100) / 100,
      ...(c.halign ? { halign: c.halign } : {}),
    }
  })
  const used = Object.values(out).reduce((s, c) => s + c.cellWidth, 0)
  const last = specs.length - 1
  out[last].cellWidth = Math.round((out[last].cellWidth + (usable - used)) * 100) / 100
  return out
}

type ProyectoFin = {
  id: string
  descripcion: string
  actividad: string
  programa: string
  componente: string
  planBase: number
  adendas: number
  planVigente: number
  strBruto: number
  devoluciones: number
  strNeto: number
  saldo: number
  avancePct: number
  strs: {
    numero: string
    fecha: string
    nroResolucion: string
    fechaResolucion: string
    nroActa: string
    fechaActa: string
    monto: number
    og: string
    fuente: string
  }[]
}

async function loadProyectoFin(proyectoId: string): Promise<ProyectoFin | null> {
  const [proy, planes, adendas, strs, devs] = await Promise.all([
    supabase
      .from('proyectos')
      .select(
        'id, descripcion, monto, componente:componentes_programa(codigo, descripcion, actividad:actividades(codigo, descripcion), programa:programas(codigo, descripcion))',
      )
      .eq('id', proyectoId)
      .maybeSingle(),
    supabase.from('planes_financieros').select('monto').eq('proyecto_id', proyectoId),
    supabase
      .from('adendas')
      .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)')
      .eq('plan.proyecto_id', proyectoId),
    supabase
      .from('strs')
      .select(
        'numero, fecha, nro_resolucion, fecha_resolucion, monto, og:objetos_de_gastos(codigo, descripcion), fuente:fuentes_financiamiento(descripcion, detalle), resolucion:resolutions(numero, fecha), acta:actas(numero, fecha)',
      )
      .eq('proyecto_id', proyectoId)
      .order('fecha', { ascending: true }),
    supabase
      .from('devoluciones')
      .select('monto, str:strs!inner(proyecto_id)')
      .eq('str.proyecto_id', proyectoId),
  ])

  if (!proy.data) return null

  const comp = nest(proy.data.componente)
  const planBase = sumKey(planes.data, 'monto') || Number(proy.data.monto) || 0
  const adendaTotal = (adendas.data ?? []).reduce((s, a) => s + ajusteAdenda(a as any), 0)
  const planVigente = planBase + adendaTotal
  const strBruto = sumKey(strs.data, 'monto')
  const devoluciones = sumKey(devs.data, 'monto')
  const strNeto = calcStrNeto(strBruto, devoluciones)
  const saldo = calcSaldoDisponible(planVigente, strBruto, devoluciones)

  return {
    id: String(proy.data.id),
    descripcion: String(proy.data.descripcion ?? '—'),
    actividad: catalogLabel(comp?.actividad?.codigo, comp?.actividad?.descripcion),
    programa: catalogLabel(comp?.programa?.codigo, comp?.programa?.descripcion),
    componente: catalogLabel(comp?.codigo, comp?.descripcion),
    planBase,
    adendas: adendaTotal,
    planVigente,
    strBruto,
    devoluciones,
    strNeto,
    saldo,
    avancePct: calcAvanceDesembolso(planVigente, strNeto),
    strs: (strs.data ?? []).map((s: any) => {
      const res = nest(s.resolucion)
      const acta = nest(s.acta)
      return {
        numero: String(s.numero ?? '—'),
        fecha: String(s.fecha ?? '').slice(0, 10),
        nroResolucion: String(res?.numero ?? s.nro_resolucion ?? '').trim() || '—',
        fechaResolucion: String(res?.fecha ?? s.fecha_resolucion ?? '').slice(0, 10),
        nroActa: String(acta?.numero ?? '').trim() || '—',
        fechaActa: String(acta?.fecha ?? '').slice(0, 10),
        monto: Number(s.monto) || 0,
        og: catalogLabel(nest(s.og)?.codigo, nest(s.og)?.descripcion),
        fuente: (nest(s.fuente)?.descripcion ?? '').trim() || '—',
      }
    }),
  }
}

function renderPlanVsPagadoPie(
  planVigente: number,
  strNeto: number,
  sizePx = 560,
): string | null {
  if (typeof document === 'undefined') return null
  const pagado = Math.max(0, strNeto)
  const saldo = Math.max(0, planVigente - pagado)
  const total = pagado + saldo
  if (total <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = sizePx
  canvas.height = sizePx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const cx = sizePx / 2
  const cy = sizePx / 2
  const r = sizePx * 0.38
  const slices = [
    { value: pagado, color: COLOR_PAGADO },
    { value: saldo, color: COLOR_SALDO },
  ]

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sizePx, sizePx)

  let angle = -Math.PI / 2
  for (const slice of slices) {
    if (slice.value <= 0) continue
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
  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
  ctx.fill()

  const pct = planVigente > 0 ? Math.round((pagado / planVigente) * 100) : 0
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 42px Calibri, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${pct}%`, cx, cy - 12)
  ctx.font = '22px Calibri, Arial, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('ejecutado', cx, cy + 22)

  return canvas.toDataURL('image/png')
}

export function sectionTitle(doc: jsPDF, layout: PdfLayout, y: number, title: string): number {
  y = pdfEnsureSpace(doc, y, 12, layout)
  doc.setFillColor(...BRAND)
  doc.rect(PDF_MARGIN_MM, y, pdfPageWidth(doc) - PDF_MARGIN_MM * 2, 7, 'F')
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(title, PDF_MARGIN_MM + 2.5, y + 4.7)
  doc.setTextColor(0, 0, 0)
  return y + 11
}

export function drawKpiRow(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  pageW: number,
  items: { label: string; value: string }[],
): number {
  const usable = pageW - PDF_MARGIN_MM * 2
  const gap = 3
  const w = (usable - gap * (items.length - 1)) / items.length
  y = pdfEnsureSpace(doc, y, 18, layout)
  items.forEach((it, i) => {
    const x = PDF_MARGIN_MM + i * (w + gap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, w, 16, 1.5, 1.5, 'FD')
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(100, 116, 139)
    doc.text(it.label, x + 2.5, y + 5)
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(15, 23, 42)
    const lines = doc.splitTextToSize(it.value, w - 5) as string[]
    doc.text(lines[0] ?? it.value, x + 2.5, y + 11)
  })
  doc.setTextColor(0, 0, 0)
  return y + 20
}

function drawPieBlock(
  doc: jsPDF,
  layout: PdfLayout,
  y: number,
  pageW: number,
  planVigente: number,
  strNeto: number,
): number {
  y = sectionTitle(doc, layout, y, 'TOTAL PROYECTO VS PAGADOS')
  y = pdfEnsureSpace(doc, y, 70, layout)

  const pagado = Math.max(0, strNeto)
  const saldo = Math.max(0, planVigente - pagado)
  const pctPagado = planVigente > 0 ? (pagado / planVigente) * 100 : 0
  const pctSaldo = planVigente > 0 ? (saldo / planVigente) * 100 : 0

  const dataUrl = renderPlanVsPagadoPie(planVigente, strNeto)
  const chartSize = 58
  const xChart = PDF_MARGIN_MM + 4
  if (dataUrl) {
    doc.addImage(dataUrl, 'PNG', xChart, y, chartSize, chartSize)
  }

  const lx = xChart + chartSize + 10
  const legend: { color: [number, number, number]; label: string; monto: number; pct: number }[] = [
    { color: COLOR_PAGADO, label: 'Pagado (STR neto)', monto: pagado, pct: pctPagado },
    { color: COLOR_SALDO, label: 'Saldo disponible', monto: saldo, pct: pctSaldo },
  ]

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND)
  doc.text('Composición del plan vigente', lx, y + 6)
  doc.setTextColor(0, 0, 0)

  let ly = y + 14
  for (const item of legend) {
    doc.setFillColor(...item.color)
    doc.roundedRect(lx, ly - 2.5, 4, 4, 0.6, 0.6, 'F')
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42)
    doc.text(item.label, lx + 7, ly)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(51, 65, 85)
    doc.text(
      `${fmtMoneyPdf(item.monto)}  ·  ${item.pct.toFixed(1)}%`,
      lx + 7,
      ly + 5,
    )
    ly += 14
  }

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND)
  doc.text(`Plan vigente: ${fmtMoneyPdf(planVigente)}`, lx, ly + 2)
  doc.setTextColor(0, 0, 0)

  return Math.max(y + chartSize, ly + 8) + 6
}

async function drawProyectoResumen(
  doc: jsPDF,
  layout: PdfLayout,
  pageW: number,
  y: number,
  fin: ProyectoFin,
): Promise<number> {
  y = sectionTitle(doc, layout, y, 'DATOS DEL PROYECTO')
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  const nameLines = doc.splitTextToSize(txtPdf(fin.descripcion), pageW - PDF_MARGIN_MM * 2) as string[]
  y = pdfEnsureSpace(doc, y, nameLines.length * 5 + 2, layout)
  doc.text(nameLines, PDF_MARGIN_MM, y)
  y += nameLines.length * 4.5 + 3

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  for (const line of [
    `Actividad: ${txtPdf(fin.actividad)}`,
    `Programa: ${txtPdf(fin.programa)}`,
    `Componente: ${txtPdf(fin.componente)}`,
  ]) {
    y = pdfEnsureSpace(doc, y, 5, layout)
    doc.text(line, PDF_MARGIN_MM, y)
    y += 4
  }
  doc.setTextColor(0, 0, 0)
  y += 3

  y = sectionTitle(doc, layout, y, 'RESUMEN DE SALDOS')
  y = drawKpiRow(doc, layout, y, pageW, [
    { label: 'Plan base', value: fmtMoneyPdf(fin.planBase) },
    { label: 'Adendas', value: fmtMoneyPdf(fin.adendas) },
    { label: 'Plan vigente', value: fmtMoneyPdf(fin.planVigente) },
    { label: 'Avance', value: `${fin.avancePct}%` },
  ])
  y = drawKpiRow(doc, layout, y, pageW, [
    { label: 'STR bruto', value: fmtMoneyPdf(fin.strBruto) },
    { label: 'Devoluciones', value: fmtMoneyPdf(fin.devoluciones) },
    { label: 'STR neto (pagado)', value: fmtMoneyPdf(fin.strNeto) },
    { label: 'Saldo disponible', value: fmtMoneyPdf(fin.saldo) },
  ])

  y = drawPieBlock(doc, layout, y, pageW, fin.planVigente, fin.strNeto)

  y = sectionTitle(doc, layout, y, 'PAGOS REALIZADOS (STR)')
  const body: PdfTableCell[][] = fin.strs.map(s => [
    txtPdf(s.numero),
    fmtDatePdf(s.fecha) || '—',
    txtPdf(s.nroResolucion),
    s.fechaResolucion ? fmtDatePdf(s.fechaResolucion) : '—',
    txtPdf(s.nroActa),
    s.fechaActa ? fmtDatePdf(s.fechaActa) : '—',
    txtPdf(s.og),
    txtPdf(s.fuente),
    fmtMoneyPdf(s.monto),
  ])
  if (!body.length) {
    body.push(['Sin pagos STR registrados', '', '', '', '', '', '', '', ''])
  }

  y = drawPdfTable(
    doc,
    layout,
    y,
    [['N° STR', 'Fecha', 'N° Resolución', 'Fecha Resolución', 'N° Acta', 'Fecha de Acta', 'OG', 'Fuente', 'Monto']],
    body,
    [[
      { content: `TOTAL (${fin.strs.length})`, styles: { fontStyle: 'bold' } },
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      { content: fmtMoneyPdf(fin.strBruto), styles: { fontStyle: 'bold', halign: 'right' } },
    ]],
    cols(pageW, [
      { w: 18 },
      { w: 16 },
      { w: 20 },
      { w: 18 },
      { w: 18 },
      { w: 18 },
      { w: 28 },
      { w: 24 },
      { w: 24, halign: 'right' },
    ]),
    {
      fontSize: 6.2,
      headFontSize: 6.5,
      headFill: HEAD,
      headText: [255, 255, 255],
      gapAfter: 6,
      marginMm: PDF_MARGIN_MM,
      showFoot: 'lastPage',
    },
  )

  return y
}

/** PDF resumen de pagos y saldos de un proyecto (con torta plan vs pagado). */
export async function exportResumenPagosSaldosPdf(proyectoId: string): Promise<void> {
  const fin = await loadProyectoFin(proyectoId)
  if (!fin) throw new Error('No se pudo cargar el proyecto.')

  const doc = createPdfDoc({ orientation: 'portrait' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('RESUMEN DE PAGOS Y SALDOS', pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(`Generado: ${fmtDatePdf(nowDateInputValue())}`, pageW / 2, y, { align: 'center' })
  y += 8
  doc.setTextColor(0, 0, 0)

  await drawProyectoResumen(doc, layout, pageW, y, fin)
  pdfFinishAndSave(doc, layout, `Resumen_pagos_saldos_${fin.id.slice(0, 8)}`)
}

/**
 * Resumen desde el listado STR filtrado.
 * Si hay un solo proyecto, genera el PDF de ese proyecto.
 * Si hay varios, genera un consolidado con torta global + tabla por proyecto.
 */
export async function exportResumenPagosSaldosFromStrRows(strRows: any[]): Promise<void> {
  const ids = [...new Set(
    strRows
      .map(r => String(r.proyecto_id || nest(r.proyecto)?.id || ''))
      .filter(Boolean),
  )]

  if (ids.length === 0) {
    throw new Error('No hay proyectos en el listado filtrado.')
  }

  if (ids.length === 1) {
    await exportResumenPagosSaldosPdf(ids[0])
    return
  }

  const fins = (await Promise.all(ids.map(id => loadProyectoFin(id)))).filter(
    (f): f is ProyectoFin => !!f,
  )
  if (!fins.length) throw new Error('No se pudieron cargar los proyectos.')

  const planTotal = fins.reduce((s, f) => s + f.planVigente, 0)
  const pagadoTotal = fins.reduce((s, f) => s + f.strNeto, 0)
  const saldoTotal = fins.reduce((s, f) => s + f.saldo, 0)
  const strBrutoTotal = fins.reduce((s, f) => s + f.strBruto, 0)
  const devolTotal = fins.reduce((s, f) => s + f.devoluciones, 0)

  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('RESUMEN DE PAGOS Y SALDOS · CONSOLIDADO', pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(
    `${fins.length} proyectos · Generado: ${fmtDatePdf(nowDateInputValue())}`,
    pageW / 2,
    y,
    { align: 'center' },
  )
  y += 8
  doc.setTextColor(0, 0, 0)

  y = sectionTitle(doc, layout, y, 'TOTALES CONSOLIDADOS')
  y = drawKpiRow(doc, layout, y, pageW, [
    { label: 'Plan vigente', value: fmtMoneyPdf(planTotal) },
    { label: 'STR bruto', value: fmtMoneyPdf(strBrutoTotal) },
    { label: 'Devoluciones', value: fmtMoneyPdf(devolTotal) },
    { label: 'STR neto', value: fmtMoneyPdf(pagadoTotal) },
    { label: 'Saldo', value: fmtMoneyPdf(saldoTotal) },
  ])

  y = drawPieBlock(doc, layout, y, pageW, planTotal, pagadoTotal)

  y = sectionTitle(doc, layout, y, 'SALDOS POR PROYECTO')
  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Proyecto', 'Plan vigente', 'STR neto', 'Saldo', 'Avance']],
    fins.map(f => [
      txtPdf(f.descripcion),
      fmtMoneyPdf(f.planVigente),
      fmtMoneyPdf(f.strNeto),
      fmtMoneyPdf(f.saldo),
      `${f.avancePct}%`,
    ]),
    [[
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: fmtMoneyPdf(planTotal), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: fmtMoneyPdf(pagadoTotal), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: fmtMoneyPdf(saldoTotal), styles: { fontStyle: 'bold', halign: 'right' } },
      '',
    ]],
    cols(pageW, [
      { w: 110 },
      { w: 40, halign: 'right' },
      { w: 40,halign: 'right' },
      { w: 40,halign: 'right' },
      { w: 28,halign: 'right' },
    ]),
    {
      fontSize: 7,
      headFontSize: 7.5,
      headFill: HEAD,
      headText: [255, 255, 255],
      gapAfter: 6,
      marginMm: PDF_MARGIN_MM,
      showFoot: 'lastPage',
    },
  )

  pdfFinishAndSave(doc, layout, 'Resumen_pagos_saldos_consolidado')
}
