import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { exportActaPdf } from '../lib/actaPdf'

export default function ActaPdfDownloadButton({
  actaId,
  className,
  disabled = false,
  title,
}: {
  actaId: string
  className?: string
  /** Deshabilitar cuando ya hay acta firmada adjunta. */
  disabled?: boolean
  title?: string
}) {
  const [loading, setLoading] = useState(false)

  const descargar = async () => {
    setLoading(true)
    try {
      await exportActaPdf(actaId)
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF del acta.')
    } finally {
      setLoading(false)
    }
  }

  const isDisabled = disabled || loading

  return (
    <button
      type="button"
      title={title ?? (disabled ? 'Acta firmada adjunta: no se puede regenerar' : 'Generar PDF del acta')}
      disabled={isDisabled}
      onClick={e => {
        e.stopPropagation()
        if (isDisabled) return
        void descargar()
      }}
      className={className ?? 'rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800'}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    </button>
  )
}
