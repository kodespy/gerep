import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtMoney } from '../lib/format'
import { ajusteModificacionAdmin } from '../lib/planVigente'
import { cdpMontoVigente } from '../lib/cdpUtils'

interface PlanAdminResumenFinancieroProps {
  plan: any
  reloadKey?: number
}

export default function PlanAdminResumenFinanciero({ plan, reloadKey = 0 }: PlanAdminResumenFinancieroProps) {
  const [adendasNetas, setAdendasNetas] = useState(0)
  const [comprometido, setComprometido] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const [adendas, cdps] = await Promise.all([
        supabase.from('modificaciones_administrativas').select('monto, tipo_modificacion').eq('plan_administrativo_id', plan.id),
        supabase.from('budget_commitments').select('monto_comprometido, estado').eq('plan_administrativo_id', plan.id),
      ])
      if (!alive) return
      const netAd = (adendas.data ?? []).reduce((s, a) => s + ajusteModificacionAdmin(a as any), 0)
      const cdp = (cdps.data ?? []).reduce((s, c) => s + cdpMontoVigente(c as any), 0)
      setAdendasNetas(netAd)
      setComprometido(cdp)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [plan.id, reloadKey])

  const original = Number(plan.monto_total) || 0
  const vigente = original + adendasNetas
  const disponible = vigente - comprometido

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Monto original</p>
        <p className="mt-1 font-semibold tabular-nums text-slate-800">{loading ? '…' : fmtMoney(original)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Adendas netas</p>
        <p className={`mt-1 font-semibold tabular-nums ${adendasNetas < 0 ? 'text-rose-600' : adendasNetas > 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
          {loading ? '…' : `${adendasNetas >= 0 ? '+' : ''}${fmtMoney(adendasNetas)}`}
        </p>
      </div>
      <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Presupuesto vigente</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-brand-900">{loading ? '…' : fmtMoney(vigente)}</p>
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Disponible (CDP)</p>
        <p className="mt-1 font-semibold tabular-nums text-emerald-800">{loading ? '…' : fmtMoney(disponible)}</p>
        {!loading && comprometido > 0 && (
          <p className="mt-0.5 text-[11px] text-slate-400">Comprometido: {fmtMoney(comprometido)}</p>
        )}
      </div>
    </div>
  )
}
