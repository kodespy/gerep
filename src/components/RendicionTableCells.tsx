import { CheckCircle2 } from 'lucide-react'
import { fmtDate, fmtMoney } from '../lib/format'
import { Badge } from './ui'

/** Diferencia en días calendario: límite − fecha de referencia (negativo = atraso). */
export function diasEntreLimiteYPresentacion(
  fechaLimite: string | null | undefined,
  fechaPresentacion: string | null | undefined,
): number | null {
  const lim = String(fechaLimite ?? '').trim()
  const pres = String(fechaPresentacion ?? '').trim()
  if (!lim || !pres) return null
  const mLim = lim.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const mPres = pres.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!mLim || !mPres) return null
  const limite = new Date(Number(mLim[1]), Number(mLim[2]) - 1, Number(mLim[3]))
  const presentacion = new Date(Number(mPres[1]), Number(mPres[2]) - 1, Number(mPres[3]))
  return Math.round((limite.getTime() - presentacion.getTime()) / 86_400_000)
}

export function RendicionDiasAtrasoCell({
  fechaLimite,
  fechaPresentacionCgr,
}: {
  fechaLimite: string | null | undefined
  fechaPresentacionCgr?: string | null | undefined
}) {
  const dias = diasEntreLimiteYPresentacion(fechaLimite, fechaPresentacionCgr)
  if (dias == null) {
    return <span className="text-[11px] text-slate-400">—</span>
  }
  if (dias < 0) {
    const n = Math.abs(dias)
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-rose-100 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight text-rose-700">
        {n} {n === 1 ? 'día' : 'días'} de retraso
      </span>
    )
  }
  if (dias === 0) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        En fecha
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight text-emerald-700">
      {dias} {dias === 1 ? 'día' : 'días'} antes
    </span>
  )
}

export function RendicionEstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <Badge>—</Badge>
  const e = estado.toLowerCase().trim()
  if (e.includes('sin movimiento') || e === 's/m') {
    return (
      <span
        title="Sin movimiento"
        className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 ring-1 ring-inset ring-slate-500/20"
      >
        S/M
      </span>
    )
  }
  if (e.includes('final') || e.includes('aprobad')) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        <CheckCircle2 className="h-3 w-3" />
        {estado}
      </span>
    )
  }
  if (e.includes('observad') || e.includes('rechaz')) {
    return <Badge color="red">{estado}</Badge>
  }
  if (e.includes('presentad')) {
    return <Badge color="blue">{estado}</Badge>
  }
  return <Badge color="amber">{estado}</Badge>
}

export function RendicionStrCell({ row }: { row: any }) {
  const str = row.str
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold text-slate-800">STR {str?.numero ?? '—'}</div>
      <div className="truncate tabular-nums text-[11px] text-slate-500">{fmtMoney(str?.monto)}</div>
      {str?.nro_ot ? (
        <div className="truncate text-[10px] text-slate-400">OT {str.nro_ot}</div>
      ) : null}
    </div>
  )
}

/**
 * Saldo de la STR después de esta rendición (corrido por fecha):
 * monto STR − suma de esta y todas las anteriores de la misma STR.
 * Ej.: 44M → rinde 22M → saldo 22M; luego rinde 22M → saldo 0.
 */
export function rendicionSaldoARendir(row: any): number {
  if (row.str_saldo_despues != null && row.str_saldo_despues !== '') {
    return Math.round(Number(row.str_saldo_despues) || 0)
  }
  // Fallback: si no hay acumulado, al menos descontar esta fila
  const strMonto = Math.round(Number(row.str?.monto) || 0)
  const rendido = Math.round(Number(row.str_rendido_acumulado ?? row.monto_rendicion) || 0)
  return strMonto - rendido
}

export function fmtDateOrPendiente(v: string | null | undefined) {
  if (!v) return <span className="text-[11px] text-slate-400">Pendiente</span>
  return <span className="whitespace-nowrap text-[11px] tabular-nums">{fmtDate(v)}</span>
}

export function fmtDateCompact(v: string | null | undefined) {
  if (!v) return <span className="text-slate-400">—</span>
  return <span className="whitespace-nowrap text-[11px] tabular-nums">{fmtDate(v)}</span>
}

export function fmtMoneyCompactCell(v: number | null | undefined) {
  return <span className="whitespace-nowrap font-semibold tabular-nums text-[11px]">{fmtMoney(v)}</span>
}
