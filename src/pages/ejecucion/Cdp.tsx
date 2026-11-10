import { useMemo } from 'react'
import CrudModule from '../../components/CrudModule'
import CdpsListPdfButton from '../../components/CdpsListPdfButton'
import { cdpConfig } from '../../config/modules'

export default function Cdp() {
  const cfg = useMemo(() => {
    const base = cdpConfig()
    return {
      ...base,
      hideExcelExport: true,
      toolbarExtra: ({ filteredRows }: { filteredRows: any[] }) => (
        <CdpsListPdfButton
          rows={filteredRows}
          subtitle="Módulo CDP · Certificados de disponibilidad presupuestaria"
          filename="Listado_CDP"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        />
      ),
    }
  }, [])

  return <CrudModule {...cfg} />
}
