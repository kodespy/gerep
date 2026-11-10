import { supabase } from './supabase'

const EXPEDIENTE_NUMERO_RE = /^(\d+)-(\d{4})$/

/** Formato estándar: 0099-2026 */
export function formatExpedienteNumero(secuencia: number, anio: number): string {
  const seq = Math.max(1, Math.floor(secuencia))
  const year = Math.floor(anio)
  return `${String(seq).padStart(4, '0')}-${year}`
}

/** Parsea NNNN-AAAA; devuelve null si no coincide. */
export function parseExpedienteNumero(value: unknown): { secuencia: number; anio: number } | null {
  const m = String(value ?? '').trim().match(EXPEDIENTE_NUMERO_RE)
  if (!m) return null
  return { secuencia: Number(m[1]), anio: Number(m[2]) }
}

/** Siguiente número de expediente para el año (secuencia anual + 1). */
export async function fetchNextExpedienteNumero(anio = new Date().getFullYear()): Promise<string> {
  const { data, error } = await supabase
    .from('expedientes')
    .select('numero_expediente')
    .ilike('numero_expediente', `%-${anio}`)
    .limit(5000)
  if (error) throw new Error(error.message)

  let maxSeq = 0
  for (const row of data ?? []) {
    const parsed = parseExpedienteNumero(row.numero_expediente)
    if (parsed && parsed.anio === anio && parsed.secuencia > maxSeq) {
      maxSeq = parsed.secuencia
    }
  }
  return formatExpedienteNumero(maxSeq + 1, anio)
}
