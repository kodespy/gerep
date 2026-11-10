import { supabase } from './supabase'
import { supabaseFetchAll } from './supabaseFetchAll'

/** Formato estándar: RC-2026-0007 */
export function formatRendicionControlNumero(secuencia: number, anio = new Date().getFullYear()): string {
  const seq = Math.max(1, Math.floor(secuencia))
  const year = Math.floor(anio)
  return `RC-${year}-${String(seq).padStart(4, '0')}`
}

function looksLikeYear(n: number, digits: string): boolean {
  return digits.length === 4 && n >= 1990 && n <= 2100
}

/**
 * Acepta RC-2026-0007, RC-2026-7, RC-0007-2026 y variantes con espacio o barra.
 */
export function parseRendicionControlNumero(value: unknown): { secuencia: number; anio: number } | null {
  const raw = String(value ?? '').trim().toUpperCase()
  const m = raw.match(/^RC[\s.\-\/_]*(\d+)[\s.\-\/_]+(\d+)$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const aYear = looksLikeYear(a, m[1])
  const bYear = looksLikeYear(b, m[2])
  if (aYear && !bYear) return { anio: a, secuencia: b }
  if (bYear && !aYear) return { anio: b, secuencia: a }
  if (aYear) return { anio: a, secuencia: b }
  return null
}

export function normalizeRendicionControlNumero(value: unknown): string | null {
  const p = parseRendicionControlNumero(value)
  return p ? formatRendicionControlNumero(p.secuencia, p.anio) : null
}

function maxSeqForYear(values: unknown[], anio: number): number {
  let max = 0
  for (const v of values) {
    const p = parseRendicionControlNumero(v)
    if (p && p.anio === anio && p.secuencia > max) max = p.secuencia
  }
  return max
}

/**
 * Siguiente número de Formulario de Control de Rendición (global del año).
 * Recorre todas las filas (cada formulario guarda un ítem por fila).
 */
export async function fetchNextRendicionControlNumero(
  anio = new Date().getFullYear(),
): Promise<string> {
  const year = Math.floor(anio)
  const { data, error } = await supabaseFetchAll<{ numero_formulario: string | null }>(
    () => supabase.from('rendicion_control_formularios').select('numero_formulario'),
    50_000,
  )
  if (error) throw new Error(error.message)
  const maxSeq = maxSeqForYear((data ?? []).map(r => r.numero_formulario), year)
  return formatRendicionControlNumero(maxSeq + 1, year)
}

/** True si el número ya existe en cualquier rendición (opcionalmente excluyendo uno al editar). */
export async function rendicionControlNumeroExists(
  numero: string,
  excludeNumero?: string | null,
): Promise<boolean> {
  const num = normalizeRendicionControlNumero(numero) ?? numero.trim().toUpperCase()
  if (!num) return false
  const exclude = normalizeRendicionControlNumero(excludeNumero) ?? (excludeNumero ?? '').trim().toUpperCase()
  if (exclude && num === exclude) return false

  const { data, error } = await supabaseFetchAll<{ numero_formulario: string | null }>(
    () => supabase.from('rendicion_control_formularios').select('numero_formulario'),
    50_000,
  )
  if (error) throw new Error(error.message)
  return (data ?? []).some(r => {
    const existing = normalizeRendicionControlNumero(r.numero_formulario)
      ?? String(r.numero_formulario ?? '').trim().toUpperCase()
    return existing === num
  })
}
