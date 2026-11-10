import { Navigate } from 'react-router'
import CrudModule from '../components/CrudModule'
import { Badge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { canAccessSistema } from '../lib/roles'

export default function ControlRendicionesCuentas() {
  const { profile } = useAuth()
  if (!canAccessSistema(profile?.role)) return <Navigate to="/" replace />

  return (
    <CrudModule
      table="rendiciones_cuentas_items_predeterminados"
      title="Configuración de Control de Rendiciones de Cuentas"
      singular="Ítem"
      subtitle="Ítems predeterminados del control de rendiciones de cuentas"
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
          key: 'nombre',
          label: 'Nombre',
          render: (r: any) => (
            <span className="font-medium text-slate-800">
              {(r.nombre ?? '').trim() || '—'}
            </span>
          ),
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
          key: 'doc_sustancial',
          label: 'Doc. Sustancial',
          align: 'center',
          render: (r: any) => (
            r.doc_sustancial
              ? <Badge color="brand">Sí</Badge>
              : <Badge color="slate">No</Badge>
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
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan2: true },
        { name: 'doc_sustancial', label: 'Doc. Sustancial', type: 'boolean', defaultValue: false },
        { name: 'activo', label: 'Activo', type: 'boolean', defaultValue: true },
      ]}
    />
  )
}
