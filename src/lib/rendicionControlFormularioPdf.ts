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

type PredefRow = {
  orden: number | null
  nombre: string | null
  descripcion: string | null
  doc_sustancial?: boolean | null
}

const META_LABEL_W = 42

function foldKey(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function predefKeys(p: PredefRow): string[] {
  const label = (p.nombre ?? '').trim() || (p.descripcion ?? '').trim()
  return [p.nombre, p.descripcion, label].map(foldKey).filter(Boolean)
}

function formatPrograma(programa: { codigo?: string | null; descripcion?: string | null } | null | undefined): string {
  if (!programa) return ''
  const desc = (programa.descripcion ?? '').trim()
  const codigo = (programa.codigo ?? '').trim()
  if (desc && codigo) return `${desc} (Cod. SNIP ${codigo})`
  return desc || codigo
}

function formatExpStr(strNumero: string | null | undefined, expNumero: string | null | undefined): string {
  const str = (strNumero ?? '').trim()
  const exp = (expNumero ?? '').trim()
  const parts: string[] = []
  if (str) parts.push(`STR: ${str}`)
  if (exp) parts.push(`Exp: ${exp}`)
  return parts.join(' - ')
}

async function fetchPredefs(): Promise<PredefRow[]> {
  const withFlag = await supabase
    .from('rendiciones_cuentas_items_predeterminados')
    .select('orden, nombre, descripcion, doc_sustancial')
    .eq('activo', true)
    .order('orden', { ascending: true })
  if (!withFlag.error) return (withFlag.data ?? []) as PredefRow[]
  const msg = withFlag.error.message || ''
  if (!/doc_sustancial|column/i.test(msg)) throw withFlag.error
  const fallback = await supabase
    .from('rendiciones_cuentas_items_predeterminados')
    .select('orden, nombre, descripcion')
    .eq('activo', true)
    .order('orden', { ascending: true })
  if (fallback.error) throw fallback.error
  return (fallback.data ?? []) as PredefRow[]
}

/** Genera el PDF "Formulario de Rendición de Cuentas" según la plantilla institucional. */
export async function exportRendicionControlFormularioPdf(
  rendicionId: string,
  numeroFormulario: string,
  opts?: { soloSustanciales?: boolean },
): Promise<void> {
  const numero = numeroFormulario.trim()
  const soloSustanciales = Boolean(opts?.soloSustanciales)
  if (!rendicionId || !numero) throw new Error('Faltan datos del formulario.')

  const [rendRes, itemsRes, predefs] = await Promise.all([
    supabase
      .from('rendiciones_cuentas')
      .select(`
        id,
        expediente:expedientes(numero_expediente),
        str:strs(
          numero,
          proyecto:proyectos(
            descripcion,
            componente:componentes_programa(
              codigo, descripcion,
              programa:programas(codigo, descripcion)
            )
          )
        )
      `)
      .eq('id', rendicionId)
      .maybeSingle(),
    supabase
      .from('rendicion_control_formularios')
      .select('descripcion, cumple, no_cumple, no_aplica, observaciones, fecha, numero_formulario, created_at')
      .eq('rendicion_id', rendicionId)
      .eq('numero_formulario', numero)
      .order('created_at', { ascending: true }),
    fetchPredefs(),
  ])

  if (rendRes.error) throw rendRes.error
  if (itemsRes.error) throw itemsRes.error
  if (!rendRes.data) throw new Error('Rendición no encontrada.')

  const ordenIdx = new Map<string, number>()
  const sustancialKeys = new Set<string>()
  for (const p of predefs) {
    const orden = Number(p.orden)
    const keys = predefKeys(p)
    if (Number.isFinite(orden)) {
      for (const k of keys) {
        if (!ordenIdx.has(k)) ordenIdx.set(k, orden)
      }
    }
    if (p.doc_sustancial) {
      for (const k of keys) sustancialKeys.add(k)
    }
  }

  let items = [...((itemsRes.data ?? []) as ControlItem[])].sort((a, b) => {
    const oa = ordenIdx.get(foldKey(a.descripcion))
    const ob = ordenIdx.get(foldKey(b.descripcion))
    if (oa != null && ob != null && oa !== ob) return oa - ob
    if (oa != null && ob == null) return -1
    if (oa == null && ob != null) return 1
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
  if (soloSustanciales) {
    items = items.filter(it => sustancialKeys.has(foldKey(it.descripcion)))
    if (!items.length) {
      throw new Error('No hay documentos sustanciales en este formulario. Márquelos en Sistema → Control de rendiciones de cuentas.')
    }
  } else if (!items.length) {
    throw new Error('El formulario no tiene ítems para exportar.')
  }

  const rend = rendRes.data as any
  const str = rend.str
  const proyecto = str?.proyecto
  const programa = proyecto?.componente?.programa
  const programaLabel = formatPrograma(programa)
  const proyNombre = (proyecto?.descripcion ?? '').trim()
  const compNombre = (
    proyecto?.componente?.descripcion ?? proyecto?.componente?.codigo ?? ''
  ).trim()
  const proyectoLabel = (compNombre ? `${proyNombre} - ${compNombre}` : proyNombre).toUpperCase()
  const expStrLabel = formatExpStr(str?.numero, rend.expediente?.numero_expediente)
  const fecha = items.find(i => i.fecha)?.fecha ?? null

  const doc = createPdfDoc()
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text('Formulario de Rendición de Cuentas', pageW / 2, y, { align: 'center' })
  y += 10

  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(9)

  const valueX = PDF_MARGIN_MM + META_LABEL_W
  const maxValueW = pageW - PDF_MARGIN_MM - valueX

  const meta: [string, string][] = [
    ['N° de Formulario:', txtPdf(numero)],
    ['Fecha:', fmtDatePdf(fecha)],
    ['Rendición (Exp/STR):', txtPdf(expStrLabel)],
    ['Programa:', txtPdf(programaLabel)],
    ['Proyecto:', txtPdf(proyectoLabel)],
  ]

  for (const [label, value] of meta) {
    doc.setFont(PDF_TABLE_FONT, 'bold')
    doc.text(label, PDF_MARGIN_MM, y)
    doc.setFont(PDF_TABLE_FONT, 'normal')
    const lines = doc.splitTextToSize(value || '—', maxValueW) as string[]
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
      'Item\nN°',
      'Descripción del Control',
      'Cumple',
      'No\nCumple',
      'No\nAplica',
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

  const slug = numero.replace(/[^\w.-]+/g, '_')
  const filename = soloSustanciales
    ? `Control_Rendicion_${slug}_Sustanciales`
    : `Control_Rendicion_${slug}`
  pdfFinishAndSave(doc, layout, filename)
}
