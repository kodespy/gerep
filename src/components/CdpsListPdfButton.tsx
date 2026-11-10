import { useState } from 'react'
import { FileSpreadsheet, Loader2, Printer } from 'lucide-react'
import { exportCdpsListPdf } from '../lib/cdpsListPdf'
import { exportCdpsListExcel } from '../lib/cdpsListExcel'

interface CdpsListPdfButtonProps {
  rows: any[]
  subtitle?: string
  filename?: string
  className?: string
}

export default function CdpsListPdfButton({ rows, subtitle, filename, className }: CdpsListPdfButtonProps) {
  const [busy, setBusy] = useState<'print' | 'excel' | null>(null)
  const disabled = rows.length === 0 || busy != null

  const run = async (kind: 'print' | 'excel', fn: () => Promise<void>, fallback: string) => {
    setBusy(kind)
    try {
      await fn()
    } catch (err: any) {
      alert(err?.message ?? fallback)
    } finally {
      setBusy(null)
    }
  }

  const btnClass = className
    ?? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <>
      <button
        type="button"
        title="Imprimir listado de CDP"
        disabled={disabled}
        onClick={() => void run('print', () => exportCdpsListPdf(rows, { subtitle, filename, print: true }), 'No se pudo generar el listado de CDP.')}
        className={btnClass}
      >
        {busy === 'print' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        Imprimir CDPs
      </button>
      <button
        type="button"
        title="Descargar listado de CDP en Excel"
        disabled={disabled}
        onClick={() => void run('excel', () => exportCdpsListExcel(rows, { subtitle, filename }), 'No se pudo generar el Excel de CDP.')}
        className={btnClass}
      >
        {busy === 'excel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
        Excel
      </button>
    </>
  )
}
