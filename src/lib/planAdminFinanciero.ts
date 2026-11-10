import { supabase } from './supabase'
import { ajusteModificacionAdmin } from './planVigente'
import { cdpMontoVigente } from './cdpUtils'

type ModificacionRow = { monto: number; tipo_modificacion: string | null }
type CdpRow = { monto_comprometido?: number | null; estado?: string | null }
type PlanAdminRow = {
  id?: string
  monto_total?: number | null
  modificaciones?: ModificacionRow[]
  cdps?: CdpRow[]
  presupuesto_comprometido?: number | null
}

export function presupuestoInicialPlanAdmin(row: PlanAdminRow): number {
  return Number(row.monto_total) || 0
}

export function netModificacionesPlanAdmin(row: PlanAdminRow): number {
  return (row.modificaciones ?? []).reduce((s, m) => s + ajusteModificacionAdmin(m), 0)
}

export function presupuestoVigentePlanAdminRow(row: PlanAdminRow): number {
  return presupuestoInicialPlanAdmin(row) + netModificacionesPlanAdmin(row)
}

/** Sumatoria de CDP vigentes (excluye anulados). */
export function presupuestoComprometidoPlanAdmin(row: PlanAdminRow): number {
  if (row.presupuesto_comprometido != null && Number.isFinite(Number(row.presupuesto_comprometido))) {
    return Number(row.presupuesto_comprometido) || 0
  }
  return (row.cdps ?? []).reduce((s, c) => s + cdpMontoVigente(c as any), 0)
}

/** Presupuesto vigente − Presupuesto comprometido (CDP). */
export function saldoPresupuestarioPlanAdmin(row: PlanAdminRow): number {
  return presupuestoVigentePlanAdminRow(row) - presupuestoComprometidoPlanAdmin(row)
}

/** Enriquece filas del listado con la sumatoria de CDP por plan. */
export async function enrichPlanesAdminConCdp(rows: any[]): Promise<any[]> {
  const ids = rows.map(r => r?.id).filter(Boolean).map(String)
  if (!ids.length) return rows.map(r => ({ ...r, presupuesto_comprometido: 0 }))

  const { data, error } = await supabase
    .from('budget_commitments')
    .select('plan_administrativo_id, monto_comprometido, estado')
    .in('plan_administrativo_id', ids)
    .limit(8000)
  if (error) {
    console.error('[planes admin CDP]', error.message)
    return rows.map(r => ({ ...r, presupuesto_comprometido: 0 }))
  }

  const byPlan = new Map<string, number>()
  for (const c of data ?? []) {
    const pid = String(c.plan_administrativo_id ?? '')
    if (!pid) continue
    byPlan.set(pid, (byPlan.get(pid) ?? 0) + cdpMontoVigente(c as any))
  }
  return rows.map(r => ({
    ...r,
    presupuesto_comprometido: byPlan.get(String(r.id)) ?? 0,
  }))
}

export async function fetchPresupuestoVigentePlanAdmin(planId: string, montoTotal: number): Promise<number> {
  const { data } = await supabase
    .from('modificaciones_administrativas')
    .select('monto, tipo_modificacion')
    .eq('plan_administrativo_id', planId)
  const net = (data ?? []).reduce((s, a) => s + ajusteModificacionAdmin(a as any), 0)
  return (Number(montoTotal) || 0) + net
}

/** Reparte un monto total en 12 meses (enteros; el resto va a los primeros meses). */
export function distribuirMontoEn12Meses(total: number): number[] {
  const t = Math.max(0, Math.round(total))
  const base = Math.floor(t / 12)
  const resto = t - base * 12
  return Array.from({ length: 12 }, (_, i) => base + (i < resto ? 1 : 0))
}
