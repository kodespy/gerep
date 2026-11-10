import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal } from './ui'
import { FkSelect, type FkOption } from './fields'
import { fromDatetimeLocalValue, nowDateInputValue, nowTimestamptz } from '../lib/format'

export default function ExpedienteRetornoExternaModal({
  open,
  onClose,
  expedienteId,
  numeroExpediente,
  areaExternaId,
  areaExternaNombre,
  areaDestinoSugeridaId,
  misAreaIds,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string
  numeroExpediente?: string | null
  areaExternaId: string | null
  areaExternaNombre?: string | null
  /** Área que originalmente derivó hacia la externa (sugerida para el retorno). */
  areaDestinoSugeridaId?: string | null
  misAreaIds: string[]
  onSaved?: () => void
}) {
  const { session } = useAuth()
  const [areas, setAreas] = useState<FkOption[]>([])
  const [areaDestinoId, setAreaDestinoId] = useState('')
  const [fechaRec, setFechaRec] = useState(nowDateInputValue())
  const [observacion, setObservacion] = useState('Retorno desde dependencia externa')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFechaRec(nowDateInputValue())
    setObservacion('Retorno desde dependencia externa')
    setError(null)
    void (async () => {
      const { data, error: err } = await supabase
        .from('areas')
        .select('id,nombre,is_external')
        .order('nombre', { ascending: true })
        .limit(2000)
      if (err) {
        setError(err.message)
        setAreas([])
        return
      }
      const internas = (data ?? []).filter(a => !a.is_external)
      const opts = internas.map(a => ({
        value: String(a.id),
        label: a.nombre || 'Área',
      }))
      setAreas(opts)

      const sugerida = areaDestinoSugeridaId ? String(areaDestinoSugeridaId) : ''
      const mia = misAreaIds.find(id => opts.some(o => o.value === String(id)))
      const preferida =
        (sugerida && opts.some(o => o.value === sugerida) ? sugerida : '') ||
        (mia ? String(mia) : '') ||
        (opts[0]?.value ?? '')
      setAreaDestinoId(preferida)
    })()
  }, [open, areaDestinoSugeridaId, misAreaIds])

  const guardar = async () => {
    if (!session?.user?.id) {
      setError('Debe iniciar sesión.')
      return
    }
    if (!areaExternaId) {
      setError('No se pudo determinar la dependencia externa de origen.')
      return
    }
    if (!areaDestinoId) {
      setError('Seleccione el área interna que recepciona el retorno.')
      return
    }
    if (String(areaDestinoId) === String(areaExternaId)) {
      setError('El destino debe ser un área interna distinta a la externa.')
      return
    }
    if (!fechaRec) {
      setError('Ingrese la fecha de recepción.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const ahora = nowTimestamptz()
      const fechaVal = fromDatetimeLocalValue(fechaRec) || fechaRec

      const { error: derErr } = await supabase.from('expediente_seguimiento').insert({
        expediente_id: expedienteId,
        area_origen_id: areaExternaId,
        area_destino_id: areaDestinoId,
        estado: 'Derivado',
        user_id: session.user.id,
        fecha_derivacion: ahora,
        observacion: observacion.trim() || 'Retorno desde dependencia externa',
      })
      if (derErr) throw derErr

      const { error: recErr } = await supabase.from('expediente_seguimiento').insert({
        expediente_id: expedienteId,
        area_origen_id: areaDestinoId,
        area_destino_id: areaDestinoId,
        estado: 'Recibido',
        user_id: session.user.id,
        fecha_hora_recepcion: fechaVal,
        observacion: observacion.trim() || 'Recepción del retorno desde dependencia externa',
      })
      if (recErr) throw recErr

      const { error: estErr } = await supabase
        .from('expedientes')
        .update({ estado: 'Recibido' })
        .eq('id', expedienteId)
      if (estErr) throw estErr

      onSaved?.()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar el retorno desde la dependencia externa.')
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
          <Undo2 className="h-5 w-5 text-emerald-600" />
          Recepcionar retorno
          {numeroExpediente ? ` · ${numeroExpediente}` : ''}
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          La dependencia externa no usa la app. Registrá acá que te devolvieron el expediente
          {areaExternaNombre ? (
            <> desde <span className="font-semibold">{areaExternaNombre}</span></>
          ) : null}
          {' '}y queda recepcionado en el área que indiques.
        </p>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <label className="block text-xs font-semibold text-slate-600">
          Área que recepciona <span className="text-rose-500">*</span>
          <div className="mt-1">
            <FkSelect
              value={areaDestinoId}
              onChange={setAreaDestinoId}
              options={areas}
              placeholder="Seleccione área interna…"
            />
          </div>
        </label>

        <label className="block text-xs font-semibold text-slate-600">
          Fecha de recepción <span className="text-rose-500">*</span>
          <input
            type="date"
            value={fechaRec}
            onChange={e => setFechaRec(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-600">
          Observación
          <textarea
            rows={3}
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void guardar()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" />
            {saving ? 'Guardando…' : 'Recepcionar retorno'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
