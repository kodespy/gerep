import { useCallback, useMemo, useState } from 'react'
import { FileDown, Loader2, RefreshCw, X } from 'lucide-react'
import CrudModule, { type CrudConfig } from '../../components/CrudModule'
import ActasConfigRegistrosModal, { ActasConfigRegistrosButton } from '../../components/ActasConfigRegistrosModal'
import ActaFirmadaRowActions from '../../components/ActaFirmadaRowActions'
import ActaItemsPanel from '../../components/ActaItemsPanel'
import { actasConfig } from '../../config/modules'
import { isActaSoloAprobacion } from '../../lib/actaEstado'
import { exportActasListPdf } from '../../lib/actasListPdf'
import { supabase } from '../../lib/supabase'

const selectCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400'

export default function Actas() {
  const [configOpen, setConfigOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)

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
    const base = actasConfig()
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
      toolbarExtra: ({ filteredRows, reload }) => (
        <div className="flex flex-wrap items-center gap-2">
          <ActasConfigRegistrosButton onClick={() => setConfigOpen(true)} />
          <button
            type="button"
            title="Pasar a Desembolso las actas con monto aprobado > 0 que siguen en Aprobación"
            disabled={syncLoading}
            onClick={async () => {
              if (!confirm(
                '¿Actualizar a «Desembolso» todas las actas con monto aprobado a desembolsar mayor a 0 que están en estado «Aprobación»?',
              )) return
              setSyncLoading(true)
              try {
                const { data, error } = await supabase
                  .from('actas')
                  .update({ estado: 'Desembolso' })
                  .gt('monto_aprobado', 0)
                  .in('estado', ['Aprobación', 'Aprobacion', 'aprobación', 'aprobacion'])
                  .select('id')
                if (error) throw error
                alert(`Se actualizaron ${data?.length ?? 0} acta(s).`)
                reload()
              } catch (e: any) {
                alert(e?.message ?? 'No se pudieron actualizar los estados.')
              } finally {
                setSyncLoading(false)
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {syncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync estados
          </button>
          <button
            type="button"
            title="Generar PDF del listado filtrado"
            disabled={filteredRows.length === 0 || pdfLoading}
            onClick={async () => {
              setPdfLoading(true)
              try {
                await exportActasListPdf(filteredRows, {
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
        </div>
      ),
      expandedRowId: expandedId,
      onRowClick: (row: any) => setExpandedId(cur => (cur === row.id ? null : String(row.id))),
      renderRowDetail: (row: any, { reload }: { reload: () => void }) => (
        <ActaItemsPanel
          actaId={String(row.id)}
          proyectoId={row.proyecto_id ? String(row.proyecto_id) : null}
          soloAprobacion={isActaSoloAprobacion(row.estado)}
          onChanged={reload}
        />
      ),
      rowActions: (row: any, reload: () => void) => <ActaFirmadaRowActions row={row} reload={reload} />,
    }
  }, [clientFilter, filterResetKey, desde, hasta, hasFilters, pdfLoading, syncLoading, expandedId])

  return (
    <>
      <CrudModule {...cfg} />
      <ActasConfigRegistrosModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  )
}
