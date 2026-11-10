import { supabase } from './supabase'

export type OgLite = {
  id: string
  codigo?: string | null
  descripcion?: string | null
  og_principal_id?: string | number | null
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

export function asOgLite(v: any): OgLite | null {
  const o = nest(v)
  if (!o?.id && o?.codigo == null && o?.og_principal_id == null) return null
  const id = o.id != null ? String(o.id) : ''
  if (!id && o.codigo == null) return null
  return {
    id,
    codigo: o.codigo ?? null,
    descripcion: o.descripcion ?? null,
    og_principal_id: o.og_principal_id ?? null,
  }
}

export function ogCodigo(o: OgLite | null | undefined): string {
  return String(o?.codigo ?? '').trim()
}

/** Índice por id y por `codigo:879` para resolver el OG principal. */
export function indexOgs(rows: OgLite[]): Map<string, OgLite> {
  const map = new Map<string, OgLite>()
  for (const row of rows) {
    const lite = asOgLite(row)
    if (!lite) continue
    if (lite.id) map.set(lite.id, lite)
    const codigo = ogCodigo(lite)
    if (codigo) map.set(`codigo:${codigo}`, lite)
  }
  return map
}

/** OG principal (padre): 522 → 879; el 839 se conserva. */
export function displayOgPrincipal(og: any, catalog: Map<string, OgLite>): OgLite | null {
  const lite = asOgLite(og)
  if (!lite) return null
  if (isOg839(lite)) return lite
  const ref = lite.og_principal_id != null ? String(lite.og_principal_id).trim() : ''
  if (ref) {
    const parent = catalog.get(ref) ?? catalog.get(`codigo:${ref}`)
    if (parent) return parent
  }
  return lite
}

function isOg839(o: OgLite | null | undefined): boolean {
  return ogCodigo(o) === '839'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IN_CHUNK = 80

function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

async function fetchIn<T extends Record<string, any>>(
  table: string,
  select: string,
  column: string,
  ids: string[],
): Promise<T[]> {
  const uniq = [...new Set(ids.map(String).filter(Boolean))]
  const out: T[] = []
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const chunk = uniq.slice(i, i + IN_CHUNK)
    const { data, error } = await supabase.from(table).select(select).in(column, chunk)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
  }
  return out
}

async function fetchOgsByIds(ids: string[]): Promise<Map<string, OgLite>> {
  const uniq = [...new Set(ids.map(String).filter(isUuid))]
  const map = new Map<string, OgLite>()
  if (!uniq.length) return map
  const rows = await fetchIn<any>(
    'objetos_de_gastos',
    'id, codigo, descripcion, og_principal_id',
    'id',
    uniq,
  )
  for (const row of rows) {
    const og = asOgLite(row)
    if (og?.id) map.set(og.id, og)
  }
  return map
}

async function fetchOgsByCodigos(codigos: string[]): Promise<Map<string, OgLite>> {
  const uniq = [...new Set(codigos.map(c => String(c).trim()).filter(c => c && !isUuid(c)))]
  const map = new Map<string, OgLite>()
  if (!uniq.length) return map
  const rows = await fetchIn<any>(
    'objetos_de_gastos',
    'id, codigo, descripcion, og_principal_id',
    'codigo',
    uniq,
  )
  for (const row of rows) {
    const og = asOgLite(row)
    if (og) map.set(ogCodigo(og), og)
  }
  return map
}

/** Padre (OG principal) referenciado por og_principal_id (uuid o código). */
export async function resolveOgPrincipal(
  ogPrincipalRef: string | number | null | undefined,
  known?: Map<string, OgLite>,
): Promise<OgLite | null> {
  if (ogPrincipalRef == null || String(ogPrincipalRef).trim() === '') return null
  const key = String(ogPrincipalRef).trim()
  if (known?.get(key)) return known.get(key) ?? null
  const byCodigo = [...(known?.values() ?? [])].find(o => ogCodigo(o) === key)
  if (byCodigo) return byCodigo

  if (isUuid(key)) {
    const byId = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion, og_principal_id')
      .eq('id', key)
      .maybeSingle()
    if (byId.data) return asOgLite(byId.data)
  }

  const byCod = await supabase
    .from('objetos_de_gastos')
    .select('id, codigo, descripcion, og_principal_id')
    .eq('codigo', key)
    .maybeSingle()
  return asOgLite(byCod.data)
}

/** OG de transferencia = OG principal del OG de ejecución; si no hay padre, el mismo OG. */
export async function resolveOgTransferencia(ejecucion: OgLite | null): Promise<OgLite | null> {
  if (!ejecucion) return null
  if (isOg839(ejecucion)) return ejecucion
  const parent = await resolveOgPrincipal(ejecucion.og_principal_id)
  return parent ?? ejecucion
}

/**
 * OG imputado al STR: la línea de la resolución manda (incluido 839).
 * Acta/plan solo se usan si esa línea no tiene OG.
 */
function pickOgEjecucion(planOgs: OgLite[], itemOg: OgLite | null, actaOgs: OgLite[] = []): OgLite | null {
  if (itemOg?.id) return itemOg

  const acta = uniqueOgs(actaOgs)
  const actaReal = acta.filter(p => !isOg839(p))
  if (actaReal.length === 1) return actaReal[0]
  if (acta.length === 1) return acta[0]

  const plan = uniqueOgs(planOgs)
  const notDefault = plan.filter(p => !isOg839(p))
  if (notDefault.length === 1) return notDefault[0]
  if (plan.length === 1) return plan[0]
  if (notDefault.length) return notDefault[0]
  return plan[0] ?? acta[0] ?? null
}

/** 522 → 879; el 839 imputado en la línea se conserva (no es un placeholder aquí). */
function toOgTransferencia(ejec: OgLite | null, byId: Map<string, OgLite>): OgLite | null {
  if (!ejec) return null
  if (isOg839(ejec)) return ejec
  return principalFromMap(ejec, byId)
}

async function fetchPlanOgsByProyectoIds(proyectoIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(proyectoIds.filter(isUuid))]
  const map = new Map<string, string[]>()
  if (!ids.length) return map
  const data = await fetchIn<{ proyecto_id: string | null; objeto_de_gasto_id: string | null }>(
    'planes_financieros',
    'proyecto_id, objeto_de_gasto_id',
    'proyecto_id',
    ids,
  )
  for (const row of data) {
    const pid = String(row.proyecto_id ?? '')
    const ogId = row.objeto_de_gasto_id ? String(row.objeto_de_gasto_id) : ''
    if (!pid || !ogId) continue
    const list = map.get(pid) ?? []
    if (!list.includes(ogId)) list.push(ogId)
    map.set(pid, list)
  }
  return map
}

async function fetchActaPlanOgsByActaIds(actaIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(actaIds.filter(isUuid))]
  const map = new Map<string, string[]>()
  if (!ids.length) return map
  const items = await fetchIn<{ acta_id: string | null; plan_financiero_id: string | null }>(
    'acta_items',
    'acta_id, plan_financiero_id',
    'acta_id',
    ids,
  )
  const planIds = [...new Set(items.map(i => i.plan_financiero_id ? String(i.plan_financiero_id) : '').filter(isUuid))]
  if (!planIds.length) return map
  const planes = await fetchIn<{ id: string; objeto_de_gasto_id: string | null }>(
    'planes_financieros',
    'id, objeto_de_gasto_id',
    'id',
    planIds,
  )
  const ogByPlan = new Map<string, string>()
  for (const p of planes) {
    if (p.id && p.objeto_de_gasto_id) ogByPlan.set(String(p.id), String(p.objeto_de_gasto_id))
  }
  for (const it of items) {
    const aid = String(it.acta_id ?? '')
    const ogId = ogByPlan.get(String(it.plan_financiero_id ?? '')) ?? ''
    if (!aid || !ogId) continue
    const list = map.get(aid) ?? []
    if (!list.includes(ogId)) list.push(ogId)
    map.set(aid, list)
  }
  return map
}

function uniqueOgs(ogs: OgLite[]): OgLite[] {
  const seen = new Set<string>()
  const out: OgLite[] = []
  for (const o of ogs) {
    if (!o.id || seen.has(o.id)) continue
    seen.add(o.id)
    out.push(o)
  }
  return out
}

async function hydrateOgMap(ids: string[]): Promise<Map<string, OgLite>> {
  const uuids = ids.filter(isUuid)
  const codes = ids.filter(id => id && !isUuid(id))
  const byId = await fetchOgsByIds(uuids)
  if (codes.length) {
    const extra = await fetchOgsByCodigos(codes)
    for (const v of extra.values()) {
      if (v.id) byId.set(v.id, v)
    }
  }
  const principalRefs = [...byId.values()]
    .map(o => (o.og_principal_id != null ? String(o.og_principal_id).trim() : ''))
    .filter(Boolean)
  const missingUuid = principalRefs.filter(ref => isUuid(ref) && !byId.has(ref))
  const missingCodes = principalRefs.filter(ref => !isUuid(ref) && ![...byId.values()].some(o => ogCodigo(o) === ref))
  if (missingUuid.length) {
    const extra = await fetchOgsByIds(missingUuid)
    for (const [k, v] of extra) byId.set(k, v)
  }
  if (missingCodes.length) {
    const extra = await fetchOgsByCodigos(missingCodes)
    for (const v of extra.values()) {
      if (v.id) byId.set(v.id, v)
    }
  }
  return byId
}

function principalFromMap(og: OgLite, byId: Map<string, OgLite>): OgLite {
  const ref = og.og_principal_id != null ? String(og.og_principal_id).trim() : ''
  if (!ref) return og
  if (byId.has(ref)) return byId.get(ref) ?? og
  const byCode = [...byId.values()].find(o => ogCodigo(o) === ref)
  return byCode ?? og
}

/**
 * OG que debe figurar en el STR:
 * - si la línea de resolución imputa un OG (incluido 839), ese OG
 * - si el OG de ejecución tiene principal (p. ej. 522 → 879), el principal
 */
export async function resolveStrOgTransferencia(opts: {
  proyectoId?: string | null
  itemOgId?: string | null
  actaId?: string | null
}): Promise<OgLite | null> {
  const itemOgId = opts.itemOgId ? String(opts.itemOgId) : ''
  const proyectoId = opts.proyectoId ? String(opts.proyectoId) : ''
  const actaId = opts.actaId ? String(opts.actaId) : ''
  const [planMap, actaMap] = await Promise.all([
    proyectoId ? fetchPlanOgsByProyectoIds([proyectoId]) : Promise.resolve(new Map<string, string[]>()),
    actaId ? fetchActaPlanOgsByActaIds([actaId]) : Promise.resolve(new Map<string, string[]>()),
  ])
  const planOgIds = planMap.get(proyectoId) ?? []
  const actaOgIds = actaMap.get(actaId) ?? []
  const allIds = [...planOgIds, ...actaOgIds, itemOgId].filter(Boolean)
  const byId = await hydrateOgMap(allIds)
  const planOgs = uniqueOgs(planOgIds.map(id => byId.get(id)).filter((o): o is OgLite => !!o))
  const actaOgs = uniqueOgs(actaOgIds.map(id => byId.get(id)).filter((o): o is OgLite => !!o))
  const itemOg = itemOgId ? (byId.get(itemOgId) ?? null) : null
  const ejec = pickOgEjecucion(planOgs, itemOg, actaOgs)
  if (!ejec) return itemOg
  return toOgTransferencia(ejec, byId)
}

/** Adjunta el OG a mostrar; restaura en BD los STR cuya línea imputa 839 y se reescribió. */
export async function attachStrOgTransferencia(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  try {
    return await attachStrOgTransferenciaUnsafe(rows)
  } catch (e) {
    console.error('[strs og transferencia]', e)
    return rows
  }
}

async function attachStrOgTransferenciaUnsafe(rows: any[]): Promise<any[]> {
  const proyectoIds = [
    ...rows.map(r => r.proyecto_id ? String(r.proyecto_id) : ''),
    ...rows.map(r => {
      const acta = nest(r.acta)
      return acta?.proyecto_id ? String(acta.proyecto_id) : ''
    }),
  ].filter(Boolean)
  const actaIds = rows.map(r => {
    const acta = nest(r.acta)
    return String(r.acta_id ?? acta?.id ?? '').trim()
  }).filter(Boolean)

  const [planMap, actaOgMap] = await Promise.all([
    fetchPlanOgsByProyectoIds(proyectoIds),
    fetchActaPlanOgsByActaIds(actaIds),
  ])

  const ogIds: string[] = []
  for (const ids of planMap.values()) ogIds.push(...ids)
  for (const ids of actaOgMap.values()) ogIds.push(...ids)
  for (const r of rows) {
    const item = nest(r.plan_item)
    if (item?.og_id) ogIds.push(String(item.og_id))
    const itemOg = asOgLite(item?.og)
    if (itemOg?.id) ogIds.push(itemOg.id)
    if (r.og_id) ogIds.push(String(r.og_id))
    const stored = asOgLite(r.og)
    if (stored?.id) ogIds.push(stored.id)
  }
  const byId = await hydrateOgMap(ogIds)

  const out = rows.map(r => {
    const pid = r.proyecto_id ? String(r.proyecto_id) : String(nest(r.acta)?.proyecto_id ?? '')
    const actaId = String(r.acta_id ?? nest(r.acta)?.id ?? '').trim()
    const planOgs = uniqueOgs(
      (planMap.get(pid) ?? []).map(id => byId.get(id)).filter((o): o is OgLite => !!o),
    )
    const actaOgs = uniqueOgs(
      (actaOgMap.get(actaId) ?? []).map(id => byId.get(id)).filter((o): o is OgLite => !!o),
    )
    const item = nest(r.plan_item)
    const itemOg = (item?.og_id ? byId.get(String(item.og_id)) ?? null : null) ?? asOgLite(item?.og)
    const stored = (r.og_id ? byId.get(String(r.og_id)) ?? null : null) ?? asOgLite(r.og)
    const ejec = pickOgEjecucion(planOgs, itemOg, actaOgs) ?? stored
    const transfer = toOgTransferencia(ejec, byId) ?? stored
    if (!transfer) return r
    return {
      ...r,
      og_id: transfer.id || r.og_id,
      og: transfer,
      __og_item: itemOg,
      __og_ejecucion: ejec,
      __og_stored_id: r.og_id,
    }
  })

  const stale = out.filter((r, i) => {
    const origId = String(rows[i]?.og_id ?? '')
    const newId = String(r.og_id ?? '')
    const itemOg = r.__og_item as OgLite | null | undefined
    return r.id && newId && origId !== newId && isOg839(itemOg)
  })
  if (stale.length) {
    console.info(
      '[strs og repair]',
      stale.map(r => ({
        numero: r.numero,
        from: r.__og_stored_id,
        to: (r.og as OgLite | undefined)?.codigo,
        item: (r.__og_item as OgLite | undefined)?.codigo,
      })),
    )
    await Promise.all(stale.map(async r => {
      const { error } = await supabase.from('strs').update({ og_id: r.og_id }).eq('id', r.id)
      if (error) console.error('[strs og persist]', error.message)
    }))
  }

  return out
}
