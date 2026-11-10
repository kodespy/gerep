import { useMemo, useState } from 'react'
import { CalendarDays, FileDown, Loader2, Stamp, TrendingUp } from 'lucide-react'
import CrudModule from '../../components/CrudModule'
import ComprometerCdpModal from '../../components/ComprometerCdpModal'
import PlanAdminRowAccordion from '../../components/PlanAdminRowAccordion'
import CronogramaFinancieroAdminModal from '../../components/CronogramaFinancieroAdminModal'
import ModificacionesAdminModal from '../../components/ModificacionesAdminModal'
import { planesFinancierosAdministrativosConfig } from '../../config/modules'
import { enrichPlanesAdminConCdp } from '../../lib/planAdminFinanciero'
import { exportPlanAdminConsolidadoPdf } from '../../lib/planAdminListPdf'

export default function PlanesAdministrativos() {
  const [comprometiendo, setComprometiendo] = useState<any | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cronogramaPlan, setCronogramaPlan] = useState<any | null>(null)
  const [modificacionesPlan, setModificacionesPlan] = useState<any | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)

  const refresh = () => setReloadKey(k => k + 1)

  const config = useMemo(() => ({
    ...planesFinancierosAdministrativosConfig(),
    transformRows: enrichPlanesAdminConCdp,
    expandedRowId: expandedId,
    onRowClick: (row: any) => setExpandedId(prev => (prev === row.id ? null : row.id)),
    renderRowDetail: (row: any) => (
      <PlanAdminRowAccordion plan={row} reloadKey={reloadKey} onMutated={refresh} />
    ),
    toolbarExtra: ({ filteredRows }: { filteredRows: any[] }) => (
      <button
        type="button"
        title="Generar PDF consolidado del listado filtrado"
        disabled={filteredRows.length === 0 || pdfLoading}
        onClick={async () => {
          setPdfLoading(true)
          try {
            await exportPlanAdminConsolidadoPdf(filteredRows)
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
    rowActions: (row: any) => (
      <>
        <button
          type="button"
          title="Comprometer · CDP"
          onClick={() => setComprometiendo(row)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
        >
          <Stamp className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Cargar cronograma"
          onClick={() => setCronogramaPlan(row)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Modificaciones (+/− presupuesto)"
          onClick={() => setModificacionesPlan(row)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
      </>
    ),
    onMutated: refresh,
  }), [expandedId, reloadKey, pdfLoading])

  return (
    <>
      <CrudModule key={reloadKey} {...config} />
      {comprometiendo && (
        <ComprometerCdpModal
          plan={comprometiendo}
          onClose={() => setComprometiendo(null)}
          onSaved={refresh}
        />
      )}
      {cronogramaPlan && (
        <CronogramaFinancieroAdminModal
          plan={cronogramaPlan}
          open
          onClose={() => setCronogramaPlan(null)}
          onSaved={refresh}
        />
      )}
      {modificacionesPlan && (
        <ModificacionesAdminModal
          plan={modificacionesPlan}
          open
          onClose={() => setModificacionesPlan(null)}
          onSaved={refresh}
        />
      )}
    </>
  )
}
