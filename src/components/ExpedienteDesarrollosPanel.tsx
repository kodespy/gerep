import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate, nowDateInputValue, nowTimestamptz } from '../lib/format'

export type ExpedienteDesarrollo = {
  id: string
  expediente_id: string
  fecha: string
  descripcion: string
  area_id: string | null
  created_at: string | null
  area?: { nombre: string | null } | null
}

export function formatDesarrolloLinea(fecha: string | null | undefined, descripcion: string | null | undefined): string {
  const desc = String(descripcion ?? '').trim()
  const fechaTxt = fmtDate(fecha)
  if (!desc) return fechaTxt === '—' ? '' : fechaTxt
  if (fechaTxt === '—') return desc
  return `${fechaTxt} ${desc}`
}

async function syncSituacionActual(expedienteId: string, userId: string | null) {
  const { data } = await supabase
    .from('expediente_desarrollos')
    .select('fecha,descripcion,created_at')
    .eq('expediente_id', expedienteId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  const last = (data ?? [])[0] as { fecha?: string; descripcion?: string } | undefined
  const texto = last ? formatDesarrolloLinea(last.fecha, last.descripcion) || null : null
  await supabase
    .from('expedientes')
    .update({
      situacion_actual: texto,
      situacion_actual_at: texto ? nowTimestamptz() : null,
      situacion_actual_by: texto ? userId : null,
    })
    .eq('id', expedienteId)
}

export default function ExpedienteDesarrollosPanel({
  expedienteId,
  areaId,
  dependenciaNombre,
  canAdd,
  userId,
  situacionPrevia,
  onChanged,
}: {
  expedienteId: string
  areaId: string | null
  dependenciaNombre: string
  canAdd: boolean
  userId: string | null
  situacionPrevia?: string | null
  onChanged?: () => void
}) {
  const [items, setItems] = useState<ExpedienteDesarrollo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [fecha, setFecha] = useState(nowDateInputValue())
  const [descripcion, setDescripcion] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('expediente_desarrollos')
      .select('id,expediente_id,fecha,descripcion,area_id,created_at,area:areas!area_id(nombre)')
      .eq('expediente_id', expedienteId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) {
      console.error('[expediente_desarrollos]', err.message)
      setError(err.message)
      setItems([])
    } else {
      setItems((data as ExpedienteDesarrollo[]) ?? [])
    }
    setLoading(false)
  }, [expedienteId])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setFecha(nowDateInputValue())
    setDescripcion('')
    setAdding(false)
  }

  const save = async () => {
    if (!canAdd) return
    const desc = descripcion.trim()
    if (!fecha || !desc) {
      setError('Indique fecha y descripción.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const row: Record<string, unknown> = {
        expediente_id: expedienteId,
        fecha,
        descripcion: desc,
        area_id: areaId,
      }
      if (userId) row.created_by = userId
      const { error: err } = await supabase.from('expediente_desarrollos').insert(row)
      if (err) throw new Error(err.message)
      await syncSituacionActual(expedienteId, userId)
      resetForm()
      await load()
      onChanged?.()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar el ítem de desarrollo.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ExpedienteDesarrollo) => {
    if (!canAdd) return
    if (!confirm(`¿Eliminar el ítem?\n${formatDesarrolloLinea(item.fecha, item.descripcion)}`)) return
    setError(null)
    const { error: err } = await supabase.from('expediente_desarrollos').delete().eq('id', item.id)
    if (err) {
      setError(err.message)
      return
    }
    await syncSituacionActual(expedienteId, userId)
    setItems(prev => prev.filter(x => x.id !== item.id))
    onChanged?.()
  }

  const notaPrevia = !items.length ? String(situacionPrevia ?? '').trim() : ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <CalendarDays className="h-3.5 w-3.5 text-studio-violet" />
            Desarrollo del expediente
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Bitácora de avances y demoras mientras está en{' '}
            <span className="font-medium text-slate-600">{dependenciaNombre}</span>.
            {' '}Solo el responsable de esa dependencia puede agregar ítems.
          </p>
        </div>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setFecha(nowDateInputValue())
              setDescripcion('')
              setAdding(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-studio-violet/40 hover:text-studio-violet"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar ítem
          </button>
        )}
      </div>

      {adding && canAdd && (
        <div className="space-y-3 rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full rounded-[0.9rem] border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-studio-violet"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción</span>
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Retraso debido a falta de documentación, remitido por correo observaciones"
                className="w-full rounded-[0.9rem] border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-studio-violet"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Se mostrará como: {formatDesarrolloLinea(fecha, descripcion || '…')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400">{descripcion.trim().length}/2000</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="gradient-primary rounded-[0.9rem] px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar ítem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando desarrollo…
        </p>
      ) : items.length ? (
        <ul className="divide-y divide-slate-100 rounded-[0.9rem] border border-slate-200">
          {items.map(item => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-ink dark:text-slate-200">
                  <span className="font-semibold tabular-nums">{fmtDate(item.fecha)}</span>
                  {' '}
                  {item.descripcion.trim()}
                </p>
                {item.area?.nombre && (
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.area.nombre}</p>
                )}
              </div>
              {canAdd && (
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  title="Eliminar ítem"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-slate-400">
          {notaPrevia ? (
            <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nota previa · </span>
              {notaPrevia}
            </p>
          ) : canAdd ? (
            'Aún no hay ítems. Agregue fecha y descripción (ej.: 20/08/2026 Retraso debido a falta de documentación…).'
          ) : (
            'Sin ítems de desarrollo. Solo el responsable del área donde está el expediente puede registrarlos.'
          )}
        </div>
      )}
    </div>
  )
}
