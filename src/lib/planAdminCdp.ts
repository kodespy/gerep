import { supabase } from './supabase'

/** CDPs vinculados a un plan administrativo por plan_administrativo_id. */
export async function fetchCdpsForPlanAdmin(planId: string): Promise<{ data: any[]; error: string | null }> {
  const { data, error } = await supabase
    .from('budget_commitments')
    .select('*')
    .eq('plan_administrativo_id', planId)
    .order('cdp_date', { ascending: false })
    .limit(500)

  if (error) return { data: [], error: error.message }

  const rows = data ?? []
  const proyectoIds = [...new Set(rows.map(r => r.proyecto_id).filter(Boolean))]
  if (proyectoIds.length) {
    const { data: proyectos } = await supabase
      .from('proyectos')
      .select('id, descripcion, componente:componentes_programa(codigo, descripcion)')
      .in('id', proyectoIds)
    const byId = Object.fromEntries((proyectos ?? []).map(p => [p.id, p]))
    for (const row of rows) {
      if (row.proyecto_id) row.proyecto = byId[row.proyecto_id] ?? null
    }
  }

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
  if (userIds.length) {
    const { data: usuarios } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
    const byUser = Object.fromEntries((usuarios ?? []).map(u => [u.id, u]))
    for (const row of rows) {
      if (row.user_id) row.usuario = byUser[row.user_id] ?? null
    }
  }

  return { data: rows, error: null }
}

export function withPlanAdminCdpLink(planId: string, values: Record<string, any>): Record<string, any> {
  return { ...values, plan_administrativo_id: planId }
}
