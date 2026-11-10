import { useSearchParams } from 'react-router'
import { ClipboardList, Table2 } from 'lucide-react'
import CrudModule from '../../components/CrudModule'
import RendicionControlFormulariosList from '../../components/RendicionControlFormulariosList'
import ModuleTabs from '../../components/ModuleTabs'
import { PageHeader } from '../../components/ui'
import { rendicionesConfig } from '../../config/modules'

const TABS = [
  { id: 'registros', label: 'Rendiciones', icon: Table2 },
  { id: 'control', label: 'Formularios de Control', icon: ClipboardList },
] as const

type TabId = typeof TABS[number]['id']

export default function Rendiciones() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabId = searchParams.get('tab') === 'control' ? 'control' : 'registros'
  const setTab = (next: TabId) => {
    setSearchParams(next === 'registros' ? {} : { tab: next }, { replace: false })
  }

  return (
    <div className="fade-up">
      <PageHeader
        title="Rendiciones de cuentas"
        subtitle="Presentación de rendiciones ante la CGR. Las plantillas de control documental se configuran en Sistema."
      />

      <ModuleTabs
        tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <t.icon className="h-4 w-4" aria-hidden /> }))}
        value={tab}
        onChange={setTab}
        ariaLabel="Vistas de rendiciones"
      />

      {tab === 'registros' && (
        <CrudModule {...rendicionesConfig()} embedded />
      )}

      {tab === 'control' && (
        <RendicionControlFormulariosList />
      )}
    </div>
  )
}
