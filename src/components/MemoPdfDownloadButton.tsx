import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { exportMemoPdf } from '../lib/memoPdf'

export default function MemoPdfDownloadButton({
  memoId,
  disabled = false,
  title,
  className,
}: {
  memoId: string
  disabled?: boolean
  title?: string
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  const descargar = async () => {
    setLoading(true)
    try {
      await exportMemoPdf(memoId)
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF del memorándum.')
    } finally {
      setLoading(false)
    }
  }

  const isDisabled = disabled || loading

  return (
    <button
      type="button"
      title={title ?? (disabled ? 'Memo firmado adjunto: no se puede regenerar' : 'Imprimir / generar PDF')}
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
