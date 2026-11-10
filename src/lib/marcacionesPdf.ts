import {
  createPdfDoc,
  pdfFinishAndSave,
  pdfPageWidth,
  preparePdfLayout,
} from './pdf'
import { drawPdfTable, pdfSectionHeading, pdfBodyText } from './pdfTable'
import { PDF_TABLE_FONT } from './pdfFonts'
import { fmtDate } from './format'

export type MarcacionPdfJornada = {
  fecha: string
  usuarioName: string
  usuarioEmail: string
  entradaHora: string
  salidaHora: string
  duracionLabel: string
}

export type MarcacionPdfResumen = {
  usuariosActivos: number
  diasTrabajados: number
  promedioHrsDia: number
  incompletos: number
}

export type MarcacionPdfFilters = {
  desde: string
  hasta: string
  usuarioLabel?: string | null
}

export async function exportMarcacionesPdf(opts: {
  filters: MarcacionPdfFilters
  resumen: MarcacionPdfResumen
  jornadas: MarcacionPdfJornada[]
}): Promise<void> {
  const doc = createPdfDoc({ orientation: 'portrait' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text('Reporte de Marcaciones', pageW / 2, y, { align: 'center' })
  y += 7

  const rango = `Periodo: ${fmtDate(opts.filters.desde)} — ${fmtDate(opts.filters.hasta)}`
  const usuario = opts.filters.usuarioLabel
    ? `Usuario: ${opts.filters.usuarioLabel}`
    : 'Usuario: Todos'
  y = pdfBodyText(doc, layout, y, [rango, usuario], 8)
  y += 2

  y = pdfSectionHeading(doc, layout, y, 'Resumen')
  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Indicador', 'Valor']],
    [
      ['Usuarios activos', String(opts.resumen.usuariosActivos)],
      ['Dias trabajados', String(opts.resumen.diasTrabajados)],
      ['Promedio Hrs/Dia', opts.resumen.promedioHrsDia.toFixed(2)],
      ['Registros incompletos', String(opts.resumen.incompletos)],
    ],
    undefined,
    {
      0: { cellWidth: 70 },
      1: { halign: 'right', cellWidth: 35 },
    },
    { fontSize: 8, gapAfter: 6 },
  )

  y = pdfSectionHeading(doc, layout, y, 'Detalle de jornadas')

  const body = opts.jornadas.map(j => [
    fmtDate(j.fecha),
    j.usuarioName || '—',
    j.usuarioEmail || '',
    j.entradaHora || '—',
    j.salidaHora || '—',
    j.duracionLabel || '—',
  ])

  if (!body.length) {
    y = pdfBodyText(doc, layout, y, ['Sin marcaciones para el rango seleccionado.'], 8)
  } else {
    const usableW = pageW - 32
    drawPdfTable(
      doc,
      layout,
      y,
      [['Fecha', 'Usuario', 'Email', 'Entrada', 'Salida', 'Duracion']],
      body,
      undefined,
      {
        0: { cellWidth: usableW * 0.14 },
        1: { cellWidth: usableW * 0.24 },
        2: { cellWidth: usableW * 0.26 },
        3: { cellWidth: usableW * 0.12, halign: 'center' },
        4: { cellWidth: usableW * 0.12, halign: 'center' },
        5: { cellWidth: usableW * 0.12, halign: 'right' },
      },
      { fontSize: 7, headFontSize: 7, gapAfter: 4 },
    )
  }

  const filename = `marcaciones_${opts.filters.desde}_${opts.filters.hasta}`
  pdfFinishAndSave(doc, layout, filename)
}
