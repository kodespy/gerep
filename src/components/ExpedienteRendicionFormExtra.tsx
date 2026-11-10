import { useEffect, useState } from 'react'
import { FileDown, Loader2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS } from '../lib/storage'
import { formPatchFromStrNumero, isRendicionExpediente } from '../lib/expedienteRendicion'
import {
  parseRendicionFormularioFile,
  parsedToFormPatch,
} from '../lib/rendicionFormularioAdjunto'
import type { ExpedienteAdjunto } from './ExpedienteAdjuntosPanel'

type Props = {
  values: Record<string, any>
  patchValues: (partial: Record<string, any>) => void
  expedienteId?: string | null
}

function readableAdjunto(a: ExpedienteAdjunto): boolean {
  const n = (a.file_name ?? '').toLowerCase()
  const t = (a.file_type ?? '').toLowerCase()
  return n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.txt')
    || t.includes('pdf') || t.includes('wordprocessingml') || t.startsWith('text/')
}

async function lookupExtras(
  parsed: { strNumero?: string; ruc?: string; entidadNombre?: string },
  values: Record<string, any>,
) {
  const extra: Record<string, any> = {}
  if (parsed.strNumero) {
    Object.assign(extra, await formPatchFromStrNumero(parsed.strNumero, values))
  }
  if (parsed.ruc) {
    const { data } = await supabase
      .from('entidades')
      .select('id, razon_social, ruc')
      .ilike('ruc', `%${parsed.ruc}%`)
      .limit(1)
      .maybeSingle()
    if (data?.id) extra.entidad_id = data.id
  } else if (parsed.entidadNombre && parsed.entidadNombre.length >= 6) {
    const { data } = await supabase
      .from('entidades')
      .select('id, razon_social')
      .ilike('razon_social', `%${parsed.entidadNombre.slice(0, 40)}%`)
      .limit(1)
      .maybeSingle()
    if (data?.id) extra.entidad_id = data.id
  }
  return extra
}

export default function ExpedienteRendicionFormExtra({
  values,
  patchValues,
  expedienteId,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjuntos, setAdjuntos] = useState<ExpedienteAdjunto[]>([])

  const enabled = isRendicionExpediente(values.tipo)

  useEffect(() => {
    if (!enabled || !expedienteId) {
      setAdjuntos([])
      return
    }
    let cancelled = false
    void supabase
      .from('expediente_adjuntos')
      .select('id,expediente_id,file_path,file_name,file_type,descripcion,created_at')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setAdjuntos((data as ExpedienteAdjunto[]) ?? [])
      })
    return () => { cancelled = true }
  }, [enabled, expedienteId])

  if (!enabled) return null

  const applyFile = async (file: File) => {
    setBusy(true)
    setError(null)
    setHint(null)
    try {
      const parsed = await parseRendicionFormularioFile(file)
      const extra = await lookupExtras(parsed, values)
      const patch = { ...parsedToFormPatch(parsed), ...extra }
      patchValues(patch)
      const filled = Object.keys(patch).length
      setHint(`Se completaron ${filled} campo${filled === 1 ? '' : 's'} desde ${file.name}. Revise antes de guardar.`)
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el formulario.')
    } finally {
      setBusy(false)
    }
  }

  const applyAdjunto = async (a: ExpedienteAdjunto) => {
    if (!a.file_path) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.storage
        .from(STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS)
        .download(a.file_path)
      if (err || !data) throw new Error(err?.message ?? 'No se pudo descargar el adjunto.')
      const file = new File([data], a.file_name || 'formulario.pdf', {
        type: a.file_type || data.type || 'application/octet-stream',
      })
      await applyFile(file)
    } catch (e: any) {
      setBusy(false)
      setError(e?.message ?? 'No se pudo leer el adjunto.')
    }
  }

  const readable = adjuntos.filter(readableAdjunto)

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Rendición de cuentas
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Elija el N° de STR para completar el monto. También puede leer un formulario adjunto.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Leer formulario
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            disabled={busy}
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void applyFile(file)
            }}
          />
        </label>
        {readable.map(a => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => void applyAdjunto(a)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-300 hover:text-amber-800 disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            {a.file_name || 'Adjunto'}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">{hint}</p>}
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  )
}
