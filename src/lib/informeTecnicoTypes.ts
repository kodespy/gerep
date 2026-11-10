/** Tipos y plantillas del Informe Técnico de Verificación · Gestión Operacional. */

export type EstadoVerif =
  | 'cumple'
  | 'no_cumple'
  | 'requiere_autorizacion'
  | 'no_aplica'
  | ''

export type ItemVerif = {
  id: string
  aspecto: string
  estado: EstadoVerif
  observaciones: string
  /** Base normativa / referencia (Anexo, Art., etc.). */
  referencia?: string
  /** Detalle descriptivo del requisito. */
  detalle?: string
}

export type OfertaCol = { id: string; nombre: string }
export type OfertaFila = { id: string; concepto: string; montos: Record<string, string> }

export type VerifFinanciera = {
  notas: string
  oferentes: OfertaCol[]
  filas: OfertaFila[]
  analisis: ItemVerif[]
}

export type InformeTecnicoDraft = {
  id?: string
  numero: string
  entidad_proponente: string
  monto_solicitado: string
  /** Objetos de gasto seleccionados desde el catálogo. */
  objetos_gasto: ObjetoGastoRef[]
  marco_normativo: string
  fecha_verificacion: string
  verificado_por: string
  /** Activa anexos de infraestructura (llamado + adjudicado). */
  es_infraestructura: boolean
  verificacion_documental: ItemVerif[]
  verificacion_infra_llamado: ItemVerif[]
  verificacion_infra_adjudicado: ItemVerif[]
  verificacion_financiera: VerifFinanciera
  verificacion_tiempo: ItemVerif[]
  otros_aspectos: ItemVerif[]
  conclusion: string
  recomendacion: string
  resultado_verificacion: string
  archivo_firmado?: string | null
}

export type ObjetoGastoRef = {
  id: string
  codigo: string
  descripcion: string
}

export function formatObjetosGasto(items: ObjetoGastoRef[]): string {
  return items
    .map(o => [o.codigo, o.descripcion].filter(Boolean).join(' — '))
    .filter(Boolean)
    .join('; ')
}

/** Lee `objeto_gasto` (text/json) desde BD hacia lista estructurada. */
export function parseObjetosGasto(raw: unknown): ObjetoGastoRef[] {
  if (raw == null) return []
  let value = raw
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    try {
      value = JSON.parse(s)
    } catch {
      // Texto legado: "100 — Desc; 200 — Desc"
      return s.split(/[;\n]+/).map((part, i) => {
        const t = part.trim()
        if (!t) return null
        const m = t.match(/^(\S+)\s*[—\-–]\s*(.*)$/)
        return {
          id: `legacy-${i}`,
          codigo: m ? m[1] : t,
          descripcion: m ? m[2] : '',
        } satisfies ObjetoGastoRef
      }).filter(Boolean) as ObjetoGastoRef[]
    }
  }
  if (!Array.isArray(value)) return []
  return value.map((item, i) => {
    if (typeof item === 'string') {
      const t = item.trim()
      return { id: `legacy-${i}`, codigo: t, descripcion: '' }
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      return {
        id: String(o.id ?? `og-${i}`),
        codigo: String(o.codigo ?? ''),
        descripcion: String(o.descripcion ?? ''),
      }
    }
    return { id: `og-${i}`, codigo: String(item ?? ''), descripcion: '' }
  }).filter(o => o.codigo || o.descripcion)
}

export const ESTADO_OPTIONS: { value: EstadoVerif; label: string; tone: string }[] = [
  { value: 'cumple', label: 'Cumple', tone: 'emerald' },
  { value: 'no_cumple', label: 'No cumple', tone: 'rose' },
  { value: 'requiere_autorizacion', label: 'Requiere autorización', tone: 'violet' },
  { value: 'no_aplica', label: 'No aplica', tone: 'slate' },
]

export const ESTADO_MARK: Record<Exclude<EstadoVerif, ''>, string> = {
  cumple: '✓ Cumple',
  no_cumple: '✗ No cumple',
  requiere_autorizacion: '◉ Requiere autorización',
  no_aplica: '— No aplica',
}

/** Colores e íconos para PDF (RGB). */
export const ESTADO_PDF: Record<Exclude<EstadoVerif, ''>, {
  label: string
  symbol: string
  rgb: [number, number, number]
}> = {
  cumple: { label: 'Cumple', symbol: '✓', rgb: [5, 150, 105] },
  no_cumple: { label: 'No cumple', symbol: '✗', rgb: [225, 29, 72] },
  requiere_autorizacion: { label: 'Requiere autorización', symbol: '◉', rgb: [124, 58, 237] },
  no_aplica: { label: 'No aplica', symbol: '—', rgb: [100, 116, 139] },
}

export function isTotalFila(concepto: string): boolean {
  return /^TOTAL\b/i.test(String(concepto ?? '').trim())
}

export function parseMontoOferta(v: string): number | null {
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Suma por oferente excluyendo filas de TOTAL manuales. */
export function calcOfertaTotales(fin: VerifFinanciera): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const o of fin.oferentes) totals[o.id] = 0
  for (const f of fin.filas) {
    if (isTotalFila(f.concepto)) continue
    for (const o of fin.oferentes) {
      const n = parseMontoOferta(f.montos[o.id] ?? '')
      if (n != null) totals[o.id] += n
    }
  }
  return totals
}

/** Filas editables (sin TOTAL). */
export function filasConcepto(fin: VerifFinanciera): OfertaFila[] {
  return fin.filas.filter(f => !isTotalFila(f.concepto))
}

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function newItem(aspecto: string, estado: EstadoVerif = '', extra?: { referencia?: string; detalle?: string }): ItemVerif {
  return {
    id: nid('it'),
    aspecto,
    estado,
    observaciones: '',
    referencia: extra?.referencia,
    detalle: extra?.detalle,
  }
}

export function defaultDocumental(): ItemVerif[] {
  return [
    newItem('Nota de Presentación (Anexo I)'),
    newItem('Ficha Técnica (Anexo II)'),
    newItem('Formularios Presupuestarios'),
    newItem('Certificado de Disponibilidad Presupuestaria'),
    newItem('Documentación Legal de Oferentes'),
    newItem('Declaraciones Juradas'),
    newItem('Acta de Comisión Directiva'),
  ]
}

/** Anexo infraestructura · 1. Verificación documental del proceso de llamado. */
export function defaultInfraLlamado(): ItemVerif[] {
  return [
    newItem('Pliego de Bases y Condiciones / Términos de Referencia', '', {
      referencia: 'Anexo XI, ítem 4',
      detalle: 'Especificaciones de la convocatoria.',
    }),
    newItem('Publicación / Invitación a Oferentes', '', {
      referencia: 'Art. 8°, inc. B',
      detalle: 'Constancia de convocatoria al proceso competitivo.',
    }),
    newItem('Cuadro Comparativo de Ofertas', '', {
      referencia: 'Anexo VII',
      detalle: 'Detalle de los tres (3) presupuestos obtenidos.',
    }),
    newItem('Informe de Evaluación y Adjudicación', '', {
      referencia: 'Anexo XI, ítem 4',
      detalle: 'Documento que justifica la selección de la oferta.',
    }),
    newItem('Borrador de Contrato', '', {
      referencia: 'Anexo XI, ítem 6',
      detalle: 'Entre la entidad y la empresa/proveedor adjudicado.',
    }),
    newItem('Antecedentes Documentales', '', {
      referencia: 'Art. 8°, inc. D',
      detalle: 'En caso de aplicar Ley 7021/2022 (procedimiento supletorio).',
    }),
    newItem('Presupuesto Detallado', '', {
      referencia: 'Art. 8°, in fine / Anexo XIX, A',
      detalle: 'Debe incluir cantidades, precios unitarios, totales, IVA, RUC y firma del oferente.',
    }),
    newItem('Vigencia de la Oferta', '', {
      referencia: 'Art. 8°, in fine / Anexo XIX, A',
      detalle: 'El presupuesto debe tener una validez mínima de treinta (30) días.',
    }),
    newItem('Actividad Económica', '', {
      referencia: 'Art. 8°, in fine / Anexo XIX, A',
      detalle: 'Verificación de que el rubro del RUC esté relacionado con el bien o servicio ofertado.',
    }),
    newItem('Declaración Jurada de mantenimiento de oferta y/o cumplimiento de contrato', '', {
      referencia: 'Anexo XIX, Sección A',
      detalle: 'Compromiso del oferente respecto al mantenimiento de la oferta y/o cumplimiento contractual.',
    }),
  ]
}

/** Anexo infraestructura · 2. Verificación documental del adjudicado. */
export function defaultInfraAdjudicado(): ItemVerif[] {
  return [
    newItem('Pedido inicial'),
    newItem('PBC - Pliego de Bases y Condiciones'),
    newItem('Informe de Evaluación'),
  ]
}

/** Alinea ítems guardados al catálogo vigente (conserva estado si el aspecto coincide). */
export function syncInfraAdjudicado(saved: ItemVerif[] | null | undefined): ItemVerif[] {
  const defaults = defaultInfraAdjudicado()
  const byAspecto = new Map((saved ?? []).map(i => [i.aspecto, i]))
  return defaults.map(d => {
    const prev = byAspecto.get(d.aspecto)
    if (!prev) return d
    return {
      ...d,
      id: prev.id || d.id,
      estado: prev.estado ?? '',
      observaciones: prev.observaciones ?? '',
    }
  })
}

/** Detecta si el proyecto parece de infraestructura (programa/componente/actividad/descripcion). */
export function detectEsInfraestructura(...texts: Array<string | null | undefined>): boolean {
  return texts.some(t => /infraestructura|infraestruct/i.test(String(t ?? '')))
}

export function defaultAnalisisFinanciero(): ItemVerif[] {
  return [
    newItem('Cantidad de presupuestos'),
    newItem('Oferta económicamente más conveniente'),
    newItem('Criterio de selección'),
    newItem('Imputación presupuestaria'),
  ]
}

export function defaultTiempo(): ItemVerif[] {
  return [
    newItem('Fecha de presentación'),
    newItem('Presentación dentro del plazo mensual'),
    newItem('Antelación mínima de 30 días hábiles'),
    newItem('Aplicación de excepción (Art. 28°)'),
  ]
}

export function defaultOtros(): ItemVerif[] {
  return [
    newItem('Visibilidad Institucional (Art. 17°)'),
    newItem('Rendición de Cuentas (Art. 23°)'),
    newItem('Vigencia de las ofertas'),
  ]
}

export function defaultFinanciera(): VerifFinanciera {
  const a = { id: nid('of'), nombre: 'Oferente A' }
  const b = { id: nid('of'), nombre: 'Oferente B' }
  const c = { id: nid('of'), nombre: 'Oferente C' }
  const mk = (concepto: string): OfertaFila => ({
    id: nid('fl'),
    concepto,
    montos: { [a.id]: '', [b.id]: '', [c.id]: '' },
  })
  return {
    notas: '',
    oferentes: [a, b, c],
    filas: [mk('Concepto 1'), mk('Concepto 2')],
    analisis: defaultAnalisisFinanciero(),
  }
}

export function emptyInformeDraft(partial?: Partial<InformeTecnicoDraft>): InformeTecnicoDraft {
  return {
    numero: '',
    entidad_proponente: '',
    monto_solicitado: '',
    objetos_gasto: [],
    marco_normativo: 'Resolución SND N.º 227/2026',
    fecha_verificacion: '',
    verificado_por: '',
    es_infraestructura: false,
    verificacion_documental: defaultDocumental(),
    verificacion_infra_llamado: defaultInfraLlamado(),
    verificacion_infra_adjudicado: defaultInfraAdjudicado(),
    verificacion_financiera: defaultFinanciera(),
    verificacion_tiempo: defaultTiempo(),
    otros_aspectos: defaultOtros(),
    conclusion: '',
    recomendacion: '',
    resultado_verificacion: '',
    archivo_firmado: null,
    ...partial,
  }
}

export function suggestNumeroInforme(existing: string[]): string {
  const year = new Date().getFullYear()
  const prefix = `FC-${year}-`
  let max = 0
  for (const n of existing) {
    const m = String(n).trim().toUpperCase().match(/^FC-(\d{4})-(\d{4})$/)
    if (!m) continue
    if (Number(m[1]) !== year) continue
    max = Math.max(max, Number(m[2]) || 0)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function completionStats(d: InformeTecnicoDraft) {
  const items = [
    ...d.verificacion_documental,
    ...(d.es_infraestructura ? d.verificacion_infra_llamado : []),
    ...(d.es_infraestructura ? d.verificacion_infra_adjudicado : []),
    ...d.verificacion_financiera.analisis,
    ...d.verificacion_tiempo,
    ...d.otros_aspectos,
  ]
  const total = items.length
  const done = items.filter(i => i.estado).length
  const cumple = items.filter(i => i.estado === 'cumple').length
  const noCumple = items.filter(i => i.estado === 'no_cumple').length
  const atencion = items.filter(i => i.estado === 'requiere_autorizacion').length
  const noAplica = items.filter(i => i.estado === 'no_aplica').length
  const pct = total ? Math.round((done / total) * 100) : 0
  return { total, done, cumple, noCumple, atencion, noAplica, pct }
}

export const STEPS_BASE = [
  { id: 'datos', label: 'Datos generales', hint: 'Identificación del proyecto' },
  { id: 'documental', label: 'Documental', hint: 'Art. 7° · Resolución 227/2026' },
  { id: 'infra_llamado', label: 'Infra · Llamado', hint: 'Proceso de llamado · Anexo XIX' },
  { id: 'infra_adjudicado', label: 'Infra · Adjudicado', hint: 'Documentación del adjudicado' },
  { id: 'financiera', label: 'Financiera', hint: 'Art. 8° · Ofertas y análisis' },
  { id: 'tiempo', label: 'Tiempo y forma', hint: 'Plazos y excepciones' },
  { id: 'otros', label: 'Otros aspectos', hint: 'Visibilidad y rendición' },
  { id: 'cierre', label: 'Conclusión', hint: 'Dictamen y recomendación' },
] as const

export type StepId = typeof STEPS_BASE[number]['id']

export function stepsForDraft(esInfra: boolean) {
  if (esInfra) return [...STEPS_BASE]
  return STEPS_BASE.filter(s => s.id !== 'infra_llamado' && s.id !== 'infra_adjudicado')
}

/** @deprecated usar stepsForDraft */
export const STEPS = STEPS_BASE.filter(s => s.id !== 'infra_llamado' && s.id !== 'infra_adjudicado')
