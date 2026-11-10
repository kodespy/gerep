import { supabase } from './supabase'

/** Monto CDP que suma en totales (excluye anulados). */
export function cdpMontoVigente(r: { monto_comprometido: number; estado: string | null }): number {
  if ((r.estado ?? '').toLowerCase().includes('anulad')) return 0
  return Number(r.monto_comprometido) || 0
}

/** Compromiso acumulado antes del CDP indicado (orden cronológico). */
export function cdpCompAnterior(row: { id?: string }, rows: any[]): number {
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a.cdp_date ?? 0).getTime()
    const db = new Date(b.cdp_date ?? 0).getTime()
    if (da !== db) return da - db
    return String(a.cdp_numero ?? '').localeCompare(String(b.cdp_numero ?? ''))
  })
  let sum = 0
  for (const r of sorted) {
    if (r.id === row.id) break
    sum += cdpMontoVigente(r)
  }
  return sum
}

export function cdpEstaAnulado(r: { estado?: string | null }): boolean {
  return (r.estado ?? '').toLowerCase().includes('anulad')
}

const CDP_NUMERO_RE = /^CDP-(\d+)-(\d{4})$/i

/** Formato estándar: CDP-008-2026 */
export function formatCdpNumero(secuencia: number, anio: number): string {
  const seq = Math.max(1, Math.floor(secuencia))
  const year = Math.floor(anio)
  return `CDP-${String(seq).padStart(3, '0')}-${year}`
}

/** Parsea CDP-NNN-AAAA; devuelve null si no coincide. */
export function parseCdpNumeroFormat(value: unknown): { secuencia: number; anio: number } | null {
  const m = String(value ?? '').trim().match(CDP_NUMERO_RE)
  if (!m) return null
  return { secuencia: Number(m[1]), anio: Number(m[2]) }
}

/** Siguiente número CDP para el año indicado (secuencia anual + 1). */
export async function fetchNextCdpNumero(anio = new Date().getFullYear()): Promise<string> {
  const { data, error } = await supabase
    .from('budget_commitments')
    .select('cdp_numero')
    .limit(2000)
  if (error) throw new Error(error.message)

  let maxSeq = 0
  for (const row of data ?? []) {
    const parsed = parseCdpNumeroFormat(row.cdp_numero)
    if (parsed && parsed.anio === anio && parsed.secuencia > maxSeq) {
      maxSeq = parsed.secuencia
    }
  }
  return formatCdpNumero(maxSeq + 1, anio)
}

/** Valores por defecto al crear un CDP (tipo_movimiento no va en el formulario). */
export function cdpInsertPayload(values: Record<string, any>): Record<string, any> {
  return {
    tipo_movimiento: values.tipo_movimiento ?? 'Compromiso',
    ...values,
  }
}
