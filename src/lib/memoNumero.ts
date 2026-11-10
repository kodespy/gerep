import { supabase } from './supabase'

/** Formato institucional: 001/2026 */
export function formatMemoNumero(secuencia: number, anio = new Date().getFullYear()): string {
  const seq = Math.max(1, Math.floor(secuencia))
  return `${String(seq).padStart(3, '0')}/${Math.floor(anio)}`
}

export function parseMemoNumero(value: unknown): { secuencia: number; anio: number } | null {
  const m = String(value ?? '').trim().match(/^(\d+)\s*\/\s*(\d{4})$/)
  if (!m) return null
  const secuencia = Number(m[1])
  const anio = Number(m[2])
  if (!Number.isFinite(secuencia) || !Number.isFinite(anio)) return null
  return { secuencia, anio }
}

export function yearFromMemoFecha(fecha: unknown, fallback = new Date().getFullYear()): number {
  const m = String(fecha ?? '').trim().match(/^(\d{4})/)
  if (m) {
    const y = Number(m[1])
    if (y >= 1990 && y <= 2100) return y
  }
  return Math.floor(fallback)
}

export function displayMemoNumero(value: unknown): string {
  const p = parseMemoNumero(value)
  if (p) return formatMemoNumero(p.secuencia, p.anio)
  const raw = String(value ?? '').trim()
  return raw || '—'
}

/** Normaliza 1/2026 → 001/2026. Vacío o inválido: null. */
export function normalizeMemoNumero(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const p = parseMemoNumero(raw)
  return p ? formatMemoNumero(p.secuencia, p.anio) : null
}

export function memoNumeroSortValue(value: unknown): number {
  const p = parseMemoNumero(value)
  if (!p) return Number.NEGATIVE_INFINITY
  return p.anio * 1_000_000 + p.secuencia
}

export function compareMemoNumero(a: unknown, b: unknown): number {
  return memoNumeroSortValue(a) - memoNumeroSortValue(b)
}

export function memoTitulo(numero: string | null | undefined): string {
  const n = String(numero ?? '').trim()
  return n ? `MEMORÁNDUM UEP N° ${n}` : 'MEMORÁNDUM UEP'
}

/** Siguiente N° de memo del año: 001/2026, 002/2026… */
export async function fetchNextMemoNumero(anio = new Date().getFullYear()): Promise<string> {
  const year = Math.floor(anio)
  const { data, error } = await supabase
    .from('memos')
    .select('numero')
    .ilike('numero', `%/${year}`)
    .limit(5000)
  if (error) throw new Error(error.message)

  let max = 0
  for (const row of data ?? []) {
    const parsed = parseMemoNumero(row.numero)
    if (parsed && parsed.anio === year && parsed.secuencia > max) max = parsed.secuencia
  }
  return formatMemoNumero(max + 1, year)
}
