import { supabase } from './supabase'
import { supabaseFetchAll } from './supabaseFetchAll'
import { actaMontoAprobadoADesembolsar } from './actaEstado'

/** Σ montos STR vinculados a cada acta_id. */
export async function fetchMontoEjecutadoByActaIds(
  actaIds: string[],
  opts?: { excludeStrId?: string | null },
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(actaIds.map(String).filter(Boolean))]
  if (!ids.length) return out
  const excludeId = opts?.excludeStrId ? String(opts.excludeStrId).trim() : ''

  const IN = 80
  for (let i = 0; i < ids.length; i += IN) {
    const chunk = ids.slice(i, i + IN)
    const { data, error } = await supabaseFetchAll<{ id: string; acta_id: string; monto: number | null }>(
      () => {
        let q = supabase
          .from('strs')
          .select('id, acta_id, monto', { count: 'exact' })
          .in('acta_id', chunk)
          .order('id', { ascending: true })
        if (excludeId) q = q.neq('id', excludeId)
        return q
      },
    )
    if (error) throw new Error(error.message)
    for (const s of data ?? []) {
      const aid = String(s.acta_id ?? '')
      if (!aid) continue
      out.set(aid, (out.get(aid) ?? 0) + (Number(s.monto) || 0))
    }
  }
  return out
}

/** Saldo del acta = Monto aprobado a desembolsar − Monto ejecutado (Σ STR del acta). */
export function actaSaldoAprobadoVsEjecutado(
  montoAprobado: unknown,
  montoEjecutado: unknown,
): number {
  return (Number(montoAprobado) || 0) - (Number(montoEjecutado) || 0)
}

/** Saldo disponible por acta (aprobado − STR ejecutado), opcionalmente excluyendo un STR. */
export async function fetchActaSaldoDisponibleMap(
  actaIds: string[],
  opts?: { excludeStrId?: string | null },
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(actaIds.map(String).filter(Boolean))]
  if (!ids.length) return out

  const IN = 80
  const aprobadoByActa = new Map<string, number>()
  for (let i = 0; i < ids.length; i += IN) {
    const chunk = ids.slice(i, i + IN)
    const { data, error } = await supabase
      .from('actas')
      .select('id, monto_aprobado, estado')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    for (const a of data ?? []) {
      const aid = String(a.id)
      aprobadoByActa.set(aid, actaMontoAprobadoADesembolsar(a, 0))
    }
  }

  const ejecutadoByActa = await fetchMontoEjecutadoByActaIds(ids, opts)
  for (const aid of ids) {
    const aprobado = aprobadoByActa.get(aid) ?? 0
    const ejecutado = ejecutadoByActa.get(aid) ?? 0
    out.set(aid, actaSaldoAprobadoVsEjecutado(aprobado, ejecutado))
  }
  return out
}

/** Adjunta `saldo` y `monto_ejecutado` (Σ STR) a cada fila de acta. */
export async function attachActasSaldoProyecto(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const ejecutadoByActa = await fetchMontoEjecutadoByActaIds(
    rows.map(r => String(r.id ?? '')),
  )
  return rows.map(r => {
    const aid = String(r.id ?? '')
    const montoEjecutado = aid ? (ejecutadoByActa.get(aid) ?? 0) : 0
    const montoAprobado = Number(r.monto_aprobado) || 0
    return {
      ...r,
      monto_ejecutado: montoEjecutado,
      saldo: actaSaldoAprobadoVsEjecutado(montoAprobado, montoEjecutado),
    }
  })
}
