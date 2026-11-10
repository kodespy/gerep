import { useEffect, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal } from './ui'
import { fromDatetimeLocalValue, nowDateInputValue } from '../lib/format'

export default function ExpedienteRecepcionExternaModal({
  open,
  onClose,
  expedienteId,
  seguimientoId,
  numeroExpediente,
  areaDestinoNombre,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string
  seguimientoId: string
  numeroExpediente?: string | null
  areaDestinoNombre?: string | null
  onSaved?: () => void
}) {
  const { session } = useAuth()
  const [fechaRec, setFechaRec] = useState(nowDateInputValue())
  const [quienRecibio, setQuienRecibio] = useState('')
  const [nroAsignado, setNroAsignado] = useState('')
  const [obsRec, setObsRec] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFechaRec(nowDateInputValue())
    setQuienRecibio('')
    setNroAsignado('')
    setObsRec('')
    setError(null)
  }, [open, seguimientoId])

  const guardar = async () => {
    const quien = quienRecibio.trim()
    if (!fechaRec) {
      setError('Ingrese la fecha de recepción.')
      return
    }
    if (!quien) {
      setError('Indique quién recibió el expediente.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const fechaVal = fromDatetimeLocalValue(fechaRec) || fechaRec
      const payload: Record<string, any> = {
        // Mantener "Derivado": la recepción externa se marca con fecha_hora_recepcion
        // sobre la misma fila (así el expediente sigue “en” la dependencia externa).
        fecha_hora_recepcion: fechaVal,
        quien_recibio: quien,
        nro_expediente_asignado: nroAsignado.trim() || null,
        observacion_recepcion: obsRec.trim() || null,
      }
      if (session?.user?.id) payload.user_id = session.user.id

      let { error: updErr } = await supabase
        .from('expediente_seguimiento')
        .update(payload)
        .eq('id', seguimientoId)

      if (updErr && /quien_recibio|nro_expediente_asignado|observacion_recepcion/i.test(updErr.message)) {
        const basic = {
          fecha_hora_recepcion: fechaVal,
          observacion: [
            `Recepción externa: ${quien}`,
            nroAsignado.trim() ? `N° asignado: ${nroAsignado.trim()}` : '',
            obsRec.trim(),
          ].filter(Boolean).join(' · '),
          ...(session?.user?.id ? { user_id: session.user.id } : {}),
        }
        const retry = await supabase.from('expediente_seguimiento').update(basic).eq('id', seguimientoId)
        if (retry.error) throw retry.error
        updErr = null
      }
      if (updErr) throw updErr

      await supabase.from('expedientes').update({ estado: 'Recibido' }).eq('id', expedienteId)
      onSaved?.()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar la recepción externa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose() }}
      title={
        <span className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-amber-600" />
          Recepción externa
          {numeroExpediente ? ` · ${numeroExpediente}` : ''}
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Registre la recepción en la dependencia externa
          {areaDestinoNombre ? (
            <> <span className="font-semibold">{areaDestinoNombre}</span></>
          ) : null}
          .
        </p>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Fecha recepción <span className="text-rose-500">*</span>
            <input
              type="date"
              value={fechaRec}
              onChange={e => setFechaRec(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Quién recibió <span className="text-rose-500">*</span>
            <input
              type="text"
              value={quienRecibio}
              onChange={e => setQuienRecibio(e.target.value)}
              placeholder="Nombre de la persona o mesa externa"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            N° expediente asignado (opcional)
            <input
              type="text"
              value={nroAsignado}
              onChange={e => setNroAsignado(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            Observación de recepción
            <textarea
              rows={3}
              value={obsRec}
              onChange={e => setObsRec(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void guardar()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Registrar recepción'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
