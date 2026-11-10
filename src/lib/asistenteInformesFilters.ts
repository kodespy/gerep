/** Filtros tipo JOIN / WHERE interpretados desde lenguaje natural. */

export type RowFilterOp = 'eq' | 'contains' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy'

export type RowFilter = {
  /** Clave del objeto fila (ej. alerta, fechaPresentacion, estado). */
  field: string
  op: RowFilterOp
  value?: string | number | boolean | null
  /** Texto para explicar al usuario. */
  label: string
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Campos conocidos por informe (alias NL → field). */
const FIELD_ALIASES: { re: RegExp; field: string; reports?: string[] }[] = [
  { re: /\b(alerta|estado\s+de\s+alerta|situacion\s+de\s+rendicion)\b/, field: 'alerta', reports: ['radar_rendiciones'] },
  // “fecha de presentación esté atrasada” → en Radar es la alerta de presentación
  { re: /\b(fecha\s+(de\s+)?presentacion|presentacion|presentada)\b/, field: 'alerta', reports: ['radar_rendiciones'] },
  { re: /\b(dias?\s+de\s+atraso|dias?\s+atraso|atraso)\b/, field: 'diasAtraso', reports: ['radar_rendiciones'] },
  { re: /\b(vencid\w*|sin\s+presentar|vencido\s+sin\s+presentar)\b/, field: 'vencidoSinPresentar', reports: ['radar_rendiciones'] },
  { re: /\b(fecha\s+limite|limite\s+a\s+rendir)\b/, field: 'fechaLimite', reports: ['radar_rendiciones'] },
  { re: /\b(fecha\s+desembolso|desembolso)\b/, field: 'fechaDesembolso', reports: ['radar_rendiciones', 'strs'] },
  { re: /\b(estado)\b/, field: 'estado' },
  { re: /\b(proyecto|descripcion\s+del\s+proyecto)\b/, field: 'proyecto' },
  { re: /\b(str|nro\s+str|numero\s+str)\b/, field: 'str', reports: ['radar_rendiciones'] },
  { re: /\b(avance|avance\s*%|porcentaje)\b/, field: 'avancePct', reports: ['cartera_360'] },
  { re: /\b(saldo)\b/, field: 'saldo', reports: ['cartera_360'] },
]

function parseAlertaValue(raw: string): string | null {
  const t = norm(raw)
  if (/^atrasad/.test(t)) return 'Atrasada'
  if (/^presentad/.test(t)) return 'Presentada'
  if (/^pendiente/.test(t)) return 'Pendiente'
  if (/^(al\s*dia|ok|en\s*dia)/.test(t)) return 'Al día'
  if (/sin\s*rendicion/.test(t)) return 'Sin rendición'
  if (/sin\s*registro/.test(t)) return 'Sin registro'
  return raw.trim() || null
}

/**
 * Extrae condiciones WHERE desde frases como:
 * - "que la fecha de presentación esté Atrasada"
 * - "donde alerta sea Presentada"
 * - "solo atrasadas"
 * - "con días de atraso mayor a 30"
 */
export function detectWhereFilters(text: string, reportId?: string | null): RowFilter[] {
  const raw = String(text ?? '')
  const t = norm(raw)
  const out: RowFilter[] = []
  const push = (f: RowFilter) => {
    if (out.some(x => x.field === f.field && x.op === f.op && String(x.value) === String(f.value))) return
    out.push(f)
  }

  // Atajos por informe Radar
  if (!reportId || reportId === 'radar_rendiciones') {
    if (/\b(solo\s+)?atrasad\w*\b/.test(t) || /\bfecha\s+(de\s+)?presentacion\s+(est[eé]|sea|es|igual\s+a|=)?\s*atrasad/.test(t)) {
      push({ field: 'alerta', op: 'eq', value: 'Atrasada', label: 'alerta = Atrasada' })
    } else if (/\b(solo\s+)?presentad\w*\b/.test(t) && !/\batrasad/.test(t)) {
      push({ field: 'alerta', op: 'eq', value: 'Presentada', label: 'alerta = Presentada' })
    } else if (/\b(solo\s+)?pendiente\w*\b/.test(t) && !/\batrasad/.test(t)) {
      push({ field: 'alerta', op: 'eq', value: 'Pendiente', label: 'alerta = Pendiente' })
    }
    if (/\b(vencid\w*\s+sin\s+presentar|sin\s+presentar|vencidas?\b)/.test(t)) {
      push({ field: 'vencidoSinPresentar', op: 'truthy', value: true, label: 'vencido sin presentar' })
    }
    const dias = t.match(/\bdias?\s+(de\s+)?atraso\s+(mayor\s+a|>=|>|mas\s+de)\s*(\d+)/)
    if (dias) {
      push({ field: 'diasAtraso', op: 'gt', value: Number(dias[3]), label: `días atraso > ${dias[3]}` })
    }
  }

  // Patrón genérico: que/donde <campo> sea/esté <valor>
  const re =
    /\b(?:que|donde|con|filtr(?:ar|e)?(?:\s+por)?|solo(?:\s+las?|\s+los?)?)\s+(?:la\s+|el\s+|las\s+|los\s+)?(.+?)\s+(?:est[eé]|sea|es|igual\s+a|=|==)\s+["“']?([^"'“”,.]+?)["”']?(?=\s+(?:en\s+)?(?:pdf|excel|word)\b|[.,]|$)/i
  // Fallback without trailing format
  const re2 =
    /\b(?:que|donde|con)\s+(?:la\s+|el\s+)?([^,]+?)\s+(?:est[eé]|sea|es|=)\s+["“']?([^"'“”,.]+?)["”']?\s*$/i

  let m = raw.match(re) || raw.match(re2)
  // Variante: "que la fecha de presentación este Atrasada"
  if (!m) {
    m = raw.match(
      /\b(?:que|donde)\s+(?:la\s+|el\s+)?(fecha\s+(?:de\s+)?presentaci[oó]n|alerta|estado|proyecto|avance|saldo)\s+(?:est[eé]|sea|es|=)\s+(\S+)/i,
    )
  }
  if (m) {
    const fieldNl = norm(m[1])
    const valueRaw = m[2].trim()
    let field = 'alerta'
    for (const a of FIELD_ALIASES) {
      if (a.re.test(fieldNl) && (!a.reports || !reportId || a.reports.includes(reportId))) {
        field = a.field
        break
      }
    }
    if (field === 'alerta' || fieldNl.includes('presentacion') || fieldNl.includes('alerta')) {
      const v = parseAlertaValue(valueRaw)
      if (v) push({ field: 'alerta', op: 'eq', value: v, label: `alerta = ${v}` })
    } else if (field === 'vencidoSinPresentar') {
      push({ field: 'vencidoSinPresentar', op: 'truthy', value: true, label: 'vencido sin presentar' })
    } else if (field === 'diasAtraso') {
      const n = Number(String(valueRaw).replace(/\D/g, ''))
      if (Number.isFinite(n)) push({ field: 'diasAtraso', op: 'gte', value: n, label: `días atraso ≥ ${n}` })
    } else if (field === 'avancePct' || field === 'saldo') {
      const n = Number(String(valueRaw).replace(/[^\d.-]/g, ''))
      if (Number.isFinite(n)) {
        const op: RowFilterOp = /mayor|mas de|>/.test(fieldNl) ? 'gt' : /menor|</.test(fieldNl) ? 'lt' : 'eq'
        push({ field, op, value: n, label: `${field} ${op} ${n}` })
      }
    } else {
      push({ field, op: 'contains', value: valueRaw, label: `${field} contiene “${valueRaw}”` })
    }
  }

  return out
}

function cellValue(row: Record<string, unknown>, field: string): unknown {
  if (field.includes('.')) {
    return field.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row)
  }
  return row[field]
}

export function rowMatchesFilters(row: Record<string, unknown>, filters: RowFilter[]): boolean {
  if (!filters.length) return true
  for (const f of filters) {
    const v = cellValue(row, f.field)
    const op = f.op
    if (op === 'truthy') {
      if (!v) return false
      continue
    }
    if (op === 'falsy') {
      if (v) return false
      continue
    }
    if (v == null || v === '—') {
      if (op === 'neq') continue
      return false
    }
    if (op === 'eq') {
      if (norm(String(v)) !== norm(String(f.value ?? ''))) return false
      continue
    }
    if (op === 'neq') {
      if (norm(String(v)) === norm(String(f.value ?? ''))) return false
      continue
    }
    if (op === 'contains') {
      if (!norm(String(v)).includes(norm(String(f.value ?? '')))) return false
      continue
    }
    const num = Number(v)
    const target = Number(f.value)
    if (!Number.isFinite(num) || !Number.isFinite(target)) return false
    if (op === 'gt' && !(num > target)) return false
    if (op === 'gte' && !(num >= target)) return false
    if (op === 'lt' && !(num < target)) return false
    if (op === 'lte' && !(num <= target)) return false
  }
  return true
}

export function applyRowFilters<T extends Record<string, unknown>>(rows: T[], filters: RowFilter[] | null | undefined): T[] {
  if (!filters?.length) return rows
  return rows.filter(r => rowMatchesFilters(r, filters))
}

export function describeWhere(filters: RowFilter[] | null | undefined): string {
  if (!filters?.length) return ''
  return filters.map(f => f.label).join(' · ')
}
