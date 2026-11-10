import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal } from './ui'
import { Label, TextArea, FkSelect, type FkOption } from './fields'
import { nowTimestamptz } from '../lib/format'
import { notifyDerivacion } from '../lib/notifyDerivacion'
import { esExpedienteFinalizado } from '../lib/roles'

export default function ExpedienteDerivarModal({
  open,
  onClose,
  expedienteId,
  numeroExpediente,
  asunto,
  areaOrigenId,
  onDerivado,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string | null
  numeroExpediente?: string | null
  asunto?: string | null
  areaOrigenId: string | null
  onDerivado: () => void
}) {
  const { session } = useAuth()
  const [areas, setAreas] = useState<FkOption[]>([])
  const [areaOrigenNombre, setAreaOrigenNombre] = useState<string | null>(null)
  const [areaDestinoId, setAreaDestinoId] = useState('')
  const [observacion, setObservacion] = useState('Para proceso correspondiente')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAreaDestinoId('')
    setObservacion('Para proceso correspondiente')
    setError(null)
    setAreaOrigenNombre(null)
    void (async () => {
      const { data, error: err } = await supabase
        .from('areas')
        .select('id,nombre,is_external, responsable:funcionarios!areas_responsable_id_fkey(id,nombre_completo,correo)')
        .order('nombre', { ascending: true })
        .limit(2000)
      if (err) {
        setError(err.message)
        setAreas([])
        return
      }
      const all = data ?? []
      if (areaOrigenId) {
        const origen = all.find(a => String(a.id) === String(areaOrigenId))
        setAreaOrigenNombre(origen?.nombre ? String(origen.nombre) : null)
      }
      setAreas(
        all
          .filter(a => !areaOrigenId || String(a.id) !== String(areaOrigenId))
          .map(a => {
            const resp = Array.isArray(a.responsable) ? a.responsable[0] : a.responsable
            const nombreResp = (resp?.nombre_completo ?? '').trim()
            const correo = (resp?.correo ?? '').trim()
            const nombreArea = a.nombre || 'Área'
            const ext = a.is_external ? ' · EXT' : ''
            const label = nombreResp
              ? `${nombreArea} — ${nombreResp}${ext}`
              : `${nombreArea}${ext}`
            const subParts = [
              correo || null,
              a.is_external ? 'Externa' : null,
            ].filter(Boolean)
            return {
              value: String(a.id),
              label,
              sub: subParts.join(' · ') || undefined,
            }
          }),
      )
    })()
  }, [open, areaOrigenId])

  const submit = async () => {
    if (!expedienteId || !session?.user?.id) {
      setError('Debe iniciar sesión para derivar.')
      return
    }
    if (!areaDestinoId) {
      setError('Seleccione la dependencia destino.')
      return
    }
    if (areaOrigenId && String(areaDestinoId) === String(areaOrigenId)) {
      setError('La dependencia destino debe ser distinta a la actual.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { data: expRow } = await supabase
        .from('expedientes')
        .select('id, estado, estado_finalizado')
        .eq('id', expedienteId)
        .maybeSingle()
      if (esExpedienteFinalizado(expRow)) {
        setError('Expediente finalizado: no se puede derivar. Solo un administrador o un desarrollador puede reactivarlo.')
        setSaving(false)
        return
      }

      const ahora = nowTimestamptz()
      const { error: segErr } = await supabase
        .from('expediente_seguimiento')
        .insert({
          expediente_id: expedienteId,
          area_origen_id: areaOrigenId,
          area_destino_id: areaDestinoId,
          estado: 'Derivado',
          user_id: session.user.id,
          fecha_derivacion: ahora,
          observacion: observacion.trim() || null,
        })
      if (segErr) throw segErr

      const { error: estErr } = await supabase
        .from('expedientes')
        .update({
          estado: 'Derivado',
          // La situación de permanencia queda en el área actual; al derivar se limpia.
          situacion_actual: null,
          situacion_actual_at: null,
          situacion_actual_by: null,
        })
        .eq('id', expedienteId)
      if (estErr) throw estErr

      const notify = await notifyDerivacion({
        expediente_id: expedienteId,
        area_destino_id: areaDestinoId,
        numero_expediente: numeroExpediente,
        asunto,
        observacion: observacion.trim() || null,
        area_origen_nombre: areaOrigenNombre,
      })
      if (!notify.ok && !notify.skipped) {
        console.warn('[derivar] notificación:', notify.error)
      }

      onDerivado()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo derivar el expediente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Send className="h-5 w-5 text-brand-600" />
          Derivar{numeroExpediente ? ` · ${numeroExpediente}` : ''}
        </span>
      }
    >
      <div className="space-y-4">
        <div>
          <Label text="Dependencia destino" required />
          <FkSelect
            value={areaDestinoId}
            onChange={setAreaDestinoId}
            options={areas}
            placeholder="Buscar por área, responsable o correo…"
          />
        </div>

        <div>
          <Label text="Observación" />
          <TextArea
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            placeholder="Motivo o instrucciones de la derivación…"
            rows={3}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {saving ? 'Derivando…' : 'Derivar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
