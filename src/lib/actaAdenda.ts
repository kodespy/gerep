import { fmtMoney } from './format'
import { ajusteAdenda } from './planVigente'
import { supabase } from './supabase'

export type ActaAdendaPick =
  | { kind: 'plan'; id: string }
  | { kind: 'adenda'; id: string }

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** Clave única de un ítem en el borrador / acta: plan original o adenda. */
export function actaItemDraftKey(planId: string, adendaId?: string | null): string {
  const a = String(adendaId ?? '').trim()
  if (a) return `adenda:${a}`
  return `plan:${String(planId ?? '').trim()}`
}

export function planPickValue(planId: string): string {
  return `plan:${planId}`
}

export function adendaPickValue(adendaId: string): string {
  return `adenda:${adendaId}`
}

export function parseActaItemPick(value: string): ActaAdendaPick | null {
  const v = String(value ?? '').trim()
  if (!v) return null
  if (v.startsWith('adenda:')) {
    const id = v.slice(7).trim()
    return id ? { kind: 'adenda', id } : null
  }
  if (v.startsWith('plan:')) {
    const id = v.slice(5).trim()
    return id ? { kind: 'plan', id } : null
  }
  return { kind: 'plan', id: v }
}

export function isMissingAdendaColumn(message: string | null | undefined): boolean {
  const m = message ?? ''
  if (isDuplicateAdendaItem(m)) return false
  return /column .*adenda_id|Could not find.*adenda_id|adenda_id.*does not exist/i.test(m)
}

export function isDuplicateAdendaItem(message: string | null | undefined): boolean {
  return /acta_items_adenda_id_uq|duplicate key.*adenda_id/i.test(message ?? '')
}

export function friendlyActaAdendaSaveError(message: string | null | undefined): string | null {
  if (isDuplicateAdendaItem(message)) {
    return 'Esta adenda ya está vinculada a un acta. Quite el ítem anterior o elija otra adenda.'
  }
  if (isMissingAdendaColumn(message) && /does not exist|schema cache|Could not find/i.test(message ?? '')) {
    return 'Falta la columna adenda_id. Ejecute la migración 042_acta_items_adenda.sql en Supabase.'
  }
  return null
}

export function actaAdendaNumerosFromItems(items: any[] | null | undefined): string[] {
  const nums: string[] = []
  const seen = new Set<string>()
  for (const it of items ?? []) {
    const n = String(asOne(it?.adenda)?.numero_adenda ?? '').trim()
    if (!n || seen.has(n)) continue
    seen.add(n)
    nums.push(n)
  }
  return nums
}

export function formatAdendaOptionLabel(a: {
  numero_adenda?: string | null
  tipo_ajuste?: string | null
  monto_ajuste?: number | null
  estado?: string | null
  plan?: { objeto?: { codigo?: string | null } | null } | null
}): string {
  const num = String(a.numero_adenda ?? '').trim() || '—'
  const og = a.plan?.objeto?.codigo ? `OG ${a.plan.objeto.codigo}` : ''
  const tipo = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? 'disminución' : 'aumento'
  const monto = Math.abs(Number(a.monto_ajuste) || 0)
  const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? '−' : '+'
  const parts = [`Adenda ${num}`]
  if (og) parts.push(og)
  parts.push(`${tipo} ${sign}${fmtMoney(monto)}`)
  return parts.join(' · ')
}

export function adendaMontoSugerido(a: {
  monto_ajuste?: number | null
  tipo_ajuste?: string | null
  estado?: string | null
}): number {
  return Math.abs(ajusteAdenda({
    monto_ajuste: Number(a.monto_ajuste) || 0,
    tipo_ajuste: a.tipo_ajuste ?? null,
    estado: a.estado ?? null,
  }))
}

/** Adjunta `_adendaNumeros` a cada acta (badge / PDF de listado). */
export async function attachActasAdendaLabels<T extends { id?: unknown; items?: any[] }>(
  rows: T[],
): Promise<(T & { _adendaNumeros: string[] })[]> {
  if (!rows.length) return []

  const fromEmbed = rows.map(r => ({
    ...r,
    _adendaNumeros: actaAdendaNumerosFromItems(r.items),
  }))
  if (fromEmbed.some(r => r._adendaNumeros.length)) return fromEmbed

  const ids = rows.map(r => String(r.id ?? '')).filter(Boolean)
  const byActa = new Map<string, string[]>()
  const IN = 80
  for (let i = 0; i < ids.length; i += IN) {
    const chunk = ids.slice(i, i + IN)
    const { data, error } = await supabase
      .from('acta_items')
      .select('acta_id, adenda_id, adenda:adendas(numero_adenda)')
      .in('acta_id', chunk)
      .not('adenda_id', 'is', null)
    if (error) return fromEmbed
    for (const it of data ?? []) {
      const aid = String((it as any).acta_id ?? '')
      const n = String(asOne((it as any).adenda)?.numero_adenda ?? '').trim()
      if (!aid || !n) continue
      const list = byActa.get(aid) ?? []
      if (!list.includes(n)) list.push(n)
      byActa.set(aid, list)
    }
  }
  return rows.map(r => ({
    ...r,
    _adendaNumeros: byActa.get(String(r.id ?? '')) ?? [],
  }))
}

/** Adendas ya usadas en otras actas (no en `exceptActaId`). */
export async function fetchUsedAdendaIds(exceptActaId?: string | null): Promise<Set<string>> {
  const except = String(exceptActaId ?? '').trim()
  const { data, error } = await supabase
    .from('acta_items')
    .select('adenda_id, acta_id')
    .not('adenda_id', 'is', null)
  if (error) return new Set()
  const out = new Set<string>()
  for (const r of data ?? []) {
    const id = String((r as any).adenda_id ?? '').trim()
    if (!id) continue
    if (except && String((r as any).acta_id ?? '') === except) continue
    out.add(id)
  }
  return out
}
