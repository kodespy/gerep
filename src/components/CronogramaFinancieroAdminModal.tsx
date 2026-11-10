import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Calculator } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MESES, fmtMoney } from '../lib/format'
import { distribuirMontoEn12Meses, fetchPresupuestoVigentePlanAdmin } from '../lib/planAdminFinanciero'
import { Label, MoneyInput } from './fields'
import { Modal, Spinner } from './ui'

interface CronogramaFinancieroAdminModalProps {
  plan: any
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function CronogramaFinancieroAdminModal({ plan, open, onClose, onSaved }: CronogramaFinancieroAdminModalProps) {
  const anio = Number(plan.anio) || new Date().getFullYear()
  const [montos, setMontos] = useState<string[]>(() => Array(12).fill(''))
  const [existingByMes, setExistingByMes] = useState<Record<number, string>>({})
  const [totalPlan, setTotalPlan] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [vigente, cronograma] = await Promise.all([
      fetchPresupuestoVigentePlanAdmin(plan.id, plan.monto_total),
      supabase
        .from('cronograma_administrativo')
        .select('id, mes, monto_programado')
        .eq('plan_administrativo_id', plan.id)
        .eq('anio', anio),
    ])
    setTotalPlan(vigente)
    const byMes: Record<number, string> = {}
    const values = Array(12).fill('')
    for (const row of cronograma.data ?? []) {
      const mes = Number(row.mes)
      if (mes >= 1 && mes <= 12) {
        byMes[mes] = row.id
        values[mes - 1] = String(Number(row.monto_programado) || 0)
      }
    }
    setExistingByMes(byMes)
    setMontos(values)
    setLoading(false)
  }, [plan.id, plan.monto_total, anio])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const totalProgramado = useMemo(
    () => montos.reduce((s, v) => s + (Number(v) || 0), 0),
    [montos],
  )
  const diferencia = totalPlan - totalProgramado

  const setMes = (index: number, value: string) => {
    setMontos(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const distribuirIgual = () => {
    const parts = distribuirMontoEn12Meses(totalPlan)
    setMontos(parts.map(String))
  }

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id ?? null

      for (let mes = 1; mes <= 12; mes++) {
        const monto = Number(montos[mes - 1]) || 0
        const existingId = existingByMes[mes]
        if (monto > 0) {
          if (existingId) {
            const { error } = await supabase.from('cronograma_administrativo').update({ monto_programado: monto }).eq('id', existingId)
            if (error) throw error
          } else {
            const { error } = await supabase.from('cronograma_administrativo').insert({
              plan_administrativo_id: plan.id,
              anio,
              mes,
              monto_programado: monto,
              user_id: userId,
            })
            if (error) throw error
          }
        } else if (existingId) {
          const { error } = await supabase.from('cronograma_administrativo').delete().eq('id', existingId)
          if (error) throw error
        }
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar el cronograma.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={onClose}
      wide
      nested
      title={(
        <span className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-brand-600" />
          Cronograma Financiero ({anio})
        </span>
      )}
    >
      {loading ? (
        <Spinner label="Cargando cronograma…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MESES.map((mes, i) => (
              <div key={mes}>
                <Label text={mes} />
                <MoneyInput
                  value={montos[i]}
                  onChange={v => setMes(i, v)}
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <span className="text-slate-600">Total del Plan ({anio})</span>
              <span className="font-bold tabular-nums text-slate-900">{fmtMoney(totalPlan)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 py-2">
              <span className="text-slate-600">Total Programado</span>
              <span className="font-semibold tabular-nums text-amber-600">{fmtMoney(totalProgramado)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <span className="font-medium text-slate-700">Diferencia</span>
              <span className={`font-bold tabular-nums ${diferencia === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {fmtMoney(diferencia)}
              </span>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={distribuirIgual}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Calculator className="h-4 w-4" />
              Distribuir Igual
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={saving}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar Cronograma'}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
