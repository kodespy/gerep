import { Link } from 'react-router'
import { fmtMoney, fmtMoneyCompact } from '../lib/format'
import type { RadarRow } from '../lib/informesAdminData'
import AccessibleChart from './AccessibleChart'

export type RadarAlertaBucket = {
  key: string
  label: string
  count: number
  montoStr: number
  colorClass: string
}

export type RadarTempBucket = {
  key: string
  label: string
  hint: string
  count: number
  montoStr: number
  colorClass: string
}

const ALERTA_ORDER = ['Presentada', 'Al día', 'Pendiente', 'Sin rendición', 'Atrasada'] as const

const ALERTA_COLOR: Record<string, string> = {
  Presentada: 'bg-emerald-500',
  'Al día': 'bg-sky-500',
  Pendiente: 'bg-amber-400',
  'Sin rendición': 'bg-orange-500',
  Atrasada: 'bg-rose-500',
}

function tempKey(row: RadarRow): string {
  if (row.vencidoSinPresentar || (row.alerta === 'Atrasada' && (row.diasAtraso ?? 0) > 30)) {
    return 'critico'
  }
  if (row.alerta === 'Atrasada') return 'caliente'
  if (row.alerta === 'Pendiente' || row.alerta === 'Sin rendición') return 'templado'
  return 'frio'
}

const TEMP_DEFS: { key: string; label: string; hint: string; colorClass: string }[] = [
  { key: 'frio', label: 'Frío', hint: 'Presentada / Al día', colorClass: 'bg-gradient-to-t from-sky-600 to-sky-400' },
  { key: 'templado', label: 'Templado', hint: 'Pendiente / Sin rendición', colorClass: 'bg-gradient-to-t from-amber-500 to-amber-300' },
  { key: 'caliente', label: 'Caliente', hint: 'Atrasada ≤ 30 días', colorClass: 'bg-gradient-to-t from-orange-600 to-orange-400' },
  { key: 'critico', label: 'Crítico', hint: 'Vencido sin presentar o > 30 días', colorClass: 'bg-gradient-to-t from-rose-700 to-rose-500' },
]

export function summarizeRadarAlertas(rows: RadarRow[]): RadarAlertaBucket[] {
  const map = new Map<string, RadarAlertaBucket>()
  for (const r of rows) {
    const key = (r.alerta || 'Sin estado').trim() || 'Sin estado'
    const prev = map.get(key)
    if (prev) {
      prev.count += 1
      prev.montoStr += r.montoStr || 0
    } else {
      map.set(key, {
        key,
        label: key,
        count: 1,
        montoStr: r.montoStr || 0,
        colorClass: ALERTA_COLOR[key] ?? 'bg-slate-400',
      })
    }
  }
  const ordered = ALERTA_ORDER
    .filter(k => map.has(k))
    .map(k => map.get(k)!)
  const rest = [...map.values()]
    .filter(b => !(ALERTA_ORDER as readonly string[]).includes(b.key))
    .sort((a, b) => b.count - a.count)
  return [...ordered, ...rest]
}

export function summarizeRadarTemperatura(rows: RadarRow[]): RadarTempBucket[] {
  const counts = new Map<string, { count: number; montoStr: number }>()
  for (const d of TEMP_DEFS) counts.set(d.key, { count: 0, montoStr: 0 })
  for (const r of rows) {
    const key = tempKey(r)
    const prev = counts.get(key)!
    prev.count += 1
    prev.montoStr += r.montoStr || 0
  }
  return TEMP_DEFS.map(d => ({
    ...d,
    count: counts.get(d.key)?.count ?? 0,
    montoStr: counts.get(d.key)?.montoStr ?? 0,
  }))
}

function HorizontalBars({
  items,
  valueKey,
}: {
  items: { key: string; label: string; count: number; montoStr: number; colorClass: string }[]
  valueKey: 'count' | 'montoStr'
}) {
  const max = Math.max(...items.map(i => i[valueKey]), 0)
  if (!items.length || max <= 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Sin datos para graficar.</p>
  }
  return (
    <div className="space-y-2.5">
      {items.map(item => {
        const value = item[valueKey]
        const pct = max > 0 ? Math.round((value / max) * 100) : 0
        return (
          <div key={item.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] font-semibold text-slate-600" title={item.label}>
              {item.label}
            </span>
            <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className={`h-full rounded-md transition-all ${item.colorClass}`}
                style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
                title={`${item.label}: ${item.count} · ${fmtMoneyCompact(item.montoStr)}`}
              />
            </div>
            <span className="w-[4.5rem] shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">
              {valueKey === 'count' ? item.count : fmtMoneyCompact(item.montoStr)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TemperatureBars({ items }: { items: RadarTempBucket[] }) {
  const max = Math.max(...items.map(i => i.count), 0)
  const chartH = 160
  if (max <= 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Sin datos de temperatura.</p>
  }
  return (
    <div>
      <div className="flex items-end gap-3 sm:gap-4" style={{ height: chartH }}>
        {items.map(item => {
          const h = max > 0 ? Math.max(item.count > 0 ? 6 : 0, Math.round((item.count / max) * (chartH - 20))) : 0
          return (
            <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <div className="mb-1 text-xs font-bold tabular-nums text-slate-700">
                {item.count > 0 ? item.count : ''}
              </div>
              <div
                title={`${item.label}: ${item.count} STR · ${fmtMoneyCompact(item.montoStr)} — ${item.hint}`}
                className={`w-full max-w-[72px] rounded-t-lg ${item.colorClass}`}
                style={{ height: h }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-3 border-t border-slate-100 pt-2 sm:gap-4">
        {items.map(item => (
          <div key={item.key} className="min-w-0 flex-1 text-center">
            <p className="text-xs font-bold text-slate-700">{item.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{item.hint}</p>
            <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">
              {fmtMoneyCompact(item.montoStr)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RadarCgrTemperaturaCharts({ rows }: { rows: RadarRow[] }) {
  const alertas = summarizeRadarAlertas(rows)
  const temps = summarizeRadarTemperatura(rows)
  const criticos = rows.filter(r => r.vencidoSinPresentar).length
  const atrasadas = rows.filter(r => r.alerta === 'Atrasada').length

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No hay STR/rendiciones para el Radar CGR.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
            {rows.length} STR en radar
          </span>
          <span className="rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700">
            {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}
          </span>
          <span className="rounded-md bg-rose-100 px-2 py-1 font-semibold text-rose-800">
            {criticos} vencida{criticos === 1 ? '' : 's'} sin presentar
          </span>
        </div>
        <Link
          to="/informes/admin-financieros?report=radar_rendiciones"
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Abrir informe Radar CGR →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <AccessibleChart
            title="Temperatura por estado"
            caption="Cantidad de STR según alerta del Radar CGR"
            unit="Cantidad de STR y monto STR en guaraníes (bruto)"
            period="Filtros del observatorio"
            columns={[
              { key: 'estado', label: 'Estado' },
              { key: 'count', label: 'STR', numeric: true },
              { key: 'monto', label: 'Monto STR', numeric: true },
            ]}
            rows={alertas.map(a => ({ estado: a.label, count: a.count, monto: fmtMoney(a.montoStr) }))}
          >
            <HorizontalBars items={alertas} valueKey="count" />
          </AccessibleChart>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <AccessibleChart
            title="Escala de temperatura"
            caption="Severidad de atraso frente a la fecha límite de rendición"
            unit="Cantidad de STR"
            period="Filtros del observatorio"
            columns={[
              { key: 'temp', label: 'Temperatura' },
              { key: 'hint', label: 'Criterio' },
              { key: 'count', label: 'STR', numeric: true },
              { key: 'monto', label: 'Monto STR', numeric: true },
            ]}
            rows={temps.map(t => ({ temp: t.label, hint: t.hint, count: t.count, monto: fmtMoney(t.montoStr) }))}
          >
            <TemperatureBars items={temps} />
          </AccessibleChart>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <h3 className="text-sm font-semibold text-slate-700">Monto STR por alerta</h3>
        <p className="mb-3 mt-0.5 text-[11px] text-slate-400">
          Exposición financiera asociada a cada temperatura del radar
        </p>
        <HorizontalBars items={alertas} valueKey="montoStr" />
      </div>
    </div>
  )
}
