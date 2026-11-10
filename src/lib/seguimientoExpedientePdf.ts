import { createPdfDoc, pdfFinishAndSave, preparePdfLayout } from './pdf'
import { drawPdfTable, pdfBodyText, pdfSectionHeading } from './pdfTable'
import { fmtDateTimePdf, txtPdf } from './format'
import type { SeguimientoMovimiento } from '../components/ExpedienteSeguimientoPanel'

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  return String(v)
}

export async function exportSeguimientoExpedientePdf(opts: {
  numeroExpediente?: string | null
  asunto?: string | null
  movimientos: SeguimientoMovimiento[]
}): Promise<void> {
  const { numeroExpediente, asunto, movimientos } = opts
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)

  let y = layout.contentTop
  y = pdfSectionHeading(doc, layout, y, 'Seguimiento de expediente')
  y = pdfBodyText(doc, layout, y, [
    `N. expediente: ${txtPdf(numeroExpediente)}`,
    `Asunto: ${txtPdf(asunto)}`,
    `Movimientos: ${movimientos.length}`,
  ])

  const head = [['Fecha', 'Estado', 'Origen', 'Destino', 'Usuario', 'Observacion']]
  const body = movimientos.map(m => {
    const fecha = m.fecha_hora_recepcion || m.fecha_derivacion || m.created_at
    const userLabel = asText(m.usuario?.name) || asText(m.usuario?.email) || '---'
    const destino = asText(m.area_destino?.nombre) || '---'
    const ext = m.area_destino?.is_external ? ' (EXT)' : ''
    const obsParts = [
      asText(m.observacion),
      asText(m.quien_recibio) ? `Recibio: ${asText(m.quien_recibio)}` : '',
      asText(m.nro_expediente_asignado) ? `Nro asignado: ${asText(m.nro_expediente_asignado)}` : '',
      asText(m.observacion_recepcion),
    ].filter(Boolean)
    const recepcion = m.fecha_hora_recepcion
      ? ` / Recepcion: ${fmtDateTimePdf(m.fecha_hora_recepcion)}`
      : ''
    return [
      `${fmtDateTimePdf(fecha)}${recepcion}`,
      asText(m.estado) || '---',
      asText(m.area_origen?.nombre) || '---',
      `${destino}${ext}`,
      userLabel,
      obsParts.join(' · ') || '---',
    ]
  })

  if (body.length === 0) {
    pdfBodyText(doc, layout, y, ['No hay movimientos de seguimiento registrados.'])
  } else {
    drawPdfTable(doc, layout, y, head, body, undefined, {
      0: { cellWidth: 42 },
      1: { cellWidth: 28 },
      2: { cellWidth: 36 },
      3: { cellWidth: 36 },
      4: { cellWidth: 34 },
      5: { cellWidth: 60 },
    })
  }

  const slug = (numeroExpediente || 'expediente').replace(/[^\w.-]+/g, '_')
  pdfFinishAndSave(doc, layout, `seguimiento-${slug}`)
}
