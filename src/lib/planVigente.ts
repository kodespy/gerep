/** Ajuste neto de modificación administrativa (+/−). */
export function ajusteModificacionAdmin(r: { monto: number; tipo_modificacion: string | null }): number {
  const tipo = (r.tipo_modificacion ?? '').toLowerCase()
  const sign = tipo.includes('dis') ? -1 : 1
  return sign * (Number(r.monto) || 0)
}

/** Ajuste neto de adenda (disminución resta; rechazadas/anuladas no cuentan). */
export function ajusteAdenda(a: { monto_ajuste: number; tipo_ajuste: string | null; estado: string | null }): number {
  const estado = (a.estado ?? '').toLowerCase()
  if (estado.includes('rechaz') || estado.includes('anulad')) return 0
  const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
  return sign * (Number(a.monto_ajuste) || 0)
}

export interface PlanVigenteAgg {
  planBase: number
  modificaciones: number
  presupuestoVigente: number
  comprometido: number
  disponible: number
  pctComprometido: number
}

export function calcPlanVigenteAgg(planBase: number, modificaciones: number, comprometido: number): PlanVigenteAgg {
  const presupuestoVigente = planBase + modificaciones
  const disponible = presupuestoVigente - comprometido
  const pctComprometido = presupuestoVigente > 0
    ? Math.min(100, Math.round((comprometido / presupuestoVigente) * 1000) / 10)
    : 0
  return { planBase, modificaciones, presupuestoVigente, comprometido, disponible, pctComprometido }
}
