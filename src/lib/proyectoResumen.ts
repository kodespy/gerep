import { supabase } from './supabase'
import { calcSaldoDisponible } from './proyectoSaldos'
import { ajusteAdenda } from './planVigente'

function sumKey(rows: any[] | null | undefined, key: string): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

export interface ProyectoResumenFinanciero {
  montoOriginal: number
  totalAdendas: number
  presupuestoAjustado: number
  ejecutado: number
  devoluciones: number
  saldoDisponible: number
}

/** Snapshot de saldos del proyecto (plan + adendas + STR + devoluciones). */
export async function loadProyectoResumenFinanciero(proyectoId: string): Promise<ProyectoResumenFinanciero | null> {
  if (!proyectoId) return null

  const [proy, planes, adendas, strs, devs] = await Promise.all([
    supabase.from('proyectos').select('id, monto').eq('id', proyectoId).maybeSingle(),
    supabase.from('planes_financieros').select('monto').eq('proyecto_id', proyectoId),
    supabase
      .from('adendas')
      .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)')
      .eq('plan.proyecto_id', proyectoId),
    supabase.from('strs').select('monto').eq('proyecto_id', proyectoId),
    supabase
      .from('devoluciones')
      .select('monto, str:strs!inner(proyecto_id)')
      .eq('str.proyecto_id', proyectoId),
  ])

  if (!proy.data) return null

  const montoOriginal = sumKey(planes.data, 'monto') || Number(proy.data.monto) || 0
  const totalAdendas = (adendas.data ?? []).reduce((s, a) => s + ajusteAdenda(a as any), 0)
  const presupuestoAjustado = montoOriginal + totalAdendas
  const ejecutado = sumKey(strs.data, 'monto')
  const devoluciones = sumKey(devs.data, 'monto')
  const saldoDisponible = calcSaldoDisponible(presupuestoAjustado, ejecutado, devoluciones)

  return {
    montoOriginal,
    totalAdendas,
    presupuestoAjustado,
    ejecutado,
    devoluciones,
    saldoDisponible,
  }
}
