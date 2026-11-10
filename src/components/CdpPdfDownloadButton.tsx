import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { exportCdpPdf } from '../lib/cdpPdf'

interface CdpPdfDownloadButtonProps {
  cdpId: string
  className?: string
}

export default function CdpPdfDownloadButton({ cdpId, className }: CdpPdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  const descargar = async () => {
    setLoading(true)
    try {
      await exportCdpPdf(cdpId)
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF del CDP.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      title="Descargar PDF CDP"
      disabled={loading}
      onClick={descargar}
      className={className ?? 'rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50'}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    </button>
  )
}
