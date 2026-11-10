import { supabase } from './supabase'
import { supabaseFetchAll } from './supabaseFetchAll'
import { actaMontoAprobadoADesembolsar } from './actaEstado'
import { ajusteAdenda } from './planVigente'
import { cdpMontoVigente } from './cdpUtils'
import { calcAvanceDesembolso, calcSaldoDisponible, calcStrNeto } from './proyectoSaldos'
import { fmtMes, addBusinessDays, nowDateInputValue } from './format'
import type { InformesFilters } from '../components/InformesFiltersBar'
import { emptyInformesFilters } from '../components/InformesFiltersBar'
import type { InformeReportId } from './informesAdminCatalog'
import { isResolucionSoloAprobacion } from './resolucionTipo'

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

/** PostgREST corta URLs largas (~400) con `.in.(uuid,uuid,…)`. */
const IN_CHUNK = 80

async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (!ids.length) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    const { data, error } = await run(chunk)
    if (error) throw new Error(error.message)
    if (data?.length) out.push(...data)
  }
  return out
}

function optLabel(codigo?: string | null, descripcion?: string | null): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `${c} — ${d}`
  return c || d || '—'
}

function dateInRange(iso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!iso) return !(desde || hasta)
  const d = String(iso).slice(0, 10)
  if (desde && d < desde) return false
  if (hasta && d > hasta) return false
  return true
}

function monthBounds(mes: number, anio: number): { start: string; end: string; prevEnd: string } {
  const start = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const end = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const prev = new Date(anio, mes - 1, 0)
  const prevEnd = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
  return { start, end, prevEnd }
}

export type CascadeMaps = {
  actividadOpts: { id: string; label: string }[]
  programaOpts: { id: string; label: string; actividadId: string }[]
  componenteOpts: { id: string; label: string; programaId: string; actividadId: string }[]
}

export type InformePreview = {
  count: number
  totalGs: number
  secondaryLabel?: string
  secondaryGs?: number
}

export type InformePayload =
  | { kind: 'cartera_360'; rows: CarteraRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'pulso_mensual'; resumen: PulsoResumen; rows: PulsoRow[]; filterLabels: string[] }
  | { kind: 'cadena_ejecucion'; rows: CadenaRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'acta_resolucion_str'; rows: ActaResolucionStrRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'mapa_og_ff'; rows: MapaRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'radar_rendiciones'; rows: RadarRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'cronometro_vs_real'; rows: CronoRow[]; totals: InformePreview; filterLabels: string[] }
  | { kind: 'plan_vs_str'; anio: number; blocks: PlanVsStrBlock[]; totalDiferencia: number[]; totals: InformePreview; filterLabels: string[] }

export type CarteraRow = {
  proyecto: string
  actividad: string
  programa: string
  componente: string
  planVigente: number
  strNeto: number
  saldo: number
  avancePct: number
  pagosCount: number
}

export type PulsoResumen = {
  periodo: string
  cdpAnterior: number
  strAnterior: number
  cdpMes: number
  strMes: number
  devolMes: number
  planVigente: number
  strAcumFinMes: number
  saldoCierre: number
  compromisoPendienteMes: number
}

export type PulsoRow = {
  proyecto: string
  cdpAnterior: number
  strAnterior: number
  cdpMes: number
  strMes: number
  saldoCierre: number
}

export type CadenaRow = {
  proyecto: string
  cdp: number
  actas: number
  strNeto: number
  gapCdpActa: number
  gapActaStr: number
}

/** Comparativo por cada STR: proyecto, resolución vinculada y acta. */
export type ActaResolucionStrRow = {
  /** N.º de ítem secuencial (1…N) tras ordenar el listado. */
  item: number
  proyecto: string
  strNumero: string
  fecha: string
  resolucionNumero: string
  actaNumero: string
  /** Plan vigente del proyecto (plan + adendas). */
  montoProyectoTotal: number
  /** STR neto ejecutado del proyecto. */
  montoStrEjecutado: number
  /** Saldo del proyecto (Proy. total − STR ejecutado). */
  montoSaldoProyecto: number
  /** Monto de la STR actual (fila). */
  montoEsteStr: number
  /** Plan total de la resolución vinculada. */
  resolucionMontoTotal: number
  /** STR ejecutado contra esa resolución. */
  resolucionMontoEjecutado: number
  /** Saldo de la resolución (plan − ejecutado). */
  resolucionSaldo: number
  /** Monto aprobado a desembolsar del acta (0 si solo Aprobación). */
  actaAprobado: number
  /** STR ejecutado contra esa acta. */
  actaEjecutado: number
  /** Saldo del acta (aprobado a desembolsar − ejecutado). */
  actaSaldo: number
}

export type MapaRow = {
  og: string
  fuente: string
  plan: number
  ejecutado: number
  saldo: number
  avancePct: number
}

export type RadarRow = {
  proyecto: string
  str: string
  estado: string
  montoStr: number
  montoRendicion: number
  fechaDesembolso: string
  fechaLimite: string
  fechaPresentacion: string
  diasAtraso: number | null
  alerta: string
  /** Vencida la fecha límite y aún sin presentación de rendición. */
  vencidoSinPresentar: boolean
}

export type CronoRow = {
  periodo: string
  programado: number
  ejecutado: number
  desvio: number
  avancePct: number
}

/** Matriz anual plan vs STR por proyecto (12 meses). */
export type PlanVsStrBlock = {
  proyecto: string
  plan: number[]
  str: number[]
  devoluciones: number[]
  diferencia: number[]
}

type ProyLite = {
  id: string
  descripcion: string
  monto: number | null
  created_at: string | null
  mes: number | null
  anho: number | null
  actividadId: string
  actividadLabel: string
  programaId: string
  programaLabel: string
  componenteId: string
  componenteLabel: string
  /** Nombre del componente (descripción, sin código). */
  componenteNombre: string
}

async function loadProyectosLite(): Promise<ProyLite[]> {
  const { data, error } = await supabase
    .from('proyectos')
    .select(`
      id, descripcion, monto, created_at, mes, anho,
      componente:componentes_programa(
        id, codigo, descripcion,
        actividad:actividades(id, codigo, descripcion),
        programa:programas(id, codigo, descripcion)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.message)

  return (data ?? []).map((p: any) => {
    const comp = nest(p.componente)
    const act = nest(comp?.actividad)
    const prog = nest(comp?.programa)
    return {
      id: String(p.id),
      descripcion: (p.descripcion ?? '').trim() || '—',
      monto: p.monto != null ? Number(p.monto) : null,
      created_at: p.created_at ?? null,
      mes: p.mes != null ? Number(p.mes) : null,
      anho: p.anho != null ? Number(p.anho) : null,
      actividadId: act?.id ? String(act.id) : '',
      actividadLabel: optLabel(act?.codigo, act?.descripcion),
      programaId: prog?.id ? String(prog.id) : '',
      programaLabel: optLabel(prog?.codigo, prog?.descripcion),
      componenteId: comp?.id ? String(comp.id) : '',
      componenteLabel: optLabel(comp?.codigo, comp?.descripcion),
      componenteNombre: String(comp?.descripcion ?? '').trim() || String(comp?.codigo ?? '').trim(),
    }
  })
}

export function buildCascadeFromProyectos(proys: ProyLite[]): CascadeMaps {
  const actividades = new Map<string, string>()
  const programas = new Map<string, { label: string; actividadId: string }>()
  const componentes = new Map<string, { label: string; programaId: string; actividadId: string }>()

  for (const p of proys) {
    if (p.actividadId) actividades.set(p.actividadId, p.actividadLabel)
    if (p.programaId) {
      programas.set(p.programaId, { label: p.programaLabel, actividadId: p.actividadId })
    }
    if (p.componenteId) {
      componentes.set(p.componenteId, {
        label: p.componenteLabel,
        programaId: p.programaId,
        actividadId: p.actividadId,
      })
    }
  }

  return {
    actividadOpts: [...actividades.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    programaOpts: [...programas.entries()]
      .map(([id, v]) => ({ id, label: v.label, actividadId: v.actividadId }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    componenteOpts: [...componentes.entries()]
      .map(([id, v]) => ({
        id,
        label: v.label,
        programaId: v.programaId,
        actividadId: v.actividadId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
  }
}

function filterProyectos(proys: ProyLite[], f: InformesFilters, useCreatedAtRange: boolean): ProyLite[] {
  return proys.filter(p => {
    if (f.actividadId && p.actividadId !== f.actividadId) return false
    if (f.programaId && p.programaId !== f.programaId) return false
    if (f.componenteId && p.componenteId !== f.componenteId) return false
    if (useCreatedAtRange && (f.desde || f.hasta)) {
      if (!dateInRange(p.created_at, f.desde, f.hasta)) return false
    }
    return true
  })
}

function filterLabels(f: InformesFilters, cascade: CascadeMaps, mode: 'range' | 'month' | 'year'): string[] {
  const labels: string[] = []
  if (f.actividadId) {
    labels.push(`Actividad: ${cascade.actividadOpts.find(o => o.id === f.actividadId)?.label ?? f.actividadId}`)
  }
  if (f.programaId) {
    labels.push(`Programa: ${cascade.programaOpts.find(o => o.id === f.programaId)?.label ?? f.programaId}`)
  }
  if (f.componenteId) {
    labels.push(`Componente: ${cascade.componenteOpts.find(o => o.id === f.componenteId)?.label ?? f.componenteId}`)
  }
  if (mode === 'range') {
    if (f.desde) labels.push(`Desde: ${f.desde}`)
    if (f.hasta) labels.push(`Hasta: ${f.hasta}`)
  } else if (mode === 'year') {
    if (f.anio) labels.push(`Año: ${f.anio}`)
  } else {
    const m = Number(f.mes) || 0
    labels.push(`Período: ${fmtMes(m)} ${f.anio}`)
  }
  if (!labels.length) labels.push('Sin filtros (universo completo)')
  return labels
}

let proysCache: { at: number; rows: ProyLite[] } | null = null

export async function loadProyectosForInformes(): Promise<ProyLite[]> {
  const now = Date.now()
  if (proysCache && now - proysCache.at < 60_000) return proysCache.rows
  const rows = await loadProyectosLite()
  proysCache = { at: now, rows }
  return rows
}

type FinBundle = {
  planByProy: Record<string, number>
  adendaByProy: Record<string, number>
  strByProy: Record<string, { bruto: number; count: number; byDate: { fecha: string; monto: number }[] }>
  devolByProy: Record<string, { total: number; byDate: { fecha: string; monto: number }[] }>
  cdpByProy: Record<string, { total: number; byDate: { fecha: string; monto: number }[] }>
  actasByProy: Record<string, number>
  planLines: { proyecto_id: string; monto: number; og_id: string | null; fuente_id: string | null; plan_id: string }[]
  adendaByPlan: Record<string, number>
  strLines: { proyecto_id: string; monto: number; fecha: string; og_id: string | null; fuente_id: string | null; numero: string; id: string; fecha_desembolso: string | null; fecha_rendicion: string | null }[]
  cronograma: { plan_id: string; mes: number; anio: number; monto: number; proyecto_id: string }[]
  rendiciones: { str_id: string; monto: number; estado: string | null; fecha_presentacion: string | null }[]
  ogMap: Record<string, string>
  ffMap: Record<string, string>
}

let finCache: { at: number; key: string; bundle: FinBundle } | null = null

async function loadFinBundle(proyectoIds: string[]): Promise<FinBundle> {
  const empty: FinBundle = {
    planByProy: {},
    adendaByProy: {},
    strByProy: {},
    devolByProy: {},
    cdpByProy: {},
    actasByProy: {},
    planLines: [],
    adendaByPlan: {},
    strLines: [],
    cronograma: [],
    rendiciones: [],
    ogMap: {},
    ffMap: {},
  }
  if (!proyectoIds.length) return empty

  const key = [...proyectoIds].sort().join(',')
  const now = Date.now()
  if (finCache && finCache.key === key && now - finCache.at < 60_000) return finCache.bundle

  const [
    planesData, adendas, strsData, devoluciones, cdpsData, actasData, ogs, ffs, rends,
  ] = await Promise.all([
    selectInChunks<any>(proyectoIds, chunk =>
      supabase.from('planes_financieros')
        .select('id, proyecto_id, monto, objeto_de_gasto_id, fuente_financiamiento_id')
        .in('proyecto_id', chunk)
        .limit(8000),
    ),
    supabase.from('adendas')
      .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(id, proyecto_id)')
      .limit(8000),
    selectInChunks<any>(proyectoIds, chunk =>
          supabaseFetchAll(
            () => supabase.from('strs')
              .select('id, proyecto_id, monto, fecha, fecha_desembolso, fecha_rendicion, og_id, fuente_id, numero', { count: 'exact' })
              .in('proyecto_id', chunk)
              .order('id'),
          ),
    ),
    supabase.from('devoluciones')
      .select('monto, fecha, str:strs!inner(proyecto_id)')
      .limit(8000),
    selectInChunks<any>(proyectoIds, chunk =>
      supabase.from('budget_commitments')
        .select('proyecto_id, monto_comprometido, estado, cdp_date')
        .in('proyecto_id', chunk)
        .limit(8000),
    ),
    selectInChunks<any>(proyectoIds, chunk =>
      supabase.from('actas')
        .select('proyecto_id, monto_aprobado, estado')
        .in('proyecto_id', chunk)
        .limit(8000),
    ),
    supabase.from('objetos_de_gastos').select('id, codigo, descripcion').limit(3000),
    supabase.from('fuentes_financiamiento').select('id, descripcion').limit(1000),
    supabase.from('rendiciones_cuentas')
      .select('str_id, monto_rendicion, estado, fecha_presentacion_cgr')
      .limit(8000),
  ])

  if (adendas.error) throw new Error(adendas.error.message)
  if (devoluciones.error) throw new Error(devoluciones.error.message)

  const planes = { data: planesData }
  const strs = { data: strsData }
  const cdps = { data: cdpsData }
  const actas = { data: actasData }

  const planIds = (planes.data ?? []).map((p: any) => String(p.id))
  const planToProy: Record<string, string> = {}
  for (const p of planes.data ?? []) {
    const pid = String(p.proyecto_id)
    planToProy[String(p.id)] = pid
    empty.planByProy[pid] = (empty.planByProy[pid] ?? 0) + (Number(p.monto) || 0)
    empty.planLines.push({
      proyecto_id: pid,
      monto: Number(p.monto) || 0,
      og_id: p.objeto_de_gasto_id ? String(p.objeto_de_gasto_id) : null,
      fuente_id: p.fuente_financiamiento_id ? String(p.fuente_financiamiento_id) : null,
      plan_id: String(p.id),
    })
  }

  for (const a of adendas.data ?? []) {
    const plan = nest((a as any).plan)
    const planId = plan?.id ? String(plan.id) : ''
    const proyId = plan?.proyecto_id ? String(plan.proyecto_id) : ''
    if (!proyId || !proyectoIds.includes(proyId)) continue
    const adj = ajusteAdenda(a as any)
    empty.adendaByProy[proyId] = (empty.adendaByProy[proyId] ?? 0) + adj
    if (planId) empty.adendaByPlan[planId] = (empty.adendaByPlan[planId] ?? 0) + adj
  }

  for (const s of strs.data ?? []) {
    const pid = String(s.proyecto_id)
    const monto = Number(s.monto) || 0
    const fecha = String(s.fecha_desembolso || s.fecha || '').slice(0, 10)
    if (!empty.strByProy[pid]) empty.strByProy[pid] = { bruto: 0, count: 0, byDate: [] }
    empty.strByProy[pid].bruto += monto
    empty.strByProy[pid].count += 1
    if (fecha) empty.strByProy[pid].byDate.push({ fecha, monto })
    empty.strLines.push({
      proyecto_id: pid,
      monto,
      fecha,
      og_id: s.og_id ? String(s.og_id) : null,
      fuente_id: s.fuente_id ? String(s.fuente_id) : null,
      numero: String(s.numero ?? ''),
      id: String(s.id),
      fecha_desembolso: s.fecha_desembolso ? String(s.fecha_desembolso).slice(0, 10) : null,
      fecha_rendicion: s.fecha_rendicion ? String(s.fecha_rendicion).slice(0, 10) : null,
    })
  }

  for (const d of devoluciones.data ?? []) {
    const str = nest((d as any).str)
    const pid = str?.proyecto_id ? String(str.proyecto_id) : ''
    if (!pid || !proyectoIds.includes(pid)) continue
    const monto = Number(d.monto) || 0
    const fecha = String(d.fecha ?? '').slice(0, 10)
    if (!empty.devolByProy[pid]) empty.devolByProy[pid] = { total: 0, byDate: [] }
    empty.devolByProy[pid].total += monto
    if (fecha) empty.devolByProy[pid].byDate.push({ fecha, monto })
  }

  for (const c of cdps.data ?? []) {
    const pid = c.proyecto_id ? String(c.proyecto_id) : ''
    if (!pid) continue
    const monto = cdpMontoVigente(c as any)
    if (!monto) continue
    const fecha = String(c.cdp_date ?? '').slice(0, 10)
    if (!empty.cdpByProy[pid]) empty.cdpByProy[pid] = { total: 0, byDate: [] }
    empty.cdpByProy[pid].total += monto
    if (fecha) empty.cdpByProy[pid].byDate.push({ fecha, monto })
  }

  for (const a of actas.data ?? []) {
    const estado = String(a.estado ?? '').toLowerCase()
    if (estado.includes('anulad') || estado.includes('rechaz')) continue
    // Solo "Aprobación" no desembolsa: monto aprobado = 0
    if (estado === 'aprobación' || estado === 'aprobacion') continue
    const pid = String(a.proyecto_id)
    empty.actasByProy[pid] = (empty.actasByProy[pid] ?? 0) + (Number(a.monto_aprobado) || 0)
  }

  for (const o of ogs.data ?? []) {
    empty.ogMap[String(o.id)] = optLabel(o.codigo, o.descripcion)
  }
  for (const f of ffs.data ?? []) {
    empty.ffMap[String(f.id)] = (f.descripcion ?? '').trim() || '—'
  }
  for (const r of rends.data ?? []) {
    empty.rendiciones.push({
      str_id: String(r.str_id),
      monto: Number(r.monto_rendicion) || 0,
      estado: r.estado ?? null,
      fecha_presentacion: r.fecha_presentacion_cgr ? String(r.fecha_presentacion_cgr).slice(0, 10) : null,
    })
  }

  if (planIds.length) {
    const crono = await selectInChunks<any>(planIds, chunk =>
      supabase
        .from('cronograma_financiero')
        .select('plan_financiero_id, mes, anio, monto_programado')
        .in('plan_financiero_id', chunk)
        .limit(8000),
    )
    for (const c of crono) {
      const planId = String(c.plan_financiero_id)
      const proyId = planToProy[planId]
      if (!proyId) continue
      empty.cronograma.push({
        plan_id: planId,
        mes: Number(c.mes) || 0,
        anio: Number(c.anio) || 0,
        monto: Number(c.monto_programado) || 0,
        proyecto_id: proyId,
      })
    }
  }

  finCache = { at: Date.now(), key, bundle: empty }
  return empty
}

function sumByDateBefore(
  items: { fecha: string; monto: number }[] | undefined,
  beforeInclusive: string,
): number {
  if (!items?.length) return 0
  return items.reduce((s, i) => (i.fecha && i.fecha <= beforeInclusive ? s + i.monto : s), 0)
}

function sumByDateInRange(
  items: { fecha: string; monto: number }[] | undefined,
  start: string,
  end: string,
): number {
  if (!items?.length) return 0
  return items.reduce((s, i) => (i.fecha >= start && i.fecha <= end ? s + i.monto : s), 0)
}

export async function loadInformePayload(
  reportId: InformeReportId,
  filters: InformesFilters,
): Promise<InformePayload> {
  const allProys = await loadProyectosForInformes()
  const cascade = buildCascadeFromProyectos(allProys)
  const mode: 'range' | 'month' | 'year' =
    reportId === 'pulso_mensual' ? 'month' : reportId === 'plan_vs_str' ? 'year' : 'range'
  const labels = filterLabels(filters, cascade, mode)

  // En estos informes desde/hasta aplica a movimientos (fecha STR), no al alta del proyecto.
  const rangeOnStrFecha: InformeReportId[] = [
    'acta_resolucion_str',
    'mapa_og_ff',
    'radar_rendiciones',
    'cronometro_vs_real',
  ]
  const filtered = filterProyectos(
    allProys,
    filters,
    mode === 'range' && !rangeOnStrFecha.includes(reportId),
  )
  const ids = filtered.map(p => p.id)
  const fin = await loadFinBundle(ids)

  if (reportId === 'cartera_360') {
    const rows: CarteraRow[] = filtered.map(p => {
      const plan = (fin.planByProy[p.id] ?? 0) + (fin.adendaByProy[p.id] ?? 0)
      const planVigente = plan || Number(p.monto) || 0
      const bruto = fin.strByProy[p.id]?.bruto ?? 0
      const devol = fin.devolByProy[p.id]?.total ?? 0
      const strNeto = calcStrNeto(bruto, devol)
      return {
        proyecto: p.descripcion,
        actividad: p.actividadLabel,
        programa: p.programaLabel,
        componente: p.componenteLabel,
        planVigente,
        strNeto,
        saldo: calcSaldoDisponible(planVigente, bruto, devol),
        avancePct: calcAvanceDesembolso(planVigente, strNeto),
        pagosCount: fin.strByProy[p.id]?.count ?? 0,
      }
    })
    const totals: InformePreview = {
      count: rows.length,
      totalGs: rows.reduce((s, r) => s + r.planVigente, 0),
      secondaryLabel: 'STR neto',
      secondaryGs: rows.reduce((s, r) => s + r.strNeto, 0),
    }
    return { kind: 'cartera_360', rows, totals, filterLabels: labels }
  }

  if (reportId === 'pulso_mensual') {
    const mes = Number(filters.mes) || (new Date().getMonth() + 1)
    const anio = Number(filters.anio) || new Date().getFullYear()
    const { start, end, prevEnd } = monthBounds(mes, anio)

    const rows: PulsoRow[] = filtered.map(p => {
      const cdpAnt = sumByDateBefore(fin.cdpByProy[p.id]?.byDate, prevEnd)
      const strBrutoAnt = sumByDateBefore(fin.strByProy[p.id]?.byDate, prevEnd)
      const devolAnt = sumByDateBefore(fin.devolByProy[p.id]?.byDate, prevEnd)
      const strAnt = calcStrNeto(strBrutoAnt, devolAnt)
      const cdpMes = sumByDateInRange(fin.cdpByProy[p.id]?.byDate, start, end)
      const strMesBruto = sumByDateInRange(fin.strByProy[p.id]?.byDate, start, end)
      const devolMes = sumByDateInRange(fin.devolByProy[p.id]?.byDate, start, end)
      const strMes = calcStrNeto(strMesBruto, devolMes)
      const plan = (fin.planByProy[p.id] ?? 0) + (fin.adendaByProy[p.id] ?? 0) || Number(p.monto) || 0
      const strAcum = calcStrNeto(
        sumByDateBefore(fin.strByProy[p.id]?.byDate, end),
        sumByDateBefore(fin.devolByProy[p.id]?.byDate, end),
      )
      return {
        proyecto: p.descripcion,
        cdpAnterior: cdpAnt,
        strAnterior: strAnt,
        cdpMes,
        strMes,
        saldoCierre: plan - strAcum,
      }
    })

    const resumen: PulsoResumen = {
      periodo: `${fmtMes(mes)} ${anio}`,
      cdpAnterior: rows.reduce((s, r) => s + r.cdpAnterior, 0),
      strAnterior: rows.reduce((s, r) => s + r.strAnterior, 0),
      cdpMes: rows.reduce((s, r) => s + r.cdpMes, 0),
      strMes: rows.reduce((s, r) => s + r.strMes, 0),
      devolMes: filtered.reduce((s, p) => s + sumByDateInRange(fin.devolByProy[p.id]?.byDate, start, end), 0),
      planVigente: filtered.reduce((s, p) => {
        const plan = (fin.planByProy[p.id] ?? 0) + (fin.adendaByProy[p.id] ?? 0)
        return s + (plan || Number(p.monto) || 0)
      }, 0),
      strAcumFinMes: rows.reduce((s, r) => s + r.strAnterior + r.strMes, 0),
      saldoCierre: rows.reduce((s, r) => s + r.saldoCierre, 0),
      compromisoPendienteMes: rows.reduce((s, r) => s + (r.cdpMes - r.strMes), 0),
    }
    return { kind: 'pulso_mensual', resumen, rows, filterLabels: labels }
  }

  if (reportId === 'cadena_ejecucion') {
    const rows: CadenaRow[] = filtered.map(p => {
      const cdp = fin.cdpByProy[p.id]?.total ?? 0
      const actas = fin.actasByProy[p.id] ?? 0
      const bruto = fin.strByProy[p.id]?.bruto ?? 0
      const devol = fin.devolByProy[p.id]?.total ?? 0
      const strNeto = calcStrNeto(bruto, devol)
      return {
        proyecto: p.descripcion,
        cdp,
        actas,
        strNeto,
        gapCdpActa: cdp - actas,
        gapActaStr: actas - strNeto,
      }
    })
    return {
      kind: 'cadena_ejecucion',
      rows,
      totals: {
        count: rows.length,
        totalGs: rows.reduce((s, r) => s + r.cdp, 0),
        secondaryLabel: 'STR neto',
        secondaryGs: rows.reduce((s, r) => s + r.strNeto, 0),
      },
      filterLabels: labels,
    }
  }

  if (reportId === 'acta_resolucion_str') {
    const desde = filters.desde || ''
    const hasta = filters.hasta || ''
    const proyById = new Map(filtered.map(p => [p.id, p]))

    const strRows = ids.length
      ? await selectInChunks<any>(ids, chunk =>
          supabaseFetchAll(
            () => supabase.from('strs')
              .select('id, numero, fecha, fecha_desembolso, monto, proyecto_id, acta_id, resolution_id, nro_resolucion', { count: 'exact' })
              .in('proyecto_id', chunk)
              .order('id', { ascending: true }),
          ),
        )
      : []

    const strsFiltrados = strRows.filter(s => {
      const pid = String(s.proyecto_id ?? '')
      if (!proyById.has(pid)) return false
      return dateInRange(s.fecha, desde, hasta)
    })

    // Totales de proyecto (plan vigente + STR ejecutado)
    const montoProyectoByProy = new Map<string, number>()
    const strEjecutadoByProy = new Map<string, number>()
    for (const p of filtered) {
      const plan = (fin.planByProy[p.id] ?? 0) + (fin.adendaByProy[p.id] ?? 0) || Number(p.monto) || 0
      montoProyectoByProy.set(p.id, plan)
      const bruto = fin.strByProy[p.id]?.bruto ?? 0
      const devol = fin.devolByProy[p.id]?.total ?? 0
      strEjecutadoByProy.set(p.id, calcStrNeto(bruto, devol))
    }

    // Actas vinculadas — Aprob. a desemb. = monto aprobado a desembolsar (nunca solicitado)
    const actaIds = [...new Set(strsFiltrados.map(s => String(s.acta_id ?? '')).filter(Boolean))]
    const actaById = new Map<string, { numero: string; aprobado: number }>()
    const ejecutadoByActa = new Map<string, number>()
    if (actaIds.length) {
      const actas = await selectInChunks<any>(actaIds, chunk =>
        supabase.from('actas')
          .select('id, numero, monto_aprobado, estado')
          .in('id', chunk)
          .limit(8000),
      )
      const itemsSumByActa = new Map<string, number>()
      try {
        const actaItems = await selectInChunks<any>(actaIds, chunk =>
          supabase.from('acta_items')
            .select('acta_id, monto_ejecutado')
            .in('acta_id', chunk)
            .limit(8000),
        )
        for (const it of actaItems) {
          const aid = String(it.acta_id ?? '')
          if (!aid) continue
          itemsSumByActa.set(aid, (itemsSumByActa.get(aid) ?? 0) + (Number(it.monto_ejecutado) || 0))
        }
      } catch {
        // Si no existe monto_ejecutado, se usa solo cabecera monto_aprobado
      }
      for (const a of actas) {
        const aid = String(a.id)
        actaById.set(aid, {
          numero: String(a.numero ?? '').trim() || '—',
          aprobado: actaMontoAprobadoADesembolsar(a, itemsSumByActa.get(aid) ?? 0),
        })
      }
      // Ejecutado de acta = Σ STR con esa acta_id (universo del informe)
      for (const s of strRows) {
        const aid = String(s.acta_id ?? '')
        if (!aid || !actaById.has(aid)) continue
        ejecutadoByActa.set(aid, (ejecutadoByActa.get(aid) ?? 0) + (Number(s.monto) || 0))
      }
    }

    // Resoluciones vinculadas
    const resIds = [...new Set(strsFiltrados.map(s => String(s.resolution_id ?? '')).filter(Boolean))]
    const resById = new Map<string, { numero: string; tipo: string | null; plan: number }>()
    const ejecutadoByRes = new Map<string, number>()
    if (resIds.length) {
      const resolutions = await selectInChunks<any>(resIds, chunk =>
        supabase.from('resolutions')
          .select('id, numero, tipo')
          .in('id', chunk)
          .limit(8000),
      )
      for (const r of resolutions) {
        resById.set(String(r.id), {
          numero: String(r.numero ?? '').trim() || '—',
          tipo: r.tipo ?? null,
          plan: 0,
        })
      }
      const items = await selectInChunks<any>(resIds, chunk =>
        supabase.from('resolution_items')
          .select('resolution_id, monto')
          .in('resolution_id', chunk)
          .limit(8000),
      )
      for (const it of items) {
        const rid = String(it.resolution_id ?? '')
        const cur = resById.get(rid)
        if (!cur) continue
        if (isResolucionSoloAprobacion(cur.tipo)) continue
        cur.plan += Number(it.monto) || 0
      }
      // Ejecutado de resolución = Σ STR con esa resolution_id (universo del informe)
      for (const s of strRows) {
        const rid = String(s.resolution_id ?? '')
        if (!rid || !resById.has(rid)) continue
        ejecutadoByRes.set(rid, (ejecutadoByRes.get(rid) ?? 0) + (Number(s.monto) || 0))
      }
    }

    const rows: ActaResolucionStrRow[] = strsFiltrados.map(s => {
      const pid = String(s.proyecto_id ?? '')
      const proy = proyById.get(pid)
      const montoProyectoTotal = montoProyectoByProy.get(pid) ?? 0
      const montoStrEjecutado = strEjecutadoByProy.get(pid) ?? 0
      const montoEsteStr = Number(s.monto) || 0
      const rid = String(s.resolution_id ?? '')
      const res = rid ? resById.get(rid) : undefined
      const resolucionMontoTotal = res && !isResolucionSoloAprobacion(res.tipo) ? res.plan : 0
      const resolucionMontoEjecutado = rid ? (ejecutadoByRes.get(rid) ?? 0) : 0
      const aid = String(s.acta_id ?? '')
      const acta = aid ? actaById.get(aid) : undefined
      const actaAprobado = acta?.aprobado ?? 0
      const actaEjecutado = aid ? (ejecutadoByActa.get(aid) ?? 0) : 0
      const proyNombre = proy
        ? (proy.componenteNombre
          ? `${proy.descripcion} - ${proy.componenteNombre}`
          : proy.descripcion)
        : '—'
      return {
        item: 0,
        proyecto: proyNombre,
        strNumero: String(s.numero ?? '').trim() || '—',
        fecha: s.fecha ? String(s.fecha).slice(0, 10) : '',
        resolucionNumero: res?.numero
          || (String(s.nro_resolucion ?? '').trim() || '—'),
        actaNumero: acta?.numero ?? '—',
        montoProyectoTotal,
        montoStrEjecutado,
        montoSaldoProyecto: calcSaldoDisponible(montoProyectoTotal, montoStrEjecutado, 0),
        montoEsteStr,
        resolucionMontoTotal,
        resolucionMontoEjecutado,
        resolucionSaldo: resolucionMontoTotal - resolucionMontoEjecutado,
        actaAprobado,
        actaEjecutado,
        actaSaldo: actaAprobado - actaEjecutado,
      }
    }).sort((a, b) =>
      a.proyecto.localeCompare(b.proyecto, 'es')
      || a.fecha.localeCompare(b.fecha)
      || a.strNumero.localeCompare(b.strNumero, 'es'),
    ).map((r, i) => ({ ...r, item: i + 1 }))

    return {
      kind: 'acta_resolucion_str',
      rows,
      totals: {
        count: rows.length,
        totalGs: rows.reduce((s, r) => s + r.montoEsteStr, 0),
        secondaryLabel: 'Acta a desembolsar',
        secondaryGs: rows.reduce((s, r) => s + r.actaAprobado, 0),
      },
      filterLabels: labels,
    }
  }

  if (reportId === 'mapa_og_ff') {
    const planMap = new Map<string, number>()
    for (const line of fin.planLines) {
      const adj = fin.adendaByPlan[line.plan_id] ?? 0
      // distribute adenda proportionally is hard; add adj once per plan on first line
      const key = `${line.og_id ?? 'sin-og'}||${line.fuente_id ?? 'sin-ff'}`
      planMap.set(key, (planMap.get(key) ?? 0) + line.monto)
    }
    // add adendas by plan to their primary OG/FF line
    const planPrimary = new Map<string, string>()
    for (const line of fin.planLines) {
      if (!planPrimary.has(line.plan_id)) {
        planPrimary.set(line.plan_id, `${line.og_id ?? 'sin-og'}||${line.fuente_id ?? 'sin-ff'}`)
      }
    }
    for (const [planId, adj] of Object.entries(fin.adendaByPlan)) {
      const key = planPrimary.get(planId)
      if (!key || !adj) continue
      planMap.set(key, (planMap.get(key) ?? 0) + adj)
    }

    const execMap = new Map<string, number>()
    const devolTotal = Object.values(fin.devolByProy).reduce((s, d) => s + d.total, 0)
    const strTotal = fin.strLines.reduce((s, l) => s + l.monto, 0)
    for (const line of fin.strLines) {
      if (filters.desde || filters.hasta) {
        if (!dateInRange(line.fecha, filters.desde, filters.hasta)) continue
      }
      const key = `${line.og_id ?? 'sin-og'}||${line.fuente_id ?? 'sin-ff'}`
      // approximate neto: scale by overall devol ratio if needed — simpler: use bruto then note
      execMap.set(key, (execMap.get(key) ?? 0) + line.monto)
    }
    // apply global devolución proportionally to executed
    if (strTotal > 0 && devolTotal > 0) {
      const factor = 1 - devolTotal / strTotal
      for (const [k, v] of execMap) execMap.set(k, v * factor)
    }

    const keys = new Set([...planMap.keys(), ...execMap.keys()])
    const rows: MapaRow[] = [...keys].map(key => {
      const [ogId, ffId] = key.split('||')
      const plan = planMap.get(key) ?? 0
      const ejecutado = execMap.get(key) ?? 0
      return {
        og: ogId === 'sin-og' ? 'Sin OG' : (fin.ogMap[ogId] ?? ogId),
        fuente: ffId === 'sin-ff' ? 'Sin fuente' : (fin.ffMap[ffId] ?? ffId),
        plan,
        ejecutado,
        saldo: plan - ejecutado,
        avancePct: calcAvanceDesembolso(plan, ejecutado),
      }
    }).sort((a, b) => b.plan - a.plan)

    return {
      kind: 'mapa_og_ff',
      rows,
      totals: {
        count: rows.length,
        totalGs: rows.reduce((s, r) => s + r.plan, 0),
        secondaryLabel: 'Ejecutado',
        secondaryGs: rows.reduce((s, r) => s + r.ejecutado, 0),
      },
      filterLabels: labels,
    }
  }

  if (reportId === 'radar_rendiciones') {
    const strById = new Map(fin.strLines.map(s => [s.id, s]))
    const proyById = new Map(filtered.map(p => [p.id, p]))
    const today = nowDateInputValue()
    const rows: RadarRow[] = []

    const limiteDeStr = (str: { fecha_rendicion: string | null; fecha_desembolso: string | null }): string => {
      if (str.fecha_rendicion) return str.fecha_rendicion
      if (str.fecha_desembolso) return addBusinessDays(str.fecha_desembolso, 60)
      return ''
    }
    const diasDesdeLimite = (fechaLimite: string): number | null => {
      if (!fechaLimite || !today) return null
      const d0 = new Date(fechaLimite + 'T12:00:00')
      const d1 = new Date(today + 'T12:00:00')
      if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null
      return Math.floor((d1.getTime() - d0.getTime()) / 86_400_000)
    }

    for (const r of fin.rendiciones) {
      const str = strById.get(r.str_id)
      if (!str) continue
      const proy = proyById.get(str.proyecto_id)
      if (!proy) continue
      if (filters.desde || filters.hasta) {
        const ref = r.fecha_presentacion || str.fecha
        if (!dateInRange(ref, filters.desde, filters.hasta)) continue
      }
      const fechaLimite = limiteDeStr(str)
      const presentada = Boolean(r.fecha_presentacion)
      const vencidoSinPresentar = Boolean(fechaLimite && !presentada && fechaLimite < today)
      let diasAtraso: number | null = null
      let alerta = 'Al día'
      const estado = (r.estado ?? '').trim() || 'Sin estado'
      if (presentada) {
        alerta = 'Presentada'
      } else if (fechaLimite) {
        const days = diasDesdeLimite(fechaLimite)
        if (days != null && days > 0) {
          diasAtraso = days
          alerta = 'Atrasada'
        } else {
          alerta = 'Pendiente'
        }
      } else {
        alerta = 'Pendiente'
      }
      rows.push({
        proyecto: proy.descripcion,
        str: str.numero || str.id.slice(0, 8),
        estado,
        montoStr: str.monto,
        montoRendicion: r.monto,
        fechaDesembolso: str.fecha_desembolso || str.fecha || '—',
        fechaLimite: fechaLimite || '—',
        fechaPresentacion: r.fecha_presentacion || '—',
        diasAtraso,
        alerta,
        vencidoSinPresentar,
      })
    }

    // STRs without rendicion yet
    const rendStrIds = new Set(fin.rendiciones.map(r => r.str_id))
    for (const str of fin.strLines) {
      if (rendStrIds.has(str.id)) continue
      const proy = proyById.get(str.proyecto_id)
      if (!proy) continue
      if (filters.desde || filters.hasta) {
        if (!dateInRange(str.fecha, filters.desde, filters.hasta)) continue
      }
      const fechaLimite = limiteDeStr(str)
      const vencidoSinPresentar = Boolean(fechaLimite && fechaLimite < today)
      let diasAtraso: number | null = null
      let alerta = 'Sin rendición'
      if (fechaLimite) {
        const days = diasDesdeLimite(fechaLimite)
        if (days != null && days > 0) {
          diasAtraso = days
          alerta = 'Atrasada'
        }
      }
      rows.push({
        proyecto: proy.descripcion,
        str: str.numero || str.id.slice(0, 8),
        estado: 'Sin registro',
        montoStr: str.monto,
        montoRendicion: 0,
        fechaDesembolso: str.fecha_desembolso || str.fecha || '—',
        fechaLimite: fechaLimite || '—',
        fechaPresentacion: '—',
        diasAtraso,
        alerta,
        vencidoSinPresentar,
      })
    }

    return {
      kind: 'radar_rendiciones',
      rows,
      totals: {
        count: rows.length,
        totalGs: rows.reduce((s, r) => s + r.montoStr, 0),
        secondaryLabel: 'Rendido',
        secondaryGs: rows.reduce((s, r) => s + r.montoRendicion, 0),
      },
      filterLabels: labels,
    }
  }

  // plan_vs_str — matriz anual plan financiero vs STR por mes
  if (reportId === 'plan_vs_str') {
    const anio = Number(filters.anio) || new Date().getFullYear()
    const zeros = () => Array.from({ length: 12 }, () => 0)

    const planByProy = new Map<string, number[]>()
    for (const c of fin.cronograma) {
      if (!ids.includes(c.proyecto_id)) continue
      if (c.anio !== anio || c.mes < 1 || c.mes > 12) continue
      if (!planByProy.has(c.proyecto_id)) planByProy.set(c.proyecto_id, zeros())
      planByProy.get(c.proyecto_id)![c.mes - 1] += c.monto
    }

    const strByProy = new Map<string, number[]>()
    for (const s of fin.strLines) {
      if (!ids.includes(s.proyecto_id)) continue
      const fecha = s.fecha_desembolso || s.fecha
      if (!fecha || !fecha.startsWith(String(anio))) continue
      const m = Number(fecha.slice(5, 7))
      if (m < 1 || m > 12) continue
      if (!strByProy.has(s.proyecto_id)) strByProy.set(s.proyecto_id, zeros())
      strByProy.get(s.proyecto_id)![m - 1] += s.monto
    }

    const devolByProy = new Map<string, number[]>()
    for (const [pid, pack] of Object.entries(fin.devolByProy)) {
      if (!ids.includes(pid)) continue
      for (const d of pack.byDate) {
        if (!d.fecha.startsWith(String(anio))) continue
        const m = Number(d.fecha.slice(5, 7))
        if (m < 1 || m > 12) continue
        if (!devolByProy.has(pid)) devolByProy.set(pid, zeros())
        devolByProy.get(pid)![m - 1] += d.monto
      }
    }

    const blocks: PlanVsStrBlock[] = []
    const totalDiferencia = zeros()
    for (const p of filtered) {
      const plan = planByProy.get(p.id) ?? zeros()
      const str = strByProy.get(p.id) ?? zeros()
      const devoluciones = devolByProy.get(p.id) ?? zeros()
      const hasData = plan.some(v => v !== 0) || str.some(v => v !== 0) || devoluciones.some(v => v !== 0)
      if (!hasData) continue
      // Diferencia = plan − STR neto (STR bruto − devoluciones)
      const diferencia = plan.map((v, i) => v - (str[i] - devoluciones[i]))
      diferencia.forEach((v, i) => { totalDiferencia[i] += v })
      blocks.push({ proyecto: p.descripcion, plan, str, devoluciones, diferencia })
    }

    return {
      kind: 'plan_vs_str',
      anio,
      blocks,
      totalDiferencia,
      totals: {
        count: blocks.length,
        totalGs: blocks.reduce((s, b) => s + b.plan.reduce((a, v) => a + v, 0), 0),
        secondaryLabel: 'STR neto año',
        secondaryGs: blocks.reduce(
          (s, b) => s + b.str.reduce((a, v, i) => a + v - b.devoluciones[i], 0),
          0,
        ),
      },
      filterLabels: labels,
    }
  }

  // cronometro_vs_real
  const progMap = new Map<string, number>()
  for (const c of fin.cronograma) {
    if (!ids.includes(c.proyecto_id)) continue
    if (!c.mes || !c.anio) continue
    // `anio` se usa tal cual está persistido (p. ej. 2024). No se normaliza 24→2024.
    const key = `${c.anio}-${String(c.mes).padStart(2, '0')}`
    progMap.set(key, (progMap.get(key) ?? 0) + c.monto)
  }
  const execMap = new Map<string, number>()
  for (const s of fin.strLines) {
    if (!s.fecha) continue
    if (filters.desde || filters.hasta) {
      if (!dateInRange(s.fecha, filters.desde, filters.hasta)) continue
    }
    const key = s.fecha.slice(0, 7)
    execMap.set(key, (execMap.get(key) ?? 0) + s.monto)
  }
  // net devoluciones approx by month
  for (const [pid, pack] of Object.entries(fin.devolByProy)) {
    if (!ids.includes(pid)) continue
    for (const d of pack.byDate) {
      if (filters.desde || filters.hasta) {
        if (!dateInRange(d.fecha, filters.desde, filters.hasta)) continue
      }
      const key = d.fecha.slice(0, 7)
      execMap.set(key, (execMap.get(key) ?? 0) - d.monto)
    }
  }

  const keys = [...new Set([...progMap.keys(), ...execMap.keys()])].sort()
  const rows: CronoRow[] = keys.map(key => {
    const [y, m] = key.split('-').map(Number)
    const programado = progMap.get(key) ?? 0
    const ejecutado = execMap.get(key) ?? 0
    return {
      periodo: `${fmtMes(m)} ${y}`,
      programado,
      ejecutado,
      desvio: ejecutado - programado,
      avancePct: calcAvanceDesembolso(programado, ejecutado),
    }
  })

  return {
    kind: 'cronometro_vs_real',
    rows,
    totals: {
      count: rows.length,
      totalGs: rows.reduce((s, r) => s + r.programado, 0),
      secondaryLabel: 'Ejecutado',
      secondaryGs: rows.reduce((s, r) => s + r.ejecutado, 0),
    },
    filterLabels: labels,
  }
}

export function previewFromPayload(payload: InformePayload): InformePreview {
  if (payload.kind === 'pulso_mensual') {
    return {
      count: payload.rows.length,
      totalGs: payload.resumen.planVigente,
      secondaryLabel: 'Saldo cierre',
      secondaryGs: payload.resumen.saldoCierre,
    }
  }
  if (payload.kind === 'plan_vs_str') {
    return {
      count: payload.blocks.length,
      totalGs: payload.totals.totalGs,
      secondaryLabel: payload.totals.secondaryLabel,
      secondaryGs: payload.totals.secondaryGs,
    }
  }
  return payload.totals
}

/** Carga todos los informes admin aplicando los filtros del observatorio. */
export async function loadDashboardInformesPayloads(
  filters: InformesFilters = emptyInformesFilters(),
): Promise<Partial<Record<InformeReportId, InformePayload>>> {
  const range: InformesFilters = {
    ...filters,
    // mes/anio no afectan informes de rango; se conservan en el objeto para pulso/plan
  }
  const month: InformesFilters = {
    ...filters,
    desde: '',
    hasta: '',
    mes: filters.mes || String(new Date().getMonth() + 1),
    anio: filters.anio || String(new Date().getFullYear()),
  }
  const year: InformesFilters = {
    ...filters,
    desde: '',
    hasta: '',
    mes: '',
    anio: filters.anio || String(new Date().getFullYear()),
  }

  const specs: { id: InformeReportId; filters: InformesFilters }[] = [
    { id: 'cartera_360', filters: range },
    { id: 'pulso_mensual', filters: month },
    { id: 'cadena_ejecucion', filters: range },
    { id: 'acta_resolucion_str', filters: range },
    { id: 'mapa_og_ff', filters: range },
    { id: 'radar_rendiciones', filters: range },
    { id: 'cronometro_vs_real', filters: range },
    { id: 'plan_vs_str', filters: year },
  ]

  const results = await Promise.all(
    specs.map(async ({ id, filters: f }) => {
      try {
        const payload = await loadInformePayload(id, f)
        return [id, payload] as const
      } catch {
        return [id, null] as const
      }
    }),
  )

  const out: Partial<Record<InformeReportId, InformePayload>> = {}
  for (const [id, payload] of results) {
    if (payload) out[id] = payload
  }
  return out
}

/** IDs de proyectos que cumplen actividad/programa/componente (sin rango de fechas). */
export async function resolveFilteredProyectoIds(filters: InformesFilters): Promise<Set<string>> {
  const all = await loadProyectosForInformes()
  return new Set(
    all
      .filter(p => {
        if (filters.actividadId && p.actividadId !== filters.actividadId) return false
        if (filters.programaId && p.programaId !== filters.programaId) return false
        if (filters.componenteId && p.componenteId !== filters.componenteId) return false
        return true
      })
      .map(p => p.id),
  )
}
