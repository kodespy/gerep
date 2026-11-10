import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtMoney, MESES } from '../lib/format'
import { Spinner } from './ui'

interface PlanAdminCronogramaResumenProps {
  planAdminId: string
  anioDefault?: number | null
  reloadKey?: number
}

export default function PlanAdminCronogramaResumen({ planAdminId, anioDefault, reloadKey = 0 }: PlanAdminCronogramaResumenProps) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('cronograma_administrativo')
        .select('mes, anio, monto_programado')
        .eq('plan_administrativo_id', planAdminId)
        .order('anio', { ascending: true })
        .order('mes', { ascending: true })
      if (alive) {
        setRows(data ?? [])
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [planAdminId, reloadKey])

  const anios = useMemo(() => {
    const set = new Set(rows.map(r => Number(r.anio)).filter(Boolean))
    if (anioDefault) set.add(Number(anioDefault))
    if (set.size === 0) set.add(new Date().getFullYear())
    return [...set].sort((a, b) => a - b)
  }, [rows, anioDefault])

  if (loading) return <Spinner label="Cargando cronograma…" />

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
        Sin distribución mensual. Use «Cargar cronograma» para programar los montos por mes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {anios.map(anio => {
        const byMes = Array.from({ length: 12 }, (_, i) => {
          const row = rows.find(r => Number(r.anio) === anio && Number(r.mes) === i + 1)
          return Number(row?.monto_programado) || 0
        })
        const total = byMes.reduce((s, v) => s + v, 0)
        return (
          <div key={anio} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-3.5 w-3.5 text-brand-600" />
              Cronograma {anio}
            </div>
            <table className="data-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-600">
                  {MESES.map(m => (
                    <th key={m} className="px-2 py-2 text-right text-[11px] font-medium">{m.slice(0, 3)}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {byMes.map((m, i) => (
                    <td key={i} className={`px-2 py-2 text-right tabular-nums text-xs ${m > 0 ? 'font-medium text-slate-800' : 'text-slate-300'}`}>
                      {m > 0 ? fmtMoney(m).replace('₲ ', '') : '—'}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-sm font-bold text-brand-700">{fmtMoney(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
