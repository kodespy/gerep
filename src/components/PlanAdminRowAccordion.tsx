import { useState } from 'react'
import { CalendarDays, Pencil, Stamp, TrendingUp } from 'lucide-react'
import { Accordion, AccordionItem } from './Accordion'
import PlanAdminCronogramaResumen from './PlanAdminCronogramaResumen'
import PlanAdminCdpPanel from './PlanAdminCdpPanel'
import { planAdminPdfLabel } from '../lib/cdpsListPdf'
import CronogramaFinancieroAdminModal from './CronogramaFinancieroAdminModal'
import ModificacionesAdminPanel from './ModificacionesAdminPanel'

interface PlanAdminRowAccordionProps {
  plan: any
  reloadKey?: number
  onMutated?: () => void
}

export default function PlanAdminRowAccordion({ plan, reloadKey = 0, onMutated }: PlanAdminRowAccordionProps) {
  const [localKey, setLocalKey] = useState(0)
  const [cronogramaOpen, setCronogramaOpen] = useState(false)
  const [cdpSectionKey, setCdpSectionKey] = useState(0)

  const refresh = () => {
    setLocalKey(k => k + 1)
    onMutated?.()
  }

  const combinedKey = reloadKey + localKey * 1000

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Accordion>
          <AccordionItem
            title="Gestión de Modificaciones (Adendas)"
            icon={<TrendingUp className="h-4 w-4" />}
            defaultOpen
          >
            <ModificacionesAdminPanel
              key={`mod-${plan.id}-${combinedKey}`}
              plan={plan}
              onMutated={refresh}
              showHeader={false}
            />
          </AccordionItem>

          <AccordionItem
            title="Cronograma mensual"
            icon={<CalendarDays className="h-4 w-4" />}
          >
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
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
            <PlanAdminCronogramaResumen
              planAdminId={plan.id}
              anioDefault={plan.anio != null ? Number(plan.anio) : null}
              reloadKey={combinedKey}
            />
          </AccordionItem>

          <AccordionItem
            title="CDP · Compromisos presupuestarios"
            icon={<Stamp className="h-4 w-4" />}
            onOpenChange={open => { if (open) setCdpSectionKey(k => k + 1) }}
          >
            <PlanAdminCdpPanel
              planId={plan.id}
              planLabel={planAdminPdfLabel(plan)}
              reloadKey={`${combinedKey}-${cdpSectionKey}`}
              onMutated={refresh}
            />
          </AccordionItem>
        </Accordion>
      </div>

      <CronogramaFinancieroAdminModal
        plan={plan}
        open={cronogramaOpen}
        onClose={() => setCronogramaOpen(false)}
        onSaved={refresh}
      />
    </>
  )
}
