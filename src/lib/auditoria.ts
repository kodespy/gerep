import { supabase } from './supabase'

export type AuditoriaAccion = string

export interface AuditoriaRow {
  id: string
  created_at: string
  actor_id: string | null
  accion: AuditoriaAccion
  tabla: string | null
  registro_id: string | null
  resumen: string | null
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  meta: Record<string, unknown> | null
  ip_address?: string | null
  payload?: Record<string, unknown> | null
  actor?: { name: string | null; email: string | null; role: string | null } | null
}

/** Tabla real en Supabase (ya poblada). */
export const AUDIT_TABLE = 'audit_logs'

/**
 * Identificador de esta aplicación en audit_logs.app_id.
 * Debe coincidir con el backfill de la migración 033.
 * Otras apps en el mismo Supabase usan otro valor (p. ej. mistock).
 */
export const AUDIT_APP_ID =
  (import.meta.env.VITE_AUDIT_APP_ID as string | undefined)?.trim() || 'uep-proyectos'

export const ACCION_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'INSERT', label: 'INSERT' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'LOGOUT', label: 'LOGOUT' },
]

export function labelAccion(accion: string | null | undefined): string {
  const a = (accion ?? '').toUpperCase()
  if (!a) return '—'
  if (a === 'INSERT' || a === 'INSERTAR') return 'INSERT'
  if (a === 'UPDATE' || a === 'ACTUALIZAR') return 'UPDATE'
  if (a === 'DELETE' || a === 'ELIMINAR') return 'DELETE'
  return a
}

/** Etiqueta comprensible para la bitácora. No altera el valor almacenado. */
export function labelAccionHumana(accion: string | null | undefined): string {
  const a = labelAccion(accion)
  if (a === 'INSERT') return 'Alta'
  if (a === 'UPDATE') return 'Modificación'
  if (a === 'DELETE') return 'Baja'
  if (a === 'LOGIN') return 'Inicio de sesión'
  if (a === 'LOGOUT') return 'Cierre de sesión'
  return a
}

export function resumenAuditoria(row: { accion: string; tabla?: string | null; resumen?: string | null }): string {
  if (row.resumen && row.resumen.trim()) return row.resumen.trim()
  const acc = labelAccionHumana(row.accion)
  return row.tabla ? `${acc} en ${row.tabla}` : acc
}

function pickRegistroId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  for (const key of ['id', 'record_id', 'registro_id', 'pk']) {
    if (p[key] != null) return String(p[key])
  }
  const neu = p.new ?? p.new_data ?? p.datos_nuevos
  if (neu && typeof neu === 'object' && (neu as any).id != null) return String((neu as any).id)
  const old = p.old ?? p.old_data ?? p.datos_anteriores
  if (old && typeof old === 'object' && (old as any).id != null) return String((old as any).id)
  return null
}

function splitPayload(payload: unknown): {
  anteriores: Record<string, unknown> | null
  nuevos: Record<string, unknown> | null
  meta: Record<string, unknown> | null
} {
  if (!payload || typeof payload !== 'object') {
    return { anteriores: null, nuevos: null, meta: null }
  }
  const p = payload as Record<string, unknown>
  const anteriores = (p.old ?? p.old_data ?? p.datos_anteriores ?? p.before ?? null) as Record<string, unknown> | null
  const nuevos = (p.new ?? p.new_data ?? p.datos_nuevos ?? p.after ?? null) as Record<string, unknown> | null
  if (anteriores || nuevos) {
    const meta = { ...p }
    delete meta.old
    delete meta.old_data
    delete meta.datos_anteriores
    delete meta.before
    delete meta.new
    delete meta.new_data
    delete meta.datos_nuevos
    delete meta.after
    return {
      anteriores: anteriores && typeof anteriores === 'object' ? anteriores : null,
      nuevos: nuevos && typeof nuevos === 'object' ? nuevos : null,
      meta: Object.keys(meta).length ? meta : null,
    }
  }
  return { anteriores: null, nuevos: null, meta: p }
}

function mapRow(raw: any, actorMap?: Record<string, AuditoriaRow['actor']>): AuditoriaRow {
  const payload = raw.payload ?? null
  const split = splitPayload(payload)
  const actorId = raw.user_id ?? raw.actor_id ?? null
  return {
    id: String(raw.id),
    created_at: raw.created_at,
    actor_id: actorId,
    accion: String(raw.action ?? raw.accion ?? ''),
    tabla: raw.table_name ?? raw.tabla ?? null,
    registro_id: pickRegistroId(payload),
    resumen: raw.description ?? raw.descripcion ?? raw.resumen ?? null,
    datos_anteriores: split.anteriores,
    datos_nuevos: split.nuevos,
    meta: split.meta,
    ip_address: raw.ip_address ?? null,
    payload: payload && typeof payload === 'object' ? payload : null,
    actor: actorId && actorMap ? actorMap[actorId] ?? null : (Array.isArray(raw.actor) ? raw.actor[0] : raw.actor) ?? null,
  }
}

function isMissingAppIdColumn(message: string | undefined): boolean {
  return /column .*app_id|app_id.*does not exist|Could not find.*app_id/i.test(message ?? '')
}

/** Aplica filtro por app_id (esta base / aplicación). */
function withAppScope<T extends { eq: (c: string, v: string) => T }>(query: T): T {
  return query.eq('app_id', AUDIT_APP_ID)
}

/** Registra un evento de aplicación (login, logout, etc.). */
export async function registrarAuditoria(opts: {
  accion: string
  resumen: string
  tabla?: string | null
  registro_id?: string | null
  meta?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const actorId = sessionData.session?.user?.id ?? null
    const action = labelAccion(opts.accion)
    const row: Record<string, unknown> = {
      user_id: actorId,
      action,
      table_name: opts.tabla ?? 'auth',
      description: opts.resumen,
      app_id: AUDIT_APP_ID,
      payload: {
        ...(opts.meta ?? {}),
        ...(opts.registro_id ? { id: opts.registro_id } : {}),
        app_id: AUDIT_APP_ID,
      },
    }
    let { error } = await supabase.from(AUDIT_TABLE).insert(row)
    if (error && isMissingAppIdColumn(error.message)) {
      delete row.app_id
      ;({ error } = await supabase.from(AUDIT_TABLE).insert(row))
    }
    if (error) console.warn('[auditoria]', error.message)
  } catch (e) {
    console.warn('[auditoria]', e)
  }
}

function sanitizeAuditSearchTerm(raw: string): string {
  return raw.trim().replace(/[%*_]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function attachActors(rowsRaw: any[]): Promise<AuditoriaRow[]> {
  const actorIds = [...new Set(rowsRaw.map((r: any) => r.user_id).filter(Boolean))] as string[]
  let byId: Record<string, AuditoriaRow['actor']> = {}
  if (actorIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .in('id', actorIds)
    byId = Object.fromEntries(
      (profiles ?? []).map(p => [p.id, { name: p.name, email: p.email, role: p.role }]),
    )
  }
  return rowsRaw.map((r: any) => mapRow(r, byId))
}

/** Búsqueda con JSON vía RPC (PostgREST no acepta payload::text en .or()). */
async function loadAuditoriaViaSearchRpc(filters: {
  desde: string
  hasta: string
  actorId?: string | null
  accion?: string | null
  tabla?: string | null
  q: string
  limit: number
  offset: number
}): Promise<{ data: AuditoriaRow[]; error: string | null; total: number | null; rpcMissing?: boolean }> {
  const call = async (appId: string | null) =>
    supabase.rpc('search_audit_logs', {
      p_desde: `${filters.desde}T00:00:00`,
      p_hasta: `${filters.hasta}T23:59:59.999`,
      p_app_id: appId,
      p_actor_id: filters.actorId || null,
      p_accion: filters.accion ? filters.accion.toUpperCase() : null,
      p_tabla: filters.tabla || null,
      p_q: filters.q,
      p_limit: filters.limit,
      p_offset: filters.offset,
    })

  let { data, error } = await call(AUDIT_APP_ID)
  if (error && /app_id|does not exist|Could not find|function/i.test(error.message)) {
    const retry = await call(null)
    data = retry.data
    error = retry.error
    if (error && /does not exist|Could not find|function/i.test(error.message)) {
      return { data: [], error: error.message, total: null, rpcMissing: true }
    }
  }
  if (error) return { data: [], error: error.message, total: null }

  const payload = data as { rows?: any[]; total?: number } | null
  const rowsRaw = Array.isArray(payload?.rows) ? payload!.rows! : []
  const total = typeof payload?.total === 'number' ? payload.total : rowsRaw.length
  return { data: await attachActors(rowsRaw), error: null, total }
}

export async function loadAuditoria(filters: {
  desde: string
  hasta: string
  actorId?: string | null
  accion?: string | null
  tabla?: string | null
  q?: string | null
  limit?: number
  offset?: number
}): Promise<{ data: AuditoriaRow[]; error: string | null; total: number | null }> {
  const desde = `${filters.desde}T00:00:00`
  const hasta = `${filters.hasta}T23:59:59.999`
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  const q = filters.q?.trim() ? sanitizeAuditSearchTerm(filters.q) : ''

  // Con texto libre: RPC incluye payload JSON completo
  if (q) {
    const viaRpc = await loadAuditoriaViaSearchRpc({
      desde: filters.desde,
      hasta: filters.hasta,
      actorId: filters.actorId,
      accion: filters.accion,
      tabla: filters.tabla,
      q,
      limit,
      offset,
    })
    if (!viaRpc.rpcMissing) return viaRpc
    console.warn(
      '[auditoria] Ejecutá supabase/migrations/035_audit_logs_search.sql para buscar dentro del JSON.',
    )
  }

  const build = (scoped: boolean) => {
    let query = supabase
      .from(AUDIT_TABLE)
      .select('id, created_at, user_id, table_name, action, description, ip_address, payload', { count: 'exact' })
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (scoped) query = withAppScope(query)
    if (filters.actorId) query = query.eq('user_id', filters.actorId)
    if (filters.accion) {
      const a = filters.accion.toUpperCase()
      query = query.eq('action', a)
    }
    if (filters.tabla) query = query.eq('table_name', filters.tabla)
    if (q) {
      const p = `%${q}%`
      query = query.or(
        [
          `description.ilike.${p}`,
          `table_name.ilike.${p}`,
          `action.ilike.${p}`,
          `ip_address.ilike.${p}`,
        ].join(','),
      )
    }
    return query
  }

  let { data, error, count } = await build(true)
  if (error && isMissingAppIdColumn(error.message)) {
    ;({ data, error, count } = await build(false))
    if (!error) {
      console.warn(
        '[auditoria] Falta columna app_id. Ejecutá supabase/migrations/033_audit_logs_app_id.sql para aislar por aplicación.',
      )
    }
  }
  if (error) return { data: [], error: error.message, total: null }

  return { data: await attachActors(data ?? []), error: null, total: count ?? (data ?? []).length }
}

/** Distinct de table_name vía RPC; fallback salta de nombre en nombre (no se queda en actas). */
export async function listTablasAuditoria(): Promise<string[]> {
  const fromRpc = async (appId: string | null) => {
    const { data, error } = await supabase.rpc('list_audit_table_names', { p_app_id: appId })
    if (error) return { names: null as string[] | null, error }
    const names = (data ?? [])
      .map((v: unknown) => String(v ?? '').trim())
      .filter(Boolean)
    return { names: [...new Set(names)].sort((a, b) => a.localeCompare(b, 'es')), error: null }
  }

  let rpc = await fromRpc(AUDIT_APP_ID)
  if (rpc.error && /app_id|does not exist|Could not find|function/i.test(rpc.error.message)) {
    rpc = await fromRpc(null)
  }
  if (!rpc.error && rpc.names) return rpc.names

  // Fallback sin RPC: una fila por cada table_name distinto (gt cursor)
  const set = new Set<string>()
  let scoped = true
  let cursor = ''
  for (let hop = 0; hop < 80; hop++) {
    let q = supabase
      .from(AUDIT_TABLE)
      .select('table_name')
      .not('table_name', 'is', null)
      .order('table_name', { ascending: true })
      .limit(1)
    if (cursor) q = q.gt('table_name', cursor)
    if (scoped) q = withAppScope(q)
    const { data, error } = await q
    if (error && scoped && isMissingAppIdColumn(error.message)) {
      scoped = false
      cursor = ''
      set.clear()
      continue
    }
    if (error || !data?.length) break
    const name = String(data[0].table_name ?? '').trim()
    if (!name) break
    set.add(name)
    cursor = name
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Usuarios que aparecen como actores en la auditoría de ESTA aplicación
 * (no todo el catálogo profiles de bases/apps compartidas).
 */
export async function listUsuariosAuditoriaApp(): Promise<
  { id: string; name: string | null; email: string | null }[]
> {
  const fromRpc = async (appId: string | null) => {
    const { data, error } = await supabase.rpc('list_audit_user_ids', { p_app_id: appId })
    if (error) return { ids: null as string[] | null, error }
    const ids = (data ?? []).map((v: unknown) => String(v)).filter(Boolean)
    return { ids: [...new Set(ids)], error: null }
  }

  let rpc = await fromRpc(AUDIT_APP_ID)
  if (rpc.error && /app_id|does not exist|Could not find/i.test(rpc.error.message)) {
    rpc = await fromRpc(null)
  }

  let ids = rpc.ids
  if (rpc.error || !ids) {
    const build = (scoped: boolean) => {
      let q = supabase
        .from(AUDIT_TABLE)
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(5000)
      if (scoped) q = withAppScope(q)
      return q
    }
    let { data, error } = await build(true)
    if (error && isMissingAppIdColumn(error.message)) {
      ;({ data, error } = await build(false))
    }
    if (error) return []
    ids = [...new Set((data ?? []).map((r: any) => String(r.user_id)).filter(Boolean))]
  }

  if (!ids.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', ids)
    .or('is_blocked.is.null,is_blocked.eq.false')
    .order('name', { ascending: true })

  return (profiles ?? []).map(p => ({
    id: String(p.id),
    name: p.name ?? null,
    email: p.email ?? null,
  }))
}
