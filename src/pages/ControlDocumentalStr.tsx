import { Navigate } from 'react-router'
import CrudModule from '../components/CrudModule'
import { Badge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { canAccessSistema } from '../lib/roles'

export default function ControlDocumentalStr() {
  const { profile } = useAuth()
  if (!canAccessSistema(profile?.role)) return <Navigate to="/" replace />

  return (
    <CrudModule
      table="str_control_items_predefinidos"
      title="Configuración de Control Documental de STR"
      singular="Ítem"
      subtitle="Ítems predefinidos del control documental aplicables a solicitudes de transferencia (STR)"
      select="*"
      orderBy={{ column: 'orden', ascending: true }}
      userIdField={null}
      emptyHint='Agregue el primer ítem con el botón "Ítem".'
      columns={[
        {
          key: 'orden',
          label: 'Orden',
          align: 'center',
          render: (r: any) => <span className="tabular-nums font-medium text-slate-700">{r.orden ?? '—'}</span>,
        },
        {
          key: 'descripcion',
          label: 'Descripción',
          render: (r: any) => (
            <span className="whitespace-pre-wrap text-sm leading-snug text-slate-700">
              {(r.descripcion ?? '').trim() || '—'}
            </span>
          ),
        },
        {
          key: 'activo',
          label: 'Estado',
          align: 'center',
          render: (r: any) => (
            r.activo
              ? <Badge color="green">Activo</Badge>
              : <Badge color="slate">Inactivo</Badge>
          ),
        },
      ]}
      fields={[
        { name: 'orden', label: 'Orden', type: 'number', required: true, defaultValue: 1 },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan2: true },
        { name: 'activo', label: 'Activo', type: 'boolean', defaultValue: true },
      ]}
    />
  )
}
