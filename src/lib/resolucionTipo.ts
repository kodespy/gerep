/** Valores de `resolutions.tipo`. */
export const RESOLUCION_TIPO_APROBACION = 'Aprobación'
export const RESOLUCION_TIPO_PLAN = 'Plan presupuestario'

export const RESOLUCION_TIPO_OPTIONS = [
  { value: RESOLUCION_TIPO_APROBACION, label: 'Solo aprobación (sin plan presupuestario)' },
  { value: RESOLUCION_TIPO_PLAN, label: 'Con plan presupuestario aprobado' },
] as const

export function isResolucionSoloAprobacion(tipo: unknown): boolean {
  const t = String(tipo ?? '').trim().toLowerCase()
  if (!t) return false
  return t === 'aprobación' || t === 'aprobacion' || t === 'solo aprobación' || t === 'solo aprobacion'
}

export function isResolucionConPlan(tipo: unknown): boolean {
  return !isResolucionSoloAprobacion(tipo)
}
