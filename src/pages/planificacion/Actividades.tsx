import CrudModule from '../../components/CrudModule'
import { Badge } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function Actividades() {
  return (
    <CrudModule
      table="actividades"
      title="Actividades"
      singular="Actividad"
      subtitle="Actividades presupuestarias que agrupan los componentes de cada programa"
      orderBy={{ column: 'codigo', ascending: true }}
      columns={[
        { key: 'codigo', label: 'Código', render: r => <Badge color="brand">{r.codigo}</Badge> },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'created_at', label: 'Registrado', render: r => <span className="text-slate-400">{fmtDate(r.created_at)}</span> },
      ]}
      fields={[
        { name: 'codigo', label: 'Código', type: 'text', required: true, placeholder: 'Ej.: ACT-001' },
        { name: 'descripcion', label: 'Descripción', type: 'textarea' },
      ]}
    />
  )
}
