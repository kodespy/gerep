import { supabase } from './supabase'
import { fmtDatePdf, txtPdf } from './format'
import {
  createPdfDoc, PDF_MARGIN_MM, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT, pdfEstadoMarkCell } from './pdfTable'

type ControlItem = {
  descripcion: string | null
  cumple: boolean | null
  no_cumple: boolean | null
  no_aplica: boolean | null
  observaciones: string | null
  fecha: string | null
  numero_formulario: string | null
  created_at?: string | null
}

const META_LABEL_W = 38

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'formulario'
}

/** Genera el PDF "Formulario de Control de Proyecto" según la plantilla institucional. */
export async function exportProyectoControlFormularioPdf(
  proyectoId: string,
  numeroFormulario: string,
): Promise<void> {
  const numero = numeroFormulario.trim()
  if (!proyectoId || !numero) throw new Error('Faltan datos del formulario.')

  const [proyRes, itemsRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('descripcion, componente:componentes_programa(codigo, descripcion, programa:programas(codigo, descripcion))')
      .eq('id', proyectoId)
      .maybeSingle(),
    supabase
      .from('proyecto_control_formularios')
      .select('descripcion, cumple, no_cumple, no_aplica, observaciones, fecha, numero_formulario, created_at')
      .eq('proyecto_id', proyectoId)
      .eq('numero_formulario', numero)
      .order('created_at', { ascending: true }),
  ])

  if (proyRes.error) throw proyRes.error
  if (itemsRes.error) throw itemsRes.error
  if (!proyRes.data) throw new Error('Proyecto no encontrado.')

  const items = (itemsRes.data ?? []) as ControlItem[]
  if (!items.length) throw new Error('El formulario no tiene ítems para exportar.')

  const proyecto = proyRes.data as any
  const programa = proyecto.componente?.programa
  const programaLabel = [programa?.codigo, programa?.descripcion]
    .filter(Boolean)
    .join(' — ') || (programa?.descripcion ?? programa?.codigo ?? '')
  const proyectoLabel = (proyecto.descripcion ?? '').trim()
  const fecha = items.find(i => i.fecha)?.fecha ?? null

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text('Formulario de Control de Proyecto', pageW / 2, y, { align: 'center' })
  y += 10

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(9)

  const valueX = PDF_MARGIN_MM + META_LABEL_W
  const maxValueW = pageW - PDF_MARGIN_MM - valueX

  const meta: [string, string][] = [
    ['Nº de Formulario:', txtPdf(numero)],
    ['Fecha:', fmtDatePdf(fecha)],
    ['Programa:', txtPdf(programaLabel)],
    ['Proyecto:', txtPdf(proyectoLabel)],
  ]

  for (const [label, value] of meta) {
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.text(label, PDF_MARGIN_MM, y)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    const lines = doc.splitTextToSize(value, maxValueW) as string[]
    doc.text(lines, valueX, y)
    y += Math.max(5.5, lines.length * 4.2 + 1.5)
  }

  y += 4

  const body = items.map((it, idx) => [
    String(idx + 1),
    txtPdf(it.descripcion),
    pdfEstadoMarkCell(it.cumple ? 'cumple' : null),
    pdfEstadoMarkCell(it.no_cumple ? 'no_cumple' : null),
    pdfEstadoMarkCell(it.no_aplica ? 'no_aplica' : null),
    (it.observaciones ?? '').trim(),
  ])

  drawPdfTable(
    doc,
    layout,
    y,
    [[
      'Item Nº',
      'Descripción del Control',
      'Cumple',
      'No Cumple',
      'No Aplica',
      'Observaciones',
    ]],
    body,
    undefined,
    {
      0: { halign: 'center', cellWidth: 14 },
      1: { halign: 'left', cellWidth: 78 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'left' },
    },
    { fontSize: 8, headFontSize: 8, gapAfter: 6 },
  )

  const filename = `Formulario_Control_${slugify(numero)}_${fmtDatePdf(fecha).replace(/\//g, '-')}`
  pdfFinishAndSave(doc, layout, filename)
}
