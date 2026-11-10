import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  FileDown, GitBranch, HeartPulse, Layers, Link2,
  Loader2, Map, Radar, Scale, Timer, type LucideIcon,
} from 'lucide-react'
import InformesFiltersBar, {
  emptyInformesFilters,
  type InformesFilters,
} from '../../components/InformesFiltersBar'
import { Badge, Card, PageHeader } from '../../components/ui'
import { INFORMES_ADMIN_REPORTS, type InformeReportId } from '../../lib/informesAdminCatalog'
import {
  buildCascadeFromProyectos,
  loadInformePayload,
  loadProyectosForInformes,
  previewFromPayload,
  type InformePayload,
  type InformePreview,
} from '../../lib/informesAdminData'
import { exportInformeAdminPdf } from '../../lib/informesAdminPdf'
import { fmtMoney } from '../../lib/format'

const REPORT_ICONS: Record<InformeReportId, LucideIcon> = {
  cartera_360: Layers,
  pulso_mensual: HeartPulse,
  cadena_ejecucion: GitBranch,
  acta_resolucion_str: Link2,
  mapa_og_ff: Map,
  radar_rendiciones: Radar,
  cronometro_vs_real: Timer,
  plan_vs_str: Scale,
}

/** Colores en estilo inline: evita que Tailwind omita clases dinámicas. */
const REPORT_HEADER_STYLE: Record<InformeReportId, CSSProperties> = {
  cartera_360: { background: 'linear-gradient(90deg, #334155 0%, #1e293b 100%)' },
  pulso_mensual: { background: 'linear-gradient(90deg, #0d9488 0%, #0f766e 100%)' },
  cadena_ejecucion: { background: 'linear-gradient(90deg, #d97706 0%, #c2410c 100%)' },
  acta_resolucion_str: { background: 'linear-gradient(90deg, #7c3aed 0%, #4338ca 100%)' },
  mapa_og_ff: { background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)' },
  radar_rendiciones: { background: 'linear-gradient(90deg, #e11d48 0%, #be123c 100%)' },
  cronometro_vs_real: { background: 'linear-gradient(90deg, #059669 0%, #047857 100%)' },
  plan_vs_str: { background: 'linear-gradient(90deg, #0e7490 0%, #115e59 100%)' },
}

function filterModeLabel(mode: 'range' | 'month' | 'year'): string {
  if (mode === 'month') return 'Mes / Año'
  if (mode === 'year') return 'Año'
  return 'Rango fechas'
}

function filterModeBadge(mode: 'range' | 'month' | 'year'): string {
  if (mode === 'month') return 'amber'
  if (mode === 'year') return 'green'
  return 'blue'
}

function ReportCardIcon({ id }: { id: InformeReportId }): ReactNode {
  const Icon = REPORT_ICONS[id]
  return <Icon className="h-5 w-5 text-white" strokeWidth={2.1} color="#ffffff" />
}

const REPORT_IDS = INFORMES_ADMIN_REPORTS.map(r => r.id) as InformeReportId[]

function parseReport(raw: string | null): InformeReportId {
  if (raw && REPORT_IDS.includes(raw as InformeReportId)) return raw as InformeReportId
  return 'cartera_360'
}

export default function InformesAdminFinancieros() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<InformesFilters>(emptyInformesFilters)
  const selected = parseReport(searchParams.get('report'))
  const setSelected = (id: InformeReportId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (id === 'cartera_360') next.delete('report')
      else next.set('report', id)
      return next
    }, { replace: false })
  }
  const [cascadeSource, setCascadeSource] = useState<Awaited<ReturnType<typeof loadProyectosForInformes>>>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<InformePreview | null>(null)
  const [payload, setPayload] = useState<InformePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const report = INFORMES_ADMIN_REPORTS.find(r => r.id === selected)!

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoadingMeta(true)
      try {
        const rows = await loadProyectosForInformes()
        if (alive) setCascadeSource(rows)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar la estructura.')
      } finally {
        if (alive) setLoadingMeta(false)
      }
    })()
    return () => { alive = false }
  }, [])

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

  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => {
      ;(async () => {
        setLoadingPreview(true)
        setError(null)
        try {
          if ((report.filterMode === 'month' || report.filterMode === 'year') && !filters.anio) {
            throw new Error(report.filterMode === 'year'
              ? 'Seleccione el año para este informe.'
              : 'Seleccione mes y año para este informe.')
          }
          if (report.requiresMonth && !filters.mes) {
            throw new Error('Seleccione mes y año para este informe.')
          }
          const data = await loadInformePayload(selected, filters)
          if (!alive) return
          setPayload(data)
          setPreview(previewFromPayload(data))
        } catch (e) {
          if (!alive) return
          setPayload(null)
          setPreview(null)
          setError(e instanceof Error ? e.message : 'Error al preparar el informe.')
        } finally {
          if (alive) setLoadingPreview(false)
        }
      })()
    }, 280)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [selected, filters, report.requiresMonth, report.filterMode])

  const generate = async () => {
    if (!payload) return
    setExporting(true)
    setError(null)
    try {
      await exportInformeAdminPdf(selected, payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Informes"
        title="Informes administrativos y financieros"
        subtitle="Elija un informe, ajuste los filtros y genere el PDF. Los montos se muestran en guaraníes (bruto o neto según el informe)."
        actions={(
          <button
            type="button"
            disabled={exporting || loadingPreview || !payload}
            onClick={() => void generate()}
            className="gradient-primary inline-flex items-center gap-2 rounded-[0.9rem] px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Generar PDF
          </button>
        )}
      />

      <InformesFiltersBar
        filters={filters}
        onChange={setFilters}
        mode={report.filterMode}
        actividadOpts={actividadOpts}
        programaOpts={programaOpts}
        componenteOpts={componenteOpts}
      />

      {loadingMeta ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo de proyectos…
        </p>
      ) : null}

      <div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        style={{ gap: '11px', rowGap: '12px', columnGap: '11px' }}
      >
        {INFORMES_ADMIN_REPORTS.map(r => {
          const active = r.id === selected
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(r.id)}
              className={`group overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition duration-200 dark:bg-slate-900 ${
                active
                  ? 'border-brand-500 shadow-md'
                  : 'border-slate-300 hover:border-slate-400 hover:shadow-md dark:border-slate-600'
              }`}
            >
              <div
                className="px-4 py-3.5"
                style={{ ...REPORT_HEADER_STYLE[r.id], color: '#ffffff' }}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/15 ring-1 ring-white/30 text-white">
                    <ReportCardIcon id={r.id} />
                  </span>
                  <div className="min-w-0 pt-0.5" style={{ color: '#ffffff' }}>
                    <p className="text-[15px] font-bold leading-tight tracking-tight" style={{ color: '#ffffff' }}>{r.title}</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: '#ffffff' }}>{r.tagline}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{r.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge color={filterModeBadge(r.filterMode)}>
                    {filterModeLabel(r.filterMode)}
                  </Badge>
                  {active ? <Badge color="brand">Seleccionado</Badge> : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden p-0">
        <div
          className="px-4 py-3"
          style={{ ...REPORT_HEADER_STYLE[report.id], color: '#ffffff' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3" style={{ color: '#ffffff' }}>
            <div className="flex items-center gap-3" style={{ color: '#ffffff' }}>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/15"
                style={{ color: '#ffffff' }}
              >
                <ReportCardIcon id={report.id} />
              </span>
              <div style={{ color: '#ffffff' }}>
                <h2
                  className="text-sm font-bold leading-tight"
                  style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                >
                  Vista previa · {report.title}
                </h2>
                <p
                  className="text-[11px] font-medium"
                  style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                >
                  {report.tagline}
                </p>
              </div>
            </div>
            {loadingPreview ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium"
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" color="#ffffff" /> Calculando…
              </span>
            ) : preview ? (
              <div className="flex flex-wrap gap-2">
                <span
                  className="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs font-semibold"
                  style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                >
                  {preview.count} registros
                </span>
                <span
                  className="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs font-semibold"
                  style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                >
                  {fmtMoney(preview.totalGs)}
                </span>
                {preview.secondaryLabel != null && preview.secondaryGs != null ? (
                  <span
                    className="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs font-semibold"
                    style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                  >
                    {preview.secondaryLabel}: {fmtMoney(preview.secondaryGs)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">{report.description}</p>

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          {!loadingPreview && preview && preview.count === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              Sin datos con estos filtros. Ajuste actividad, programa, componente o fechas.
            </p>
          ) : null}

          {payload && preview && preview.count > 0 ? (
            <p className="mt-3 text-[11px] text-slate-600">
              Montos en guaraníes. Período según los filtros del informe. La población es el conjunto de registros que cumplen esos filtros; no se recalculan fórmulas aquí.
            </p>
          ) : null}

          {payload?.kind === 'pulso_mensual' && payload.resumen ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['CDP mes', payload.resumen.cdpMes],
                ['STR mes', payload.resumen.strMes],
                ['Saldo cierre', payload.resumen.saldoCierre],
                ['Pendiente mes', payload.resumen.compromisoPendienteMes],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="text-sm font-bold tabular-nums text-slate-800">{fmtMoney(Number(value))}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
