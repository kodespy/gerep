import { supabase } from './supabase'
import { ajusteAdenda } from './planVigente'
import { calcSaldoDisponible, calcStrNeto } from './proyectoSaldos'
import { displayOgPrincipal, indexOgs, ogCodigo, type OgLite } from './ogTransferencia'

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

export type CdpProyectoSaldo = {
  ejecutadoStr: number
  saldoProyecto: number
  uniqueKey: string
}

type Acc = {
  plan: number
  adendas: number
  strBruto: number
  devol: number
  montoProyecto: number
}

function emptyAcc(): Acc {
  return { plan: 0, adendas: 0, strBruto: 0, devol: 0, montoProyecto: 0 }
}

function saldoFromAcc(a: Acc): Omit<CdpProyectoSaldo, 'uniqueKey'> {
  const planVigente = a.plan + a.adendas
  const base = planVigente || a.montoProyecto
  return {
    ejecutadoStr: calcStrNeto(a.strBruto, a.devol),
    saldoProyecto: calcSaldoDisponible(base, a.strBruto, a.devol),
  }
}

const IN_CHUNK = 80

async function fetchOgsByIds(ids: string[]): Promise<OgLite[]> {
  const uniq = [...new Set(ids.map(String).filter(Boolean))]
  const out: OgLite[] = []
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion, og_principal_id')
      .in('id', uniq.slice(i, i + IN_CHUNK))
    out.push(...((data ?? []) as OgLite[]))
  }
  return out
}

async function loadOgCatalog(rawIds: string[]): Promise<Map<string, OgLite>> {
  const ogRows = await fetchOgsByIds(rawIds)
  const knownIds = new Set(ogRows.map(o => String(o.id ?? '')))
  const knownCodigos = new Set(ogRows.map(o => ogCodigo(o)).filter(Boolean))
  const parentRefs = [...new Set(
    ogRows
      .map(o => (o.og_principal_id != null ? String(o.og_principal_id).trim() : ''))
      .filter(Boolean),
  )]
  const missingIds = parentRefs.filter(r => /^[0-9a-f-]{36}$/i.test(r) && !knownIds.has(r))
  const missingCodigos = parentRefs.filter(r => !/^[0-9a-f-]{36}$/i.test(r) && !knownCodigos.has(r))
  if (missingIds.length) ogRows.push(...await fetchOgsByIds(missingIds))
  for (let i = 0; i < missingCodigos.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion, og_principal_id')
      .in('codigo', missingCodigos.slice(i, i + IN_CHUNK))
    ogRows.push(...((data ?? []) as OgLite[]))
  }
  return indexOgs(ogRows)
}

function principalCodigoOf(ogId: string | null | undefined, catalog: Map<string, OgLite>): string {
  const id = ogId != null ? String(ogId).trim() : ''
  if (!id) return ''
  const og = catalog.get(id) ?? catalog.get(`codigo:${id}`) ?? { id }
  return ogCodigo(displayOgPrincipal(og, catalog))
}

/** Ejecutado STR neto y saldo, por CDP: si hay plan administrativo, solo el OG de ese plan (839, 879…). */
export async function fetchCdpProyectoSaldos(rows: any[]): Promise<Map<string, CdpProyectoSaldo>> {
  const out = new Map<string, CdpProyectoSaldo>()
  const proyectoIds = [...new Set(rows.map(r => r.proyecto_id).filter(Boolean).map(String))]
  const adminIds = [...new Set(rows.map(r => r.plan_administrativo_id).filter(Boolean).map(String))]
  if (!proyectoIds.length) return out

  const [proy, planes, adendas, strs, devs, adminPlanes] = await Promise.all([
    supabase.from('proyectos').select('id, monto').in('id', proyectoIds),
    supabase.from('planes_financieros').select('proyecto_id, monto, objeto_de_gasto_id').in('proyecto_id', proyectoIds),
    supabase
      .from('adendas')
      .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id, objeto_de_gasto_id)')
      .in('plan.proyecto_id', proyectoIds),
    supabase.from('strs').select('proyecto_id, monto, og_id').in('proyecto_id', proyectoIds),
    supabase
      .from('devoluciones')
      .select('monto, str:strs!inner(proyecto_id, og_id)')
      .in('str.proyecto_id', proyectoIds),
    adminIds.length
      ? supabase.from('planes_financieros_administrativos').select('id, objeto_de_gasto_id').in('id', adminIds)
      : Promise.resolve({ data: [] as { id: string; objeto_de_gasto_id: string | null }[] }),
  ])

  const ogIds = [
    ...(planes.data ?? []).map(p => p.objeto_de_gasto_id),
    ...(strs.data ?? []).map(s => s.og_id),
    ...(adminPlanes.data ?? []).map(p => p.objeto_de_gasto_id),
    ...(adendas.data ?? []).map(a => nest((a as any).plan)?.objeto_de_gasto_id),
  ].filter(Boolean).map(String)

  const catalog = await loadOgCatalog(ogIds)

  const adminOg = new Map<string, string>()
  for (const p of adminPlanes.data ?? []) {
    adminOg.set(String(p.id), principalCodigoOf(p.objeto_de_gasto_id, catalog))
  }

  const allByProy = new Map<string, Acc>()
  const ogByProy = new Map<string, Map<string, Acc>>()
  const getAll = (pid: string) => {
    let a = allByProy.get(pid)
    if (!a) { a = emptyAcc(); allByProy.set(pid, a) }
    return a
  }
  const getOg = (pid: string, codigo: string) => {
    let byOg = ogByProy.get(pid)
    if (!byOg) { byOg = new Map(); ogByProy.set(pid, byOg) }
    let a = byOg.get(codigo)
    if (!a) { a = emptyAcc(); byOg.set(codigo, a) }
    return a
  }

  for (const id of proyectoIds) getAll(id)

  for (const p of proy.data ?? []) {
    const a = getAll(String(p.id))
    a.montoProyecto = Number(p.monto) || 0
  }
  for (const pl of planes.data ?? []) {
    const pid = String(pl.proyecto_id ?? '')
    if (!pid) continue
    const monto = Number(pl.monto) || 0
    getAll(pid).plan += monto
    const codigo = principalCodigoOf(pl.objeto_de_gasto_id, catalog)
    getOg(pid, codigo).plan += monto
  }
  for (const row of adendas.data ?? []) {
    const plan = nest((row as any).plan)
    const pid = String(plan?.proyecto_id ?? '')
    if (!pid) continue
    const adj = ajusteAdenda(row as any)
    getAll(pid).adendas += adj
    const codigo = principalCodigoOf(plan?.objeto_de_gasto_id, catalog)
    getOg(pid, codigo).adendas += adj
  }
  for (const s of strs.data ?? []) {
    const pid = String(s.proyecto_id ?? '')
    if (!pid) continue
    const monto = Number(s.monto) || 0
    getAll(pid).strBruto += monto
    const codigo = principalCodigoOf(s.og_id, catalog)
    getOg(pid, codigo).strBruto += monto
  }
  for (const d of devs.data ?? []) {
    const str = nest((d as any).str)
    const pid = String(str?.proyecto_id ?? '')
    if (!pid) continue
    const monto = Number(d.monto) || 0
    getAll(pid).devol += monto
    const codigo = principalCodigoOf(str?.og_id, catalog)
    getOg(pid, codigo).devol += monto
  }

  for (const row of rows) {
    const pid = row?.proyecto_id ? String(row.proyecto_id) : ''
    if (!pid) continue
    const adminId = row?.plan_administrativo_id ? String(row.plan_administrativo_id) : ''
    const ogCodigoKey = adminId ? (adminOg.get(adminId) ?? '') : ''
    const acc = ogCodigoKey
      ? (ogByProy.get(pid)?.get(ogCodigoKey) ?? emptyAcc())
      : (allByProy.get(pid) ?? emptyAcc())
    const uniqueKey = ogCodigoKey ? `${pid}||${ogCodigoKey}` : pid
    const computed = saldoFromAcc(ogCodigoKey ? { ...acc, montoProyecto: 0 } : acc)
    const saldo: CdpProyectoSaldo = { ...computed, uniqueKey }
    if (row?.id) out.set(String(row.id), saldo)
    if (!out.has(uniqueKey)) out.set(uniqueKey, saldo)
    if (!ogCodigoKey && !out.has(pid)) out.set(pid, saldo)
  }

  return out
}

export function cdpProyectoSaldoOf(
  row: any,
  saldos: Map<string, CdpProyectoSaldo>,
): CdpProyectoSaldo | null {
  const rid = row?.id ? String(row.id) : ''
  if (rid && saldos.has(rid)) return saldos.get(rid) ?? null
  const id = row?.proyecto_id ? String(row.proyecto_id) : ''
  if (!id) return null
  return saldos.get(id) ?? { ejecutadoStr: 0, saldoProyecto: 0, uniqueKey: id }
}

/** Suma ejecutado/saldo una vez por proyecto (y OG, si el CDP viene de un plan administrativo). */
export function sumUniqueProyectoSaldos(
  rows: any[],
  saldos: Map<string, CdpProyectoSaldo>,
): CdpProyectoSaldo {
  const seen = new Set<string>()
  let ejecutadoStr = 0
  let saldoProyecto = 0
  for (const r of rows) {
    const s = cdpProyectoSaldoOf(r, saldos)
    if (!s) continue
    const key = s.uniqueKey || (r?.proyecto_id ? String(r.proyecto_id) : '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    ejecutadoStr += s.ejecutadoStr
    saldoProyecto += s.saldoProyecto
  }
  return { ejecutadoStr, saldoProyecto, uniqueKey: '' }
}
