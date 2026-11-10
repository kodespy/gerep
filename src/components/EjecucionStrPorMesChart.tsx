import { useEffect, useMemo, useState } from 'react'
import { fmtMoney, fmtMoneyCompact, MESES } from '../lib/format'
import AccessibleChart from './AccessibleChart'

export type StrMesPoint = {
  /** YYYY-MM */
  key: string
  year: number
  month: number
  monto: number
  count: number
}

const SHORT_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Fecha de ejecución STR: desembolso si existe, si no fecha del STR. */
export function strFechaEjecucion(row: {
  fecha?: string | null
  fecha_desembolso?: string | null
}): string | null {
  const d = (row.fecha_desembolso ?? row.fecha ?? '').trim()
  if (!d) return null
  return d.slice(0, 10)
}

export function buildStrEjecucionPorMes(
  strs: { monto?: number | null; fecha?: string | null; fecha_desembolso?: string | null }[],
): StrMesPoint[] {
  const map = new Map<string, StrMesPoint>()
  for (const s of strs) {
    const iso = strFechaEjecucion(s)
    if (!iso) continue
    const [ys, ms] = iso.split('-')
    const year = Number(ys)
    const month = Number(ms)
    if (!year || !month || month < 1 || month > 12) continue
    const key = `${year}-${String(month).padStart(2, '0')}`
    const prev = map.get(key)
    const monto = Number(s.monto) || 0
    if (prev) {
      prev.monto += monto
      prev.count += 1
    } else {
      map.set(key, { key, year, month, monto, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function monthsForYear(year: number, data: StrMesPoint[]): StrMesPoint[] {
  const byMonth = new Map(data.filter(d => d.year === year).map(d => [d.month, d]))
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    return byMonth.get(month) ?? { key: `${year}-${String(month).padStart(2, '0')}`, year, month, monto: 0, count: 0 }
  })
}

export default function EjecucionStrPorMesChart({
  points,
  preferredYear,
}: {
  points: StrMesPoint[]
  preferredYear?: number | null
}) {
  const years = useMemo(() => {
    const set = new Set(points.map(p => p.year))
    const current = new Date().getFullYear()
    set.add(current)
    if (preferredYear) set.add(preferredYear)
    return [...set].sort((a, b) => b - a)
  }, [points, preferredYear])

  const [year, setYear] = useState(() => preferredYear || years[0] || new Date().getFullYear())

  useEffect(() => {
    if (preferredYear && years.includes(preferredYear)) setYear(preferredYear)
  }, [preferredYear, years])

  const effectiveYear = years.includes(year) ? year : (years[0] ?? new Date().getFullYear())
  const series = useMemo(() => monthsForYear(effectiveYear, points), [effectiveYear, points])
  const max = Math.max(...series.map(s => s.monto), 0)
  const total = series.reduce((s, p) => s + p.monto, 0)
  const totalCount = series.reduce((s, p) => s + p.count, 0)

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No hay STR con fecha para graficar ejecución mensual.
      </p>
    )
  }

  const chartH = 180

  return (
    <AccessibleChart
      title="Ejecución STR por mes"
      caption="Montos de solicitudes de transferencia (STR) agrupados por mes. Se usa la fecha de desembolso; si no existe, la fecha del STR."
      unit="Guaraníes (bruto del STR, sin descontar devoluciones en esta serie)"
      period={`Año ${effectiveYear}`}
      reference="Fecha de referencia: desembolso o, en su defecto, fecha del STR"
      columns={[
        { key: 'mes', label: 'Mes' },
        { key: 'monto', label: 'Monto STR', numeric: true },
        { key: 'count', label: 'Cantidad', numeric: true },
      ]}
      rows={series.map(p => ({
        mes: `${MESES[p.month - 1]} ${p.year}`,
        monto: fmtMoney(p.monto),
        count: p.count,
      }))}
    >
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Monto STR desembolsado
          </span>
          <span className="tabular-nums text-slate-600">
            {effectiveYear}: <span className="font-semibold text-slate-800">{fmtMoneyCompact(total)}</span>
            {' · '}
            {totalCount} pago{totalCount === 1 ? '' : 's'}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          Año
          <select
            value={effectiveYear}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: chartH }}>
            {series.map(p => {
              const h = max > 0 ? Math.max(p.monto > 0 ? 4 : 0, Math.round((p.monto / max) * (chartH - 8))) : 0
              const title = `${MESES[p.month - 1]} ${p.year}: ${fmtMoneyCompact(p.monto)} (${p.count} STR)`
              return (
                <div key={p.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="mb-1 text-[10px] font-semibold tabular-nums text-slate-500">
                    {p.monto > 0 ? fmtMoneyCompact(p.monto) : ''}
                  </div>
                  <div
                    title={title}
                    className="w-full max-w-[42px] rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all hover:from-brand-700 hover:to-brand-400"
                    style={{ height: h }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-2 sm:gap-2">
            {series.map(p => (
              <div key={p.key} className="min-w-0 flex-1 text-center">
                <span className="text-[11px] font-medium text-slate-500">{SHORT_MES[p.month - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </AccessibleChart>
  )
}
