import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import TruncatedText from '../../components/TruncatedText'
import { readSearchString, usePatchSearchParams } from '../../lib/urlState'
import { Plus, Pencil, Trash2, Search, FolderKanban, FileText, CalendarDays, Layers, ChevronLeft, ChevronRight, FileSpreadsheet, FileDown, LayoutGrid, LayoutList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card, Modal, ConfirmDialog, DeleteBlockedDialog, Spinner, EmptyState, PageHeader, Badge } from '../../components/ui'
import { RecordForm, type FieldDef } from '../../components/CrudModule'
import { fmtMoney, fmtMoneyCompact, fmtMes, fmtDate, MESES } from '../../lib/format'
import { actaMontoAprobadoADesembolsar } from '../../lib/actaEstado'
import { calcAvanceDesembolso, calcSaldoDisponible } from '../../lib/proyectoSaldos'
import {
  buildOgCatalog,
  buildProyectoExportRows,
  collectOgsByProyecto,
  emptyProyectoAgg,
  exportProyectosExcel,
  exportProyectosPdf,
  ogRefFromId,
  type ProyectoAgg,
  type ProyectoOgAggs,
  type ProyectoOgRef,
} from '../../lib/exportProyectos'
import {
  deleteConfirmMessage,
  findDeleteVinculos,
  friendlyDeleteError,
  safeDeleteById,
  type DeleteVinculo,
} from '../../lib/deleteGuard'

const FIELDS: FieldDef[] = [
  { name: 'descripcion', label: 'Descripción del proyecto', type: 'textarea', required: true },
  { name: 'monto', label: 'Monto', type: 'money' },
  {
    name: 'componente_id', label: 'Componente (programa)', type: 'fk',
    fk: { table: 'componentes_programa', select: 'id,codigo,descripcion, programa:programas(codigo)', label: (r: any) => `${r.programa?.codigo ?? ''} · ${r.codigo}`, sub: (r: any) => r.descripcion ?? '', orderBy: 'codigo' },
  },
  {
    name: 'expediente_id', label: 'Expediente de origen', type: 'fk',
    fk: {
      table: 'expedientes',
      select: 'id,numero_expediente,asunto,fecha_recepcion',
      label: (r: any) => r.numero_expediente,
      sub: (r: any) => r.asunto ?? '',
      orderBy: 'fecha_recepcion',
      orderAscending: false,
      fetchAll: true,
      limit: 10_000,
    },
  },
  { name: 'mes', label: 'Mes', type: 'select', options: MESES.map((m, i) => ({ value: String(i + 1), label: m })) },
  { name: 'anho', label: 'Año', type: 'number', defaultValue: new Date().getFullYear() },
]

/** signo del ajuste de una adenda (disminución resta); se ignoran rechazadas/anuladas */
function ajusteAdenda(a: { monto_ajuste: number; tipo_ajuste: string | null; estado: string | null }): number {
  const estado = (a.estado ?? '').toLowerCase()
  if (estado.includes('rechaz') || estado.includes('anulad')) return 0
  const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
  return sign * (Number(a.monto_ajuste) || 0)
}

const EMPTY_AGG = emptyProyectoAgg

function nestRel<T = any>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** Tono de la ficha según el avance de desembolso. */
const TONOS = [
  { max: 0, label: 'Sin desembolsos', card: 'border-slate-200/70 bg-white', bar: 'from-slate-300 to-slate-200', track: 'bg-slate-100', pct: 'text-slate-500', dot: 'bg-slate-300' },
  { max: 39, label: 'Inicial (< 40%)', card: 'border-amber-200 bg-amber-50/70 hover:border-amber-300', bar: 'from-amber-500 to-amber-400', track: 'bg-amber-100', pct: 'text-amber-700', dot: 'bg-amber-400' },
  { max: 79, label: 'En avance (40–79%)', card: 'border-sky-200 bg-sky-50/70 hover:border-sky-300', bar: 'from-sky-500 to-sky-400', track: 'bg-sky-100', pct: 'text-sky-700', dot: 'bg-sky-400' },
  { max: 99, label: 'Avanzado (80–99%)', card: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300', bar: 'from-emerald-500 to-emerald-400', track: 'bg-emerald-100', pct: 'text-emerald-700', dot: 'bg-emerald-400' },
  { max: 100, label: 'Completado (100%)', card: 'border-emerald-300 bg-emerald-50 hover:border-emerald-400', bar: 'from-emerald-600 to-emerald-500', track: 'bg-emerald-100', pct: 'text-emerald-800', dot: 'bg-emerald-600' },
]

const tonoDe = (pct: number) => TONOS.find(t => pct <= t.max) ?? TONOS[0]

type VistaProyectos = 'cards' | 'list'
const VIEW_STORAGE_KEY = 'gep-proyectos-view'

function readStoredView(): VistaProyectos {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function proyectoPeriodo(p: { mes?: number | string | null; anho?: number | string | null; created_at?: string | null }): { fecha: string; byMonth: boolean } {
  const mes = Number(p.mes)
  const anho = Number(p.anho)
  if (anho > 1900 && mes >= 1 && mes <= 12) {
    return { fecha: `${anho}-${pad2(mes)}-01`, byMonth: true }
  }
  const c = String(p.created_at ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(c)) return { fecha: c.slice(0, 10), byMonth: false }
  return { fecha: '', byMonth: false }
}

function inDateRange(fecha: string, desde: string, hasta: string, byMonth: boolean) {
  if (!desde && !hasta) return true
  if (!fecha) return false
  if (byMonth) {
    const ym = fecha.slice(0, 7)
    if (desde && ym < desde.slice(0, 7)) return false
    if (hasta && ym > hasta.slice(0, 7)) return false
    return true
  }
  if (desde && fecha < desde) return false
  if (hasta && fecha > hasta) return false
  return true
}

export default function ProyectosList() {
  const { searchParams, patch } = usePatchSearchParams()
  const [rows, setRows] = useState<any[]>([])
  const [aggs, setAggs] = useState<Record<string, ProyectoAgg>>({})
  const [loading, setLoading] = useState(true)
  const [ogsByProyecto, setOgsByProyecto] = useState<Record<string, ProyectoOgRef[]>>({})
  const [aggsByProyectoOg, setAggsByProyectoOg] = useState<ProyectoOgAggs>({})
  const [separarPorOg, setSepararPorOg] = useState(() => searchParams.get('sep_og') === '1')
  const [q, setQ] = useState(() => readSearchString(searchParams, 'q'))
  const [fActividad, setFActividad] = useState(() => readSearchString(searchParams, 'actividad'))
  const [fComponente, setFComponente] = useState(() => readSearchString(searchParams, 'componente'))
  const [desde, setDesde] = useState(() => readSearchString(searchParams, 'desde'))
  const [hasta, setHasta] = useState(() => readSearchString(searchParams, 'hasta'))
  const [view, setView] = useState<VistaProyectos>(() => {
    const v = readSearchString(searchParams, 'vista')
    return v === 'list' || v === 'cards' ? v : readStoredView()
  })
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)
  const [blocked, setBlocked] = useState<{ row: any; vinculos: DeleteVinculo[] } | null>(null)
  const [checkingDelete, setCheckingDelete] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [proys, planes, adendas, strs, devoluciones, cdps, actas, resol, conv, rends] = await Promise.all([
      supabase.from('proyectos')
        .select('*, componente:componentes_programa(id, codigo, descripcion, actividad:actividades(id, codigo, descripcion), programa:programas(codigo, descripcion)), expediente:expedientes(numero_expediente)')
        .order('created_at', { ascending: false }).limit(2000),
      supabase.from('planes_financieros').select('proyecto_id, monto, objeto_de_gasto_id').limit(5000),
      supabase.from('adendas').select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id, objeto_de_gasto_id)').limit(5000),
      supabase.from('strs').select('proyecto_id, monto, og_id').limit(5000),
      supabase.from('devoluciones').select('monto, str:strs!inner(proyecto_id, acta_id, og_id)').limit(5000),
      supabase.from('budget_commitments').select('proyecto_id, monto_comprometido, estado').limit(5000),
      supabase.from('actas').select('proyecto_id, monto_aprobado, estado').limit(5000),
      supabase.from('resolution_proyectos').select('proyecto_id').limit(5000),
      supabase.from('convenios').select('proyecto_id').limit(5000),
      supabase.from('rendiciones_cuentas').select('monto_rendicion, str:strs!inner(proyecto_id, og_id)').limit(5000),
    ])
    const map: Record<string, ProyectoAgg> = {}
    const get = (id: string) => (map[id] ??= EMPTY_AGG())
    for (const p of planes.data ?? []) if (p.proyecto_id) get(p.proyecto_id).plan += Number(p.monto) || 0
    for (const a of adendas.data ?? []) {
      const pid = nestRel((a as any).plan)?.proyecto_id
      if (!pid) continue
      const g = get(pid)
      g.adendas += ajusteAdenda(a as any)
      g.adendaCount++
    }
    for (const s of strs.data ?? []) {
      if (!s.proyecto_id) continue
      const g = get(s.proyecto_id)
      const monto = Number(s.monto) || 0
      g.strBruto += monto
      g.str += monto
    }
    for (const c of cdps.data ?? []) {
      if (!c.proyecto_id || (c.estado ?? '').toLowerCase().includes('anulad')) continue
      const g = get(c.proyecto_id)
      g.cdp += Number(c.monto_comprometido) || 0
      g.cdpCount++
    }
    for (const a of actas.data ?? []) {
      if (!a.proyecto_id) continue
      const g = get(a.proyecto_id)
      g.actas += actaMontoAprobadoADesembolsar(a)
      g.actaCount++
    }
    for (const r of resol.data ?? []) if (r.proyecto_id) get(r.proyecto_id).resolCount++
    for (const c of conv.data ?? []) if (c.proyecto_id) get(c.proyecto_id).convCount++
    for (const r of rends.data ?? []) {
      const pid = nestRel((r as any).str)?.proyecto_id
      if (!pid) continue
      const g = get(pid)
      g.rend += Number(r.monto_rendicion) || 0
      g.rendCount++
    }
    // las devoluciones descuentan del desembolsado STR
    for (const d of devoluciones.data ?? []) {
      const pid = nestRel((d as any).str)?.proyecto_id
      if (!pid) continue
      const g = get(pid)
      const monto = Number(d.monto) || 0
      g.str -= monto
      g.devol += monto
      g.devolCount++
      if (nestRel((d as any).str)?.acta_id) g.devolActa += monto
    }
    const planRows = planes.data ?? []
    const ogIds = [...new Set([
      ...planRows.map(p => p.objeto_de_gasto_id),
      ...(strs.data ?? []).map(s => s.og_id),
    ].filter(Boolean).map(String))]
    const ogRows: { id?: string; codigo?: string | null; descripcion?: string | null; og_principal_id?: string | number | null }[] = []
    for (let i = 0; i < ogIds.length; i += 80) {
      const chunk = ogIds.slice(i, i + 80)
      const { data } = await supabase.from('objetos_de_gastos')
        .select('id, codigo, descripcion, og_principal_id')
        .in('id', chunk)
      ogRows.push(...(data ?? []))
    }
    const knownIds = new Set(ogRows.map(o => String(o.id ?? '')))
    const knownCodigos = new Set(ogRows.map(o => String(o.codigo ?? '').trim()).filter(Boolean))
    const parentRefs = [...new Set(ogRows.map(o => o.og_principal_id).filter(v => v != null && String(v).trim() !== '').map(v => String(v).trim()))]
    const missingIds = parentRefs.filter(r => /^[0-9a-f-]{36}$/i.test(r) && !knownIds.has(r))
    const missingCodigos = parentRefs.filter(r => !/^[0-9a-f-]{36}$/i.test(r) && !knownCodigos.has(r))
    for (let i = 0; i < missingIds.length; i += 80) {
      const { data } = await supabase.from('objetos_de_gastos')
        .select('id, codigo, descripcion, og_principal_id')
        .in('id', missingIds.slice(i, i + 80))
      ogRows.push(...(data ?? []))
    }
    for (let i = 0; i < missingCodigos.length; i += 80) {
      const { data } = await supabase.from('objetos_de_gastos')
        .select('id, codigo, descripcion, og_principal_id')
        .in('codigo', missingCodigos.slice(i, i + 80))
      ogRows.push(...(data ?? []))
    }

    const catalog = buildOgCatalog(ogRows)
    const ogAggs: ProyectoOgAggs = {}
    const getOg = (pid: string, ogId: string | null | undefined) => {
      const codigo = ogRefFromId(ogId, catalog).codigo
      ogAggs[pid] ??= {}
      ogAggs[pid][codigo] ??= EMPTY_AGG()
      return ogAggs[pid][codigo]
    }
    for (const p of planRows) {
      if (!p.proyecto_id) continue
      getOg(p.proyecto_id, p.objeto_de_gasto_id).plan += Number(p.monto) || 0
    }
    for (const a of adendas.data ?? []) {
      const plan = nestRel((a as any).plan)
      const pid = plan?.proyecto_id
      if (!pid) continue
      const g = getOg(pid, plan?.objeto_de_gasto_id)
      g.adendas += ajusteAdenda(a as any)
      g.adendaCount++
    }
    for (const s of strs.data ?? []) {
      if (!s.proyecto_id) continue
      const g = getOg(s.proyecto_id, s.og_id)
      const monto = Number(s.monto) || 0
      g.strBruto += monto
      g.str += monto
    }
    for (const r of rends.data ?? []) {
      const str = nestRel((r as any).str)
      const pid = str?.proyecto_id
      if (!pid) continue
      const g = getOg(pid, str?.og_id)
      g.rend += Number(r.monto_rendicion) || 0
      g.rendCount++
    }
    for (const d of devoluciones.data ?? []) {
      const str = nestRel((d as any).str)
      const pid = str?.proyecto_id
      if (!pid) continue
      const g = getOg(pid, str?.og_id)
      const monto = Number(d.monto) || 0
      g.str -= monto
      g.devol += monto
      g.devolCount++
      if (str?.acta_id) g.devolActa += monto
    }
    for (const [pid, total] of Object.entries(map)) {
      const byOg = ogAggs[pid] ?? (ogAggs[pid] = {})
      const keys = Object.keys(byOg)
      const planTotal = total.plan
      if (keys.length === 0) {
        byOg[''] = { ...total }
        continue
      }
      for (const key of keys) {
        const share = planTotal > 0 ? byOg[key].plan / planTotal : 0
        byOg[key].cdp = total.cdp * share
        byOg[key].cdpCount = share > 0 ? total.cdpCount : 0
        byOg[key].actas = total.actas * share
        byOg[key].actaCount = share > 0 ? total.actaCount : 0
      }
      const allocated = keys.reduce((s, k) => s + (planTotal > 0 ? byOg[k].plan / planTotal : 0), 0)
      if (allocated < 0.999 && (total.cdp || total.actas)) {
        const rest = 1 - allocated
        const g = getOg(pid, null)
        g.cdp += total.cdp * rest
        g.actas += total.actas * rest
      }
    }

    const ogLinks = [
      ...planRows.map(p => ({ proyecto_id: p.proyecto_id, objeto_de_gasto_id: p.objeto_de_gasto_id })),
      ...(strs.data ?? []).map(s => ({ proyecto_id: s.proyecto_id, objeto_de_gasto_id: s.og_id })),
    ]

    setRows(proys.data ?? [])
    setAggs(map)
    setOgsByProyecto(collectOgsByProyecto(ogLinks, ogRows))
    setAggsByProyectoOg(ogAggs)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // opciones de filtro derivadas de los proyectos cargados
  const actividades = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      const a = r.componente?.actividad
      if (a?.id && !map.has(a.id)) map.set(a.id, `${a.codigo ? a.codigo + ' — ' : ''}${a.descripcion ?? ''}`)
    }
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((x, y) => x.label.localeCompare(y.label))
  }, [rows])

  const componentes = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      const c = r.componente
      if (!c?.id || map.has(c.id)) continue
      if (fActividad && c.actividad?.id !== fActividad) continue
      map.set(c.id, `${c.codigo} — ${c.descripcion ?? ''}`)
    }
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((x, y) => x.label.localeCompare(y.label))
  }, [rows, fActividad])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter(r => {
      if (fActividad && r.componente?.actividad?.id !== fActividad) return false
      if (fComponente && r.componente?.id !== fComponente) return false
      const periodo = proyectoPeriodo(r)
      if (!inDateRange(periodo.fecha, desde, hasta, periodo.byMonth)) return false
      if (!t) return true
      const haystack = [
        r.descripcion,
        r.componente?.codigo,
        r.componente?.descripcion,
        r.componente?.actividad?.codigo,
        r.componente?.actividad?.descripcion,
        r.componente?.programa?.codigo,
        r.componente?.programa?.descripcion,
        r.expediente?.numero_expediente,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(t)
    })
  }, [rows, q, fActividad, fComponente, desde, hasta])

  const PAGE_SIZE = view === 'list' ? 20 : 12
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paginated = useMemo(() => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE), [filtered, pageSafe, PAGE_SIZE])

  useEffect(() => { setPage(1) }, [q, fActividad, fComponente, desde, hasta, view])
  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* ignore */ }
  }, [view])
  useEffect(() => {
    patch({
      q: q.trim() || null,
      actividad: fActividad || null,
      componente: fComponente || null,
      desde: desde || null,
      hasta: hasta || null,
      vista: view === 'list' ? 'list' : null,
      sep_og: separarPorOg ? true : null,
    })
  }, [q, fActividad, fComponente, desde, hasta, view, separarPorOg, patch])

  const exportRows = useMemo(() => buildProyectoExportRows(filtered, aggs), [filtered, aggs])
  const exportFilename = `proyectos-${new Date().toISOString().slice(0, 10)}`

  const save = async (values: Record<string, any>, existing?: any) => {
    if (existing) {
      const { error } = await supabase.from('proyectos').update(values).eq('id', existing.id)
      if (error) throw error
      setEditing(null)
    } else {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('proyectos').insert({ ...values, user_id: u.user?.id })
      if (error) throw error
      setCreating(false)
    }
    await load()
  }

  /** Un proyecto con avance o vínculos no puede eliminarse. */
  const tryDelete = async (row: any) => {
    setCheckingDelete(row.id)
    try {
      const vinculos = await findDeleteVinculos('proyectos', String(row.id))
      if (vinculos.length > 0) setBlocked({ row, vinculos })
      else setDeleting(row)
    } finally {
      setCheckingDelete(null)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById('proyectos', String(deleting.id))
      setDeleting(null)
      await load()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar el proyecto.')
      setDeleting(null)
    }
  }

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Ejecución"
        title="Proyectos"
        subtitle="Cada ficha resume el estado financiero del proyecto — haga clic para abrir su vista 360°"
        actions={
          <>
            <label
              className="flex h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm"
              title="En Excel y PDF, agrupa los proyectos por objeto de gasto (839, 879, 851…)"
            >
              <input
                type="checkbox"
                checked={separarPorOg}
                onChange={e => setSepararPorOg(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Separar por OG
            </label>
            <button onClick={() => exportProyectosExcel(exportRows, exportFilename, { separarPorOg, ogsByProyecto, aggsByProyectoOg })} disabled={loading || exportRows.length === 0}
              title="Exportar listado filtrado a Excel"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button onClick={() => void exportProyectosPdf(exportRows, exportFilename, { separarPorOg, ogsByProyecto, aggsByProyectoOg })} disabled={loading || exportRows.length === 0}
              title="Exportar listado filtrado a PDF"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-rose-300 hover:text-rose-700 disabled:opacity-40">
              <FileDown className="h-4 w-4" /> PDF
            </button>
            <button onClick={() => setCreating(true)}
              className="gradient-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por descripción, actividad o expediente…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10" />
        </div>
        <select value={fActividad} onChange={e => { setFActividad(e.target.value); setFComponente('') }}
          className="max-w-[260px] rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10">
          <option value="">Todas las actividades</option>
          {actividades.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fComponente} onChange={e => setFComponente(e.target.value)}
          className="max-w-[260px] rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10">
          <option value="">Todos los componentes</option>
          {componentes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Desde
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
        {(q || fActividad || fComponente || desde || hasta) && (
          <button onClick={() => { setQ(''); setFActividad(''); setFComponente(''); setDesde(''); setHasta('') }}
            className="rounded-xl px-2.5 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50">
            Limpiar filtros
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium text-slate-400">{filtered.length} proyecto{filtered.length === 1 ? '' : 's'}</span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm" role="group" aria-label="Vista de proyectos">
            <button
              type="button"
              title="Vista tarjetas"
              aria-label="Vista tarjetas"
              aria-pressed={view === 'cards'}
              onClick={() => setView('cards')}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                view === 'cards' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-brand-600'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Vista lista"
              aria-label="Vista lista"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-brand-600'
              }`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-500">
        <span className="font-bold uppercase tracking-wide text-slate-400">Avance de desembolso:</span>
        {TONOS.map(t => (
          <span key={t.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} /> {t.label}
          </span>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-medium text-slate-500">
        <span className="font-bold uppercase tracking-wide text-slate-400">Columnas:</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-700">Proyecto</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">Monto ejecutado (STR)</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Saldo proyecto</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">Acta</span>
      </div>

      {loading ? <Spinner label="Cargando proyectos…" /> : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={(q || fActividad || fComponente || desde || hasta) ? 'Sin coincidencias' : 'Todavía no hay proyectos'}
            hint={(q || fActividad || fComponente || desde || hasta)
              ? 'Ningún proyecto coincide con la búsqueda o los filtros. Puede limpiarlos y volver a intentar.'
              : 'Cree el primero con el botón "Proyecto".'}
            action={(q || fActividad || fComponente || desde || hasta) ? (
              <button
                type="button"
                onClick={() => { setQ(''); setFActividad(''); setFComponente(''); setDesde(''); setHasta('') }}
                className="mt-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                Limpiar filtros
              </button>
            ) : undefined}
          />
        </Card>
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table data-table--dense w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-slate-600">
                  <th className="px-3 py-2 font-medium">Proyecto</th>
                  <th className="px-3 py-2 font-medium">Actividad</th>
                  <th className="px-3 py-2 font-medium">Expediente</th>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 text-right font-medium">Proyecto</th>
                  <th className="px-3 py-2 text-right font-medium">Ejecutado</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Acta</th>
                  <th className="px-3 py-2 text-center font-medium">Avance</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(p => {
                  const agg = aggs[p.id] ?? EMPTY_AGG()
                  const planVigente = agg.plan + agg.adendas
                  const base = planVigente || Number(p.monto) || 0
                  const desembolsadoStr = agg.str
                  const pct = calcAvanceDesembolso(base, desembolsadoStr)
                  const tono = tonoDe(pct)
                  const saldoProyecto = calcSaldoDisponible(base, agg.strBruto, agg.devol)
                  const actividadLabel = p.componente?.actividad
                    ? `${p.componente.actividad.codigo ? p.componente.actividad.codigo + ' — ' : ''}${p.componente.actividad.descripcion ?? ''}`
                    : '—'
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-50 hover:bg-slate-50/80"
                    >
                      <td className="max-w-[280px] px-3 py-2">
                        <Link to={`/proyectos/${p.id}`} className="block text-sm font-semibold text-slate-800 hover:underline">
                          <TruncatedText text={p.descripcion || 'Proyecto'} lines={2} />
                        </Link>
                        {p.componente?.descripcion && (
                          <p className="truncate text-[11px] text-slate-600">{p.componente.descripcion}</p>
                        )}
                      </td>
                      <td className="max-w-[200px] px-3 py-2 text-[11px] font-medium text-slate-700">
                        <span className="line-clamp-2">{actividadLabel}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-700">
                        {p.expediente?.numero_expediente ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-slate-700">
                        {p.mes ? `${fmtMes(p.mes)} ${p.anho ?? ''}` : fmtDate(p.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-violet-800">
                        {fmtMoneyCompact(base)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-sky-800">
                        {fmtMoneyCompact(desembolsadoStr)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums ${saldoProyecto < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                        {fmtMoneyCompact(saldoProyecto)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-amber-900">
                        {fmtMoneyCompact(agg.actas)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold tabular-nums ${tono.pct}`}>
                          <span className={`h-2 w-2 rounded-full ${tono.dot}`} />
                          {pct}%
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => setEditing(p)} title="Editar" aria-label="Editar proyecto"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => tryDelete(p)} title="Eliminar" aria-label="Eliminar proyecto" disabled={checkingDelete === p.id}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map(p => {
            const agg = aggs[p.id] ?? EMPTY_AGG()
            const planVigente = agg.plan + agg.adendas
            const base = planVigente || Number(p.monto) || 0
            const desembolsadoStr = agg.str
            const pct = calcAvanceDesembolso(base, desembolsadoStr)
            const tono = tonoDe(pct)
            return (
              <div key={p.id}
                className={`group rounded-2xl border p-5 shadow-[0_1px_3px_rgba(47,28,106,0.06)] transition hover:-translate-y-0.5 hover:shadow-lg ${tono.card}`}>
                <div className="mb-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Actividad</p>
                    <p className="text-[11px] font-semibold leading-snug text-brand-800">
                      {p.componente?.actividad
                        ? `${p.componente.actividad.codigo ? p.componente.actividad.codigo + ' — ' : ''}${p.componente.actividad.descripcion ?? ''}`
                        : <span className="font-medium italic text-slate-600">Sin actividad vinculada</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => setEditing(p)} title="Editar" aria-label="Editar proyecto"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => tryDelete(p)} title="Eliminar" aria-label="Eliminar proyecto" disabled={checkingDelete === p.id}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <Link to={`/proyectos/${p.id}`} className="mb-1.5 block hover:underline">
                  <TruncatedText as="h3" text={p.descripcion || 'Proyecto'} className="text-sm font-bold leading-snug text-brand-950" />
                </Link>

                {(p.componente?.programa?.descripcion || p.componente?.descripcion) && (
                  <p className="mb-3 text-[11px] leading-snug text-slate-500">
                    {p.componente?.programa?.descripcion && <span className="font-semibold">{p.componente.programa.descripcion}</span>}
                    {p.componente?.programa?.descripcion && p.componente?.descripcion && ' · '}
                    {p.componente?.descripcion}
                  </p>
                )}

                <div className="mb-3 flex items-end justify-between">
                  {agg.adendaCount > 0 ? (
                    <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${agg.adendas < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                      <Layers className="h-3 w-3" />
                      {agg.adendaCount} adenda{agg.adendaCount === 1 ? '' : 's'} · {agg.adendas >= 0 ? '+' : ''}{fmtMoneyCompact(agg.adendas)}
                    </span>
                  ) : <span />}
                  <span className={`text-[11px] font-bold tabular-nums ${tono.pct}`}>{pct}% avance</span>
                </div>

                {(() => {
                  const saldoProyecto = calcSaldoDisponible(base, agg.strBruto, agg.devol)
                  const actasAprob = agg.actas
                  return (
                    <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-violet-600">Proyecto</p>
                        <p className="mt-0.5 text-[11px] font-extrabold tabular-nums leading-tight text-violet-900">{fmtMoneyCompact(base)}</p>
                      </div>
                      <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-sky-600">Monto ejecutado</p>
                        <p className="mt-0.5 text-[11px] font-extrabold tabular-nums leading-tight text-sky-900">{fmtMoneyCompact(desembolsadoStr)}</p>
                      </div>
                      <div className={`rounded-lg border px-2 py-1.5 ${saldoProyecto < 0 ? 'border-rose-200 bg-rose-50/80' : 'border-emerald-200 bg-emerald-50/80'}`}>
                        <p className={`text-[9px] font-bold uppercase tracking-wide ${saldoProyecto < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Saldo proyecto</p>
                        <p className={`mt-0.5 text-[11px] font-extrabold tabular-nums leading-tight ${saldoProyecto < 0 ? 'text-rose-800' : 'text-emerald-900'}`}>{fmtMoneyCompact(saldoProyecto)}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Acta</p>
                        <p className="mt-0.5 text-[11px] font-extrabold tabular-nums leading-tight text-amber-950">{fmtMoneyCompact(actasAprob)}</p>
                      </div>
                    </div>
                  )
                })()}

                <div className={`mb-4 h-2 overflow-hidden rounded-full ${tono.track}`}>
                  <div className={`h-full rounded-full bg-gradient-to-r ${tono.bar}`} style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {p.expediente?.numero_expediente ?? 'Sin expediente'}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {p.mes ? `${fmtMes(p.mes)} ${p.anho ?? ''}` : fmtDate(p.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Mostrando <b className="text-slate-600">{(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)}</b> de <b className="text-slate-600">{filtered.length}</b> proyectos
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - pageSafe) <= 2)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center">
                  {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-xs text-slate-300">…</span>}
                  <button onClick={() => setPage(n)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold shadow-sm ${n === pageSafe
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-600'}`}>
                    {n}
                  </button>
                </span>
              ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={<span className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-brand-600" /> Nuevo proyecto</span>}>
        {creating && <RecordForm fields={FIELDS} onCancel={() => setCreating(false)} onSubmit={v => save(v)} submitLabel="Crear" />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={<span className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-brand-600" /> Editar proyecto</span>}>
        {editing && <RecordForm fields={FIELDS} initial={editing} onCancel={() => setEditing(null)} onSubmit={v => save(v, editing)} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onCancel={() => setDeleting(null)} onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({ singular: 'proyecto', label: deleting?.descripcion })} />

      <DeleteBlockedDialog
        open={!!blocked}
        onClose={() => setBlocked(null)}
        vinculos={blocked?.vinculos ?? []}
        description={
          blocked ? (
            <>
              El proyecto <b className="text-slate-800">"{blocked.row.descripcion}"</b> tiene avance registrado
              y no puede eliminarse mientras existan registros vinculados:
            </>
          ) : undefined
        }
      />
    </div>
  )
}
