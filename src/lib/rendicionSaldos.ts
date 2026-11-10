import { supabase } from './supabase'
import { asGs } from './format'

/** Evita URLs demasiado largas en `.in(...)` de PostgREST. */
const IN_CHUNK = 80

export type StrRendicionSaldo = {
  strId: string
  montoStr: number
  rendido: number
  saldo: number
}

function chunkIds<T>(ids: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/** Cache para prellenar `monto_rendicion` al elegir STR en el formulario. */
const strSaldoFormCache = new Map<string, number>()

export function peekStrSaldoFormCache(strId: string): number | undefined {
  return strSaldoFormCache.get(String(strId))
}

export function setStrSaldoFormCache(map: Map<string, number>): void {
  strSaldoFormCache.clear()
  for (const [k, v] of map) strSaldoFormCache.set(k, v)
}

export function setStrSaldoFormCacheEntry(strId: string, saldo: number): void {
  strSaldoFormCache.set(String(strId), saldo)
}

/**
 * Saldo a rendir de una STR:
 * `monto STR − Σ montos de todas las rendiciones` (opcionalmente excluyendo una en edición).
 */
export function calcSaldoStrARendir(montoStr: number, rendidoTotal: number): number {
  return asGs(montoStr) - asGs(rendidoTotal)
}

function strIdOf(row: any): string {
  return String(row?.str_id ?? row?.str?.id ?? '').trim()
}

function rendicionSortKey(r: {
  fecha_presentacion_cgr?: string | null
  created_at?: string | null
  id?: string
}): string {
  const fecha = String(r.fecha_presentacion_cgr ?? '').slice(0, 10) || '9999-99-99'
  const created = String(r.created_at ?? '')
  return `${fecha}|${created}|${r.id ?? ''}`
}

/**
 * Adjunta a cada fila:
 * - `str_rendido_total`: suma de TODAS las rendiciones de la STR
 * - `str_saldo_a_rendir`: saldo pendiente global de la STR (tras todas)
 * - `str_rendido_acumulado`: suma hasta esta rendición (orden por fecha CGR / created_at)
 * - `str_saldo_despues`: saldo de la STR DESPUÉS de esta rendición
 *
 * Ejemplo STR 44M → 1ª 22M (saldo 22M) → 2ª 22M (saldo 0).
 */
export async function attachStrRendicionSaldos(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const strIds = [...new Set(rows.map(strIdOf).filter(Boolean))]
  if (!strIds.length) return rows

  const data: {
    id: string
    str_id: string | null
    monto_rendicion: number | null
    fecha_presentacion_cgr: string | null
    created_at: string | null
  }[] = []
  let queryFailed = false
  const pageSize = 1000
  for (const part of chunkIds(strIds)) {
    let from = 0
    for (;;) {
      const { data: chunk, error } = await supabase
        .from('rendiciones_cuentas')
        .select('id, str_id, monto_rendicion, fecha_presentacion_cgr, created_at')
        .in('str_id', part)
        .range(from, from + pageSize - 1)
      if (error) {
        console.warn('[rendicionSaldos]', error.message)
        queryFailed = true
        break
      }
      const rows = (chunk as typeof data) ?? []
      data.push(...rows)
      if (rows.length < pageSize) break
      from += pageSize
    }
    if (queryFailed) break
  }

  // Si el query falla, usar las filas ya cargadas como respaldo.
  const source = !queryFailed
    ? data
    : rows.map(r => ({
        id: r.id,
        str_id: strIdOf(r),
        monto_rendicion: r.monto_rendicion,
        fecha_presentacion_cgr: r.fecha_presentacion_cgr,
        created_at: r.created_at,
      }))

  const byStr = new Map<string, typeof source>()
  for (const r of source) {
    const sid = String(r.str_id ?? '').trim()
    if (!sid) continue
    const list = byStr.get(sid) ?? []
    list.push(r)
    byStr.set(sid, list)
  }

  const montoStrById = new Map<string, number>()
  for (const row of rows) {
    const sid = strIdOf(row)
    if (sid && !montoStrById.has(sid)) {
      montoStrById.set(sid, asGs(row.str?.monto))
    }
  }

  const totalRendidoByStr = new Map<string, number>()
  const afterByRendicion = new Map<string, { acumulado: number; saldoDespues: number }>()

  for (const [sid, list] of byStr) {
    const montoStr = montoStrById.get(sid) ?? 0
    const ordered = [...list].sort((a, b) =>
      rendicionSortKey(a).localeCompare(rendicionSortKey(b)),
    )
    let acumulado = 0
    for (const r of ordered) {
      acumulado += asGs(r.monto_rendicion)
      afterByRendicion.set(String(r.id), {
        acumulado,
        saldoDespues: calcSaldoStrARendir(montoStr, acumulado),
      })
    }
    totalRendidoByStr.set(sid, acumulado)
  }

  return rows.map(row => {
    const sid = strIdOf(row)
    const montoStr = asGs(row.str?.monto)
    const totalRendido = totalRendidoByStr.get(sid) ?? asGs(row.monto_rendicion)
    const after = afterByRendicion.get(String(row.id))
    return {
      ...row,
      str_id: sid || row.str_id,
      str_rendido_total: totalRendido,
      str_saldo_a_rendir: calcSaldoStrARendir(montoStr, totalRendido),
      str_rendido_acumulado: after?.acumulado ?? asGs(row.monto_rendicion),
      str_saldo_despues: after?.saldoDespues ?? calcSaldoStrARendir(montoStr, asGs(row.monto_rendicion)),
    }
  })
}

export async function sumRendidoByStrIds(
  strIds: string[],
  excludeRendicionId?: string | null,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!strIds.length) return map

  const exclude = excludeRendicionId ? String(excludeRendicionId) : ''
  const pageSize = 1000

  for (const part of chunkIds(strIds)) {
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('rendiciones_cuentas')
        .select('id, str_id, monto_rendicion')
        .in('str_id', part)
        .range(from, from + pageSize - 1)

      if (error) {
        console.warn('[rendicionSaldos] sumRendidoByStrIds', error.message)
        break
      }

      const rows = data ?? []
      for (const r of rows) {
        if (exclude && String(r.id) === exclude) continue
        const sid = String(r.str_id ?? '').trim()
        if (!sid) continue
        map.set(sid, (map.get(sid) ?? 0) + asGs(r.monto_rendicion))
      }
      if (rows.length < pageSize) break
      from += pageSize
    }
  }
  return map
}

/** Mapa strId → saldo disponible (para el selector FK / nueva rendición). */
export async function fetchStrSaldoDisponibleMap(
  strRows: { id: string; monto?: number | null }[],
  excludeRendicionId?: string | null,
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!strRows.length) return result

  const strIds = strRows.map(r => String(r.id)).filter(Boolean)
  const rendidoByStr = await sumRendidoByStrIds(strIds, excludeRendicionId)
  const montoByStr = new Map(strRows.map(r => [String(r.id), asGs(r.monto)]))

  for (const sid of strIds) {
    const monto = montoByStr.get(sid) ?? 0
    const rendido = rendidoByStr.get(sid) ?? 0
    result.set(sid, calcSaldoStrARendir(monto, rendido))
  }

  setStrSaldoFormCache(result)
  return result
}

export async function fetchSaldoDisponibleStr(
  strId: string,
  montoStr: number,
  excludeRendicionId?: string | null,
): Promise<number> {
  const sid = String(strId).trim()
  const map = await sumRendidoByStrIds([sid], excludeRendicionId)
  return calcSaldoStrARendir(montoStr, map.get(sid) ?? 0)
}
