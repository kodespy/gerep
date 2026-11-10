import { Link } from 'react-router'
import { fmtMoneyCompact } from '../lib/format'
import type {
  CadenaRow,
  CarteraRow,
  CronoRow,
  InformePayload,
  MapaRow,
  PlanVsStrBlock,
  PulsoResumen,
  RadarRow,
} from '../lib/informesAdminData'
import type { InformeReportId } from '../lib/informesAdminCatalog'
import { INFORMES_ADMIN_REPORTS } from '../lib/informesAdminCatalog'
import RadarCgrTemperaturaCharts from './RadarCgrTemperaturaCharts'

const SHORT_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function Section({
  id,
  children,
}: {
  id: InformeReportId
  children: React.ReactNode
}) {
  const def = INFORMES_ADMIN_REPORTS.find(r => r.id === id)
  if (!def) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{def.title}</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">{def.tagline}</p>
        </div>
        <Link to={`/informes/admin-financieros?report=${id}`} className="text-[11px] font-medium text-brand-700 hover:underline">
          Abrir {def.title} →
        </Link>
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text ?? 'Sin datos para graficar.'}</p>
}

function DualMoneyBars({
  items,
  aKey,
  bKey,
  aLabel,
  bLabel,
  aClass = 'bg-slate-500',
  bClass = 'bg-emerald-500',
  limit = 10,
}: {
  items: Record<string, any>[]
  aKey: string
  bKey: string
  aLabel: string
  bLabel: string
  aClass?: string
  bClass?: string
  limit?: number
}) {
  const rows = items.slice(0, limit)
  const max = Math.max(...rows.flatMap(r => [Number(r[aKey]) || 0, Number(r[bKey]) || 0]), 0)
  if (!rows.length || max <= 0) return <Empty />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${aClass}`} /> {aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${bClass}`} /> {bLabel}</span>
      </div>
      {rows.map((r, idx) => {
        const a = Number(r[aKey]) || 0
        const b = Number(r[bKey]) || 0
        const label = String(r.label ?? r.proyecto ?? r.periodo ?? r.og ?? `#${idx + 1}`)
        return (
          <div key={`${label}-${idx}`}>
            <p className="mb-1 truncate text-[11px] font-semibold text-slate-700" title={label}>{label}</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${aClass}`} style={{ width: `${Math.max(a > 0 ? 2 : 0, (a / max) * 100)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-600">{fmtMoneyCompact(a)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bClass}`} style={{ width: `${Math.max(b > 0 ? 2 : 0, (b / max) * 100)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-600">{fmtMoneyCompact(b)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KpiBars({ items }: { items: { label: string; value: number; colorClass: string }[] }) {
  const max = Math.max(...items.map(i => Math.abs(i.value)), 0)
  if (!items.length || max <= 0) return <Empty />
  return (
    <div className="space-y-2.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-[11px] font-semibold text-slate-600">{item.label}</span>
          <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className={`h-full rounded-md ${item.colorClass}`}
              style={{ width: `${Math.max(item.value ? 4 : 0, (Math.abs(item.value) / max) * 100)}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">
            {fmtMoneyCompact(item.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function MonthPairChart({
  labels,
  seriesA,
  seriesB,
  aLabel,
  bLabel,
  aClass = 'bg-slate-500',
  bClass = 'bg-emerald-500',
}: {
  labels: string[]
  seriesA: number[]
  seriesB: number[]
  aLabel: string
  bLabel: string
  aClass?: string
  bClass?: string
}) {
  const max = Math.max(...seriesA, ...seriesB, 0)
  const chartH = 140
  if (max <= 0) return <Empty />
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${aClass}`} /> {aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${bClass}`} /> {bLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex items-end gap-1" style={{ height: chartH }}>
            {labels.map((lab, i) => {
              const a = seriesA[i] ?? 0
              const b = seriesB[i] ?? 0
              const ha = Math.max(a > 0 ? 3 : 0, Math.round((a / max) * (chartH - 8)))
              const hb = Math.max(b > 0 ? 3 : 0, Math.round((b / max) * (chartH - 8)))
              return (
                <div key={lab} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
                  <div className={`w-[45%] max-w-[18px] rounded-t-sm ${aClass}`} style={{ height: ha }} title={`${aLabel}: ${fmtMoneyCompact(a)}`} />
                  <div className={`w-[45%] max-w-[18px] rounded-t-sm ${bClass}`} style={{ height: hb }} title={`${bLabel}: ${fmtMoneyCompact(b)}`} />
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex gap-1 border-t border-slate-100 pt-1.5">
            {labels.map(lab => (
              <div key={lab} className="min-w-0 flex-1 text-center text-[10px] font-medium text-slate-500">{lab}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CarteraChart({ rows }: { rows: CarteraRow[] }) {
  const top = [...rows].sort((a, b) => b.planVigente - a.planVigente).slice(0, 8)
  const totalPlan = rows.reduce((s, r) => s + r.planVigente, 0)
  const totalStr = rows.reduce((s, r) => s + r.strNeto, 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">Plan {fmtMoneyCompact(totalPlan)}</span>
        <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">STR neto {fmtMoneyCompact(totalStr)}</span>
        <span className="rounded-md bg-brand-50 px-2 py-1 font-semibold text-brand-700">
          Avance {totalPlan > 0 ? Math.round((totalStr / totalPlan) * 100) : 0}%
        </span>
      </div>
      <DualMoneyBars
        items={top.map(r => ({ ...r, label: r.proyecto }))}
        aKey="planVigente"
        bKey="strNeto"
        aLabel="Plan vigente"
        bLabel="STR neto"
        aClass="bg-slate-500"
        bClass="bg-emerald-500"
      />
    </div>
  )
}

function PulsoChart({ resumen }: { resumen: PulsoResumen }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">Período: <span className="font-semibold text-slate-700">{resumen.periodo}</span></p>
      <KpiBars items={[
        { label: 'CDP del mes', value: resumen.cdpMes, colorClass: 'bg-sky-500' },
        { label: 'STR del mes', value: resumen.strMes, colorClass: 'bg-emerald-500' },
        { label: 'Pendiente mes', value: resumen.compromisoPendienteMes, colorClass: 'bg-amber-500' },
        { label: 'Saldo cierre', value: resumen.saldoCierre, colorClass: 'bg-brand-600' },
        { label: 'Plan vigente', value: resumen.planVigente, colorClass: 'bg-slate-500' },
      ]} />
    </div>
  )
}

function CadenaChart({ rows }: { rows: CadenaRow[] }) {
  const cdp = rows.reduce((s, r) => s + r.cdp, 0)
  const actas = rows.reduce((s, r) => s + r.actas, 0)
  const str = rows.reduce((s, r) => s + r.strNeto, 0)
  const top = [...rows].sort((a, b) => b.cdp - a.cdp).slice(0, 8)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <KpiBars items={[
        { label: 'CDP', value: cdp, colorClass: 'bg-sky-500' },
        { label: 'Actas', value: actas, colorClass: 'bg-violet-500' },
        { label: 'STR neto', value: str, colorClass: 'bg-emerald-500' },
      ]} />
      <DualMoneyBars
        items={top.map(r => ({ label: r.proyecto, a: r.cdp, b: r.strNeto }))}
        aKey="a"
        bKey="b"
        aLabel="CDP"
        bLabel="STR neto"
        aClass="bg-sky-500"
        bClass="bg-emerald-500"
      />
    </div>
  )
}

function MapaChart({ rows }: { rows: MapaRow[] }) {
  const top = [...rows].sort((a, b) => b.plan - a.plan).slice(0, 8)
  return (
    <DualMoneyBars
      items={top.map(r => ({
        label: `${r.og} · ${r.fuente}`,
        plan: r.plan,
        ejecutado: r.ejecutado,
      }))}
      aKey="plan"
      bKey="ejecutado"
      aLabel="Plan"
      bLabel="Ejecutado"
      aClass="bg-sky-600"
      bClass="bg-emerald-500"
    />
  )
}

function CronometroChart({ rows }: { rows: CronoRow[] }) {
  const last = rows.slice(-12)
  return (
    <MonthPairChart
            labels={last.map(r => r.periodo.replace(/(\w+)\s+(\d{4})/, (_, m, y) => `${m.slice(0, 3)} ${y}`))}
      seriesA={last.map(r => r.programado)}
      seriesB={last.map(r => r.ejecutado)}
      aLabel="Programado"
      bLabel="Ejecutado"
      aClass="bg-slate-500"
      bClass="bg-emerald-500"
    />
  )
}

function PlanVsStrChart({ anio, blocks }: { anio: number; blocks: PlanVsStrBlock[] }) {
  const plan = Array.from({ length: 12 }, (_, i) => blocks.reduce((s, b) => s + (b.plan[i] || 0), 0))
  const str = Array.from({ length: 12 }, (_, i) =>
    blocks.reduce((s, b) => s + ((b.str[i] || 0) - (b.devoluciones[i] || 0)), 0),
  )
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Año {anio} · agregado de todos los proyectos</p>
      <MonthPairChart
        labels={SHORT_MES}
        seriesA={plan}
        seriesB={str}
        aLabel="Plan financiero"
        bLabel="STR neto"
        aClass="bg-cyan-700"
        bClass="bg-emerald-500"
      />
    </div>
  )
}

export default function InformesAdminDashboardCharts({
  payloads,
}: {
  payloads: Partial<Record<InformeReportId, InformePayload>>
}) {
  const cartera = payloads.cartera_360?.kind === 'cartera_360' ? payloads.cartera_360 : null
  const pulso = payloads.pulso_mensual?.kind === 'pulso_mensual' ? payloads.pulso_mensual : null
  const cadena = payloads.cadena_ejecucion?.kind === 'cadena_ejecucion' ? payloads.cadena_ejecucion : null
  const mapa = payloads.mapa_og_ff?.kind === 'mapa_og_ff' ? payloads.mapa_og_ff : null
  const radar = payloads.radar_rendiciones?.kind === 'radar_rendiciones' ? payloads.radar_rendiciones : null
  const crono = payloads.cronometro_vs_real?.kind === 'cronometro_vs_real' ? payloads.cronometro_vs_real : null
  const planVs = payloads.plan_vs_str?.kind === 'plan_vs_str' ? payloads.plan_vs_str : null

  const hasAny = Boolean(cartera || pulso || cadena || mapa || radar || crono || planVs)
  if (!hasAny) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        No se pudieron cargar los informes administrativos. Intente más tarde o abra Informes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Misma lógica y filtros del observatorio · Pulso usa mes/año · Plan vs STR usa año
        </p>
        <Link to="/informes/admin-financieros" className="text-xs font-semibold text-brand-600 hover:underline">
          Ir a Informes admin. y financieros →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {cartera && (
          <Section id="cartera_360">
            <CarteraChart rows={cartera.rows} />
          </Section>
        )}
        {pulso && (
          <Section id="pulso_mensual">
            <PulsoChart resumen={pulso.resumen} />
          </Section>
        )}
        {cadena && (
          <Section id="cadena_ejecucion">
            <CadenaChart rows={cadena.rows} />
          </Section>
        )}
        {mapa && (
          <Section id="mapa_og_ff">
            <MapaChart rows={mapa.rows} />
          </Section>
        )}
      </div>

      {radar && (
        <Section id="radar_rendiciones">
          <RadarCgrTemperaturaCharts rows={radar.rows as RadarRow[]} />
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {crono && (
          <Section id="cronometro_vs_real">
            <CronometroChart rows={crono.rows} />
          </Section>
        )}
        {planVs && (
          <Section id="plan_vs_str">
            <PlanVsStrChart anio={planVs.anio} blocks={planVs.blocks} />
          </Section>
        )}
      </div>
    </div>
  )
}
