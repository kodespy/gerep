import { fmtDatePdf, fmtMoneyPdf, txtPdf, nowDateInputValue, MESES } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
  type PdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, type PdfTableCell } from './pdfTable'
import { informeById, type InformeReportId } from './informesAdminCatalog'
import type { InformePayload } from './informesAdminData'

const BRAND: [number, number, number] = [47, 28, 106]
const HEAD: [number, number, number] = [46, 117, 182]

function sectionBanner(
  doc: import('jspdf').default,
  layout: PdfLayout,
  pageW: number,
  y: number,
  title: string,
): number {
  y = pdfEnsureSpace(doc, y, 14, layout)
  doc.setFillColor(...BRAND)
  doc.rect(PDF_MARGIN_MM, y, pageW - PDF_MARGIN_MM * 2, 7, 'F')
  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(title, PDF_MARGIN_MM + 2.5, y + 4.7)
  doc.setTextColor(0, 0, 0)
  return y + 10
}

function drawCover(
  doc: import('jspdf').default,
  layout: PdfLayout,
  pageW: number,
  reportId: InformeReportId,
  filterLabels: string[],
): number {
  const meta = informeById(reportId)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BRAND)
  doc.text('OBSERVATORIO DE EJECUCIÓN', pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(txtPdf(meta?.title ?? reportId), pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(txtPdf(meta?.tagline ?? ''), pageW / 2, y, { align: 'center' })
  y += 5
  doc.text(`Generado: ${fmtDatePdf(nowDateInputValue())}`, pageW / 2, y, { align: 'center' })
  y += 7

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND)
  doc.text('Filtros aplicados', PDF_MARGIN_MM, y)
  y += 4
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(60, 60, 60)
  for (const line of filterLabels) {
    y = pdfEnsureSpace(doc, y, 5, layout)
    doc.text(`• ${txtPdf(line)}`, PDF_MARGIN_MM, y)
    y += 3.8
  }
  return y + 4
}

function money(n: number): string {
  return fmtMoneyPdf(n)
}

/** Monto compacto para columnas mensuales estrechas (sin sufijo Gs.). */
function moneyCell(n: number): string {
  const v = Math.round(Number(n) || 0)
  if (v === 0) return '0'
  const abs = Math.abs(v)
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${v < 0 ? '-' : ''}${formatted}`
}

const DIFF_ROW: [number, number, number] = [242, 242, 242]
const TOTAL_ROW: [number, number, number] = [180, 180, 180]

/** Anchos que suman exactamente el área útil (mismo margen que los títulos). */
function cols(pageW: number, specs: Array<{ w: number; halign?: 'left' | 'right' | 'center' }>) {
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

const TABLE_OPTS = {
  fontSize: 7,
  headFontSize: 7.5,
  gapAfter: 5,
  headFill: HEAD,
  headText: [255, 255, 255] as [number, number, number],
  marginMm: PDF_MARGIN_MM,
}

export async function exportInformeAdminPdf(
  reportId: InformeReportId,
  payload: InformePayload,
): Promise<void> {
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = drawCover(doc, layout, pageW, reportId, payload.filterLabels)

  if (payload.kind === 'cartera_360') {
    y = sectionBanner(doc, layout, pageW, y, 'CARTERA DE PROYECTOS')
    y = drawPdfTable(
      doc, layout, y,
      [['Proyecto', 'Programa', 'Componente', 'Plan vigente', 'STR neto', 'Saldo', 'Avance', 'Pagos']],
      payload.rows.map(r => [
        txtPdf(r.proyecto),
        txtPdf(r.programa),
        txtPdf(r.componente),
        money(r.planVigente),
        money(r.strNeto),
        money(r.saldo),
        `${r.avancePct}%`,
        String(r.pagosCount),
      ]),
      [[
        'TOTAL',
        '',
        '',
        money(payload.totals.totalGs),
        money(payload.totals.secondaryGs ?? 0),
        money(payload.rows.reduce((s, r) => s + r.saldo, 0)),
        '',
        String(payload.rows.reduce((s, r) => s + r.pagosCount, 0)),
      ]],
      cols(pageW, [
        { w: 96 },
        { w: 42 },
        { w: 42 },
        { w: 30, halign: 'right' },
        { w: 30, halign: 'right' },
        { w: 30, halign: 'right' },
        { w: 16, halign: 'right' },
        { w: 12, halign: 'right' },
      ]),
      TABLE_OPTS,
    )
  }

  if (payload.kind === 'pulso_mensual') {
    const r = payload.resumen
    y = sectionBanner(doc, layout, pageW, y, `PULSO DEL MES · ${r.periodo.toUpperCase()}`)
    y = drawPdfTable(
      doc, layout, y,
      [['Indicador', 'Monto']],
      [
        ['CDP acumulado anterior', money(r.cdpAnterior)],
        ['STR neto acumulado anterior', money(r.strAnterior)],
        ['CDP del mes', money(r.cdpMes)],
        ['STR neto del mes', money(r.strMes)],
        ['Devoluciones del mes', money(r.devolMes)],
        ['Plan vigente (cartera)', money(r.planVigente)],
        ['STR neto al cierre del mes', money(r.strAcumFinMes)],
        ['Saldo disponible al cierre', money(r.saldoCierre)],
        ['Compromiso pendiente del mes (CDP − STR)', money(r.compromisoPendienteMes)],
      ],
      undefined,
      cols(pageW, [
        { w: 220 },
        { w: 78, halign: 'right' },
      ]),
      { ...TABLE_OPTS, fontSize: 8, headFontSize: 8, gapAfter: 6 },
    )

    y = sectionBanner(doc, layout, pageW, y, 'DETALLE POR PROYECTO')
    y = drawPdfTable(
      doc, layout, y,
      [['Proyecto', 'CDP ant.', 'STR ant.', 'CDP mes', 'STR mes', 'Saldo cierre']],
      payload.rows.map(row => [
        txtPdf(row.proyecto),
        money(row.cdpAnterior),
        money(row.strAnterior),
        money(row.cdpMes),
        money(row.strMes),
        money(row.saldoCierre),
      ]),
      undefined,
      cols(pageW, [
        { w: 130 },
        { w: 34,halign: 'right' },
        { w: 34,halign: 'right' },
        { w: 34,halign: 'right' },
        { w: 34,halign: 'right' },
        { w: 32,halign: 'right' },
      ]),
      TABLE_OPTS,
    )
  }

  if (payload.kind === 'cadena_ejecucion') {
    y = sectionBanner(doc, layout, pageW, y, 'CADENA CDP → ACTAS → STR')
    y = drawPdfTable(
      doc, layout, y,
      [['Proyecto', 'CDP', 'Actas', 'STR neto', 'Gap CDP−Acta', 'Gap Acta−STR']],
      payload.rows.map(r => [
        txtPdf(r.proyecto),
        money(r.cdp),
        money(r.actas),
        money(r.strNeto),
        money(r.gapCdpActa),
        money(r.gapActaStr),
      ]),
      [[
        'TOTAL',
        money(payload.rows.reduce((s, r) => s + r.cdp, 0)),
        money(payload.rows.reduce((s, r) => s + r.actas, 0)),
        money(payload.rows.reduce((s, r) => s + r.strNeto, 0)),
        money(payload.rows.reduce((s, r) => s + r.gapCdpActa, 0)),
        money(payload.rows.reduce((s, r) => s + r.gapActaStr, 0)),
      ]],
      cols(pageW, [
        { w: 120 },
        { w: 36,halign: 'right' },
        { w: 36,halign: 'right' },
        { w: 36,halign: 'right' },
        { w: 35,halign: 'right' },
        { w: 35,halign: 'right' },
      ]),
      TABLE_OPTS,
    )
  }

  if (payload.kind === 'acta_resolucion_str') {
    y = sectionBanner(doc, layout, pageW, y, 'ACTA · RESOLUCIÓN · STR (por cada STR)')
    // Orden: Item | Proyecto (4) | STR (3) | Resolución (4) | Actas (4)
    const colSpecs = [
      { w: 8, halign: 'center' as const },
      { w: 32 },
      { w: 16, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
      { w: 13, halign: 'center' as const },
      { w: 13, halign: 'center' as const },
      { w: 15, halign: 'right' as const },
      { w: 12, halign: 'center' as const },
      { w: 15, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
      { w: 12, halign: 'center' as const },
      { w: 15, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
      { w: 15, halign: 'right' as const },
    ]
    const groupHead = { halign: 'center' as const, fontStyle: 'bold' as const }
    const sumValues = payload.rows.map(r => [
      null,
      null,
      r.montoProyectoTotal,
      r.montoStrEjecutado,
      r.montoSaldoProyecto,
      null,
      null,
      r.montoEsteStr,
      null,
      r.resolucionMontoTotal,
      r.resolucionMontoEjecutado,
      r.resolucionSaldo,
      null,
      r.actaAprobado,
      r.actaEjecutado,
      r.actaSaldo,
    ])
    y = drawPdfTable(
      doc, layout, y,
      [
        [
          { content: 'Item', rowSpan: 2, styles: groupHead },
          { content: 'Proyecto', colSpan: 4, styles: groupHead },
          { content: 'STR', colSpan: 3, styles: groupHead },
          { content: 'Resolución', colSpan: 4, styles: groupHead },
          { content: 'Actas', colSpan: 4, styles: groupHead },
        ],
        [
          'Descripción',
          'Monto Total',
          'Monto Ejec.',
          'Saldo',
          'N.º',
          'Fecha',
          'Monto',
          'N.º',
          'Monto Total',
          'Monto Ejec.',
          'Saldo',
          'N.º',
          'Monto Aprob.',
          'Monto Ejec.',
          'Saldos',
        ],
      ],
      payload.rows.map(r => [
        String(r.item),
        txtPdf(r.proyecto),
        money(r.montoProyectoTotal),
        money(r.montoStrEjecutado),
        money(r.montoSaldoProyecto),
        txtPdf(r.strNumero),
        r.fecha ? fmtDatePdf(r.fecha) : '—',
        money(r.montoEsteStr),
        txtPdf(r.resolucionNumero),
        money(r.resolucionMontoTotal),
        money(r.resolucionMontoEjecutado),
        money(r.resolucionSaldo),
        txtPdf(r.actaNumero),
        money(r.actaAprobado),
        money(r.actaEjecutado),
        money(r.actaSaldo),
      ]),
      undefined,
      cols(pageW, colSpecs),
      {
        ...TABLE_OPTS,
        fontSize: 5.4,
        headFontSize: 5.6,
        footFill: [220, 220, 220],
        pageSums: {
          values: sumValues,
          format: money,
          labelCol: 1,
          pageLabel: 'SUBTOTAL PÁGINA',
          grandLabel: 'TOTAL GENERAL',
          pageFill: [220, 220, 220],
          grandFill: TOTAL_ROW,
        },
      },
    )
  }

  if (payload.kind === 'mapa_og_ff') {
    y = sectionBanner(doc, layout, pageW, y, 'MAPA OBJETO DE GASTO × FUENTE')
    y = drawPdfTable(
      doc, layout, y,
      [['Objeto de gasto', 'Fuente', 'Plan', 'Ejecutado', 'Saldo', 'Avance']],
      payload.rows.map(r => [
        txtPdf(r.og),
        txtPdf(r.fuente),
        money(r.plan),
        money(r.ejecutado),
        money(r.saldo),
        `${r.avancePct}%`,
      ]),
      [[
        'TOTAL',
        '',
        money(payload.totals.totalGs),
        money(payload.totals.secondaryGs ?? 0),
        money(payload.rows.reduce((s, r) => s + r.saldo, 0)),
        '',
      ]],
      cols(pageW, [
        { w: 100 },
        { w: 78 },
        { w: 32,halign: 'right' },
        { w: 32,halign: 'right' },
        { w: 32,halign: 'right' },
        { w: 24,halign: 'right' },
      ]),
      TABLE_OPTS,
    )
  }

  if (payload.kind === 'radar_rendiciones') {
    y = sectionBanner(doc, layout, pageW, y, 'RADAR DE RENDICIONES CGR')
    const RED_FILL: [number, number, number] = [254, 202, 202]
    const RED_TEXT: [number, number, number] = [127, 29, 29]
    const redCell = (content: string, red: boolean, halign?: 'left' | 'right' | 'center'): PdfTableCell => {
      if (!red) return content
      return {
        content,
        styles: {
          fillColor: RED_FILL,
          textColor: RED_TEXT,
          fontStyle: 'bold',
          ...(halign ? { halign } : {}),
        },
      }
    }
    y = drawPdfTable(
      doc, layout, y,
      [['Proyecto', 'STR', 'Estado', 'Monto STR', 'Rendido', 'Desembolso', 'Fecha límite', 'Presentación', 'Alerta', 'Días']],
      payload.rows.map(r => {
        const red = r.vencidoSinPresentar
        return [
          redCell(txtPdf(r.proyecto), red),
          redCell(txtPdf(r.str), red),
          redCell(txtPdf(r.estado), red),
          redCell(money(r.montoStr), red, 'right'),
          redCell(money(r.montoRendicion), red, 'right'),
          redCell(r.fechaDesembolso && r.fechaDesembolso !== '—' ? fmtDatePdf(r.fechaDesembolso) : '—', red),
          redCell(r.fechaLimite && r.fechaLimite !== '—' ? fmtDatePdf(r.fechaLimite) : '—', red),
          redCell(r.fechaPresentacion && r.fechaPresentacion !== '—' ? fmtDatePdf(r.fechaPresentacion) : '—', red),
          redCell(txtPdf(r.alerta), red),
          redCell(r.diasAtraso != null ? String(r.diasAtraso) : '—', red, 'right'),
        ]
      }),
      undefined,
      cols(pageW, [
        { w: 68 },
        { w: 22 },
        { w: 24 },
        { w: 26,halign: 'right' },
        { w: 26,halign: 'right' },
        { w: 24 },
        { w: 24 },
        { w: 24 },
        { w: 24 },
        { w: 14,halign: 'right' },
      ]),
      { ...TABLE_OPTS, fontSize: 6, headFontSize: 6.5 },
    )
  }

  if (payload.kind === 'cronometro_vs_real') {
    y = sectionBanner(doc, layout, pageW, y, 'CRONÓMETRO PROGRAMADO VS REAL')
    y = drawPdfTable(
      doc, layout, y,
      [['Período', 'Programado', 'Ejecutado', 'Desvío', 'Avance']],
      payload.rows.map(r => [
        txtPdf(r.periodo),
        money(r.programado),
        money(r.ejecutado),
        money(r.desvio),
        `${r.avancePct}%`,
      ]),
      [[
        'TOTAL',
        money(payload.totals.totalGs),
        money(payload.totals.secondaryGs ?? 0),
        money(payload.rows.reduce((s, r) => s + r.desvio, 0)),
        '',
      ]],
      cols(pageW, [
        { w: 60 },
        { w: 65,halign: 'right' },
        { w: 65,halign: 'right' },
        { w: 65,halign: 'right' },
        { w: 43,halign: 'right' },
      ]),
      { ...TABLE_OPTS, fontSize: 8, headFontSize: 8 },
    )
  }

  if (payload.kind === 'plan_vs_str') {
    y = sectionBanner(doc, layout, pageW, y, `PLAN FINANCIERO VS STR · ${payload.anio}`)
    const diffCell = (content: string) => ({
      content,
      styles: { fillColor: DIFF_ROW, fontStyle: 'bold' as const },
    })
    const body: PdfTableCell[][] = []
    for (const b of payload.blocks) {
      const name = txtPdf(b.proyecto)
      body.push([
        `${name} - Plan Financiero`,
        ...b.plan.map(moneyCell),
      ])
      body.push([
        `${name} - STR (Obligados)`,
        ...b.str.map(moneyCell),
      ])
      body.push([
        `${name} - Devoluciones`,
        ...b.devoluciones.map(moneyCell),
      ])
      body.push([
        diffCell('Diferencia'),
        ...b.diferencia.map(v => diffCell(moneyCell(v))),
      ])
    }
    const monthSpecs = MESES.map(() => ({ w: 18, halign: 'right' as const }))
    y = drawPdfTable(
      doc, layout, y,
      [['Proyectos', ...MESES]],
      body,
      [[
        { content: 'Total General', styles: { fontStyle: 'bold' } },
        ...payload.totalDiferencia.map(v => ({
          content: moneyCell(v),
          styles: { fontStyle: 'bold' as const, halign: 'right' as const },
        })),
      ]],
      cols(pageW, [{ w: 72 }, ...monthSpecs]),
      {
        ...TABLE_OPTS,
        fontSize: 5.5,
        headFontSize: 6.5,
        footFill: TOTAL_ROW,
        showFoot: 'lastPage',
      },
    )
  }

  const slug = reportId.replace(/_/g, '-')
  pdfFinishAndSave(doc, layout, `Informe_${slug}`)
}
