import { useCallback, useMemo, useState } from 'react'
import { FileDown, Loader2, X } from 'lucide-react'
import CrudModule, { type CrudConfig } from '../../components/CrudModule'
import { resolucionesConfig } from '../../config/modules'
import { exportResolucionesListPdf } from '../../lib/resolucionesListPdf'

const selectCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400'

export default function Resoluciones() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const filterResetKey = `${desde}|${hasta}`
  const hasFilters = Boolean(desde || hasta)

  const clientFilter = useCallback((r: any) => {
    const fecha = String(r.fecha ?? '').slice(0, 10)
    if (desde && (!fecha || fecha < desde)) return false
    if (hasta && (!fecha || fecha > hasta)) return false
    return true
  }, [desde, hasta])

  const clearFilters = () => {
    setDesde('')
    setHasta('')
  }

  const cfg: CrudConfig = useMemo(() => {
    const base = resolucionesConfig()
    return {
      ...base,
      clientFilter,
      filterResetKey,
      filtersExtra: (
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-[150px] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fecha desde
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className={`mt-1 ${selectCls}`}
            />
          </label>
          <label className="w-[150px] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fecha hasta
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className={`mt-1 ${selectCls}`}
            />
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      ),
      toolbarExtra: ({ filteredRows }) => (
        <button
          type="button"
          title="Generar PDF del listado filtrado"
          disabled={filteredRows.length === 0 || pdfLoading}
          onClick={async () => {
            setPdfLoading(true)
            try {
              await exportResolucionesListPdf(filteredRows, {
                desde: desde || undefined,
                hasta: hasta || undefined,
              })
            } catch (e: any) {
              alert(e?.message ?? 'No se pudo generar el PDF.')
            } finally {
              setPdfLoading(false)
            }
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          PDF
        </button>
      ),
    }
  }, [clientFilter, filterResetKey, desde, hasta, hasFilters, pdfLoading])

  return <CrudModule {...cfg} />
}
