import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtMoney } from '../lib/format'
import { Modal } from './ui'
import CdpCreateForm from './CdpCreateForm'
import { cdpConfig } from '../config/modules'
import { fetchCdpsForPlanAdmin, withPlanAdminCdpLink } from '../lib/planAdminCdp'
import { cdpMontoVigente, cdpInsertPayload } from '../lib/cdpUtils'
import {
  presupuestoInicialPlanAdmin,
} from '../lib/planAdminFinanciero'
import { ajusteModificacionAdmin } from '../lib/planVigente'

interface ComprometerCdpModalProps {
  plan: any
  onClose: () => void
  onSaved: () => void
}

function planTitulo(plan: any): string {
  const parts = [
    plan.anio,
    plan.programa?.codigo,
    plan.actividad?.codigo,
    plan.objeto?.codigo,
  ].filter(Boolean)
  return plan.descripcion || parts.join(' · ') || 'Plan administrativo'
}

export default function ComprometerCdpModal({ plan, onClose, onSaved }: ComprometerCdpModalProps) {
  const cfg = useMemo(() => cdpConfig(), [])
  const [cdpRows, setCdpRows] = useState<any[]>([])
  const [modsNetas, setModsNetas] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const [cdpsRes, modsRes] = await Promise.all([
        fetchCdpsForPlanAdmin(plan.id),
        supabase
          .from('modificaciones_administrativas')
          .select('monto, tipo_modificacion')
          .eq('plan_administrativo_id', plan.id),
      ])
      if (!alive) return
      setCdpRows(cdpsRes.data)
      const net = (modsRes.data ?? []).reduce((s, m) => s + ajusteModificacionAdmin(m as any), 0)
      setModsNetas(net)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [plan.id])

  const comprometido = cdpRows.reduce((s, r) => s + cdpMontoVigente(r), 0)
  const montoInicial = presupuestoInicialPlanAdmin(plan)
  const presupuestoVigente = montoInicial + modsNetas
  const disponible = presupuestoVigente - comprometido

  const save = async (values: Record<string, any>) => {
    const payload = cdpInsertPayload(withPlanAdminCdpLink(plan.id, values))
    const { data: u } = await supabase.auth.getUser()
    if (u.user) payload.user_id = u.user.id

    const { error } = await supabase.from('budget_commitments').insert(payload)
    if (error) throw error
    onSaved()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Comprometer · CDP" wide>
      <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm">
        <p className="font-semibold text-brand-900">{planTitulo(plan)}</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
          <span>
            Monto plan: <b className="tabular-nums text-slate-800">{fmtMoney(montoInicial)}</b>
          </span>
          <span>
            Modificaciones: <b className={`tabular-nums ${modsNetas < 0 ? 'text-rose-600' : modsNetas > 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
              {modsNetas >= 0 ? '+' : ''}{fmtMoney(modsNetas)}
            </b>
          </span>
          <span>
            Presupuesto vigente: <b className="tabular-nums text-brand-800">{fmtMoney(presupuestoVigente)}</b>
          </span>
          <span>
            Comprometido: <b className="tabular-nums text-brand-700">{fmtMoney(comprometido)}</b>
          </span>
          <span>
            Saldo del plan: <b className="tabular-nums text-emerald-700">{fmtMoney(disponible)}</b>
          </span>
          {!loading && cdpRows.length > 0 && (
            <span className="text-slate-400">{cdpRows.length} CDP vinculado{cdpRows.length === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>

      <CdpCreateForm
        fields={cfg.fields}
        formExtra={cfg.formExtra?.({ rows: cdpRows })}
        onCancel={onClose}
        onSubmit={save}
        submitLabel="Registrar CDP"
      />
    </Modal>
  )
}
