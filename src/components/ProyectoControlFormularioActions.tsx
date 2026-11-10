import { useRef, useState } from 'react'
import { FileDown, Loader2, Trash2, Upload } from 'lucide-react'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { supabase } from '../lib/supabase'
import { exportProyectoControlFormularioPdf } from '../lib/proyectoControlFormularioPdf'
import {
  normalizeStoragePath,
  STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS,
  uploadStorageFile,
} from '../lib/storage'

export default function ProyectoControlFormularioActions({
  proyectoId,
  numeroFormulario,
  archivoFirmado,
  onChanged,
}: {
  proyectoId: string
  numeroFormulario: string
  archivoFirmado?: string | null
  onChanged?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const archivo = (archivoFirmado ?? '').trim()
  const hasFile = Boolean(archivo)
  const numero = numeroFormulario.trim()

  const generarPdf = async () => {
    if (hasFile || !numero || numero === 'Sin número') return
    setPdfLoading(true)
    try {
      await exportProyectoControlFormularioPdf(proyectoId, numero)
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF del formulario.')
    } finally {
      setPdfLoading(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file || !numero || numero === 'Sin número') return
    setUploading(true)
    try {
      const path = await uploadStorageFile(
        STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS,
        `proyectos/${proyectoId}/${numero}`,
        file,
      )
      const { error } = await supabase
        .from('proyecto_control_formularios')
        .update({ archivo_firmado: path, updated_at: new Date().toISOString() })
        .eq('proyecto_id', proyectoId)
        .eq('numero_formulario', numero)
      if (error) throw error
      onChanged?.()
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo subir el formulario firmado.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeFile = async () => {
    if (!hasFile || !numero || numero === 'Sin número') return
    if (!confirm('¿Eliminar el archivo firmado adjunto? Podrá generar el PDF nuevamente.')) return
    setRemoving(true)
    try {
      const { error } = await supabase
        .from('proyecto_control_formularios')
        .update({ archivo_firmado: null, updated_at: new Date().toISOString() })
        .eq('proyecto_id', proyectoId)
        .eq('numero_formulario', numero)
      if (error) throw error

      const objectPath = normalizeStoragePath(archivo, STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS)
      if (objectPath) {
        await supabase.storage
          .from(STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS)
          .remove([objectPath])
          .catch(() => undefined)
      }
      onChanged?.()
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo eliminar el archivo firmado.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={
          hasFile
            ? 'Formulario firmado adjunto: no se puede regenerar el PDF'
            : 'Generar PDF del formulario'
        }
        disabled={hasFile || pdfLoading || !numero || numero === 'Sin número'}
        onClick={e => {
          e.stopPropagation()
          void generarPdf()
        }}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </button>

      {hasFile ? (
        <>
          <ArchivoAdjuntoLink path={archivo} bucket={STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS} />
          <button
            type="button"
            title="Eliminar archivo firmado"
            disabled={removing}
            onClick={e => {
              e.stopPropagation()
              void removeFile()
            }}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
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
            title="Adjuntar formulario firmado"
            disabled={uploading || !numero || numero === 'Sin número'}
            onClick={e => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  )
}
