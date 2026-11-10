import type jsPDF from 'jspdf'
import { asGs, fmtDatePdf, fmtMoneyPdf, nowDateInputValue, txtPdf } from './format'
import {
  createPdfDoc,
  PDF_MARGIN_MM,
  pdfAddPage,
  pdfEnsureSpace,
  pdfFinishAndSave,
  pdfPageWidth,
  preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, type PdfTableCell } from './pdfTable'
import { supabase } from './supabase'
import { supabaseFetchAll } from './supabaseFetchAll'
import {
  netModificacionesPlanAdmin,
  presupuestoComprometidoPlanAdmin,
  presupuestoInicialPlanAdmin,
  presupuestoVigentePlanAdminRow,
} from './planAdminFinanciero'
import { cdpEstaAnulado, cdpMontoVigente } from './cdpUtils'

const HEAD_BLUE: [number, number, number] = [46, 117, 182]
const FOOT_GREEN: [number, number, number] = [84, 180, 81]
const WHITE: [number, number, number] = [255, 255, 255]
const BRAND: [number, number, number] = [47, 28, 106]
const TEAL: [number, number, number] = [13, 148, 136]
const SLATE: [number, number, number] = [148, 163, 184]
const MARGIN = PDF_MARGIN_MM

type PlanRow = Record<string, any>
type CdpRow = {
  id: string
  plan_administrativo_id: string | null
  cdp_numero: string | null
  cdp_date: string | null
  monto_comprometido: number | null
  estado: string | null
  descripcion: string | null
}

type Grupo = {
  key: string
  programa: string
  og: string
  fuente: string
  anio: string
  original: number
  modificaciones: number
  vigente: number
  comprometido: number
  disponible: number
  pct: number
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function programaLabel(row: PlanRow): string {
  const p = nest(row.programa)
  const desc = String(p?.descripcion ?? '').trim()
  const cod = String(p?.codigo ?? '').trim()
  return desc || cod || 'Sin programa'
}

function actividadLabel(row: PlanRow): string {
  const a = nest(row.actividad)
  const desc = String(a?.descripcion ?? '').trim()
  const cod = String(a?.codigo ?? '').trim()
  if (desc && cod) return `${cod} — ${desc}`
  return desc || cod || 'Sin actividad'
}

function ogCodigo(row: PlanRow): string {
  return String(nest(row.objeto)?.codigo ?? '').trim() || '—'
}

function fuenteLabel(row: PlanRow): string {
  const f = nest(row.fuente)
  const cod = String(f?.codigo ?? '').trim()
  const desc = String(f?.descripcion ?? '').trim()
  return cod || desc || '—'
}

function pctTxt(comprometido: number, vigente: number): string {
  if (vigente <= 0) return '0.00%'
  return `${((comprometido / vigente) * 100).toFixed(2)}%`
}

function moneyCell(n: number): string {
  return fmtMoneyPdf(n)
}

function footMoney(n: number): PdfTableCell {
  return {
    content: moneyCell(n),
    styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN },
  }
}

function donutPng(pctCommitted: number, size = 320): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42
  const inner = size * 0.26
  const start = -Math.PI / 2
  const committed = Math.max(0, Math.min(1, pctCommitted / 100))

  const ring = (from: number, to: number, color: string) => {
    ctx.beginPath()
    ctx.arc(cx, cy, r, from, to, false)
    ctx.arc(cx, cy, inner, to, from, true)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  ring(0, Math.PI * 2, '#cbd5e1')
  if (committed > 0) ring(start, start + committed * Math.PI * 2, '#0d9488')

  ctx.fillStyle = '#0f172a'
  ctx.font = `bold ${Math.round(size * 0.09)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${pctCommitted.toFixed(1)}%`, cx, cy)
  return canvas.toDataURL('image/png')
}

function buildGrupos(plans: PlanRow[]): Grupo[] {
  const map = new Map<string, Grupo>()
  for (const row of plans) {
    const programa = programaLabel(row)
    const programaId = String(row.programa_id ?? nest(row.programa)?.id ?? programa)
    const og = ogCodigo(row)
    const ogId = String(row.objeto_de_gasto_id ?? nest(row.objeto)?.id ?? og)
    const fuente = fuenteLabel(row)
    const fuenteId = String(row.fuente_financiamiento_id ?? nest(row.fuente)?.id ?? fuente)
    const anio = String(row.anio ?? '—')
    const key = `${programaId}|${ogId}|${fuenteId}|${anio}`
    const original = asGs(presupuestoInicialPlanAdmin(row))
    const modificaciones = asGs(netModificacionesPlanAdmin(row))
    const vigente = asGs(presupuestoVigentePlanAdminRow(row))
    const comprometido = asGs(presupuestoComprometidoPlanAdmin(row))
    const prev = map.get(key)
    if (!prev) {
      map.set(key, {
        key,
        programa,
        og,
        fuente,
        anio,
        original,
        modificaciones,
        vigente,
        comprometido,
        disponible: asGs(vigente - comprometido),
        pct: vigente > 0 ? (comprometido / vigente) * 100 : 0,
      })
      continue
    }
    prev.original = asGs(prev.original + original)
    prev.modificaciones = asGs(prev.modificaciones + modificaciones)
    prev.vigente = asGs(prev.vigente + vigente)
    prev.comprometido = asGs(prev.comprometido + comprometido)
    prev.disponible = asGs(prev.vigente - prev.comprometido)
    prev.pct = prev.vigente > 0 ? (prev.comprometido / prev.vigente) * 100 : 0
  }
  return [...map.values()].sort((a, b) => {
    const p = a.programa.localeCompare(b.programa, 'es')
    if (p) return p
    if (a.og !== b.og) return a.og.localeCompare(b.og, 'es', { numeric: true })
    if (a.fuente !== b.fuente) return a.fuente.localeCompare(b.fuente, 'es')
    return String(a.anio).localeCompare(String(b.anio))
  })
}

async function fetchCdps(planIds: string[]): Promise<CdpRow[]> {
  const all: CdpRow[] = []
  for (let i = 0; i < planIds.length; i += 80) {
    const chunk = planIds.slice(i, i + 80)
    const { data, error } = await supabaseFetchAll<CdpRow>(
      () => supabase
        .from('budget_commitments')
        .select('id, plan_administrativo_id, cdp_numero, cdp_date, monto_comprometido, estado, descripcion')
        .in('plan_administrativo_id', chunk),
    )
    if (error) throw new Error(error.message)
    all.push(...data)
  }
  return all.sort((a, b) => {
    const da = String(a.cdp_date ?? '')
    const db = String(b.cdp_date ?? '')
    if (da !== db) return db.localeCompare(da)
    return String(b.cdp_numero ?? '').localeCompare(String(a.cdp_numero ?? ''))
  })
}

function drawSectionTitle(doc: jsPDF, layout: PdfLayout, y: number, title: string): number {
  y = pdfEnsureSpace(doc, y, 10, layout)
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BRAND)
  doc.text(title, MARGIN, y)
  doc.setTextColor(0, 0, 0)
  return y + 5
}

function drawParagraph(doc: jsPDF, layout: PdfLayout, y: number, text: string, maxW: number): number {
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(40, 40, 40)
  const lines = doc.splitTextToSize(text, maxW) as string[]
  const lineH = 4.2
  for (const line of lines) {
    y = pdfEnsureSpace(doc, y, lineH + 1, layout)
    doc.text(line, MARGIN, y)
    y += lineH
  }
  doc.setTextColor(0, 0, 0)
  return y + 2
}

function drawTopCharts(doc: jsPDF, layout: PdfLayout, y: number, groups: Grupo[]): number {
  const contentW = pdfPageWidth(doc) - MARGIN * 2
  const gap = 10
  const colW = (contentW - gap) / 2
  const boxH = 70
  const imgSize = 40

  for (let i = 0; i < groups.length; i++) {
    const col = i % 2
    if (col === 0) y = pdfEnsureSpace(doc, y, boxH, layout)
    const x = MARGIN + col * (colW + gap)
    const g = groups[i]
    const png = donutPng(g.pct)
    if (png) doc.addImage(png, 'PNG', x + 2, y, imgSize, imgSize)

    doc.setFillColor(...TEAL)
    doc.rect(x + imgSize + 10, y + 12, 3.5, 3.5, 'F')
    doc.setFillColor(...SLATE)
    doc.rect(x + imgSize + 10, y + 20, 3.5, 3.5, 'F')
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(30, 30, 30)
    doc.text(`Comprometido  ${moneyCell(g.comprometido)}`, x + imgSize + 16, y + 15)
    doc.text(`Disponible    ${moneyCell(g.disponible)}`, x + imgSize + 16, y + 23)

    const capY = y + imgSize + 5
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND)
    const caption = (doc.splitTextToSize(txtPdf(g.programa), colW - 8) as string[]).slice(0, 2)
    doc.text(caption, x + 2, capY)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 70, 70)
    doc.text(`OG: ${g.og}    Fuente: ${g.fuente}`, x + 2, capY + caption.length * 3.6)
    doc.setTextColor(0, 0, 0)

    if (col === 1 || i === groups.length - 1) y += boxH
  }
  return y + 4
}

/** Informe consolidado del plan administrativo (resumen, gráficos Top 4 y detalle de CDPs). */
export async function exportPlanAdminConsolidadoPdf(planRows: PlanRow[]): Promise<void> {
  if (!planRows.length) throw new Error('No hay planes administrativos para exportar.')

  const planIds = planRows.map(r => String(r.id)).filter(Boolean)
  const cdps = await fetchCdps(planIds)
  const cdpsByPlan = new Map<string, CdpRow[]>()
  for (const c of cdps) {
    const pid = String(c.plan_administrativo_id ?? '')
    if (!pid) continue
    const list = cdpsByPlan.get(pid) ?? []
    list.push(c)
    cdpsByPlan.set(pid, list)
  }

  const grupos = buildGrupos(planRows)
  const totOriginal = grupos.reduce((s, g) => s + g.original, 0)
  const totMod = grupos.reduce((s, g) => s + g.modificaciones, 0)
  const totVig = grupos.reduce((s, g) => s + g.vigente, 0)
  const totComp = grupos.reduce((s, g) => s + g.comprometido, 0)
  const totDisp = asGs(totVig - totComp)
  const montoActivos = cdps.reduce((s, c) => s + cdpMontoVigente({
    monto_comprometido: Number(c.monto_comprometido) || 0,
    estado: c.estado,
  }), 0)

  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  const contentW = pageW - MARGIN * 2
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BRAND)
  doc.text('Reporte Consolidado de Planes Administrativos', pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(`Generado el: ${fmtDatePdf(nowDateInputValue())}`, pageW / 2, y, { align: 'center' })
  y += 8
  doc.setTextColor(0, 0, 0)

  y = drawSectionTitle(doc, layout, y, 'Resumen Ejecutivo del Reporte')
  y = drawParagraph(
    doc,
    layout,
    y,
    'El presente informe detalla la ejecución presupuestaria del plan financiero administrativo. '
    + 'Se presenta el porcentaje de compromiso (CDP vigentes) sobre el presupuesto planificado, '
    + 'desglosado por Programa, Objeto de Gasto y Fuente, con un gráfico de distribución de '
    + 'Compromiso vs Disponibilidad. Los CDPs anulados han sido excluidos de los cálculos de ejecución presupuestaria.',
    contentW,
  )

  y = drawSectionTitle(doc, layout, y, 'Resumen por Programas')
  const sumBody: PdfTableCell[][] = grupos.map(g => [
    txtPdf(g.programa),
    g.og,
    g.fuente,
    g.anio,
    moneyCell(g.original),
    moneyCell(g.modificaciones),
    moneyCell(g.vigente),
    moneyCell(g.comprometido),
    moneyCell(g.disponible),
    pctTxt(g.comprometido, g.vigente),
  ])
  const sumFoot: PdfTableCell[][] = [[
    { content: 'TOTALES', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
    footMoney(totOriginal),
    footMoney(totMod),
    footMoney(totVig),
    footMoney(totComp),
    footMoney(totDisp),
    {
      content: pctTxt(totComp, totVig),
      styles: { fontStyle: 'bold', halign: 'center', textColor: WHITE, fillColor: FOOT_GREEN },
    },
  ]]
  y = drawPdfTable(
    doc,
    layout,
    y,
    [[
      'Programa', 'OG', 'Fuente', 'Año',
      'Monto Original', 'Modificaciones', 'Presup. Vigente',
      'Comprometido', 'Disponible', '% Ejec.',
    ]],
    sumBody,
    sumFoot,
    {
      0: { cellWidth: contentW * 0.22 },
      1: { cellWidth: contentW * 0.06, halign: 'center' },
      2: { cellWidth: contentW * 0.08, halign: 'center' },
      3: { cellWidth: contentW * 0.05, halign: 'center' },
      4: { cellWidth: contentW * 0.11, halign: 'right' },
      5: { cellWidth: contentW * 0.11, halign: 'right' },
      6: { cellWidth: contentW * 0.11, halign: 'right' },
      7: { cellWidth: contentW * 0.11, halign: 'right' },
      8: { cellWidth: contentW * 0.10, halign: 'right' },
      9: { cellWidth: contentW * 0.05, halign: 'center' },
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
    },
  )

  pdfAddPage(doc)
  y = layout.contentTop
  y = drawSectionTitle(doc, layout, y, 'Distribución por Grupo (Programa + OG + Fuente) - Top 4')
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  y = pdfEnsureSpace(doc, y, 6, layout)
  doc.text('Comprometido (CDP vigentes) vs Disponible sobre el presupuesto vigente de cada grupo.', MARGIN, y)
  y += 8
  doc.setTextColor(0, 0, 0)
  const top = [...grupos]
    .sort((a, b) => b.comprometido - a.comprometido || b.vigente - a.vigente)
    .slice(0, 4)
  y = drawTopCharts(doc, layout, y, top)

  y = drawSectionTitle(doc, layout, y, 'Resumen Global de CDPs vinculados (Conteo)')
  const byPrograma = new Map<string, number>()
  for (const row of planRows) {
    const name = programaLabel(row)
    const monto = asGs(presupuestoComprometidoPlanAdmin(row))
    byPrograma.set(name, (byPrograma.get(name) ?? 0) + monto)
  }
  const globalBody: PdfTableCell[][] = [
    ['Total CDPs (Incl. Anulados)', String(cdps.length)],
    ['Monto Total Global (Activos)', moneyCell(montoActivos)],
  ]
  for (const [name, monto] of [...byPrograma.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    globalBody.push([`Programa: ${txtPdf(name)} (Activos)`, moneyCell(monto)])
  }
  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Concepto', 'Valor']],
    globalBody,
    undefined,
    {
      0: { cellWidth: contentW * 0.72 },
      1: { cellWidth: contentW * 0.28, halign: 'right' },
    },
    { fontSize: 8, headFontSize: 8, headFill: HEAD_BLUE, headText: WHITE, gapAfter: 8 },
  )

  const byProgAct = new Map<string, { programa: string; actividad: string; plans: PlanRow[] }>()
  for (const row of planRows) {
    const programa = programaLabel(row)
    const actividad = actividadLabel(row)
    const key = `${programa}||${actividad}`
    const prev = byProgAct.get(key)
    if (!prev) byProgAct.set(key, { programa, actividad, plans: [row] })
    else prev.plans.push(row)
  }
  const sections = [...byProgAct.values()].sort((a, b) => {
    const p = a.programa.localeCompare(b.programa, 'es')
    return p || a.actividad.localeCompare(b.actividad, 'es')
  })

  let lastPrograma = ''
  for (const sec of sections) {
    const secCdps = sec.plans.flatMap(p => cdpsByPlan.get(String(p.id)) ?? [])
    const activoSec = secCdps.reduce((s, c) => s + cdpMontoVigente({
      monto_comprometido: Number(c.monto_comprometido) || 0,
      estado: c.estado,
    }), 0)
    const activoProg = planRows
      .filter(p => programaLabel(p) === sec.programa)
      .reduce((s, p) => s + asGs(presupuestoComprometidoPlanAdmin(p)), 0)

    if (sec.programa !== lastPrograma) {
      lastPrograma = sec.programa
      y = pdfEnsureSpace(doc, y, 16, layout)
      doc.setFont(PDF_TABLE_FONT, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BRAND)
      const headLines = doc.splitTextToSize(
        `Programa: ${txtPdf(sec.programa)}    Total Activo: ${moneyCell(activoProg)}`,
        contentW,
      ) as string[]
      doc.text(headLines, MARGIN, y)
      y += headLines.length * 4.5 + 2
    }

    y = pdfEnsureSpace(doc, y, 10, layout)
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    const actLines = doc.splitTextToSize(`Actividad: ${txtPdf(sec.actividad)}`, contentW) as string[]
    doc.text(actLines, MARGIN, y)
    y += actLines.length * 4 + 2

    const body: PdfTableCell[][] = secCdps.length
      ? secCdps.map(c => {
          const plan = sec.plans.find(p => String(p.id) === String(c.plan_administrativo_id))
          const anulado = cdpEstaAnulado(c)
          const desc = String(c.descripcion ?? '').trim() || '—'
          return [
            String(c.cdp_numero ?? '—'),
            fmtDatePdf(c.cdp_date),
            moneyCell(Number(c.monto_comprometido) || 0),
            anulado ? `[ANULADO] ${desc}` : desc,
            plan ? ogCodigo(plan) : '—',
            plan ? fuenteLabel(plan) : '—',
          ]
        })
      : [['—', '—', moneyCell(0), 'Sin CDPs en esta actividad', '—', '—']]

    y = drawPdfTable(
      doc,
      layout,
      y,
      [['Nro CDP', 'Fecha', 'Monto', 'Descripción', 'OG', 'Fuente']],
      body,
      [[
        { content: 'TOTAL COMPONENTE (ACTIVO)', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
        { content: moneyCell(activoSec), styles: { fontStyle: 'bold', halign: 'right', textColor: WHITE, fillColor: FOOT_GREEN } },
        { content: '', colSpan: 3, styles: { fillColor: FOOT_GREEN } },
      ]],
      {
        0: { cellWidth: contentW * 0.12 },
        1: { cellWidth: contentW * 0.08, halign: 'center' },
        2: { cellWidth: contentW * 0.12, halign: 'right' },
        3: { cellWidth: contentW * 0.50 },
        4: { cellWidth: contentW * 0.08, halign: 'center' },
        5: { cellWidth: contentW * 0.10, halign: 'center' },
      },
      {
        fontSize: 6.5,
        headFontSize: 7,
        gapAfter: 8,
        headFill: HEAD_BLUE,
        headText: WHITE,
        footFill: FOOT_GREEN,
        footText: WHITE,
        showFoot: 'lastPage',
      },
    )
  }

  const stamp = nowDateInputValue().replace(/-/g, '')
  pdfFinishAndSave(doc, layout, `Reporte_Planes_Administrativos_Consolidado_${stamp}`)
}
