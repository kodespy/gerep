import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { createPdfDoc, PDF_MARGIN_MM, pdfFinishAndSave, pdfPageWidth, preparePdfLayout } from './pdf'
import { PDF_TABLE_FONT } from './pdfFonts'
import { dateOnlyIso, fmtDatePdf, formatLocalIso, fmtMoneyPdf, txtPdf } from './format'
import { ajusteModificacionAdmin } from './planVigente'
import { cdpCompAnterior, cdpMontoVigente, parseCdpNumeroFormat } from './cdpUtils'
import { fetchCdpsForPlanAdmin } from './planAdminCdp'

const MARGIN = PDF_MARGIN_MM
const BORDER: [number, number, number] = [0, 0, 0]
const HEAD_BG: [number, number, number] = [242, 242, 242]
const META_BORDER: [number, number, number] = [180, 188, 196]
const META_RULE: [number, number, number] = [210, 216, 222]
const META_LABEL: [number, number, number] = [90, 98, 108]
const META_ACCENT: [number, number, number] = [15, 118, 110] // teal institucional
const META_BAND: [number, number, number] = [248, 250, 252]
const FONT_SIZE = 7
const HEAD_SIZE = 7

export interface CdpPdfData {
  cdp: any
  entidad: string
  programaDesc: string
  componenteDesc: string
  descripcion: string
  cdpNumeroAnexo: string
  fechaEmision: string
  anio: number
  linea: {
    activ: string
    sog: string
    ff: string
  }
  planFinancieroVigente: number
  modifPresup: number
  presupuestoVigente: number
  certificacionesAnteriores: number
  certificacionActual: number
  saldoDisponible: number
  certificacionTotal: number
}

function netModificacionesHasta(mods: any[], hastaIso: string): number {
  const limit = new Date(hastaIso).getTime()
  return (mods ?? []).reduce((sum, m) => {
    const raw = m.fecha_modificacion
    const t = raw ? new Date(raw.length <= 10 ? `${raw}T23:59:59` : raw).getTime() : 0
    if (t > limit) return sum
    return sum + ajusteModificacionAdmin(m)
  }, 0)
}

function formatCdpNumeroAnexo(cdpNumero: string | null | undefined, defaultYear: number): string {
  const parsed = parseCdpNumeroFormat(cdpNumero)
  if (parsed) return `${String(parsed.secuencia).padStart(3, '0')}/${parsed.anio}`
  const raw = String(cdpNumero ?? '').trim()
  const slash = raw.match(/(\d+)\s*\/\s*(\d{4})/)
  if (slash) return `${slash[1]}/${slash[2]}`
  return `_______/${defaultYear}`
}

function cdpFilename(cdp: any): string {
  const num = String(cdp.cdp_numero ?? 'CDP').replace(/[^\w.-]+/g, '-')
  const stamp = (dateOnlyIso(cdp.cdp_date) || dateOnlyIso(new Date().toISOString()) || 'fecha').replace(/-/g, '')
  return `${num}_${stamp}`
}

function upperTxt(v: string): string {
  const t = txtPdf(v)
  return t === '---' ? t : t.toUpperCase()
}

function moneyCell(v: number): string {
  return fmtMoneyPdf(v).replace(/\s+/g, ' ')
}

function fmtComponentePdf(comp: { codigo?: string | null; descripcion?: string | null } | null | undefined): string {
  if (!comp) return '---'
  const cod = String(comp.codigo ?? '').trim()
  const desc = String(comp.descripcion ?? '').trim()
  if (cod && desc) return `${cod} — ${desc}`
  return desc || cod || '---'
}

export async function loadCdpPdfData(cdpId: string): Promise<CdpPdfData> {
  const { data: cdp, error } = await supabase
    .from('budget_commitments')
    .select('*, proyecto:proyectos(descripcion)')
    .eq('id', cdpId)
    .single()
  if (error || !cdp) throw new Error(error?.message ?? 'CDP no encontrado')

  let plan: any = null
  let modificaciones: any[] = []
  let allCdps: any[] = []
  let programaDesc = '---'
  let componenteDesc = '---'

  // Componente/programa del proyecto (fuente correcta cuando hay proyecto vinculado)
  if (cdp.proyecto_id) {
    const { data: proy } = await supabase
      .from('proyectos')
      .select('descripcion, componente:componentes_programa(codigo, descripcion, programa:programas(codigo, descripcion))')
      .eq('id', cdp.proyecto_id)
      .maybeSingle()
    const comp = Array.isArray(proy?.componente) ? proy.componente[0] : proy?.componente
    if (comp) {
      componenteDesc = fmtComponentePdf(comp)
      const prog = Array.isArray(comp.programa) ? comp.programa[0] : comp.programa
      programaDesc = txtPdf(prog?.descripcion)
    }
  }

  if (cdp.plan_administrativo_id) {
    const [planRes, modsRes, cdpsRes] = await Promise.all([
      supabase
        .from('planes_financieros_administrativos')
        .select('*, programa:programas(codigo,descripcion), actividad:actividades(codigo,descripcion), objeto:objetos_de_gastos(codigo,descripcion), fuente:fuentes_financiamiento(descripcion)')
        .eq('id', cdp.plan_administrativo_id)
        .maybeSingle(),
      supabase
        .from('modificaciones_administrativas')
        .select('monto, tipo_modificacion, fecha_modificacion')
        .eq('plan_administrativo_id', cdp.plan_administrativo_id),
      fetchCdpsForPlanAdmin(cdp.plan_administrativo_id),
    ])
    plan = planRes.data
    modificaciones = modsRes.data ?? []
    allCdps = cdpsRes.data

    // Solo si no hay proyecto: no inventar C1; usar programa del plan y dejar componente vacío
    if (componenteDesc === '---' && plan?.programa) {
      programaDesc = txtPdf(plan.programa?.descripcion)
    }
  } else if (cdp.proyecto_id) {
    const { data: cdps } = await supabase
      .from('budget_commitments')
      .select('*')
      .eq('proyecto_id', cdp.proyecto_id)
      .order('cdp_date', { ascending: true })
    allCdps = cdps ?? []
  }

  const fechaCdp = cdp.cdp_date ?? formatLocalIso(new Date())
  const anio = Number(plan?.anio) || Number((dateOnlyIso(fechaCdp) || '').slice(0, 4)) || new Date().getFullYear()
  const planFinancieroVigente = Number(plan?.monto_total) || 0
  const modifPresup = netModificacionesHasta(modificaciones, fechaCdp)
  const presupuestoVigente = planFinancieroVigente + modifPresup
  const certificacionesAnteriores = cdpCompAnterior(cdp, allCdps)
  const certificacionActual = cdpMontoVigente(cdp)
  const certificacionTotal = certificacionesAnteriores + certificacionActual
  const saldoDisponible = presupuestoVigente - certificacionTotal

  const descripcion = (cdp.proyecto?.descripcion ?? plan?.descripcion ?? cdp.descripcion ?? '').trim()

  return {
    cdp,
    entidad: 'SECRETARÍA NACIONAL DE DEPORTES',
    programaDesc,
    componenteDesc,
    descripcion: txtPdf(descripcion),
    cdpNumeroAnexo: formatCdpNumeroAnexo(cdp.cdp_numero, anio),
    fechaEmision: fmtDatePdf(fechaCdp),
    anio,
    linea: {
      activ: txtPdf(plan?.actividad?.codigo),
      sog: txtPdf(plan?.objeto?.codigo),
      ff: txtPdf(plan?.fuente?.descripcion),
    },
    planFinancieroVigente,
    modifPresup,
    presupuestoVigente,
    certificacionesAnteriores,
    certificacionActual,
    saldoDisponible,
    certificacionTotal,
  }
}

const tableStyles = {
  font: PDF_TABLE_FONT,
  fontSize: FONT_SIZE,
  cellPadding: 1.2,
  lineColor: BORDER,
  lineWidth: 0.15,
  textColor: [0, 0, 0] as [number, number, number],
  overflow: 'linebreak' as const,
}

const headStyles = {
  font: PDF_TABLE_FONT,
  fontSize: HEAD_SIZE,
  fontStyle: 'bold' as const,
  fillColor: HEAD_BG,
  textColor: [0, 0, 0] as [number, number, number],
  halign: 'center' as const,
  valign: 'middle' as const,
}

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  doc.text(lines, x, y)
  return lines.length * lineHeight
}

function measureWrappedHeight(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(fontSize)
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  return Math.max(lineHeight, lines.length * lineHeight)
}

/** Título principal: anexo a la izquierda, título al centro, CDP N° al margen derecho. */
function renderCdpTitle(doc: jsPDF, startY: number, data: CdpPdfData): number {
  const pageW = pdfPageWidth(doc)
  const rightX = pageW - MARGIN
  const y = startY + 4.5

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 88, 96)
  doc.text('ANEXO B-02-04', MARGIN, y)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(20, 28, 36)
  doc.text(
    'CERTIFICADO DE DISPONIBILIDAD PRESUPUESTARIA (CDP)',
    pageW / 2,
    y,
    { align: 'center' },
  )

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 28, 36)
  doc.text(`CDP N° ${data.cdpNumeroAnexo}`, rightX, y, { align: 'right' })

  const underlineY = startY + 9
  const lineLeft = MARGIN
  const lineRight = rightX
  doc.setDrawColor(...META_ACCENT)
  doc.setLineWidth(0.7)
  doc.line(lineLeft, underlineY, lineRight, underlineY)
  doc.setDrawColor(...META_BORDER)
  doc.setLineWidth(0.25)
  doc.line(lineLeft, underlineY + 1.1, lineRight, underlineY + 1.1)

  doc.setTextColor(0, 0, 0)
  return startY + 13
}

/** Cabecera de datos compacta. */
function renderMetaTable(doc: jsPDF, data: CdpPdfData, startY: number): number {
  const pageW = pdfPageWidth(doc)
  const x = MARGIN
  const contentW = pageW - MARGIN * 2
  const padX = 3.5
  const labelW = 28
  const valueSize = 8
  const valueLH = 3.5
  const rowPad = 2.2
  const fechaW = 36

  const valueMaxW = contentW - labelW - padX * 2 - 2
  const firstValueMaxW = valueMaxW - fechaW - 4

  const entidad = upperTxt(data.entidad)
  const rows = [
    { label: 'PROGRAMA', value: upperTxt(data.programaDesc) },
    { label: 'COMPONENTE', value: upperTxt(data.componenteDesc) },
    { label: 'DESCRIPCIÓN', value: upperTxt(data.descripcion) },
  ]

  const entidadH = measureWrappedHeight(doc, entidad, firstValueMaxW, valueSize, valueLH)
  const rowHeights = rows.map(r =>
    measureWrappedHeight(doc, r.value, valueMaxW, valueSize, valueLH),
  )

  const firstRowH = Math.max(10, entidadH + rowPad * 2)
  const otherH = rowHeights.reduce((s, h) => s + Math.max(7.5, h + rowPad * 2), 0)
  const boxH = firstRowH + otherH
  const boxY = startY

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...META_BORDER)
  doc.setLineWidth(0.35)
  doc.roundedRect(x, boxY, contentW, boxH, 1, 1, 'FD')

  doc.setFillColor(...META_ACCENT)
  doc.rect(x, boxY, 1.4, boxH, 'F')

  let ry = boxY
  doc.setFillColor(...META_BAND)
  doc.rect(x + 1.4, ry, contentW - 1.4, firstRowH, 'F')

  const midY = ry + firstRowH / 2
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...META_LABEL)
  doc.text('ENTIDAD', x + padX + 1, midY - entidadH / 2 + 2.2)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(valueSize)
  doc.setTextColor(20, 28, 36)
  drawWrappedText(
    doc,
    entidad,
    x + padX + labelW,
    midY - entidadH / 2 + 2.4,
    firstValueMaxW,
    valueLH,
  )

  const fechaX = x + contentW - padX
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(...META_LABEL)
  doc.text('FECHA DE EMISIÓN', fechaX, midY - 2.2, { align: 'right' })
  doc.setFontSize(8)
  doc.setTextColor(20, 28, 36)
  doc.text(data.fechaEmision, fechaX, midY + 2.8, { align: 'right' })

  ry += firstRowH
  doc.setDrawColor(...META_RULE)
  doc.setLineWidth(0.25)
  doc.line(x + 1.4, ry, x + contentW, ry)

  rows.forEach((row, i) => {
    const h = Math.max(7.5, rowHeights[i] + rowPad * 2)
    if (i % 2 === 1) {
      doc.setFillColor(252, 253, 254)
      doc.rect(x + 1.4, ry, contentW - 1.4, h, 'F')
    }

    const textTop = ry + rowPad + 2.2
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...META_LABEL)
    doc.text(row.label, x + padX + 1, textTop)

    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.setFontSize(valueSize)
    doc.setTextColor(20, 28, 36)
    drawWrappedText(doc, row.value, x + padX + labelW, textTop, valueMaxW, valueLH)

    ry += h
    if (i < rows.length - 1) {
      doc.setDrawColor(...META_RULE)
      doc.setLineWidth(0.2)
      doc.line(x + 1.4, ry, x + contentW, ry)
    }
  })

  doc.setTextColor(0, 0, 0)
  return boxY + boxH
}

function renderPresupuestoTable(doc: jsPDF, data: CdpPdfData, startY: number): number {
  const { anio, linea } = data
  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    styles: tableStyles,
    headStyles,
    bodyStyles: { ...tableStyles, halign: 'center', valign: 'middle', minCellHeight: 14, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 16 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 12 },
      5: { halign: 'right', cellWidth: 30 },
      6: { halign: 'right', cellWidth: 26 },
      7: { halign: 'right', cellWidth: 30 },
      8: { halign: 'right', cellWidth: 30 },
      9: { halign: 'right', cellWidth: 30 },
      10: { halign: 'right', cellWidth: 32 },
    },
    head: [
      [
        { content: 'LINEA PRESUPUESTARIA', colSpan: 4 },
        { content: 'AÑO', rowSpan: 2 },
        { content: `Plan Financiero\nVigente ${anio}`, rowSpan: 2 },
        { content: 'Modif.\nPresup.', rowSpan: 2 },
        { content: `Presupuesto\nVigente ${anio}`, rowSpan: 2 },
        { content: 'Certificaciones\nAnteriores', rowSpan: 2 },
        { content: 'Certificación\nActual', rowSpan: 2 },
        { content: 'Certificación\n(Actual +\nAnteriores)', rowSpan: 2 },
        { content: 'Saldo del Plan\nFinanciero\nDisponible', rowSpan: 2 },
      ],
      [
        'ACTIV.', 'U.\nRes', 'S.O.G.', 'F.F.',
      ],
    ],
    body: [[
      linea.activ,
      'UEP',
      linea.sog,
      linea.ff,
      String(anio),
      moneyCell(data.planFinancieroVigente),
      moneyCell(data.modifPresup),
      moneyCell(data.presupuestoVigente),
      moneyCell(data.certificacionesAnteriores),
      moneyCell(data.certificacionActual),
      moneyCell(data.certificacionTotal),
      moneyCell(data.saldoDisponible),
    ]],
  })
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY
}

function renderFirmas(doc: jsPDF, startY: number): void {
  const pageW = pdfPageWidth(doc)
  const lineW = 78
  const leftX = MARGIN + 8
  const rightX = pageW - MARGIN - lineW - 8
  const lineY = startY + 28

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.45)
  doc.line(leftX, lineY, leftX + lineW, lineY)
  doc.line(rightX, lineY, rightX + lineW, lineY)

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('Elaborado por', leftX + lineW / 2, lineY + 6, { align: 'center' })
  doc.text('V° B°', rightX + lineW / 2, lineY + 6, { align: 'center' })
}

export async function exportCdpPdf(cdpId: string): Promise<void> {
  const data = await loadCdpPdfData(cdpId)

  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  let y = layout.contentTop

  y = renderCdpTitle(doc, y, data)
  y = renderMetaTable(doc, data, y) + 3
  y = renderPresupuestoTable(doc, data, y) + 14
  renderFirmas(doc, y)

  pdfFinishAndSave(doc, layout, cdpFilename(data.cdp))
}
