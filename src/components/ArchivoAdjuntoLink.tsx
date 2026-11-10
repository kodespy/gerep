import { useState, type ReactNode } from 'react'
import { Loader2, Paperclip } from 'lucide-react'
import { openStorageFile, storageFileLabel } from '../lib/storage'

export default function ArchivoAdjuntoLink({
  path,
  bucket,
  icon,
  badgeCount,
}: {
  path: string | null | undefined
  bucket: string
  /** Ícono del botón (por defecto clip). */
  icon?: ReactNode
  /** Badge numérico sobre el clip (ej. 1 adjunto). */
  badgeCount?: number
}) {
  const [loading, setLoading] = useState(false)

  if (!path) return <span className="text-slate-400">—</span>

  const count = badgeCount ?? 0

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async e => {
        e.preventDefault()
        e.stopPropagation()
        setLoading(true)
        try {
          await openStorageFile(bucket, path)
        } catch (err: any) {
          alert(err?.message ?? 'No se pudo descargar el archivo adjunto.')
        } finally {
          setLoading(false)
        }
      }}
      className="relative inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-60"
      title={`Descargar adjunto: ${storageFileLabel(path, bucket)}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (icon ?? <Paperclip className="h-4 w-4" />)}
      {!loading && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[9px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
