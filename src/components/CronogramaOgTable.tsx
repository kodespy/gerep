import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buildDistribucionPorOgAnio, MESES_CORTOS, type DistribucionOgAnio } from '../lib/cronogramaDistribucion'
import { fmtMoney } from '../lib/format'
import { Card, Spinner } from './ui'

export default function CronogramaOgTable({ proyectoId, reloadKey = 0 }: { proyectoId: string; reloadKey?: number }) {
  const [distribuciones, setDistribuciones] = useState<DistribucionOgAnio[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [planes, cronograma] = await Promise.all([
      supabase.from('planes_financieros')
        .select('id, objeto:objetos_de_gastos(codigo)')
        .eq('proyecto_id', proyectoId),
      supabase.from('cronograma_financiero')
        .select('mes, anio, monto_programado, plan_financiero_id, plan:planes_financieros!inner(proyecto_id, objeto:objetos_de_gastos(codigo))')
        .eq('plan.proyecto_id', proyectoId),
    ])
    setDistribuciones(buildDistribucionPorOgAnio(cronograma.data ?? [], planes.data ?? []))
    setLoading(false)
  }

  useEffect(() => { void load() }, [proyectoId, reloadKey])

  if (loading) return <Spinner label="Cargando cronograma…" />

  if (distribuciones.length === 0) {
    return (
      <Card className="p-5 text-sm text-slate-500">
        Sin distribución mensual registrada. Cargue registros en el detalle inferior.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {distribuciones.map(({ anio, rows, totalesMes, totalAnio }) => (
        <Card key={anio} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h4 className="text-sm font-bold text-slate-800">
              Cronograma de Distribución Mensual por Objeto de Gastos
              {distribuciones.length > 1 && <span className="ml-2 font-normal text-slate-500">· Año {anio}</span>}
            </h4>
            <button type="button" onClick={() => void load()} title="Actualizar"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-600">
                  <th className="px-4 py-2.5">OG</th>
                  {MESES_CORTOS.map(m => (
                    <th key={m} className="px-4 py-2.5 text-right">{m}</th>
                  ))}
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.og} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/40">
                    <td className="px-4 py-2.5 text-slate-700">{row.og}</td>
                    {row.montos.map((m, i) => (
                      <td key={i} className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoney(m)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoney(row.total)}</td>
                  </tr>
                ))}
                <tr className="total-row border-t-2 border-slate-300 bg-slate-100 text-black">
                  <td className="px-4 py-2.5 text-black">Total</td>
                  {totalesMes.map((m, i) => (
                    <td key={i} className="px-4 py-2.5 text-right tabular-nums text-black">{fmtMoney(m)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums text-black">{fmtMoney(totalAnio)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}
