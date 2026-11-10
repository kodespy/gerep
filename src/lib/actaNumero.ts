import { supabase } from './supabase'
import { isFcNumero } from './fcNumero'

/**
 * N° FC del proyecto: prioriza Informe Técnico, luego Formulario de Control,
 * luego Control de Desembolso (serie FC-YYYY-####).
 */
export async function resolveFormularioControlNumero(proyectoId: string): Promise<string> {
  if (!proyectoId) return ''
  const [inf, fc, des] = await Promise.all([
    supabase
      .from('proyecto_informes_tecnicos')
      .select('numero')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('proyecto_control_formularios')
      .select('numero_formulario')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('proyecto_control_desembolsos')
      .select('numero')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const pick = (values: (string | null | undefined)[]): string => {
    for (const v of values) {
      const n = String(v ?? '').trim().toUpperCase()
      if (isFcNumero(n)) return n
    }
    return ''
  }

  return (
    pick((inf.data ?? []).map(r => r.numero))
    || pick((fc.data ?? []).map(r => r.numero_formulario))
    || pick((des.data ?? []).map(r => r.numero))
    || ''
  )
}

function looksLikeYear(n: number, digits: string): boolean {
  return digits.length === 4 && n >= 1990 && n <= 2100
}

export type ActaTipo = 'ordinaria' | 'extraordinaria'

export const ACTA_TIPO_ORDINARIA: ActaTipo = 'ordinaria'
export const ACTA_TIPO_EXTRAORDINARIA: ActaTipo = 'extraordinaria'

export const ACTA_TIPO_OPTIONS = [
  { value: ACTA_TIPO_ORDINARIA, label: 'Ordinaria' },
  { value: ACTA_TIPO_EXTRAORDINARIA, label: 'Extraordinaria' },
]

export function normalizeActaTipo(value: unknown): ActaTipo {
  const s = String(value ?? '').trim().toLowerCase()
  if (s.startsWith('ext')) return ACTA_TIPO_EXTRAORDINARIA
  return ACTA_TIPO_ORDINARIA
}

export function isActaExtraordinaria(value: unknown): boolean {
  return parseActaNumero(value)?.tipo === ACTA_TIPO_EXTRAORDINARIA
    || normalizeActaTipo(value) === ACTA_TIPO_EXTRAORDINARIA
}

export function yearFromActaFecha(fecha: unknown, fallback = new Date().getFullYear()): number {
  const m = String(fecha ?? '').trim().match(/^(\d{4})/)
  if (m) {
    const y = Number(m[1])
    if (y >= 1990 && y <= 2100) return y
  }
  return Math.floor(fallback)
}

/** Ordinaria `001-2026` · Extraordinaria `001-E-2026`. */
export function formatActaNumero(
  secuencia: number,
  anio = new Date().getFullYear(),
  tipo: ActaTipo = ACTA_TIPO_ORDINARIA,
): string {
  const seq = String(Math.max(1, Math.floor(secuencia))).padStart(3, '0')
  const y = Math.floor(anio)
  if (normalizeActaTipo(tipo) === ACTA_TIPO_EXTRAORDINARIA) return `${seq}-E-${y}`
  return `${seq}-${y}`
}

export type ActaNumeroParsed = { anio: number; secuencia: number; tipo: ActaTipo }

/**
 * Ordinaria: `001-2026` o legado `2026-001`.
 * Extraordinaria: `001-E-2026` o `E-001-2026`.
 */
export function parseActaNumero(value: unknown): ActaNumeroParsed | null {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return null

  const extra = raw.match(/^(\d+)-E-(\d+)$/)
  if (extra) {
    const secuencia = Number(extra[1])
    const anio = Number(extra[2])
    if (!Number.isFinite(secuencia) || !Number.isFinite(anio)) return null
    if (!looksLikeYear(anio, extra[2])) return null
    return { secuencia, anio, tipo: ACTA_TIPO_EXTRAORDINARIA }
  }

  const extraAlt = raw.match(/^E-(\d+)-(\d+)$/)
  if (extraAlt) {
    const a = Number(extraAlt[1])
    const b = Number(extraAlt[2])
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    const aIsYear = looksLikeYear(a, extraAlt[1])
    const bIsYear = looksLikeYear(b, extraAlt[2])
    if (bIsYear && !aIsYear) return { secuencia: a, anio: b, tipo: ACTA_TIPO_EXTRAORDINARIA }
    if (aIsYear && !bIsYear) return { anio: a, secuencia: b, tipo: ACTA_TIPO_EXTRAORDINARIA }
    if (bIsYear) return { secuencia: a, anio: b, tipo: ACTA_TIPO_EXTRAORDINARIA }
    return null
  }

  const m = raw.match(/^(\d+)-(\d+)$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  const aIsYear = looksLikeYear(a, m[1])
  const bIsYear = looksLikeYear(b, m[2])

  // Actual: 001-2026
  if (bIsYear && !aIsYear) return { secuencia: a, anio: b, tipo: ACTA_TIPO_ORDINARIA }
  // Legado: 2026-001
  if (aIsYear && !bIsYear) return { anio: a, secuencia: b, tipo: ACTA_TIPO_ORDINARIA }
  // Ambiguo (p. ej. 2026-2026): priorizar formato actual (secuencia-año)
  if (bIsYear) return { secuencia: a, anio: b, tipo: ACTA_TIPO_ORDINARIA }
  return null
}

export function actaTipoFromNumero(value: unknown): ActaTipo {
  return parseActaNumero(value)?.tipo ?? ACTA_TIPO_ORDINARIA
}

/** Normaliza al formato de la serie. Vacío o inválido: null. */
export function normalizeActaNumero(value: unknown, tipo?: ActaTipo | null): string | null {
  const parsed = parseActaNumero(value)
  if (!parsed) return null
  const t = tipo ? normalizeActaTipo(tipo) : parsed.tipo
  return formatActaNumero(parsed.secuencia, parsed.anio, t)
}

/** Clave numérica: año, ordinarias antes que extraordinarias, luego secuencia. */
export function actaNumeroSortValue(value: unknown): number {
  const p = parseActaNumero(value)
  if (!p) return Number.NEGATIVE_INFINITY
  const tipoBoost = p.tipo === ACTA_TIPO_EXTRAORDINARIA ? 500_000 : 0
  return p.anio * 1_000_000 + tipoBoost + p.secuencia
}

/** Ascendente por N° de acta (año, luego secuencia). */
export function compareActaNumero(a: unknown, b: unknown): number {
  return actaNumeroSortValue(a) - actaNumeroSortValue(b)
}

/** Siguiente N° de la serie (ordinaria o extraordinaria) del año. */
export async function fetchNextActaNumero(
  anio = new Date().getFullYear(),
  tipo: ActaTipo = ACTA_TIPO_ORDINARIA,
): Promise<string> {
  const year = Math.floor(anio)
  const serie = normalizeActaTipo(tipo)
  const { data, error } = await supabase
    .from('actas')
    .select('numero')
    .or(`numero.ilike.%-${year},numero.ilike.${year}-%`)
    .limit(5000)
  if (error) throw new Error(error.message)

  let max = 0
  for (const row of data ?? []) {
    const parsed = parseActaNumero(row.numero)
    if (parsed && parsed.anio === year && parsed.tipo === serie && parsed.secuencia > max) {
      max = parsed.secuencia
    }
  }
  return formatActaNumero(max + 1, year, serie)
}
