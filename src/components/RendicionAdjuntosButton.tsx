import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { Modal } from './ui'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { STORAGE_BUCKET_RENDICION_ARCHIVOS, storageFileLabel, uploadStorageFile } from '../lib/storage'

/** Esquema real: id, rendicion_id, url_archivo, nombre_archivo, usuario_id */
export type RendicionArchivo = {
  id: string
  rendicion_id: string
  url_archivo: string | null
  nombre_archivo: string | null
  usuario_id?: string | null
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip,.txt,.csv'

function archivoLabel(item: RendicionArchivo): string {
  const named = (item.nombre_archivo ?? '').trim()
  if (named) return named
  if (item.url_archivo) return storageFileLabel(item.url_archivo, STORAGE_BUCKET_RENDICION_ARCHIVOS)
  return 'Archivo'
}

function RendicionAdjuntosPanel({ rendicionId }: { rendicionId: string }) {
  const { session } = useAuth()
  const [items, setItems] = useState<RendicionArchivo[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('rendicion_archivos')
      .select('id, rendicion_id, url_archivo, nombre_archivo, usuario_id')
      .eq('rendicion_id', rendicionId)
      .order('id', { ascending: false })
    if (err) {
      console.error('[rendicion_archivos]', err.message)
      setError(err.message)
      setItems([])
    } else {
      setItems((data as RendicionArchivo[]) ?? [])
    }
    setLoading(false)
  }, [rendicionId])

  useEffect(() => {
    void load()
  }, [load])

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    setError(null)
    try {
      const uid = session?.user?.id
        ?? (await supabase.auth.getUser()).data.user?.id
      if (!uid) throw new Error('Debe iniciar sesión para adjuntar archivos.')

      for (const file of list) {
        const path = await uploadStorageFile(
          STORAGE_BUCKET_RENDICION_ARCHIVOS,
          `rendiciones/${rendicionId}`,
          file,
        )
        const { error: err } = await supabase.from('rendicion_archivos').insert({
          rendicion_id: rendicionId,
          url_archivo: path,
          nombre_archivo: file.name || 'archivo',
          usuario_id: uid,
        })
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

  const remove = async (item: RendicionArchivo) => {
    if (!confirm(`¿Eliminar el adjunto "${archivoLabel(item)}"?`)) return
    setError(null)
    const { error: err } = await supabase.from('rendicion_archivos').delete().eq('id', item.id)
    if (err) {
      setError(err.message)
      return
    }
    setItems(prev => prev.filter(x => x.id !== item.id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Archivos varios de esta rendición{items.length ? ` (${items.length})` : ''}
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">Cargando adjuntos…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
          Sin archivos. Use “Agregar archivos” para adjuntar documentos varios.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-2 bg-white px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{archivoLabel(item)}</p>
              </div>
              {item.url_archivo && (
                <ArchivoAdjuntoLink path={item.url_archivo} bucket={STORAGE_BUCKET_RENDICION_ARCHIVOS} />
              )}
              <button
                type="button"
                onClick={() => void remove(item)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Eliminar adjunto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Ícono clip: abre modal para agregar/ver archivos varios de la rendición. */
export default function RendicionAdjuntosButton({
  rendicionId,
  strNumero,
  adjuntosCount,
  onChanged,
}: {
  rendicionId: string
  strNumero?: string | null
  adjuntosCount?: number
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const count = adjuntosCount ?? 0

  return (
    <>
      <button
        type="button"
        title="Archivos varios de la rendición"
        onClick={() => setOpen(true)}
        className="relative rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
      >
        <Paperclip className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[9px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          onChanged?.()
        }}
        title={`Archivos · Rendición${strNumero ? ` STR ${strNumero}` : ''}`}
      >
        <RendicionAdjuntosPanel rendicionId={rendicionId} />
      </Modal>
    </>
  )
}
