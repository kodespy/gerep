import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { asGs, fmtDate, fmtMoney } from '../lib/format'
import {
  fetchResolutionSaldoResumen,
  type ResolutionSaldoResumen,
} from '../lib/resolutionSaldos'

/** Resumen de saldos del plan de la resolución seleccionada en el formulario STR. */
export default function StrResolucionSaldoPanel({
  resolutionId,
  resolutionItemId,
  strMonto,
  excludeStrId,
  onSaldoNegativoChange,
}: {
  resolutionId?: string | null
  resolutionItemId?: string | null
  strMonto?: number | string | null
  excludeStrId?: string | null
  /** true cuando no se debe permitir guardar (monto ≤ 0 o saldo de resolución &lt; 0) */
  onSaldoNegativoChange?: (bloqueado: boolean) => void
}) {
  const [resumen, setResumen] = useState<ResolutionSaldoResumen | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const rid = String(resolutionId ?? '').trim()
    if (!rid) {
      setResumen(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    fetchResolutionSaldoResumen(rid, excludeStrId)
      .then(data => {
        if (!alive) return
        setResumen(data)
      })
      .catch((err: any) => {
        if (!alive) return
        setResumen(null)
        setError(err?.message ?? 'No se pudieron cargar los saldos.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionId, excludeStrId])

  const montoStr = asGs(strMonto)
  const ejecutadoGuardado = asGs(resumen?.montoEjecutado)
  const ejecutado = ejecutadoGuardado + montoStr
  const plan = asGs(resumen?.montoPlan)
  const saldo = resumen ? plan - ejecutado : 0
  const saldoNegativo = !!resumen && saldo < 0
  const montoCero = montoStr <= 0
  const bloquearGuardar = montoCero || saldoNegativo

  useEffect(() => {
    onSaldoNegativoChange?.(bloquearGuardar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloquearGuardar])

  if (!String(resolutionId ?? '').trim()) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
        Seleccione una resolución para ver el plan presupuestario y sus saldos.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando saldos…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    )
  }

  if (!resumen) return null

  const itemId = String(resolutionItemId ?? '').trim()
  const item = itemId ? resumen.items.find(i => i.itemId === itemId) : null
  const itemEjecutado = (item ? asGs(item.montoEjecutado) : 0) + (item ? montoStr : 0)
  const itemSaldo = item ? asGs(item.montoPlan) - itemEjecutado : null
  const excede = item != null && itemSaldo != null && itemSaldo < 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Saldos de la resolución
        </h4>
        <p className="text-[11px] text-slate-400">
          Res. {resumen.numero ?? '—'}
          {resumen.fecha ? ` · ${fmtDate(resumen.fecha)}` : ''}
          {' · '}Ejecutado = sumatoria de STR vinculados
          {montoStr > 0 ? ' (incluye el monto de este formulario)' : ''}.
        </p>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800/50">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Plan</div>
          <div className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {fmtMoney(resumen.montoPlan)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800/50">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Ejecutado</div>
          <div className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {fmtMoney(ejecutado)}
          </div>
          {montoStr > 0 && ejecutadoGuardado > 0 && (
            <div className="mt-0.5 text-[9px] text-slate-400">
              Prev. {fmtMoney(ejecutadoGuardado)}
            </div>
          )}
        </div>
        <div className={`rounded-lg px-2 py-2 ${saldoNegativo ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
          <div className={`text-[10px] font-semibold uppercase ${saldoNegativo ? 'text-rose-600' : 'text-emerald-600'}`}>
            Saldo
          </div>
          <div className={`text-sm font-semibold tabular-nums ${saldoNegativo ? 'text-rose-800 dark:text-rose-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
            {fmtMoney(saldo)}
          </div>
        </div>
      </div>

      {saldoNegativo && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          El saldo de la resolución es negativo. No se puede guardar este STR.
        </p>
      )}
      {!saldoNegativo && montoCero && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Ingrese un monto mayor a cero para poder guardar.
        </p>
      )}

      {resumen.items.length > 0 && (
        <ul className="divide-y divide-slate-100 text-[11px] dark:divide-slate-700">
          {resumen.items.map(i => {
            const active = i.itemId === itemId
            const ej = asGs(i.montoEjecutado) + (active ? montoStr : 0)
            const sal = asGs(i.montoPlan) - ej
            return (
              <li
                key={i.itemId}
                className={`flex items-start justify-between gap-2 py-1.5 ${active ? 'font-semibold text-brand-800' : 'text-slate-600'}`}
              >
                <span className="min-w-0 truncate">
                  OG {i.ogCodigo ?? '—'}
                  {i.ogDescripcion ? ` — ${i.ogDescripcion}` : ''}
                </span>
                <span className="shrink-0 tabular-nums">
                  {fmtMoney(sal)}
                  <span className="text-slate-400"> / {fmtMoney(i.montoPlan)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {item && montoStr > 0 && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${excede ? 'bg-rose-50 text-rose-700' : 'bg-brand-50 text-brand-800'}`}>
          {excede
            ? `El monto del STR supera el saldo de la línea (${fmtMoney(item.saldo)}).`
            : `Tras este STR, el saldo de la línea quedaría en ${fmtMoney(itemSaldo ?? 0)}.`}
        </p>
      )}
    </div>
  )
}
