import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import ModuleTabs from '../../components/ModuleTabs'
import {
  ArrowLeft, Wallet, ScrollText, FileCheck2, Gavel, Handshake, Banknote,
  ClipboardCheck, LayoutList, ChevronRight, Undo2, Layers, FileDown, CalendarDays, Files,
  ClipboardPen, Loader2, PieChart,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card, Spinner } from '../../components/ui'
import CrudModule from '../../components/CrudModule'
import ActasConfigRegistrosModal, { ActasConfigRegistrosButton } from '../../components/ActasConfigRegistrosModal'
import ActaItemsPanel from '../../components/ActaItemsPanel'
import { isActaSoloAprobacion } from '../../lib/actaEstado'
import ActaFirmadaRowActions from '../../components/ActaFirmadaRowActions'
import InformeTecnicoPanel from '../../components/InformeTecnicoPanel'
import {
  planesFinancierosConfig, adendasConfig, cronogramaFinancieroConfig, cdpConfig, actasConfig, resolucionesConfig,
  conveniosConfig, strsConfig, devolucionesConfig, rendicionesConfig, proyectoDocumentosConfig,
} from '../../config/modules'
import { fmtMoney, fmtMoneyCompact } from '../../lib/format'
import { calcSaldoDisponible, calcStrNeto } from '../../lib/proyectoSaldos'
import { exportFichaTecnicaPdf } from '../../lib/fichaTecnicaPdf'
import { exportResumenPagosSaldosPdf } from '../../lib/resumenPagosSaldosPdf'
import CronogramaOgTable from '../../components/CronogramaOgTable'
import CdpsListPdfButton from '../../components/CdpsListPdfButton'

interface Stats {
  planMonto: number; planCount: number
  adendaCount: number; adendaMonto: number
  cdpMonto: number; cdpCount: number
  actaMonto: number; actaCount: number
  resolCount: number; convCount: number
  strMonto: number; strCount: number
  rendMonto: number; rendCount: number
  devolCount: number
  /** devoluciones cuyo STR está vinculado a un acta: se descuentan del total de actas */
  devolActaMonto: number
  /** total devuelto sobre STRs del proyecto: se descuenta del total desembolsado */
  devolMonto: number
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutList },
  { id: 'plan', label: 'Plan financiero', icon: Wallet },
  { id: 'cdp', label: 'CDP', icon: ScrollText },
  { id: 'actas', label: 'Actas', icon: FileCheck2 },
  { id: 'resoluciones', label: 'Resoluciones', icon: Gavel },
  { id: 'convenios', label: 'Convenios', icon: Handshake },
  { id: 'str', label: 'STR · Pagos', icon: Banknote },
  { id: 'devoluciones', label: 'Devoluciones', icon: Undo2 },
  { id: 'rendiciones', label: 'Rendiciones', icon: ClipboardCheck },
  { id: 'informe', label: 'Informe Técnico', icon: ClipboardPen },
  { id: 'documentos', label: 'Archivos', icon: Files },
] as const

type TabId = typeof TABS[number]['id']

/** Etapas del pipeline y qué contador de stats las alimenta. */
const PIPELINE: { tab: TabId; label: string; count: (s: Stats) => number; money?: (s: Stats) => number }[] = [
  { tab: 'plan', label: 'Plan financiero', count: s => s.planCount, money: s => s.planMonto + s.adendaMonto },
  { tab: 'cdp', label: 'CDP', count: s => s.cdpCount, money: s => s.cdpMonto },
  { tab: 'actas', label: 'Actas', count: s => s.actaCount, money: s => s.actaMonto - s.devolActaMonto },
  { tab: 'resoluciones', label: 'Resoluciones', count: s => s.resolCount },
  { tab: 'convenios', label: 'Convenios', count: s => s.convCount },
  { tab: 'str', label: 'STR · Pagos', count: s => s.strCount, money: s => s.strMonto },
  { tab: 'devoluciones', label: 'Devoluciones', count: s => s.devolCount, money: s => s.devolMonto },
  { tab: 'rendiciones', label: 'Rendiciones', count: s => s.rendCount, money: s => s.rendMonto },
]

const TAB_IDS = TABS.map(t => t.id) as TabId[]

export default function ProyectoDetail() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [proyecto, setProyecto] = useState<any | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const tabRaw = searchParams.get('tab')
  const tab: TabId = TAB_IDS.includes(tabRaw as TabId) ? tabRaw as TabId : 'resumen'
  const setTab = (next: TabId) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      if (next === 'resumen') n.delete('tab')
      else n.set('tab', next)
      return n
    }, { replace: false })
  }
  const [loading, setLoading] = useState(true)
  const [cronogramaKey, setCronogramaKey] = useState(0)
  const [actasConfigOpen, setActasConfigOpen] = useState(false)
  const [actaExpandedId, setActaExpandedId] = useState<string | null>(null)
  const [resumenPagosLoading, setResumenPagosLoading] = useState(false)

  const loadStats = async () => {
    const [planes, adendas, cdps, actas, resol, conv, strs, rends, devs] = await Promise.all([
      supabase.from('planes_financieros').select('monto').eq('proyecto_id', id),
      supabase.from('adendas').select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)').eq('plan.proyecto_id', id),
      supabase.from('budget_commitments').select('monto_comprometido, estado').eq('proyecto_id', id),
      supabase.from('actas').select('monto_aprobado, estado').eq('proyecto_id', id),
      supabase.from('resolution_proyectos').select('id', { count: 'exact', head: true }).eq('proyecto_id', id),
      supabase.from('convenios').select('id', { count: 'exact', head: true }).eq('proyecto_id', id),
      supabase.from('strs').select('monto').eq('proyecto_id', id),
      supabase.from('rendiciones_cuentas').select('monto_rendicion, str:strs!inner(proyecto_id)').eq('str.proyecto_id', id),
      supabase.from('devoluciones').select('monto, str:strs!inner(proyecto_id, acta_id)').eq('str.proyecto_id', id),
    ])
    const sum = (rows: any[] | null, key: string) => (rows ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
    // ajuste neto de adendas: disminuciones restan; rechazadas/anuladas no cuentan
    const adendaMonto = (adendas.data ?? []).reduce((s, a: any) => {
      const estado = (a.estado ?? '').toLowerCase()
      if (estado.includes('rechaz') || estado.includes('anulad')) return s
      const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
      return s + sign * (Number(a.monto_ajuste) || 0)
    }, 0)
    // los CDP anulados no suman en los resúmenes
    const cdpsVigentes = (cdps.data ?? []).filter((c: any) => !(c.estado ?? '').toLowerCase().includes('anulad'))
    setStats({
      planMonto: sum(planes.data, 'monto'), planCount: planes.data?.length ?? 0,
      adendaCount: adendas.data?.length ?? 0, adendaMonto,
      cdpMonto: sum(cdpsVigentes, 'monto_comprometido'), cdpCount: cdpsVigentes.length,
      actaMonto: (actas.data ?? []).reduce((s, a: any) => {
        const est = String(a.estado ?? '').trim().toLowerCase()
        if (est === 'aprobación' || est === 'aprobacion') return s
        return s + (Number(a.monto_aprobado) || 0)
      }, 0), actaCount: actas.data?.length ?? 0,
      resolCount: resol.count ?? 0, convCount: conv.count ?? 0,
      strMonto: sum(strs.data, 'monto'), strCount: strs.data?.length ?? 0,
      rendMonto: sum(rends.data, 'monto_rendicion'), rendCount: rends.data?.length ?? 0,
      devolCount: devs.data?.length ?? 0,
      devolActaMonto: (devs.data ?? []).reduce((s, d: any) => s + (d.str?.acta_id ? (Number(d.monto) || 0) : 0), 0),
      devolMonto: sum(devs.data, 'monto'),
    })
  }

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('proyectos')
        .select('*, componente:componentes_programa(codigo, descripcion, actividad:actividades(codigo, descripcion), programa:programas(codigo, descripcion)), expediente:expedientes(numero_expediente, asunto), plan_admin:planes_financieros_administrativos(anio, descripcion)')
        .eq('id', id).maybeSingle()
      setProyecto(data)
      await loadStats()
      setLoading(false)
    })()
  }, [id])

  // refrescar contadores al volver al resumen o cambiar de pestaña
  useEffect(() => { if (!loading) loadStats() }, [tab])

  const configs = useMemo(() => ({
    plan: planesFinancierosConfig(id),
    adendas: adendasConfig(id),
    cronograma: { ...cronogramaFinancieroConfig(id), onMutated: () => setCronogramaKey(k => k + 1) },
    cdp: cdpConfig(id),
    actas: actasConfig(id),
    resoluciones: resolucionesConfig(id),
    convenios: conveniosConfig(id),
    str: strsConfig(id),
    devoluciones: devolucionesConfig(id),
    rendiciones: rendicionesConfig(id),
    documentos: proyectoDocumentosConfig(id),
  }), [id])

  if (loading) return <Spinner label="Cargando ficha del proyecto…" />
  if (!proyecto) return <p className="py-16 text-center text-slate-400">Proyecto no encontrado.</p>

  const planVigente = (stats?.planMonto ?? 0) + (stats?.adendaMonto ?? 0)
  const base = planVigente || proyecto.monto || 0
  const desembolsadoStr = stats?.strMonto ?? 0
  const devolucionesStr = stats?.devolMonto ?? 0
  const desembolsadoStrNeto = calcStrNeto(desembolsadoStr, devolucionesStr)
  const saldoDisponible = calcSaldoDisponible(base, desembolsadoStr, devolucionesStr)
  const pct = (v: number) => base > 0 ? Math.min(100, Math.round((v / base) * 100)) : 0
  const fmtCatalogo = (codigo?: string | null, descripcion?: string | null) => {
    if (!codigo && !descripcion) return '—'
    if (codigo && descripcion) return `${codigo} — ${descripcion}`
    return codigo || descripcion || '—'
  }
  const actividadLabel = fmtCatalogo(proyecto.componente?.actividad?.codigo, proyecto.componente?.actividad?.descripcion)
  const programaLabel = fmtCatalogo(proyecto.componente?.programa?.codigo, proyecto.componente?.programa?.descripcion)
  const componenteLabel = fmtCatalogo(proyecto.componente?.codigo, proyecto.componente?.descripcion)

  return (
    <div className="fade-up">
      {/* Encabezado */}
      <div className="mb-4">
        <Link to="/proyectos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Proyectos
        </Link>
        <Card className="overflow-hidden !bg-brand-100/80 border-brand-200/50 p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[7fr_3fr] md:gap-8">
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-snug text-slate-800">{proyecto.descripcion}</h1>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Actividad</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700">{actividadLabel}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Programa</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700">{programaLabel}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Componente</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700">{componenteLabel}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-col items-start justify-between gap-4 border-t border-brand-200/40 pt-4 md:items-end md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <div className="md:text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto del proyecto</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{fmtMoney(base)}</p>
                {stats && stats.adendaCount > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Incluye adendas{' '}
                    <span className={`font-semibold tabular-nums ${stats.adendaMonto < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      ({stats.adendaMonto >= 0 ? '+' : ''}{fmtMoney(stats.adendaMonto)})
                    </span>
                    {stats.planMonto > 0 && (
                      <span className="text-slate-400"> · base {fmtMoney(stats.planMonto)}</span>
                    )}
                  </p>
                )}
              </div>
              <button onClick={() => void exportFichaTecnicaPdf(id)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-brand-300 hover:text-brand-700">
                <FileDown className="h-4 w-4" /> Ficha técnica
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Pipeline del flujo */}
      {stats && (
        <Card className="mb-4 overflow-x-auto p-3">
          <div className="flex min-w-max items-center">
            {PIPELINE.map((st, i) => {
              const count = st.count(stats)
              const active = tab === st.tab
              const done = count > 0
              return (
                <div key={st.tab} className="flex items-center">
                  <button onClick={() => setTab(st.tab)}
                    className={`flex min-w-[104px] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition ${
                      active ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : done ? 'border-emerald-200 bg-emerald-50/50 hover:border-brand-300'
                          : 'border-dashed border-slate-200 bg-white hover:border-brand-300'}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {count}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-brand-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {st.label}
                    </span>
                    {st.money && <span className="text-[10px] tabular-nums text-slate-400">{count > 0 ? fmtMoneyCompact(st.money(stats)) : '—'}</span>}
                  </button>
                  {i < PIPELINE.length - 1 && <ChevronRight className="mx-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <ModuleTabs
        tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <t.icon className="h-4 w-4" aria-hidden /> }))}
        value={tab}
        onChange={setTab}
        ariaLabel="Secciones del proyecto"
      />

      {/* Contenido */}
      {tab === 'resumen' && stats && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-slate-700">Embudo financiero</h3>
            {[
              { label: 'Plan vigente (plan + adendas)', v: planVigente, color: 'bg-brand-500' },
              { label: 'CDP comprometido', v: stats.cdpMonto, color: 'bg-sky-500' },
              { label: 'Aprobado en actas (neto de devoluciones)', v: stats.actaMonto - stats.devolActaMonto, color: 'bg-violet-500' },
              { label: 'Desembolsado STR (neto)', v: desembolsadoStrNeto, color: 'bg-emerald-500' },
              { label: 'Devoluciones STR', v: stats.devolMonto, color: 'bg-rose-400' },
              { label: 'Saldo disponible', v: saldoDisponible, color: 'bg-teal-500' },
              { label: 'Rendido ante CGR', v: stats.rendMonto, color: 'bg-amber-500' },
            ].map(row => (
              <div key={row.label} className="mb-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-500">{row.label}</span>
                  <span className="font-semibold tabular-nums text-slate-700">{fmtMoney(row.v)} <span className="text-slate-300">· {pct(row.v)}%</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-100/70">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct(row.v)}%` }} />
                </div>
              </div>
            ))}
            {stats.devolMonto > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs">
                <Undo2 className="h-4 w-4 shrink-0 text-rose-500" />
                <span className="text-slate-600">
                  {stats.devolCount} devolución{stats.devolCount === 1 ? '' : 'es'} por{' '}
                  <b className="tabular-nums text-rose-600">{fmtMoney(stats.devolMonto)}</b>
                  {stats.devolActaMonto > 0 && <> (de las cuales <b className="tabular-nums text-rose-600">{fmtMoney(stats.devolActaMonto)}</b> corresponden a STR con acta y descuentan del total de actas)</>}
                </span>
              </div>
            )}
            {stats.adendaCount > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs">
                <Layers className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="text-slate-600">
                  Plan original <b className="tabular-nums">{fmtMoney(stats.planMonto)}</b> ajustado por{' '}
                  <b>{stats.adendaCount} adenda{stats.adendaCount === 1 ? '' : 's'}</b>{' '}
                  (<b className={`tabular-nums ${stats.adendaMonto < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{stats.adendaMonto >= 0 ? '+' : ''}{fmtMoney(stats.adendaMonto)}</b>)
                </span>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Porcentajes calculados sobre el plan vigente ({fmtMoney(base)}).</p>
          </Card>
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-slate-700">Estado del expediente</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Expediente</dt><dd className="font-medium text-slate-700">{proyecto.expediente ? `${proyecto.expediente.numero_expediente} · ${proyecto.expediente.asunto ?? ''}` : 'Sin expediente vinculado'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Programa</dt><dd className="font-medium text-slate-700">{proyecto.componente?.programa ? `${proyecto.componente.programa.codigo} — ${proyecto.componente.programa.descripcion ?? ''}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Componente</dt><dd className="font-medium text-slate-700">{proyecto.componente ? `${proyecto.componente.codigo} — ${proyecto.componente.descripcion ?? ''}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Adendas</dt><dd className="font-medium text-slate-700">{stats.adendaCount}{stats.adendaCount > 0 && <span className={`ml-1.5 tabular-nums ${stats.adendaMonto < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>({stats.adendaMonto >= 0 ? '+' : ''}{fmtMoney(stats.adendaMonto)})</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Desembolsado STR (neto)</dt><dd className="font-medium tabular-nums text-slate-700">{fmtMoney(desembolsadoStrNeto)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Saldo disponible</dt><dd className="font-medium tabular-nums text-brand-700">{fmtMoney(saldoDisponible)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Devoluciones</dt><dd className="font-medium text-slate-700">{stats.devolCount}{stats.devolMonto > 0 && <span className="ml-1.5 tabular-nums text-rose-600">({fmtMoney(stats.devolMonto)}{stats.devolActaMonto > 0 && ` · ${fmtMoney(stats.devolActaMonto)} de actas`})</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Convenio (dato del proyecto)</dt><dd className="font-medium text-slate-700">{proyecto.convenio ?? '—'}</dd></div>
            </dl>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              💡 Use el <span className="font-semibold">pipeline superior</span> para saltar a cualquier etapa del ciclo:
              cada casilla muestra cuántos registros tiene esa etapa y su monto acumulado.
            </div>
          </Card>
        </div>
      )}

      {tab === 'plan' && (
        <div className="space-y-6">
          <CrudModule {...configs.plan} />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Detalle de registros</p>
            <CrudModule {...configs.cronograma} />
            <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-4 w-4" /> Distribución mensual
            </h3>
            <CronogramaOgTable proyectoId={id} reloadKey={cronogramaKey} />
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <Undo2 className="h-4 w-4" /> Adendas
            </h3>
            <CrudModule {...configs.adendas} />
          </div>
        </div>
      )}
      {tab === 'cdp' && (
        <CrudModule
          {...configs.cdp}
          hideExcelExport
          toolbarExtra={({ filteredRows }: { filteredRows: any[] }) => (
            <CdpsListPdfButton
              rows={filteredRows}
              subtitle={proyecto.descripcion}
              filename="Listado_CDP"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            />
          )}
        />
      )}
      {tab === 'actas' && (
        <CrudModule
          {...configs.actas}
          toolbarExtra={<ActasConfigRegistrosButton onClick={() => setActasConfigOpen(true)} />}
          expandedRowId={actaExpandedId}
          onRowClick={row => setActaExpandedId(cur => (cur === row.id ? null : String(row.id)))}
          renderRowDetail={(row, { reload }) => (
            <ActaItemsPanel
              actaId={String(row.id)}
              proyectoId={id}
              soloAprobacion={isActaSoloAprobacion(row.estado)}
              onChanged={reload}
            />
          )}
          rowActions={(row, reload) => <ActaFirmadaRowActions row={row} reload={reload} />}
        />
      )}
      {tab === 'resoluciones' && <CrudModule {...configs.resoluciones} />}
      {tab === 'convenios' && <CrudModule {...configs.convenios} />}
      {tab === 'str' && (
        <CrudModule
          {...configs.str}
          toolbarExtra={(
            <button
              type="button"
              title="Resumen de pagos y saldos del proyecto"
              disabled={resumenPagosLoading}
              onClick={async () => {
                setResumenPagosLoading(true)
                try {
                  await exportResumenPagosSaldosPdf(id)
                } catch (e: any) {
                  alert(e?.message ?? 'No se pudo generar el resumen.')
                } finally {
                  setResumenPagosLoading(false)
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resumenPagosLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <PieChart className="h-4 w-4" />}
              Resumen pagos
            </button>
          )}
        />
      )}
      {tab === 'devoluciones' && <CrudModule {...configs.devoluciones} />}
      {tab === 'rendiciones' && <CrudModule {...configs.rendiciones} />}
      {tab === 'informe' && (
        <InformeTecnicoPanel
          proyectoId={id}
          proyectoDescripcion={proyecto.descripcion}
        />
      )}
      {tab === 'documentos' && <CrudModule {...configs.documentos} />}

      <ActasConfigRegistrosModal open={actasConfigOpen} onClose={() => setActasConfigOpen(false)} />
    </div>
  )
}
