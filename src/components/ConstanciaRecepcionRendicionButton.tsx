import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { exportConstanciaRecepcionRendicionPdf } from '../lib/constanciaRecepcionRendicionPdf'

type Props = {
  expedienteId: string
  variant?: 'icon' | 'button'
  className?: string
}

export default function ConstanciaRecepcionRendicionButton({
  expedienteId,
  variant = 'button',
  className,
}: Props) {
  const [busy, setBusy] = useState(false)

  const generar = async () => {
    setBusy(true)
    try {
      await exportConstanciaRecepcionRendicionPdf(expedienteId)
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar la constancia.')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        title="Generar constancia de recepción"
        disabled={busy}
        onClick={e => {
          e.stopPropagation()
          if (!busy) void generar()
        }}
        className={className ?? 'rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-40 dark:hover:bg-slate-800'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void generar()}
      className={className ?? 'inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50'}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {busy ? 'Generando…' : 'Constancia de recepción'}
    </button>
  )
}
