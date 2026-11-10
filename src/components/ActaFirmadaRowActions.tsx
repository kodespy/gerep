import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import ActaPdfDownloadButton from './ActaPdfDownloadButton'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { supabase } from '../lib/supabase'
import {
  normalizeStoragePath,
  STORAGE_BUCKET_ACTA_ARCHIVOS,
  uploadStorageFile,
} from '../lib/storage'

/** Busca un archivo en Storage para el acta y, si hace falta, re-vincula archivo_firmado. */
async function resolveActaAdjunto(
  actaId: string,
  current: string | null | undefined,
): Promise<{ path: string | null; relinked: boolean }> {
  const fromRow = (current ?? '').trim()
  if (fromRow) return { path: fromRow, relinked: false }

  const { data: dbRow, error: dbErr } = await supabase
    .from('actas')
    .select('archivo_firmado')
    .eq('id', actaId)
    .maybeSingle()
  if (!dbErr) {
    const fromDb = (dbRow?.archivo_firmado ?? '').trim()
    if (fromDb) return { path: fromDb, relinked: true }
  }

  // Adjuntos subidos por fila: actas/{actaId}/...
  const listed = await supabase.storage
    .from(STORAGE_BUCKET_ACTA_ARCHIVOS)
    .list(`actas/${actaId}`, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } })

  const file = (listed.data ?? []).find(f => f.name && f.name !== '.emptyFolderPlaceholder')
  if (!file?.name) return { path: null, relinked: false }

  const path = `actas/${actaId}/${file.name}`
  const { error: updErr } = await supabase
    .from('actas')
    .update({ archivo_firmado: path })
    .eq('id', actaId)
  if (updErr) {
    console.warn('[acta adjunto] no se pudo re-vincular:', updErr.message)
    return { path, relinked: false }
  }
  return { path, relinked: true }
}

export default function ActaFirmadaRowActions({
  row,
  reload,
}: {
  row: { id: string; archivo_firmado?: string | null }
  reload: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [archivo, setArchivo] = useState(() => (row.archivo_firmado ?? '').trim())

  useEffect(() => {
    setArchivo((row.archivo_firmado ?? '').trim())
  }, [row.id, row.archivo_firmado])

  useEffect(() => {
    let alive = true
    if ((row.archivo_firmado ?? '').trim()) return
    setResolving(true)
    ;(async () => {
      try {
        const { path, relinked } = await resolveActaAdjunto(row.id, row.archivo_firmado)
        if (!alive || !path) return
        setArchivo(path)
        if (relinked) reload()
      } catch (e) {
        console.warn('[acta adjunto] resolve failed', e)
      } finally {
        if (alive) setResolving(false)
      }
    })()
    return () => { alive = false }
    // Solo al montar / cambiar de fila sin path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id])

  const hasFile = Boolean(archivo)

  const removeFile = async () => {
    if (!hasFile) return
    if (!confirm('¿Eliminar el acta firmada adjunta? Podrá generar el PDF nuevamente.')) return
    setRemoving(true)
    try {
      const { error } = await supabase
        .from('actas')
        .update({ archivo_firmado: null })
        .eq('id', row.id)
      if (error) throw error

      const objectPath = normalizeStoragePath(archivo, STORAGE_BUCKET_ACTA_ARCHIVOS)
      if (objectPath) {
        await supabase.storage
          .from(STORAGE_BUCKET_ACTA_ARCHIVOS)
          .remove([objectPath])
          .catch(() => undefined)
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
      const path = await uploadStorageFile(STORAGE_BUCKET_ACTA_ARCHIVOS, `actas/${row.id}`, file)
      const { error } = await supabase
        .from('actas')
        .update({ archivo_firmado: path })
        .eq('id', row.id)
      if (error) throw error
      setArchivo(path)
      reload()
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo subir el acta firmada.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ActaPdfDownloadButton
        actaId={row.id}
        disabled={hasFile}
        title={hasFile
          ? 'Ya tiene acta firmada adjunta: no se puede regenerar el PDF'
          : 'Generar PDF del acta'}
      />
      {resolving ? (
        <span className="rounded-md p-1.5 text-slate-400" title="Buscando adjunto…">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : hasFile ? (
        <>
          <ArchivoAdjuntoLink path={archivo} bucket={STORAGE_BUCKET_ACTA_ARCHIVOS} badgeCount={1} />
          <button
            type="button"
            title="Eliminar acta firmada"
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
            title="Subir acta firmada"
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
