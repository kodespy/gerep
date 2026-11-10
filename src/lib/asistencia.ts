import { supabase } from './supabase'
import { getCurrentPosition, isInsideGeofence } from './geofence'
import { parseDbDateParts } from './format'

export type MarcacionTipo = 'entrada' | 'salida'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Hora de pared local (lo que muestra el reloj), sin offset.
 * Se guarda así para que coincida con el histórico de marcaciones
 * (timestamptz interpreta el número y la UI muestra esos mismos dígitos).
 */
export function nowLocalDateTime(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** Inicio del día local como texto de pared (para filtrar). */
export function startOfLocalDayIso(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T00:00:00`
}

export function endOfLocalDayIso(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T23:59:59`
}

/** Fecha YYYY-MM-DD según los dígitos guardados en BD (sin shift TZ). */
export function localDayKeyFromHora(hora: string): string {
  const p = parseDbDateParts(hora)
  if (!p) return hora.slice(0, 10)
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
}

/**
 * Muestra la hora tal como está guardada en BD (mismos dígitos),
 * para no romper marcaciones históricas.
 */
export function formatHoraLocal(hora: string | null | undefined): string {
  if (!hora) return '—'
  const p = parseDbDateParts(hora)
  if (!p || p.hh == null) return '—'
  return `${pad2(p.hh)}:${pad2(p.mm ?? 0)}:${pad2(p.ss ?? 0)}`
}

/** Fecha DD/MM/AAAA según dígitos guardados. */
export function formatFechaLocal(hora: string | null | undefined): string {
  if (!hora) return '—'
  const p = parseDbDateParts(hora)
  if (!p) return '—'
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`
}

/**
 * Duración entre dos marcas: usa el instante parseado.
 * Si ambas están en el mismo criterio (pared o UTC), la diferencia es válida.
 */
export function msBetweenHoras(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return tb - ta
}

export interface GeocercaConfig {
  id: string
  nombre_sede: string
  latitud: number
  longitud: number
  radio_metros: number
}

export interface AsistenciaMarcacion {
  id: string
  usuario_id: string
  tipo: string
  hora: string
  latitud?: number | null
  longitud?: number | null
  created_at?: string | null
  usuario?: { name?: string | null; email?: string | null; role?: string | null } | null
}

function normalizeTipo(raw: string | null | undefined): MarcacionTipo | null {
  const t = (raw ?? '').trim().toLowerCase()
  if (t === 'entrada' || t === 'entry' || t === 'in') return 'entrada'
  if (t === 'salida' || t === 'exit' || t === 'out') return 'salida'
  return null
}

function tipoDbLabel(tipo: MarcacionTipo): string {
  return tipo === 'entrada' ? 'entrada' : 'salida'
}

export async function loadGeocercaConfig(): Promise<GeocercaConfig | null> {
  const { data, error } = await supabase
    .from('configuracion_marcacion')
    .select('id, nombre_oficina, latitud_oficina, longitud_oficina, radio_tolerancia')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  return {
    id: String(row.id),
    nombre_sede: String(row.nombre_oficina ?? ''),
    latitud: Number(row.latitud_oficina),
    longitud: Number(row.longitud_oficina),
    radio_metros: Number(row.radio_tolerancia),
  }
}

export async function saveGeocercaConfig(input: {
  id?: string | null
  nombre_sede: string
  latitud: number
  longitud: number
  radio_metros: number
  updated_by?: string | null
}): Promise<GeocercaConfig> {
  const payload = {
    nombre_oficina: input.nombre_sede.trim(),
    latitud_oficina: input.latitud,
    longitud_oficina: input.longitud,
    radio_tolerancia: input.radio_metros,
    user_id: input.updated_by ?? null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('configuracion_marcacion')
      .update(payload)
      .eq('id', input.id)
      .select('id, nombre_oficina, latitud_oficina, longitud_oficina, radio_tolerancia')
      .single()
    if (error) throw error
    return {
      id: String(data.id),
      nombre_sede: String(data.nombre_oficina ?? ''),
      latitud: Number(data.latitud_oficina),
      longitud: Number(data.longitud_oficina),
      radio_metros: Number(data.radio_tolerancia),
    }
  }
  const { data, error } = await supabase
    .from('configuracion_marcacion')
    .insert(payload)
    .select('id, nombre_oficina, latitud_oficina, longitud_oficina, radio_tolerancia')
    .single()
  if (error) throw error
  return {
    id: String(data.id),
    nombre_sede: String(data.nombre_oficina ?? ''),
    latitud: Number(data.latitud_oficina),
    longitud: Number(data.longitud_oficina),
    radio_metros: Number(data.radio_tolerancia),
  }
}

function mapMarcacion(row: any): AsistenciaMarcacion {
  const usuario = Array.isArray(row.usuario) ? row.usuario[0] : row.usuario
  return {
    id: String(row.id),
    usuario_id: String(row.usuario_id ?? ''),
    tipo: String(row.tipo ?? ''),
    hora: String(row.hora ?? row.created_at ?? ''),
    latitud: row.latitud == null ? null : Number(row.latitud),
    longitud: row.longitud == null ? null : Number(row.longitud),
    created_at: row.created_at ?? null,
    usuario: usuario ?? null,
  }
}

export async function loadMarcacionesHoy(userId: string): Promise<AsistenciaMarcacion[]> {
  const { data, error } = await supabase
    .from('marcaciones')
    .select('id, usuario_id, tipo, hora, latitud, longitud, created_at')
    .eq('usuario_id', userId)
    .gte('hora', startOfLocalDayIso())
    .order('hora', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMarcacion)
}

export type EstadoAsistenciaHoy =
  | { key: 'sin_marcar'; label: string }
  | { key: 'en_oficina'; label: string }
  | { key: 'salida_marcada'; label: string }

export function estadoDesdeMarcaciones(rows: AsistenciaMarcacion[]): EstadoAsistenciaHoy {
  if (!rows.length) return { key: 'sin_marcar', label: 'Sin marcar hoy' }
  const last = rows[rows.length - 1]
  const tipo = normalizeTipo(last.tipo)
  if (tipo === 'entrada') return { key: 'en_oficina', label: 'En oficina' }
  if (tipo === 'salida') return { key: 'salida_marcada', label: 'Jornada cerrada' }
  return { key: 'sin_marcar', label: 'Sin marcar hoy' }
}

export async function marcarAsistencia(opts: {
  userId: string
  tipo: MarcacionTipo
  config: GeocercaConfig | null
}): Promise<{ marcacion: AsistenciaMarcacion; dentro: boolean; distancia: number | null }> {
  const pos = await getCurrentPosition()
  const lat = pos.coords.latitude
  const lng = pos.coords.longitude

  let dentro = true
  let distancia: number | null = null
  if (opts.config) {
    const check = isInsideGeofence(
      lat,
      lng,
      opts.config.latitud,
      opts.config.longitud,
      opts.config.radio_metros,
    )
    dentro = check.inside
    distancia = check.distance
  }

  if (!dentro) {
    const err = new Error('Ubicación Inválida') as Error & { code?: string; distancia?: number }
    err.code = 'GEO_INVALID'
    err.distancia = distancia ?? undefined
    throw err
  }

  const nowIso = nowLocalDateTime()
  const row = {
    usuario_id: opts.userId,
    tipo: tipoDbLabel(opts.tipo),
    hora: nowIso,
    latitud: lat,
    longitud: lng,
  }

  const { data, error } = await supabase
    .from('marcaciones')
    .insert(row)
    .select('id, usuario_id, tipo, hora, latitud, longitud, created_at')
    .single()
  if (error) throw error

  return {
    marcacion: mapMarcacion(data),
    dentro: true,
    distancia,
  }
}

export async function loadMarcacionesReporte(filters: {
  desde: string
  hasta: string
  usuarioId?: string | null
  tipo?: string | null
  limit?: number
}): Promise<AsistenciaMarcacion[]> {
  const desde = filters.desde.includes('T')
    ? filters.desde
    : `${filters.desde}T00:00:00`
  const hasta = filters.hasta.includes('T')
    ? filters.hasta
    : `${filters.hasta}T23:59:59`

  let q = supabase
    .from('marcaciones')
    .select('id, usuario_id, tipo, hora, latitud, longitud, created_at, usuario:profiles(name, email, role)')
    .gte('hora', desde)
    .lte('hora', hasta)
    .order('hora', { ascending: false })
    .limit(filters.limit ?? 2000)

  if (filters.usuarioId) q = q.eq('usuario_id', filters.usuarioId)
  if (filters.tipo) q = q.ilike('tipo', filters.tipo)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapMarcacion)
}
