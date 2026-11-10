import { useEffect, useState } from 'react'
import { fmtMoney } from '../lib/format'
import { loadProyectoResumenFinanciero, type ProyectoResumenFinanciero } from '../lib/proyectoResumen'

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums font-medium text-slate-700">{fmtMoney(value)}</span>
    </div>
  )
}

/** Panel lateral de saldos del proyecto para el formulario de actas. */
export default function ActaFormResumenPanel({
  proyectoId,
  montoActa,
}: {
  proyectoId: string | null | undefined
  /** Monto de esta acta (solicitado/aprobado) para proyectar el saldo. */
  montoActa?: number
}) {
  const [data, setData] = useState<ProyectoResumenFinanciero | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = (proyectoId ?? '').trim()
    if (!id) {
      setData(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    void loadProyectoResumenFinanciero(id)
      .then(res => {
        if (!alive) return
        setData(res)
        if (!res) setError('No se pudo cargar el resumen del proyecto.')
      })
      .catch((err: any) => {
        if (!alive) return
        setData(null)
        setError(err?.message ?? 'Error al cargar saldos.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [proyectoId])

  const monto = Number(montoActa) || 0
  const saldoProyectado = data ? data.saldoDisponible - monto : 0

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        Resumen financiero del proyecto
      </h4>

      {!proyectoId && (
        <p className="text-sm text-slate-500">Seleccione un proyecto para ver los saldos.</p>
      )}
      {proyectoId && loading && (
        <p className="text-sm text-slate-500">Cargando saldos…</p>
      )}
      {proyectoId && error && (
        <p className="text-sm text-rose-600">{error}</p>
      )}
      {proyectoId && data && !loading && (
        <div className="space-y-2">
          <Row label="P. Original" value={data.montoOriginal} />
          <Row label="Total Adendas" value={data.totalAdendas} />
          <Row label="P. Ajustado" value={data.presupuestoAjustado} />
          <div className="border-t border-slate-200 pt-2 dark:border-slate-600" />
          <Row label="Ejecutado (Prev.)" value={-Math.abs(data.ejecutado)} />
          <Row label="Devoluciones" value={data.devoluciones} />
          <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 dark:border-emerald-900 dark:bg-slate-900">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Saldo proyectado
            </div>
            <div className={`mt-0.5 text-lg font-bold tabular-nums ${saldoProyectado < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {fmtMoney(saldoProyectado)}
            </div>
          </div>
          <p className="pt-1 text-[11px] leading-snug text-slate-400">
            Fórmula: Presupuesto − (Ejecutado − Devoluciones) − monto del acta
          </p>
          {saldoProyectado < 0 && (
            <p className="text-xs font-medium text-rose-600">
              El monto del acta supera el saldo disponible del proyecto.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
