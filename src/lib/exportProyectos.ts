import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import { fmtDate, fmtMes, fmtMoney, fmtMoneyPdf } from './format'
import { calcAvanceDesembolso, calcSaldoDisponible, calcStrNeto } from './proyectoSaldos'
import { createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout, type PdfLayout } from './pdf'
import {
  pdfSetBodyStyle, pdfSetHeadStyle,
  PDF_TABLE_BODY_SIZE, PDF_TABLE_FONT, PDF_TABLE_HEAD_SIZE,
  PDF_TABLE_FOOT_BG, PDF_TABLE_BODY_TEXT, PDF_TABLE_BORDER, PDF_TABLE_LINE_WIDTH,
} from './pdfTable'

export interface ProyectoAgg {
  plan: number
  adendas: number
  adendaCount: number
  /** Σ STR (sumatoria sin restar devoluciones) */
  strBruto: number
  /** Σ STR − Σ devoluciones (referencia interna) */
  str: number
  cdp: number
  cdpCount: number
  actas: number
  actaCount: number
  rend: number
  rendCount: number
  devol: number
  devolActa: number
  devolCount: number
  resolCount: number
  convCount: number
}

export function emptyProyectoAgg(): ProyectoAgg {
  return {
    plan: 0, adendas: 0, adendaCount: 0, strBruto: 0, str: 0,
    cdp: 0, cdpCount: 0, actas: 0, actaCount: 0,
    rend: 0, rendCount: 0, devol: 0, devolActa: 0, devolCount: 0,
    resolCount: 0, convCount: 0,
  }
}

/** Agregados por proyecto y código de OG ('' = sin OG). */
export type ProyectoOgAggs = Record<string, Record<string, ProyectoAgg>>

export interface ProyectoOgRef {
  codigo: string
  descripcion: string
}

export interface ProyectoExportRow {
  id: string
  descripcion: string
  actividad: string
  programa: string
  componente: string
  montoProyecto: number | null
  planBase: number
  adendasNetas: number
  adendaCount: number
  planVigente: number
  cdpComprometido: number
  actasNeto: number
  desembolsadoStr: number
  rendidoCgr: number
  devoluciones: number
  avancePct: number
  saldoDisponible: number
  resoluciones: number
  convenios: number
  expediente: string
  periodo: string
}

const HEADERS: { key: keyof ProyectoExportRow; label: string; money?: boolean; pct?: boolean; total?: 'sum' | 'avgPct' }[] = [
  { key: 'descripcion', label: 'Descripción' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'programa', label: 'Programa' },
  { key: 'componente', label: 'Componente' },
  { key: 'montoProyecto', label: 'Monto proyecto', money: true, total: 'sum' },
  { key: 'planBase', label: 'Plan base', money: true, total: 'sum' },
  { key: 'adendasNetas', label: 'Adendas netas', money: true, total: 'sum' },
  { key: 'adendaCount', label: 'Nº adendas', total: 'sum' },
  { key: 'planVigente', label: 'Plan vigente', money: true, total: 'sum' },
  { key: 'cdpComprometido', label: 'CDP comprometido', money: true, total: 'sum' },
  { key: 'actasNeto', label: 'Actas aprobadas (neto)', money: true, total: 'sum' },
  { key: 'desembolsadoStr', label: 'Monto ejecutado (STR neto)', money: true, total: 'sum' },
  { key: 'rendidoCgr', label: 'Rendido CGR', money: true, total: 'sum' },
  { key: 'devoluciones', label: 'Devoluciones STR', money: true, total: 'sum' },
  { key: 'avancePct', label: 'Avance desembolso (%)', pct: true, total: 'avgPct' },
  { key: 'saldoDisponible', label: 'Saldo del proyecto', money: true, total: 'sum' },
  { key: 'resoluciones', label: 'Resoluciones', total: 'sum' },
  { key: 'convenios', label: 'Convenios', total: 'sum' },
  { key: 'expediente', label: 'Expediente' },
  { key: 'periodo', label: 'Período' },
]

const PDF_LIST_FIELDS: { label: string; key: keyof ProyectoExportRow; money?: boolean; pct?: boolean; adenda?: boolean }[] = [
  { label: 'Actividad', key: 'actividad' },
  { label: 'Programa', key: 'programa' },
  { label: 'Componente', key: 'componente' },
  { label: 'Expediente', key: 'expediente' },
  { label: 'Período', key: 'periodo' },
  { label: 'Monto proyecto', key: 'montoProyecto', money: true },
  { label: 'Plan base', key: 'planBase', money: true },
  { label: 'Adendas netas', key: 'adendasNetas', money: true, adenda: true },
  { label: 'Plan vigente', key: 'planVigente', money: true },
  { label: 'CDP comprometido', key: 'cdpComprometido', money: true },
  { label: 'Actas aprobadas (neto)', key: 'actasNeto', money: true },
  { label: 'Monto ejecutado (STR neto)', key: 'desembolsadoStr', money: true },
  { label: 'Rendido CGR', key: 'rendidoCgr', money: true },
  { label: 'Devoluciones STR', key: 'devoluciones', money: true },
  { label: 'Avance desembolso', key: 'avancePct', pct: true },
  { label: 'Saldo del proyecto', key: 'saldoDisponible', money: true },
  { label: 'Resoluciones', key: 'resoluciones' },
  { label: 'Convenios', key: 'convenios' },
]

function periodoDe(p: any): string {
  if (p.mes) return `${fmtMes(p.mes)} ${p.anho ?? ''}`.trim()
  return fmtDate(p.created_at)
}

export { calcSaldoDisponible, calcSaldoPorDesembolsar } from './proyectoSaldos'

export function buildProyectoExportRows(proyectos: any[], aggs: Record<string, ProyectoAgg>): ProyectoExportRow[] {
  return proyectos.map(p => {
    const agg = aggs[p.id] ?? {
      plan: 0, adendas: 0, adendaCount: 0, strBruto: 0, str: 0,
      cdp: 0, cdpCount: 0, actas: 0, actaCount: 0,
      rend: 0, rendCount: 0, devol: 0, devolActa: 0, devolCount: 0,
      resolCount: 0, convCount: 0,
    }
    const planVigente = agg.plan + agg.adendas
    const planVigenteVal = planVigente || Number(p.monto) || 0
    const actasNeto = agg.actas - agg.devolActa
    const desembolsadoStr = calcStrNeto(agg.strBruto, agg.devol)
    const devoluciones = agg.devol
    const avancePct = calcAvanceDesembolso(planVigenteVal, desembolsadoStr)
    const act = p.componente?.actividad
    return {
      id: String(p.id ?? ''),
      descripcion: p.descripcion ?? '',
      actividad: act ? `${act.codigo ? act.codigo + ' — ' : ''}${act.descripcion ?? ''}` : '',
      programa: p.componente?.programa?.descripcion ?? p.componente?.programa?.codigo ?? '',
      componente: p.componente ? `${p.componente.codigo ?? ''} — ${p.componente.descripcion ?? ''}`.trim() : '',
      montoProyecto: p.monto != null ? Number(p.monto) : null,
      planBase: agg.plan,
      adendasNetas: agg.adendas,
      adendaCount: agg.adendaCount,
      planVigente: planVigenteVal,
      cdpComprometido: agg.cdp,
      actasNeto,
      desembolsadoStr,
      rendidoCgr: agg.rend,
      devoluciones,
      avancePct,
      saldoDisponible: calcSaldoDisponible(planVigenteVal, agg.strBruto, devoluciones),
      resoluciones: agg.resolCount,
      convenios: agg.convCount,
      expediente: p.expediente?.numero_expediente ?? '',
      periodo: periodoDe(p),
    }
  })
}

export function computeProyectoTotals(rows: ProyectoExportRow[]): ProyectoExportRow | null {
  if (rows.length === 0) return null
  const sum = (key: keyof ProyectoExportRow) =>
    rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  const totalPlanVigente = sum('planVigente')
  const totalStrNeto = sum('desembolsadoStr')
  const totalDevol = sum('devoluciones')
  const totalStrBruto = totalStrNeto + totalDevol
  const avanceGlobal = calcAvanceDesembolso(totalPlanVigente, totalStrNeto)
  return {
    id: '',
    descripcion: 'TOTALES',
    actividad: `${rows.length} proyecto${rows.length === 1 ? '' : 's'}`,
    programa: '',
    componente: '',
    montoProyecto: sum('montoProyecto'),
    planBase: sum('planBase'),
    adendasNetas: sum('adendasNetas'),
    adendaCount: sum('adendaCount'),
    planVigente: totalPlanVigente,
    cdpComprometido: sum('cdpComprometido'),
    actasNeto: sum('actasNeto'),
    desembolsadoStr: totalStrNeto,
    rendidoCgr: sum('rendidoCgr'),
    devoluciones: totalDevol,
    avancePct: avanceGlobal,
    saldoDisponible: calcSaldoDisponible(totalPlanVigente, totalStrBruto, totalDevol),
    resoluciones: sum('resoluciones'),
    convenios: sum('convenios'),
    expediente: '',
    periodo: '',
  }
}

function fmtCell(row: ProyectoExportRow, h: typeof HEADERS[number]): string | number {
  const v = row[h.key]
  if (h.money) return fmtMoney(v as number)
  if (h.pct) return `${v}%`
  return v as string | number
}

function fmtListValue(row: ProyectoExportRow, f: typeof PDF_LIST_FIELDS[number]): string {
  const v = row[f.key]
  if (f.money) return fmtMoneyPdf(v as number)
  if (f.pct) return `${v}%`
  if (f.adenda && row.adendaCount > 0) return `${fmtMoneyPdf(v as number)} (${row.adendaCount} adenda${row.adendaCount === 1 ? '' : 's'})`
  if (f.adenda) return fmtMoneyPdf(v as number)
  if (typeof v === 'number') return String(v)
  return (v as string) || '—'
}

const SIN_OG = 'Sin OG'

function uniqueExportRows(rows: ProyectoExportRow[]): ProyectoExportRow[] {
  const seen = new Set<string>()
  const out: ProyectoExportRow[] = []
  for (const row of rows) {
    const key = row.id || `__${out.length}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

function sortOgCodigo(a: string, b: string): number {
  if (!a && b) return 1
  if (a && !b) return -1
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b, 'es', { numeric: true })
}

export type OgCatalogRow = { id?: string; codigo?: string | null; descripcion?: string | null; og_principal_id?: string | number | null }

export function buildOgCatalog(ogs: OgCatalogRow[]) {
  const byId = new Map<string, OgCatalogRow>()
  const byCodigo = new Map<string, OgCatalogRow>()
  for (const og of ogs) {
    if (og.id) byId.set(String(og.id), og)
    const cod = String(og.codigo ?? '').trim()
    if (cod) byCodigo.set(cod, og)
  }
  return { byId, byCodigo }
}

export type OgCatalog = ReturnType<typeof buildOgCatalog>

function ogDisplayCodigo(og: OgCatalogRow, catalog: OgCatalog): ProyectoOgRef {
  const ref = og.og_principal_id != null ? String(og.og_principal_id).trim() : ''
  if (ref) {
    const parent = catalog.byId.get(ref) ?? catalog.byCodigo.get(ref)
    if (parent?.codigo != null && String(parent.codigo).trim() !== '') {
      return {
        codigo: String(parent.codigo).trim(),
        descripcion: String(parent.descripcion ?? og.descripcion ?? '').trim(),
      }
    }
  }
  return {
    codigo: String(og.codigo ?? '').trim(),
    descripcion: String(og.descripcion ?? '').trim(),
  }
}

export function ogRefFromId(ogId: string | null | undefined, catalog: OgCatalog): ProyectoOgRef {
  if (!ogId) return { codigo: '', descripcion: '' }
  const og = catalog.byId.get(String(ogId))
  if (!og) return { codigo: '', descripcion: '' }
  return ogDisplayCodigo(og, catalog)
}

/** Agrupa imputaciones por proyecto usando el OG principal (839, 879, 851…). */
export function collectOgsByProyecto(
  links: { proyecto_id?: string | null; objeto_de_gasto_id?: string | null }[],
  ogs: OgCatalogRow[],
): Record<string, ProyectoOgRef[]> {
  const catalog = buildOgCatalog(ogs)
  const map: Record<string, ProyectoOgRef[]> = {}
  for (const link of links) {
    const pid = link.proyecto_id ? String(link.proyecto_id) : ''
    if (!pid) continue
    const ref = ogRefFromId(link.objeto_de_gasto_id ? String(link.objeto_de_gasto_id) : '', catalog)
    const list = map[pid] ?? (map[pid] = [])
    if (!list.some(x => x.codigo === ref.codigo)) list.push(ref)
  }
  return map
}

export function sliceExportRowForOg(row: ProyectoExportRow, agg: ProyectoAgg): ProyectoExportRow {
  const planVigente = agg.plan + agg.adendas
  const desembolsadoStr = calcStrNeto(agg.strBruto, agg.devol)
  const devoluciones = agg.devol
  const actasNeto = agg.actas - agg.devolActa
  return {
    ...row,
    montoProyecto: planVigente || null,
    planBase: agg.plan,
    adendasNetas: agg.adendas,
    adendaCount: agg.adendaCount,
    planVigente,
    cdpComprometido: agg.cdp,
    actasNeto,
    desembolsadoStr,
    rendidoCgr: agg.rend,
    devoluciones,
    avancePct: calcAvanceDesembolso(planVigente, desembolsadoStr),
    saldoDisponible: calcSaldoDisponible(planVigente, agg.strBruto, devoluciones),
    resoluciones: agg.resolCount,
    convenios: agg.convCount,
  }
}

export interface ProyectoOgGroup {
  codigo: string
  label: string
  rows: ProyectoExportRow[]
}

export function groupProyectoRowsByOg(
  rows: ProyectoExportRow[],
  ogsByProyecto: Record<string, ProyectoOgRef[]>,
  aggsByProyectoOg: ProyectoOgAggs = {},
): ProyectoOgGroup[] {
  const groups = new Map<string, ProyectoOgGroup>()
  const ensure = (codigo: string, descripcion: string) => {
    const key = codigo || ''
    const existing = groups.get(key)
    if (existing) return existing
    const label = key
      ? (descripcion ? `OG ${key} — ${descripcion}` : `OG ${key}`)
      : SIN_OG
    const created: ProyectoOgGroup = { codigo: key, label, rows: [] }
    groups.set(key, created)
    return created
  }
  for (const row of rows) {
    const byCodigo = new Map<string, string>()
    for (const og of (row.id && ogsByProyecto[row.id]) || []) {
      byCodigo.set(og.codigo, og.descripcion)
    }
    for (const codigo of Object.keys(aggsByProyectoOg[row.id] ?? {})) {
      if (!byCodigo.has(codigo)) byCodigo.set(codigo, '')
    }
    const keys = [...byCodigo.keys()]
    if (keys.length === 0) {
      ensure('', '').rows.push(row)
      continue
    }
    const hasNamed = keys.some(k => k)
    for (const codigo of keys) {
      const agg = aggsByProyectoOg[row.id]?.[codigo] ?? emptyProyectoAgg()
      const hasMonto = agg.plan || agg.adendas || agg.strBruto || agg.devol || agg.rend || agg.cdp || agg.actas
      if (codigo === '' && hasNamed && !hasMonto) continue
      ensure(codigo, byCodigo.get(codigo) ?? '').rows.push(sliceExportRowForOg(row, agg))
    }
  }
  return [...groups.values()].sort((a, b) => sortOgCodigo(a.codigo, b.codigo))
}

function stamp(): string {
  return new Date().toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function rowToSheetObject(row: ProyectoExportRow): Record<string, string | number | null> {
  const obj: Record<string, string | number | null> = {}
  for (const h of HEADERS) {
    const v = row[h.key]
    if (h.money || h.pct) obj[h.label] = v as number
    else obj[h.label] = v as string | number | null
  }
  return obj
}

export type ProyectoExportOpts = {
  separarPorOg?: boolean
  ogsByProyecto?: Record<string, ProyectoOgRef[]>
  aggsByProyectoOg?: ProyectoOgAggs
}

function styleTotalsRow(row: ExcelJS.Row) {
  row.font = { bold: true }
}

function styleGroupTitle(row: ExcelJS.Row, colCount: number) {
  row.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  row.getCell(1).alignment = { vertical: 'middle' }
  if (colCount > 1) {
    const sheet = row.worksheet
    if (sheet) sheet.mergeCells(row.number, 1, row.number, colCount)
  }
}

function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  void (async () => {
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  })()
}

export function exportProyectosExcel(rows: ProyectoExportRow[], filename = 'proyectos', opts?: ProyectoExportOpts) {
  const wb = new ExcelJS.Workbook()
  const grouped = Boolean(opts?.separarPorOg)
  const ws = wb.addWorksheet('Proyectos')
  ws.columns = HEADERS.map(h => ({
    header: grouped ? undefined : h.label,
    key: h.label,
    width: h.money ? 18 : h.key === 'descripcion' ? 36 : 16,
  }))

  if (grouped) {
    const groups = groupProyectoRowsByOg(rows, opts?.ogsByProyecto ?? {}, opts?.aggsByProyectoOg)
    const colCount = HEADERS.length
    const unique = uniqueExportRows(rows)
    const groupedRows = groups.flatMap(g => g.rows)
    for (const group of groups) {
      const title = ws.addRow([`${group.label}  (${group.rows.length} proyecto${group.rows.length === 1 ? '' : 's'})`])
      styleGroupTitle(title, colCount)
      const head = ws.addRow(HEADERS.map(h => h.label))
      head.font = { bold: true }
      for (const row of group.rows) ws.addRow(rowToSheetObject(row))
      const sub = computeProyectoTotals(group.rows)
      if (sub) {
        sub.descripcion = `SUBTOTAL ${group.codigo ? `OG ${group.codigo}` : SIN_OG}`
        styleTotalsRow(ws.addRow(rowToSheetObject(sub)))
      }
      ws.addRow([])
    }
    const grand = computeProyectoTotals(groupedRows)
    if (grand) {
      grand.descripcion = 'TOTAL GENERAL'
      grand.actividad = `${unique.length} proyecto${unique.length === 1 ? '' : 's'}`
      styleTotalsRow(ws.addRow(rowToSheetObject(grand)))
    }
  } else {
    for (const row of rows) ws.addRow(rowToSheetObject(row))
    const totals = computeProyectoTotals(rows)
    if (totals) styleTotalsRow(ws.addRow(rowToSheetObject(totals)))
  }

  downloadWorkbook(wb, filename)
}


function drawListItem(doc: jsPDF, layout: PdfLayout, row: ProyectoExportRow, index: number, y: number): number {
  const w = pdfPageWidth(doc) - PDF_MARGIN_MM * 2
  y = pdfEnsureSpace(doc, y, 18, layout)

  doc.setDrawColor(220, 225, 232)
  doc.setLineWidth(0.3)
  doc.line(PDF_MARGIN_MM, y, PDF_MARGIN_MM + w, y)
  y += 5

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(PDF_TABLE_HEAD_SIZE)
  doc.setTextColor(...PDF_TABLE_BODY_TEXT)
  const title = `${index}. ${row.descripcion || 'Sin descripción'}`
  const titleLines = doc.splitTextToSize(title, w)
  y = pdfEnsureSpace(doc, y, titleLines.length * 5 + 4, layout)
  doc.text(titleLines, PDF_MARGIN_MM, y)
  y += titleLines.length * 5 + 3

  pdfSetBodyStyle(doc)

  for (const f of PDF_LIST_FIELDS) {
    const val = fmtListValue(row, f)
    if (!val || val === '—') continue
    const line = `${f.label}: ${val}`
    const lines = doc.splitTextToSize(line, w - 4)
    y = pdfEnsureSpace(doc, y, lines.length * 4.2 + 1, layout)
    doc.text(lines, PDF_MARGIN_MM + 2, y)
    y += lines.length * 4.2 + 1.2
  }

  return y + 4
}

function drawOgSectionTitle(doc: jsPDF, layout: PdfLayout, label: string, y: number): number {
  const w = pdfPageWidth(doc) - PDF_MARGIN_MM * 2
  y = pdfEnsureSpace(doc, y, 14, layout)
  doc.setFillColor(51, 65, 85)
  doc.rect(PDF_MARGIN_MM, y, w, 8, 'F')
  pdfSetHeadStyle(doc)
  doc.setTextColor(255, 255, 255)
  doc.text(label, PDF_MARGIN_MM + 3, y + 5.5)
  doc.setTextColor(...PDF_TABLE_BODY_TEXT)
  return y + 12
}

function drawTotalsBlock(doc: jsPDF, layout: PdfLayout, totals: ProyectoExportRow, y: number, heading?: string): number {
  const w = pdfPageWidth(doc) - PDF_MARGIN_MM * 2
  y = pdfEnsureSpace(doc, y, 20, layout)

  doc.setFillColor(...PDF_TABLE_FOOT_BG)
  doc.rect(PDF_MARGIN_MM, y, w, 8, 'F')
  doc.setDrawColor(...PDF_TABLE_BORDER)
  doc.setLineWidth(PDF_TABLE_LINE_WIDTH)
  doc.rect(PDF_MARGIN_MM, y, w, 8, 'S')
  pdfSetHeadStyle(doc)
  doc.text(`${heading ?? 'TOTALES'} — ${totals.actividad}`, PDF_MARGIN_MM + 3, y + 5.5)
  y += 12

  pdfSetHeadStyle(doc, PDF_TABLE_BODY_SIZE)

  const totalFields = PDF_LIST_FIELDS.filter(f => f.money || f.pct || f.key === 'resoluciones' || f.key === 'convenios' || f.key === 'adendaCount')
  for (const f of totalFields) {
    if (f.key === 'adendasNetas') {
      const val = `${fmtMoneyPdf(totals.adendasNetas)} (${totals.adendaCount} adenda${totals.adendaCount === 1 ? '' : 's'})`
      y = pdfEnsureSpace(doc, y, 5, layout)
      doc.text(`Adendas netas: ${val}`, PDF_MARGIN_MM + 2, y)
      y += 5
      continue
    }
    const val = fmtListValue(totals, f)
    if (!val || val === '—') continue
    y = pdfEnsureSpace(doc, y, 5, layout)
    doc.text(`${f.label}: ${val}`, PDF_MARGIN_MM + 2, y)
    y += 5
  }

  return y + 4
}

export async function exportProyectosPdf(rows: ProyectoExportRow[], filename = 'proyectos', opts?: ProyectoExportOpts) {
  const doc = createPdfDoc({ orientation: 'portrait' })
  const layout = await preparePdfLayout(doc)
  const grouped = Boolean(opts?.separarPorOg)

  pdfSetHeadStyle(doc, 14)
  doc.setTextColor(0, 0, 0)
  doc.text(grouped ? 'Listado de proyectos por OG' : 'Listado de proyectos', PDF_MARGIN_MM, layout.contentTop)

  pdfSetBodyStyle(doc)
  doc.setTextColor(...PDF_TABLE_BODY_TEXT)
  const uniqueCount = uniqueExportRows(rows).length
  const subtitle = grouped
    ? `${uniqueCount} proyecto${uniqueCount === 1 ? '' : 's'} · separado por objeto de gasto · Generado ${stamp()}`
    : `${rows.length} proyecto${rows.length === 1 ? '' : 's'} · Generado ${stamp()}`
  doc.text(subtitle, PDF_MARGIN_MM, layout.contentTop + 7)

  let y = layout.contentTop + 14

  if (grouped) {
    const groups = groupProyectoRowsByOg(rows, opts?.ogsByProyecto ?? {}, opts?.aggsByProyectoOg)
    const groupedRows = groups.flatMap(g => g.rows)
    for (const group of groups) {
      y = drawOgSectionTitle(doc, layout, `${group.label}  (${group.rows.length})`, y)
      group.rows.forEach((row, i) => { y = drawListItem(doc, layout, row, i + 1, y) })
      const sub = computeProyectoTotals(group.rows)
      if (sub) {
        y = pdfEnsureSpace(doc, y, 30, layout)
        y = drawTotalsBlock(doc, layout, sub, y, `SUBTOTAL ${group.codigo ? `OG ${group.codigo}` : SIN_OG}`)
      }
      y += 4
    }
    const grand = computeProyectoTotals(groupedRows)
    if (grand) {
      grand.actividad = `${uniqueCount} proyecto${uniqueCount === 1 ? '' : 's'}`
      y = pdfEnsureSpace(doc, y, 30, layout)
      y = drawTotalsBlock(doc, layout, grand, y, 'TOTAL GENERAL')
    }
  } else {
    rows.forEach((row, i) => { y = drawListItem(doc, layout, row, i + 1, y) })
    const totals = computeProyectoTotals(rows)
    if (totals) {
      y = pdfEnsureSpace(doc, y, 30, layout)
      y = drawTotalsBlock(doc, layout, totals, y)
    }
  }

  pdfFinishAndSave(doc, layout, filename)
}
