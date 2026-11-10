import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMoney } from '../lib/format'
import { ajusteModificacionAdmin } from '../lib/planVigente'
import { ConfirmDialog, Spinner } from './ui'
import { deleteConfirmMessage, friendlyDeleteError, safeDeleteById } from '../lib/deleteGuard'
import { Label, MoneyInput, SelectInput, TextArea, TextInput } from './fields'

const DOC_PREFIX = 'DOC:'

export type ModificacionRow = {
  id: string
  plan_administrativo_id: string
  tipo_modificacion: string | null
  monto: number
  descripcion: string | null
  fecha_modificacion: string | null
  user_id?: string | null
  created_at?: string
}

type FormState = {
  numero_documento: string
  fecha_modificacion: string
  tipo_modificacion: 'aumento' | 'disminucion'
  monto: string
  justificacion: string
}

const TIPO_OPTIONS = [
  { value: 'aumento', label: 'Aumento (Ampliación)' },
  { value: 'disminucion', label: 'Disminución (Reducción)' },
]

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyForm(): FormState {
  return {
    numero_documento: '',
    fecha_modificacion: todayIso(),
    tipo_modificacion: 'aumento',
    monto: '',
    justificacion: '',
  }
}

export function encodeModDescripcion(numero: string, justificacion: string): string | null {
  const n = numero.trim()
  const t = justificacion.trim()
  if (n && t) return `${DOC_PREFIX}${n}\n${t}`
  if (n) return `${DOC_PREFIX}${n}`
  if (t) return t
  return null
}

export function decodeModDescripcion(raw: string | null | undefined): { numero: string; justificacion: string } {
  const s = (raw ?? '').trim()
  if (!s) return { numero: '', justificacion: '' }
  if (s.startsWith(DOC_PREFIX)) {
    const rest = s.slice(DOC_PREFIX.length)
    const i = rest.indexOf('\n')
    if (i === -1) return { numero: rest.trim(), justificacion: '' }
    return { numero: rest.slice(0, i).trim(), justificacion: rest.slice(i + 1).trim() }
  }
  return { numero: '', justificacion: s }
}

function itemLabel(plan: any): string {
  const codigo = plan?.objeto?.codigo
  const desc = plan?.objeto?.descripcion || plan?.descripcion
  if (codigo && desc) return `[${codigo}] ${desc}`
  if (desc) return String(desc)
  if (codigo) return `[${codigo}]`
  return [plan?.programa?.codigo, plan?.actividad?.codigo].filter(Boolean).join(' · ') || 'Plan administrativo'
}

function tipoLabel(tipo: string | null | undefined) {
  const t = (tipo ?? '').toLowerCase()
  if (t.includes('dis')) return 'Disminución'
  return 'Aumento'
}

interface ModificacionesAdminPanelProps {
  plan: any
  onMutated?: () => void
  /** Si true, muestra el encabezado completo (título + ítem). */
  showHeader?: boolean
}

export default function ModificacionesAdminPanel({ plan, onMutated, showHeader = true }: ModificacionesAdminPanelProps) {
  const [rows, setRows] = useState<ModificacionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ModificacionRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ModificacionRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('modificaciones_administrativas')
      .select('id,plan_administrativo_id,tipo_modificacion,monto,descripcion,fecha_modificacion,user_id,created_at')
      .eq('plan_administrativo_id', plan.id)
      .order('fecha_modificacion', { ascending: false })
      .limit(500)
    if (err) console.error('[modificaciones_administrativas]', err.message)
    setRows((data as ModificacionRow[]) ?? [])
    setLoading(false)
  }, [plan.id])

  useEffect(() => { void load() }, [load])

  const original = Number(plan.monto_total) || 0
  const totalAjustes = useMemo(
    () => rows.reduce((s, r) => s + ajusteModificacionAdmin(r), 0),
    [rows],
  )
  const vigente = original + totalAjustes

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setError(null)
    setFormOpen(true)
  }

  const openEdit = (row: ModificacionRow) => {
    const decoded = decodeModDescripcion(row.descripcion)
    setEditing(row)
    setForm({
      numero_documento: decoded.numero,
      fecha_modificacion: (row.fecha_modificacion ?? todayIso()).slice(0, 10),
      tipo_modificacion: (row.tipo_modificacion ?? '').toLowerCase().includes('dis') ? 'disminucion' : 'aumento',
      monto: row.monto != null ? String(Math.round(Number(row.monto) || 0)) : '',
      justificacion: decoded.justificacion,
    })
    setError(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setError(null)
    setForm(emptyForm())
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setError(null)
    const monto = Number(form.monto)
    if (!form.fecha_modificacion) {
      setError('La fecha es obligatoria.')
      return
    }
    if (!form.tipo_modificacion) {
      setError('Seleccione el tipo de ajuste.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('Ingrese un monto de ajuste mayor a cero.')
      return
    }

    setSaving(true)
    const payload = {
      plan_administrativo_id: plan.id,
      fecha_modificacion: form.fecha_modificacion,
      tipo_modificacion: form.tipo_modificacion,
      monto,
      descripcion: encodeModDescripcion(form.numero_documento, form.justificacion),
    }

    try {
      if (editing) {
        const { error: err } = await supabase
          .from('modificaciones_administrativas')
          .update({
            fecha_modificacion: payload.fecha_modificacion,
            tipo_modificacion: payload.tipo_modificacion,
            monto: payload.monto,
            descripcion: payload.descripcion,
          })
          .eq('id', editing.id)
        if (err) throw err
      } else {
        const { data: auth } = await supabase.auth.getUser()
        const insertPayload = {
          ...payload,
          ...(auth.user ? { user_id: auth.user.id } : {}),
        }
        const { error: err } = await supabase
          .from('modificaciones_administrativas')
          .insert(insertPayload)
        if (err) throw err
      }
      closeForm()
      await load()
      onMutated?.()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar la modificación.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById('modificaciones_administrativas', String(deleting.id))
      setDeleting(null)
      await load()
      onMutated?.()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar la modificación.')
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <History className="h-5 w-5 text-slate-500" />
            Gestión de Modificaciones (Adendas)
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Ajustes presupuestarios para el ítem:{' '}
            <span className="font-semibold text-slate-800">{itemLabel(plan)}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Ajustes presupuestarios para el ítem:{' '}
          <span className="font-semibold text-slate-800">{itemLabel(plan)}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Monto original</p>
          <p className="mt-1 text-base font-bold tabular-nums text-slate-800">{fmtMoney(original)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total ajustes</p>
          <p className={`mt-1 text-base font-bold tabular-nums ${totalAjustes < 0 ? 'text-rose-600' : totalAjustes > 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
            {totalAjustes >= 0 ? '+' : ''}{fmtMoney(totalAjustes)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Monto vigente</p>
          <p className="mt-1 text-base font-bold tabular-nums text-white">{fmtMoney(vigente)}</p>
        </div>
      </div>

      {formOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              {editing ? 'Editar modificación' : 'Nueva Modificación'}
            </h3>
            <button type="button" onClick={closeForm} className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label text="Nº Documento / Adenda" />
              <TextInput
                value={form.numero_documento}
                placeholder="Ej: RES-2024-001"
                onChange={e => setField('numero_documento', e.target.value)}
              />
            </div>
            <div>
              <Label text="Fecha" required />
              <TextInput
                type="date"
                value={form.fecha_modificacion}
                onChange={e => setField('fecha_modificacion', e.target.value)}
              />
            </div>
            <div>
              <Label text="Tipo de Ajuste" required />
              <SelectInput
                value={form.tipo_modificacion}
                options={TIPO_OPTIONS}
                onChange={e => setField('tipo_modificacion', e.target.value as FormState['tipo_modificacion'])}
              />
            </div>
            <div>
              <Label text="Monto de Ajuste" required />
              <MoneyInput
                value={form.monto}
                onChange={v => setField('monto', v)}
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2">
              <Label text="Descripción / Justificación" />
              <TextArea
                value={form.justificacion}
                placeholder="Motivo del ajuste..."
                onChange={e => setField('justificacion', e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : editing ? 'Actualizar modificación' : 'Guardar Modificación'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Nueva modificación
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Historial · {rows.length} registro{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        {loading ? (
          <Spinner label="Cargando modificaciones…" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Sin modificaciones. Use “Nueva modificación” para registrar la primera adenda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-600">
                  <th className="px-4 py-2.5">Nº Doc.</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5 text-right">Ajuste</th>
                  <th className="px-4 py-2.5">Justificación</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const decoded = decodeModDescripcion(row.descripcion)
                  const net = ajusteModificacionAdmin(row)
                  const isDown = net < 0
                  return (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{decoded.numero || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{fmtDate(row.fecha_modificacion)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${isDown ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}`}>
                          {isDown ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                          {tipoLabel(row.tipo_modificacion)}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${isDown ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {net >= 0 ? '+' : ''}{fmtMoney(net)}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-slate-600">{decoded.justificacion || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => openEdit(row)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => setDeleting(row)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleting}
        message={deleteConfirmMessage({ singular: 'modificación' })}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
