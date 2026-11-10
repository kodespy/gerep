/** Estado del acta: solo aprobación (sin desembolso). */
export function isActaSoloAprobacion(estado: unknown): boolean {
  const t = String(estado ?? '').trim().toLowerCase()
  return t === 'aprobación' || t === 'aprobacion'
}

/**
 * Si el monto aprobado a desembolsar es > 0 y el estado es solo «Aprobación»,
 * pasa a «Desembolso». No modifica «Aprobación y desembolso» ni otros estados.
 */
export function promoteActaEstadoSiTieneMontoAprobado(
  estado: unknown,
  montoAprobado: unknown,
): string {
  const actual = String(estado ?? '').trim() || 'Aprobación'
  const monto = Math.round(Number(montoAprobado) || 0)
  if (monto > 0 && isActaSoloAprobacion(actual)) return 'Desembolso'
  return actual
}

/**
 * Monto aprobado a desembolsar del acta.
 * Nunca usa `monto_solicitado`.
 * Prioridad: Σ ítems (`monto_ejecutado`) > 0 → esa suma; si no → `monto_aprobado`.
 * En solo «Aprobación» es siempre 0.
 */
export function actaMontoAprobadoADesembolsar(
  acta: {
    estado?: unknown
    monto_aprobado?: number | null
  },
  itemsMontoEjecutadoSum = 0,
): number {
  if (isActaSoloAprobacion(acta.estado)) return 0
  const desdeItems = Math.round(Number(itemsMontoEjecutadoSum) || 0)
  if (desdeItems > 0) return desdeItems
  return Math.round(Number(acta.monto_aprobado) || 0)
}
