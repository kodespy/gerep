import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  FolderKanban, Banknote, ClipboardCheck, Wallet, ArrowRight, Target, Network,
  FileCheck2, ScrollText, Handshake, Mailbox,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseFetchAll } from '../lib/supabaseFetchAll'
import { Card, StatCard, Spinner, PageHeader } from '../components/ui'
import { fmtMoneyCompact, fmtDate } from '../lib/format'
import { ajusteAdenda } from '../lib/planVigente'
import EjecucionPorComponenteChart, {
  type ComponenteEjecucionRow,
} from '../components/EjecucionPorComponenteChart'
import EjecucionStrPorMesChart, {
  buildStrEjecucionPorMes,
  strFechaEjecucion,
  type StrMesPoint,
} from '../components/EjecucionStrPorMesChart'
import InformesAdminDashboardCharts from '../components/InformesAdminDashboardCharts'
import InformesFiltersBar, {
  emptyInformesFilters,
  type InformesFilters,
} from '../components/InformesFiltersBar'
import {
  buildCascadeFromProyectos,
  loadDashboardInformesPayloads,
  loadProyectosForInformes,
  resolveFilteredProyectoIds,
  type InformePayload,
} from '../lib/informesAdminData'
import type { InformeReportId } from '../lib/informesAdminCatalog'

interface Counts { [k: string]: number }

const CHAIN: { table: string; label: string; to: string; icon: React.ReactNode }[] = [
  { table: 'actividades', label: 'Actividades', to: '/planificacion/actividades', icon: <Target className="h-4 w-4" /> },
  { table: 'programas', label: 'Programas', to: '/planificacion/programas', icon: <Network className="h-4 w-4" /> },
  { table: 'proyectos', label: 'Proyectos', to: '/proyectos', icon: <FolderKanban className="h-4 w-4" /> },
  { table: 'planes_financieros', label: 'Planes de proyecto', to: '/proyectos', icon: <Wallet className="h-4 w-4" /> },
  { table: 'budget_commitments', label: 'CDP', to: '/cdp', icon: <ScrollText className="h-4 w-4" /> },
  { table: 'actas', label: 'Actas', to: '/actas', icon: <FileCheck2 className="h-4 w-4" /> },
  { table: 'convenios', label: 'Convenios', to: '/convenios', icon: <Handshake className="h-4 w-4" /> },
  { table: 'strs', label: 'STR · Pagos', to: '/pagos/str', icon: <Banknote className="h-4 w-4" /> },
  { table: 'rendiciones_cuentas', label: 'Rendiciones', to: '/rendiciones', icon: <ClipboardCheck className="h-4 w-4" /> },
]

function inDateRange(iso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true
  if (!iso) return false
  const d = iso.slice(0, 10)
  if (desde && d < desde) return false
  if (hasta && d > hasta) return false
  return true
}

function buildComponenteRows(
  proyectos: any[],
  strs: any[],
  devoluciones: any[],
  rendiciones: any[],
  planes: any[],
  adendas: any[],
): ComponenteEjecucionRow[] {
  const proyComp = new Map<string, string>()
  const map = new Map<string, ComponenteEjecucionRow>()

  const planByProyecto = new Map<string, number>()
  for (const pl of planes) {
    const pid = pl.proyecto_id
    if (!pid) continue
    planByProyecto.set(pid, (planByProyecto.get(pid) ?? 0) + (Number(pl.monto) || 0))
  }

  const adendaByProyecto = new Map<string, number>()
  for (const a of adendas) {
    const pid = a.plan?.proyecto_id
    if (!pid) continue
    adendaByProyecto.set(pid, (adendaByProyecto.get(pid) ?? 0) + ajusteAdenda(a))
  }

  for (const p of proyectos) {
    const compId = p.componente_id ?? p.componente?.id ?? 'sin-componente'
    const key = String(compId)
    proyComp.set(p.id, key)

    const planBase = planByProyecto.has(p.id)
      ? (planByProyecto.get(p.id) ?? 0)
      : (Number(p.monto) || 0)
    const vigente = planBase + (adendaByProyecto.get(p.id) ?? 0)

    const existing = map.get(key)
    if (existing) {
      existing.montoProyectos += vigente
    } else {
      map.set(key, {
        id: key,
        codigo: p.componente?.codigo ?? '—',
        descripcion: p.componente?.descripcion ?? (key === 'sin-componente' ? 'Sin componente' : ''),
        montoProyectos: vigente,
        montoPagos: 0,
        montoRendiciones: 0,
      })
    }
  }

  const strByProyecto = new Map<string, number>()
  for (const s of strs) {
    const pid = s.proyecto_id
    if (!pid) continue
    strByProyecto.set(pid, (strByProyecto.get(pid) ?? 0) + (Number(s.monto) || 0))
  }

  const devolByProyecto = new Map<string, number>()
  for (const d of devoluciones) {
    const pid = d.str?.proyecto_id
    if (!pid) continue
    devolByProyecto.set(pid, (devolByProyecto.get(pid) ?? 0) + (Number(d.monto) || 0))
  }

  for (const [pid, bruto] of strByProyecto) {
    const compId = proyComp.get(pid)
    if (!compId) continue
    const row = map.get(compId)
    if (!row) continue
    row.montoPagos += bruto - (devolByProyecto.get(pid) ?? 0)
  }

  for (const r of rendiciones) {
    const pid = r.str?.proyecto_id
    if (!pid) continue
    const compId = proyComp.get(pid)
    if (!compId) continue
    const row = map.get(compId)
    if (!row) continue
    row.montoRendiciones += Number(r.monto_rendicion) || 0
  }

  return [...map.values()]
    .filter(r => r.montoProyectos > 0)
    .sort((a, b) => b.montoProyectos - a.montoProyectos)
}

export default function Dashboard() {
  const [filters, setFilters] = useState<InformesFilters>(() => emptyInformesFilters())
  const [cascadeSource, setCascadeSource] = useState<Awaited<ReturnType<typeof loadProyectosForInformes>>>([])
  const [counts, setCounts] = useState<Counts>({})
  const [totales, setTotales] = useState<{ proyectos: number; strs: number; rendiciones: number }>({ proyectos: 0, strs: 0, rendiciones: 0 })
  const [recientes, setRecientes] = useState<any[]>([])
  const [expPendientes, setExpPendientes] = useState(0)
  const [porComponente, setPorComponente] = useState<ComponenteEjecucionRow[]>([])
  const [strPorMes, setStrPorMes] = useState<StrMesPoint[]>([])
  const [informes, setInformes] = useState<Partial<Record<InformeReportId, InformePayload>>>({})
  const [loading, setLoading] = useState(true)
  const [chartsLoading, setChartsLoading] = useState(false)

  const cascade = useMemo(() => buildCascadeFromProyectos(cascadeSource), [cascadeSource])
  const actividadOpts = cascade.actividadOpts
  const programaOpts = useMemo(
    () => cascade.programaOpts
      .filter(o => !filters.actividadId || o.actividadId === filters.actividadId)
      .map(o => ({ id: o.id, label: o.label })),
    [cascade.programaOpts, filters.actividadId],
  )
  const componenteOpts = useMemo(
    () => cascade.componenteOpts
      .filter(o => {
        if (filters.actividadId && o.actividadId !== filters.actividadId) return false
        if (filters.programaId && o.programaId !== filters.programaId) return false
        return true
      })
      .map(o => ({ id: o.id, label: o.label })),
    [cascade.componenteOpts, filters.actividadId, filters.programaId],
  )

  // Carga base (conteos, recientes, catálogo de cascada) — una vez
  useEffect(() => {
    (async () => {
      const countQueries = [...CHAIN.map(c => c.table), 'resolutions', 'devoluciones'].map(async t => {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
        return [t, count ?? 0] as const
      })
      const [countEntries, exp, recent, proyCascade] = await Promise.all([
        Promise.all(countQueries),
        supabase.from('expedientes').select('id', { count: 'exact', head: true }).eq('estado_finalizado', false),
        supabase.from('proyectos').select('id, descripcion, monto, created_at, componente:componentes_programa(codigo, programa:programas(codigo))').order('created_at', { ascending: false }).limit(6),
        loadProyectosForInformes().catch(() => []),
      ])
      setCounts(Object.fromEntries(countEntries))
      setExpPendientes(exp.count ?? 0)
      setRecientes(recent.data ?? [])
      setCascadeSource(proyCascade)
      setLoading(false)
    })()
  }, [])

  // Gráficos e informes — reaccionan a filtros
  useEffect(() => {
    if (loading) return
    let alive = true
    const t = window.setTimeout(() => {
      ;(async () => {
        setChartsLoading(true)
        try {
          const [
            proyIds,
            proys,
            strFetch,
            devolRows,
            rendRows,
            proyComp,
            planesRows,
            adendasRows,
            informesPayloads,
          ] = await Promise.all([
            resolveFilteredProyectoIds(filters),
            supabase.from('proyectos').select('id, monto'),
            supabaseFetchAll(
              () => supabase
                .from('strs')
                .select('monto, proyecto_id, fecha, fecha_desembolso', { count: 'exact' })
                .order('id'),
              50_000,
            ),
            supabaseFetchAll(
              () => supabase
                .from('devoluciones')
                .select('monto, fecha, str:strs(proyecto_id)', { count: 'exact' })
                .order('id'),
              50_000,
            ),
            supabaseFetchAll(
              () => supabase
                .from('rendiciones_cuentas')
                .select('monto_rendicion, fecha_presentacion_cgr, str:strs(proyecto_id)', { count: 'exact' })
                .order('id'),
              50_000,
            ),
            supabase.from('proyectos').select('id, monto, componente_id, componente:componentes_programa(id, codigo, descripcion)'),
            supabaseFetchAll(
              () => supabase
                .from('planes_financieros')
                .select('proyecto_id, monto', { count: 'exact' })
                .order('id'),
              50_000,
            ),
            supabaseFetchAll(
              () => supabase
                .from('adendas')
                .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)', { count: 'exact' })
                .order('id'),
              50_000,
            ),
            loadDashboardInformesPayloads(filters).catch(() => ({})),
          ])
          if (!alive) return

          if (strFetch.error) console.warn('[Dashboard] strs', strFetch.error.message)

          const allow = proyIds
          const proyectos = (proys.data ?? []).filter((p: any) => allow.has(String(p.id)))
          const strsAll = (strFetch.data ?? []).filter((s: any) => allow.has(String(s.proyecto_id)))
          const strs = strsAll.filter((s: any) =>
            inDateRange(strFechaEjecucion(s), filters.desde, filters.hasta),
          )
          const devoluciones = (devolRows.data ?? []).filter((d: any) => {
            const pid = d.str?.proyecto_id
            if (!pid || !allow.has(String(pid))) return false
            return inDateRange(d.fecha ? String(d.fecha).slice(0, 10) : null, filters.desde, filters.hasta)
          })
          const rendsFiltered = (filters.desde || filters.hasta)
            ? (rendRows.data ?? []).filter((r: any) => {
                const pid = r.str?.proyecto_id
                if (!pid || !allow.has(String(pid))) return false
                return inDateRange(
                  r.fecha_presentacion_cgr ? String(r.fecha_presentacion_cgr).slice(0, 10) : null,
                  filters.desde,
                  filters.hasta,
                )
              })
            : (rendRows.data ?? []).filter((r: any) => {
                const pid = r.str?.proyecto_id
                return pid && allow.has(String(pid))
              })

          const proyCompFiltered = (proyComp.data ?? []).filter((p: any) => allow.has(String(p.id)))
          const planesFiltered = (planesRows.data ?? []).filter((p: any) => allow.has(String(p.proyecto_id)))
          const adendasFiltered = (adendasRows.data ?? []).filter((a: any) =>
            allow.has(String(a.plan?.proyecto_id ?? '')),
          )

          const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
          const strBruto = sum(strs, 'monto')
          const devolTotal = sum(devoluciones, 'monto')

          setTotales({
            proyectos: sum(proyectos, 'monto'),
            strs: strBruto - devolTotal,
            rendiciones: sum(rendsFiltered, 'monto_rendicion'),
          })
          setPorComponente(buildComponenteRows(
            proyCompFiltered,
            strs,
            devoluciones,
            rendsFiltered,
            planesFiltered,
            adendasFiltered,
          ))
          setStrPorMes(buildStrEjecucionPorMes(strs))
          setInformes(informesPayloads ?? {})
        } finally {
          if (alive) setChartsLoading(false)
        }
      })()
    }, 280)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [filters, loading])

  if (loading) return <Spinner label="Cargando panel…" />

  const ejecucionPct = totales.proyectos > 0 ? Math.min(100, Math.round((totales.strs / totales.proyectos) * 100)) : 0

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="General"
        title="Panel de control"
        subtitle="Resumen de proyectos, pagos STR, rendiciones y expedientes abiertos. Los gráficos usan los filtros de arriba; los montos están en guaraníes."
      />

      <div className="mb-5">
        <InformesFiltersBar
          filters={filters}
          onChange={setFilters}
          mode="dashboard"
          actividadOpts={actividadOpts}
          programaOpts={programaOpts}
          componenteOpts={componenteOpts}
        />
        {chartsLoading && (
          <p className="mt-2 text-xs font-medium text-slate-400">Actualizando gráficos e informes…</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<FolderKanban className="h-5 w-5" />} label="Proyectos registrados" value={counts['proyectos'] ?? 0}
          sub={`Monto filtrado (plan de proyecto) ${fmtMoneyCompact(totales.proyectos)}`} tone="brand" />
        <StatCard icon={<Banknote className="h-5 w-5" />} label="Pagos STR" value={counts['strs'] ?? 0}
          sub={`Desembolsado neto ${fmtMoneyCompact(totales.strs)}`} tone="green" />
        <StatCard icon={<ClipboardCheck className="h-5 w-5" />} label="Rendiciones de cuentas" value={counts['rendiciones_cuentas'] ?? 0}
          sub={`Rendido ${fmtMoneyCompact(totales.rendiciones)}`} tone="amber" />
        <StatCard icon={<Mailbox className="h-5 w-5" />} label="Expedientes abiertos" value={expPendientes}
          sub="Mesa de entrada · no finalizados" tone="sky" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Cadena de ejecución</h2>
            <span className="text-xs text-slate-600">cantidad de registros por etapa</span>
          </div>
          <div className="flex flex-wrap items-stretch gap-y-3">
            {CHAIN.map((c, i) => (
              <div key={c.table} className="flex items-center">
                <Link to={c.to}
                  className="group flex min-w-[96px] flex-col items-center gap-1 rounded-2xl bg-brand-50/70 px-3 py-2.5 transition hover:bg-brand-100 hover:shadow-md hover:shadow-brand-600/10">
                  <span className="text-brand-600">{c.icon}</span>
                  <span className="text-lg font-bold leading-none text-slate-800">{counts[c.table] ?? 0}</span>
                  <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-400 group-hover:text-brand-600">{c.label}</span>
                </Link>
                {i < CHAIN.length - 1 && <ArrowRight className="mx-1 h-4 w-4 shrink-0 text-slate-300" />}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-brand-50/70 p-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">Desembolsado STR neto vs. monto de proyectos (filtros actuales)</span>
              <span className="font-bold text-brand-700">{ejecucionPct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-brand-100">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all" style={{ width: `${ejecucionPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
              <span>{fmtMoneyCompact(totales.strs)} desembolsado</span>
              <span>{fmtMoneyCompact(totales.proyectos)} planificado</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Proyectos recientes</h2>
            <Link to="/proyectos" className="text-xs font-medium text-brand-600 hover:underline">Ver todos</Link>
          </div>
          {recientes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Aún no hay proyectos registrados.<br />
              <Link to="/proyectos" className="mt-1 inline-block font-medium text-brand-600 hover:underline">Crear el primero →</Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recientes.map(p => (
                <li key={p.id}>
                  <Link to={`/proyectos/${p.id}`} className="block rounded-lg px-2 py-2.5 hover:bg-brand-50/50">
                    <p className="truncate text-sm font-medium text-slate-700">{p.descripcion}</p>
                    <p className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
                      <span>{p.componente?.programa?.codigo ?? '—'} · {fmtDate(p.created_at)}</span>
                      <span className="font-semibold text-slate-500">{fmtMoneyCompact(p.monto)}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-700">Ejecución STR por mes</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Monto de pagos STR agrupado por mes (fecha de desembolso; si no hay, fecha del STR).
          </p>
        </div>
        <EjecucionStrPorMesChart
          points={strPorMes}
          preferredYear={filters.anio ? Number(filters.anio) : null}
        />
      </Card>

      <Card className="mt-5 p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-800">Informes administrativos y financieros</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Cada gráfico abre el informe correspondiente. Radar CGR muestra atrasos de rendición. Los planes administrativos (presupuesto anual) se gestionan en Planificación; el plan financiero de cada proyecto está en su ficha.
          </p>
        </div>
        <InformesAdminDashboardCharts payloads={informes} />
      </Card>

      <Card className="mt-5 p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-700">Ejecución por componente</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Porcentaje de pagos STR (neto) y rendiciones sobre el monto de proyectos de cada componente.
          </p>
        </div>
        <EjecucionPorComponenteChart rows={porComponente} />
      </Card>
    </div>
  )
}
