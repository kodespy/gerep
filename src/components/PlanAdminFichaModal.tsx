import { useState } from 'react'
import { CalendarDays, Pencil } from 'lucide-react'
import { EstadoBadge, Modal } from './ui'
import PlanAdminCdpPanel from './PlanAdminCdpPanel'
import { planAdminPdfLabel } from '../lib/cdpsListPdf'
import PlanAdminResumenFinanciero from './PlanAdminResumenFinanciero'
import PlanAdminCronogramaResumen from './PlanAdminCronogramaResumen'
import CronogramaFinancieroAdminModal from './CronogramaFinancieroAdminModal'
import ModificacionesAdminPanel from './ModificacionesAdminPanel'

function CodigoDescripcion({ codigo, descripcion }: { codigo?: string | null; descripcion?: string | null }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{codigo ?? '—'}</p>
      {descripcion && <p className="mt-0.5 text-xs leading-snug text-slate-400">{descripcion}</p>}
    </div>
  )
}

interface PlanAdminFichaModalProps {
  plan: any
  onClose: () => void
  onMutated?: () => void
}

export default function PlanAdminFichaModal({ plan, onClose, onMutated }: PlanAdminFichaModalProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const [cronogramaOpen, setCronogramaOpen] = useState(false)
  const titulo = plan.descripcion
    || [plan.programa?.codigo, plan.actividad?.codigo, plan.objeto?.codigo].filter(Boolean).join(' · ')
    || 'Plan administrativo'

  const refresh = () => {
    setReloadKey(k => k + 1)
    onMutated?.()
  }

  return (
    <Modal open onClose={onClose} title={`Ficha · ${titulo}`} wide>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Año</p>
          <p className="mt-1 font-semibold text-slate-800">{plan.anio ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Programa</p>
          <div className="mt-1"><CodigoDescripcion codigo={plan.programa?.codigo} descripcion={plan.programa?.descripcion} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Actividad</p>
          <div className="mt-1"><CodigoDescripcion codigo={plan.actividad?.codigo} descripcion={plan.actividad?.descripcion} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Objeto de gasto</p>
          <div className="mt-1"><CodigoDescripcion codigo={plan.objeto?.codigo} descripcion={plan.objeto?.descripcion} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fuente</p>
          <p className="mt-1 text-sm text-slate-700">{plan.fuente?.descripcion ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</p>
          <div className="mt-1"><EstadoBadge estado={plan.estado} /></div>
        </div>
      </div>

      {plan.descripcion && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descripción</p>
          <p className="mt-1 text-sm text-slate-700">{plan.descripcion}</p>
        </div>
      )}

      <PlanAdminResumenFinanciero plan={plan} reloadKey={reloadKey} />

      <section className="mb-6 border-t border-slate-100 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Cronograma mensual</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCronogramaOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setCronogramaOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Cargar cronograma
            </button>
          </div>
        </div>
        <PlanAdminCronogramaResumen planAdminId={plan.id} anioDefault={plan.anio != null ? Number(plan.anio) : null} reloadKey={reloadKey} />
      </section>

      <CronogramaFinancieroAdminModal
        plan={plan}
        open={cronogramaOpen}
        onClose={() => setCronogramaOpen(false)}
        onSaved={refresh}
      />

      <section className="mb-6 border-t border-slate-100 pt-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Gestión de Modificaciones (Adendas)</h3>
        <ModificacionesAdminPanel key={`ad-${plan.id}-${reloadKey}`} plan={plan} onMutated={refresh} showHeader={false} />
      </section>

      <section className="border-t border-slate-100 pt-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">CDP · Compromisos presupuestarios</h3>
        <PlanAdminCdpPanel planId={plan.id} planLabel={planAdminPdfLabel(plan)} onMutated={refresh} />
      </section>
    </Modal>
  )
}
