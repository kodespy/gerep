import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import MemoPdfDownloadButton from './MemoPdfDownloadButton'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { supabase } from '../lib/supabase'
import {
  normalizeStoragePath,
  STORAGE_BUCKET_MEMO_ARCHIVOS,
  uploadStorageFile,
} from '../lib/storage'

export default function MemoFirmadoRowActions({
  row,
  reload,
}: {
  row: { id: string; archivo_firmado?: string | null }
  reload: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [archivo, setArchivo] = useState(() => (row.archivo_firmado ?? '').trim())

  useEffect(() => {
    setArchivo((row.archivo_firmado ?? '').trim())
  }, [row.id, row.archivo_firmado])

  const hasFile = Boolean(archivo)

  const removeFile = async () => {
    if (!hasFile) return
    if (!confirm('¿Eliminar el memorándum firmado adjunto? Podrá generar el PDF nuevamente.')) return
    setRemoving(true)
    try {
      const { error } = await supabase
        .from('memos')
        .update({ archivo_firmado: null })
        .eq('id', row.id)
      if (error) throw error
      const objectPath = normalizeStoragePath(archivo, STORAGE_BUCKET_MEMO_ARCHIVOS)
      if (objectPath) {
        await supabase.storage.from(STORAGE_BUCKET_MEMO_ARCHIVOS).remove([objectPath]).catch(() => undefined)
      }
      setArchivo('')
      reload()
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo eliminar el archivo adjunto.')
    } finally {
      setRemoving(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const path = await uploadStorageFile(STORAGE_BUCKET_MEMO_ARCHIVOS, `memos/${row.id}`, file)
      const { error } = await supabase
        .from('memos')
        .update({ archivo_firmado: path })
        .eq('id', row.id)
      if (error) throw error
      setArchivo(path)
      reload()
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo subir el memorándum firmado.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <MemoPdfDownloadButton
        memoId={row.id}
        disabled={hasFile}
        title={hasFile
          ? 'Ya tiene el memo firmado adjunto: no se puede regenerar el PDF'
          : 'Imprimir / generar PDF del memorándum'}
      />
      {hasFile ? (
        <>
          <ArchivoAdjuntoLink path={archivo} bucket={STORAGE_BUCKET_MEMO_ARCHIVOS} badgeCount={1} />
          <button
            type="button"
            title="Eliminar memo firmado"
            disabled={removing}
            onClick={e => {
              e.stopPropagation()
              void removeFile()
            }}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40"
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={e => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            title="Adjuntar memo firmado"
            disabled={uploading}
            onClick={e => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  )
}
