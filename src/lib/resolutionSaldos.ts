import { supabase } from './supabase'
import { asGs } from './format'
import { isResolucionSoloAprobacion } from './resolucionTipo'
import { fetchActaSaldoDisponibleMap } from './actasSaldo'
import { resolveStrOgTransferencia } from './ogTransferencia'

export type ResolutionItemSaldo = {
  itemId: string
  ogId: string | null
  ogCodigo: string | null
  ogDescripcion: string | null
  montoPlan: number
  montoEjecutado: number
  saldo: number
}

export type ResolutionSaldoResumen = {
  resolutionId: string
  numero: string | null
  fecha: string | null
  montoPlan: number
  montoEjecutado: number
  saldo: number
  items: ResolutionItemSaldo[]
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** Monto del plan (= suma de resolution_items). */
export function resolutionMontoPlan(row: { items?: any[] | null }): number {
  const items = Array.isArray(row.items) ? row.items : []
  return items.reduce((s, i) => s + asGs(i?.monto), 0)
}

/**
 * Adjunta a cada resolución:
 * - `ejecutado_str`: sumatoria de montos de STR vinculadas
 * - `saldo_str`: plan − ejecutado
 */
export async function attachResolutionEjecutadoFromStrs(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const resolutionIds = [...new Set(rows.map(r => String(r?.id ?? '')).filter(Boolean))]
  if (!resolutionIds.length) return rows

  const ejecutadoByRes = new Map<string, number>()
  const countedStrIds = new Set<string>()

  // STR con resolution_id
  const { data: byRes, error: errRes } = await supabase
    .from('strs')
    .select('id, resolution_id, monto')
    .in('resolution_id', resolutionIds)
  if (!errRes) {
    for (const s of byRes ?? []) {
      const rid = String(s.resolution_id ?? '')
      if (!rid) continue
      if (s.id) countedStrIds.add(String(s.id))
      ejecutadoByRes.set(rid, (ejecutadoByRes.get(rid) ?? 0) + asGs(s.monto))
    }
  }

  // Complemento: STR solo por resolution_item_id
  const { data: items } = await supabase
    .from('resolution_items')
    .select('id, resolution_id')
    .in('resolution_id', resolutionIds)
  const itemToRes = new Map<string, string>()
  for (const it of items ?? []) {
    itemToRes.set(String(it.id), String(it.resolution_id))
  }
  const itemIds = [...itemToRes.keys()]
  if (itemIds.length) {
    const { data: byItem, error: errItem } = await supabase
      .from('strs')
      .select('id, resolution_id, resolution_item_id, monto')
      .in('resolution_item_id', itemIds)
    if (!errItem) {
      for (const s of byItem ?? []) {
        const sid = s.id ? String(s.id) : ''
        if (sid && countedStrIds.has(sid)) continue
        const rid = s.resolution_id
          ? String(s.resolution_id)
          : itemToRes.get(String(s.resolution_item_id ?? ''))
        if (!rid) continue
        if (sid) countedStrIds.add(sid)
        ejecutadoByRes.set(rid, (ejecutadoByRes.get(rid) ?? 0) + asGs(s.monto))
      }
    }
  }

  return rows.map(r => {
    const plan = resolutionMontoPlan(r)
    const ejecutado = ejecutadoByRes.get(String(r.id)) ?? 0
    return {
      ...r,
      monto_plan: plan,
      ejecutado_str: ejecutado,
      saldo_str: plan - ejecutado,
    }
  })
}

/** Suma de montos STR de una línea de plan, excluyendo un STR (edición). */
export async function sumStrMontoByResolutionItem(
  resolutionItemId: string,
  excludeStrId?: string | null,
): Promise<number> {
  let q = supabase
    .from('strs')
    .select('id, monto')
    .eq('resolution_item_id', resolutionItemId)
  if (excludeStrId) q = q.neq('id', excludeStrId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + asGs(r.monto), 0)
}

/** Suma de montos STR de toda la resolución, excluyendo un STR (edición). */
export async function sumStrMontoByResolution(
  resolutionId: string,
  excludeStrId?: string | null,
): Promise<number> {
  let q = supabase
    .from('strs')
    .select('id, monto')
    .eq('resolution_id', resolutionId)
  if (excludeStrId) q = q.neq('id', excludeStrId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + asGs(r.monto), 0)
}

/** Resumen de saldos del plan de una resolución (por ítem y total). */
export async function fetchResolutionSaldoResumen(
  resolutionId: string,
  excludeStrId?: string | null,
): Promise<ResolutionSaldoResumen | null> {
  const rid = String(resolutionId || '').trim()
  if (!rid) return null

  const [{ data: resol, error: resolErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase.from('resolutions').select('id, numero, fecha').eq('id', rid).maybeSingle(),
      supabase
        .from('resolution_items')
        .select('id, monto, og_id, og:objetos_de_gastos(codigo, descripcion)')
        .eq('resolution_id', rid)
        .order('created_at', { ascending: true }),
    ])

  if (resolErr) throw resolErr
  if (itemsErr) throw itemsErr
  if (!resol) return null

  const itemRows = items ?? []
  const itemIds = itemRows.map((i: any) => String(i.id)).filter(Boolean)
  const exclude = String(excludeStrId ?? '').trim()

  // STR por resolution_id + por resolution_item_id (por si falta resolution_id en algún registro)
  const strQueries: PromiseLike<{ data: any[] | null; error: any }>[] = [
    supabase.from('strs').select('id, monto, resolution_item_id, resolution_id').eq('resolution_id', rid),
  ]
  if (itemIds.length) {
    strQueries.push(
      supabase.from('strs').select('id, monto, resolution_item_id, resolution_id').in('resolution_item_id', itemIds),
    )
  }
  const strResults = await Promise.all(strQueries)

  const ejecutadoByItem = new Map<string, number>()
  const seenStr = new Set<string>()
  let ejecutadoTotal = 0

  for (const res of strResults) {
    if (res.error) {
      // Si falla por columna inexistente, continuar con lo que haya
      if (/resolution_id|resolution_item_id|column/i.test(String(res.error.message ?? ''))) continue
      throw res.error
    }
    for (const s of res.data ?? []) {
      const sid = String(s.id ?? '')
      if (!sid || seenStr.has(sid)) continue
      if (exclude && sid === exclude) continue
      seenStr.add(sid)
      const m = asGs(s.monto)
      ejecutadoTotal += m
      const iid = s.resolution_item_id ? String(s.resolution_item_id) : ''
      if (iid) ejecutadoByItem.set(iid, (ejecutadoByItem.get(iid) ?? 0) + m)
    }
  }

  const itemSaldos: ResolutionItemSaldo[] = itemRows.map((raw: any) => {
    const og = asOne(raw.og)
    const montoPlan = asGs(raw.monto)
    const ejecutado = ejecutadoByItem.get(String(raw.id)) ?? 0
    return {
      itemId: String(raw.id),
      ogId: raw.og_id ? String(raw.og_id) : null,
      ogCodigo: og?.codigo ?? null,
      ogDescripcion: og?.descripcion ?? null,
      montoPlan,
      montoEjecutado: ejecutado,
      saldo: montoPlan - ejecutado,
    }
  })

  const montoPlan = itemSaldos.reduce((s, i) => s + i.montoPlan, 0)
  return {
    resolutionId: rid,
    numero: resol.numero ?? null,
    fecha: resol.fecha ?? null,
    montoPlan,
    montoEjecutado: ejecutadoTotal,
    saldo: montoPlan - ejecutadoTotal,
    items: itemSaldos,
  }
}

/**
 * Valida y enriquece el payload de un STR respecto a la resolución / línea de plan.
 * Lanza Error si el monto supera el saldo disponible.
 */
export async function prepareStrResolucionPayload(
  values: Record<string, any>,
  opts?: { excludeStrId?: string | null },
): Promise<Record<string, any>> {
  const resolutionId = String(values.resolution_id ?? '').trim()
  const itemId = String(values.resolution_item_id ?? '').trim()
  const monto = Number(values.monto) || 0

  if (!resolutionId) throw new Error('Seleccione la resolución.')
  if (!itemId) throw new Error('Seleccione la línea del plan presupuestario (OG) de la resolución.')
  if (monto <= 0) throw new Error('El monto del STR debe ser mayor a cero.')

  const { data: item, error: itemErr } = await supabase
    .from('resolution_items')
    .select('id, resolution_id, monto, og_id')
    .eq('id', itemId)
    .maybeSingle()
  if (itemErr) throw itemErr
  if (!item) throw new Error('La línea del plan no existe.')
  if (String(item.resolution_id) !== resolutionId) {
    throw new Error('La línea del plan no pertenece a la resolución seleccionada.')
  }

  const { data: resol, error: resolErr } = await supabase
    .from('resolutions')
    .select('id, numero, fecha, tipo')
    .eq('id', resolutionId)
    .maybeSingle()
  if (resolErr) throw resolErr
  if (!resol) throw new Error('La resolución no existe.')
  if (isResolucionSoloAprobacion(resol.tipo)) {
    throw new Error('La resolución seleccionada es solo aprobación y no tiene plan presupuestario. Elija una resolución con plan.')
  }

  const ejecutado = await sumStrMontoByResolutionItem(itemId, opts?.excludeStrId)
  const montoPlan = asGs(item.monto)
  const saldo = montoPlan - ejecutado
  if (asGs(monto) > saldo) {
    throw new Error(
      `El monto del STR (${asGs(monto).toLocaleString('es-PY')}) supera el saldo de la línea del plan (${saldo.toLocaleString('es-PY')}).`,
    )
  }

  const actaId = String(values.acta_id ?? '').trim()
  if (actaId) {
    const saldoByActa = await fetchActaSaldoDisponibleMap([actaId], {
      excludeStrId: opts?.excludeStrId ?? null,
    })
    const saldoActa = saldoByActa.get(actaId) ?? 0
    if (saldoActa <= 0.009) {
      throw new Error('El acta seleccionada no tiene saldo disponible. Elija otra acta o deje el campo vacío.')
    }
    if (asGs(monto) > saldoActa + 0.009) {
      throw new Error(
        `El monto del STR (${asGs(monto).toLocaleString('es-PY')}) supera el saldo del acta (${saldoActa.toLocaleString('es-PY')}).`,
      )
    }
  }

  const transfer = await resolveStrOgTransferencia({
    proyectoId: values.proyecto_id ?? null,
    itemOgId: item.og_id ? String(item.og_id) : null,
    actaId: values.acta_id ?? null,
  })

  return {
    ...values,
    resolution_id: resolutionId,
    resolution_item_id: itemId,
    og_id: transfer?.id || (item.og_id ? String(item.og_id) : values.og_id),
    nro_resolucion: resol.numero ?? values.nro_resolucion ?? null,
    fecha_resolucion: resol.fecha ?? values.fecha_resolucion ?? null,
  }
}
