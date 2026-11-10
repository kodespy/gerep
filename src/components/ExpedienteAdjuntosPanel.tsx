import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS, storageFileLabel, uploadStorageFile } from '../lib/storage'
import { fmtDateTime } from '../lib/format'

export type ExpedienteAdjunto = {
  id: string
  expediente_id: string
  file_path: string | null
  file_name: string | null
  file_type: string | null
  descripcion: string | null
  created_at: string | null
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip,.txt,.csv'

export default function ExpedienteAdjuntosPanel({
  expedienteId,
}: {
  expedienteId: string | null | undefined
}) {
  const { session } = useAuth()
  const [items, setItems] = useState<ExpedienteAdjunto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!expedienteId) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('expediente_adjuntos')
      .select('id,expediente_id,file_path,file_name,file_type,descripcion,created_at')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false })
    if (err) {
      console.error('[expediente_adjuntos]', err.message)
      setError(err.message)
      setItems([])
    } else {
      setItems((data as ExpedienteAdjunto[]) ?? [])
    }
    setLoading(false)
  }, [expedienteId])

  useEffect(() => {
    void load()
  }, [load])

  const uploadFiles = async (files: FileList | File[]) => {
    if (!expedienteId) return
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    setError(null)
    try {
      const uid = session?.user?.id
      for (const file of list) {
        const path = await uploadStorageFile(
          STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS,
          `expedientes/${expedienteId}`,
          file,
        )
        const row: Record<string, unknown> = {
          expediente_id: expedienteId,
          file_path: path,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
        }
        if (uid) row.user_id = uid
        const { error: err } = await supabase.from('expediente_adjuntos').insert(row)
        if (err) throw new Error(err.message)
      }
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo subir el archivo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (item: ExpedienteAdjunto) => {
    if (!confirm(`¿Eliminar el adjunto "${item.file_name || 'archivo'}"?`)) return
    setError(null)
    const { error: err } = await supabase.from('expediente_adjuntos').delete().eq('id', item.id)
    if (err) {
      setError(err.message)
      return
    }
    setItems(prev => prev.filter(x => x.id !== item.id))
  }

  if (!expedienteId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
        Guardá el expediente para poder adjuntar documentos.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Documentos adjuntos{items.length ? ` (${items.length})` : ''}
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Subiendo…' : 'Agregar archivos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
          }}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">Cargando adjuntos…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400 dark:border-slate-700">
          Sin documentos adjuntos
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {items.map(item => {
            const label = item.file_name
              || (item.file_path ? storageFileLabel(item.file_path, STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS) : 'Archivo')
            return (
              <li key={item.id} className="flex items-center gap-2 bg-white px-3 py-2.5 dark:bg-slate-900">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
                  <p className="text-[11px] text-slate-400">
                    {[item.file_type, fmtDateTime(item.created_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {item.file_path && (
                  <ArchivoAdjuntoLink path={item.file_path} bucket={STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS} />
                )}
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                  title="Eliminar adjunto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Resumen compacto para columnas del listado. */
export function ExpedienteAdjuntosCell({ adjuntos }: { adjuntos?: ExpedienteAdjunto[] | null }) {
  const list = adjuntos ?? []
  if (!list.length) return <span className="text-slate-400">—</span>
  const first = list[0]
  const path = first.file_path
  if (!path) return <span className="text-slate-500">{list.length}</span>
  return (
    <span className="inline-flex items-center gap-1">
      <ArchivoAdjuntoLink path={path} bucket={STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS} />
      {list.length > 1 && (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          +{list.length - 1}
        </span>
      )}
    </span>
  )
}
