import { useState } from 'react'
import { FolderKanban } from 'lucide-react'
import CrudModule from '../../components/CrudModule'
import ProveedorProyectosModal from '../../components/ProveedorProyectosModal'
import type { ProveedorRef } from '../../lib/proveedorProyectos'
import { Badge } from '../../components/ui'
import { jsonTextListTexts } from '../../components/fields'
import { Navigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { canAccessRrhh } from '../../lib/roles'
import { supabase } from '../../lib/supabase'

function formatMaybe(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const k of ['nombre_completo', 'nombre', 'descripcion', 'text', 'label']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return o[k] as string
    }
    try { return JSON.stringify(value) } catch { return '—' }
  }
  return String(value)
}

export function Entidades() {
  return (
    <CrudModule
      table="entidades"
      title="Entidades"
      singular="Entidad"
      subtitle="Instituciones y organizaciones que remiten expedientes"
      orderBy={{ column: 'razon_social', ascending: true }}
      columns={[
        { key: 'razon_social', label: 'Razón social' },
        { key: 'ruc', label: 'RUC' },
        { key: 'correo', label: 'Correo' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'direccion', label: 'Dirección' },
      ]}
      fields={[
        { name: 'razon_social', label: 'Razón social', type: 'text', required: true },
        { name: 'ruc', label: 'RUC', type: 'text' },
        { name: 'correo', label: 'Correo', type: 'text' },
        { name: 'telefono', label: 'Teléfono', type: 'text' },
        { name: 'direccion', label: 'Dirección', type: 'text', colSpan2: true },
      ]}
    />
  )
}

export function Proveedores() {
  const [proyectosDe, setProyectosDe] = useState<ProveedorRef | null>(null)

  return (
    <>
    <CrudModule
      table="proveedores"
      title="Proveedores"
      singular="Proveedor"
      subtitle="Proveedores y beneficiarios de los planes financieros"
      orderBy={{ column: 'razon_social', ascending: true }}
      rowActions={row => (
        <button
          type="button"
          title="Proyectos vinculados"
          aria-label={`Proyectos vinculados de ${row.razon_social ?? 'proveedor'}`}
          onClick={() => setProyectosDe({ id: String(row.id), razon_social: row.razon_social, documento: row.documento })}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-studio-violet"
        >
          <FolderKanban className="h-4 w-4" />
        </button>
      )}
      columns={[
        { key: 'razon_social', label: 'Razón social' },
        { key: 'documento', label: 'RUC / Documento' },
        { key: 'correo', label: 'Correo' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'direccion', label: 'Dirección' },
      ]}
      fields={[
        {
          name: 'documento',
          label: 'RUC / Documento',
          type: 'text',
          required: true,
          placeholder: 'Ej. 80097255',
          turucLookup: {
            rucField: 'documento',
            razonSocialField: 'razon_social',
          },
        },
        { name: 'razon_social', label: 'Razón social', type: 'text', required: true },
        { name: 'correo', label: 'Correo', type: 'text' },
        { name: 'telefono', label: 'Teléfono', type: 'text' },
        { name: 'direccion', label: 'Dirección', type: 'text', colSpan2: true },
      ]}
    />
    <ProveedorProyectosModal proveedor={proyectosDe} onClose={() => setProyectosDe(null)} />
    </>
  )
}

export function Fuentes() {
  return (
    <CrudModule
      table="fuentes_financiamiento"
      title="Fuentes de financiamiento"
      singular="Fuente"
      subtitle="FF 10, 20, 30… y sus detalles"
      orderBy={{ column: 'descripcion', ascending: true }}
      columns={[
        { key: 'descripcion', label: 'Descripción', render: r => <Badge color="brand">{r.descripcion}</Badge> },
        { key: 'detalle', label: 'Detalle' },
      ]}
      fields={[
        { name: 'descripcion', label: 'Descripción (ej.: FF 10)', type: 'text', required: true },
        { name: 'detalle', label: 'Detalle', type: 'textarea' },
      ]}
    />
  )
}

export function Areas() {
  const { profile } = useAuth()
  if (!canAccessRrhh(profile?.role)) return <Navigate to="/" replace />

  return (
    <CrudModule
      table="areas"
      title="Áreas"
      singular="Área"
      subtitle="Unidades organizativas de la UEP"
      select="*, responsable:funcionarios!areas_responsable_id_fkey(id,nombre_completo,correo,cargo)"
      orderBy={{ column: 'nombre', ascending: true }}
      emptyHint='Cree el primer registro con el botón "Área".'
      columns={[
        { key: 'nombre', label: 'Nombre', render: r => <Badge color="brand">{formatMaybe(r.nombre)}</Badge> },
        {
          key: 'is_external',
          label: 'Tipo',
          render: r => (
            <Badge color={r.is_external ? 'amber' : 'blue'}>
              {r.is_external ? 'Externa' : 'Interna'}
            </Badge>
          ),
        },
        {
          key: 'area_padre_id',
          label: 'Depende de',
          sortable: false,
          render: (r, ctx) => {
            if (r.area_padre_id == null || r.area_padre_id === '') return 'Sin dependencia'
            const padre = (ctx?.allRows ?? ctx?.rows ?? []).find((a: any) => String(a.id) === String(r.area_padre_id))
            if (!padre) return 'Sin dependencia'
            const resp = Array.isArray(padre.responsable) ? padre.responsable[0] : padre.responsable
            const nombreResp = (resp?.nombre_completo || resp?.correo || '').trim()
            const nombreArea = (padre.nombre || '').trim()
            if (nombreResp && nombreArea) return `${nombreResp} - ${nombreArea}`
            if (nombreArea) return nombreArea
            if (nombreResp) return nombreResp
            return 'Sin dependencia'
          },
        },
        {
          key: 'descripcion',
          label: 'Funciones',
          sortable: false,
          render: r => {
            const texts = jsonTextListTexts(r.descripcion)
            if (!texts.length) return '—'
            return (
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-700">
                {texts.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
              </ul>
            )
          },
        },
        {
          key: 'responsable',
          label: 'Responsable',
          sortable: false,
          render: r => {
            const resp = Array.isArray(r.responsable) ? r.responsable[0] : r.responsable
            if (!resp) return '—'
            const nombre = formatMaybe(resp.nombre_completo || resp.correo)
            const cargo = typeof resp.cargo === 'string' ? resp.cargo.trim() : ''
            return cargo ? `${nombre} · ${cargo}` : nombre
          },
        },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        {
          name: 'is_external',
          label: 'Tipo de área',
          type: 'select',
          required: true,
          defaultValue: 'false',
          options: [
            { value: 'false', label: 'Interna' },
            { value: 'true', label: 'Externa' },
          ],
        },
        {
          name: 'area_padre_id',
          label: 'Depende de (área padre)',
          type: 'fk',
          fk: {
            table: 'areas',
            select: 'id,nombre,is_external, responsable:funcionarios!areas_responsable_id_fkey(id,nombre_completo,correo)',
            label: r => {
              const resp = Array.isArray(r.responsable) ? r.responsable[0] : r.responsable
              const nombreResp = (resp?.nombre_completo || resp?.correo || '').trim()
              const nombreArea = (r.nombre || '').trim() || 'Área'
              return nombreResp ? `${nombreResp} - ${nombreArea}` : nombreArea
            },
            sub: r => (r.is_external ? 'Externa' : 'Interna'),
            orderBy: 'nombre',
          },
        },
        {
          name: 'descripcion',
          label: 'Funciones',
          type: 'json_text_list',
          colSpan2: true,
          placeholder: 'Nueva función…',
        },
        {
          name: 'responsable_id',
          label: 'Responsable',
          type: 'fk',
          fk: {
            table: 'funcionarios',
            select: 'id,nombre_completo,correo,cargo',
            label: r => r.nombre_completo || r.correo || 'Funcionario',
            sub: r => [r.cargo, r.correo].filter(Boolean).join(' · '),
            orderBy: 'nombre_completo',
          },
        },
      ]}
    />
  )
}

export function Funcionarios() {
  const { profile } = useAuth()
  if (!canAccessRrhh(profile?.role)) return <Navigate to="/" replace />

  return (
    <CrudModule
      table="funcionarios"
      title="Funcionarios"
      singular="Funcionario"
      subtitle="Personal vinculado a las áreas de la UEP. Asocie un Usuario del sistema para Recepcionar/Derivar con su cuenta."
      select="*, area:areas!area_id(id,nombre)"
      orderBy={{ column: 'nombre_completo', ascending: true }}
      userIdField={null}
      emptyHint='Cree el primer registro con el botón "Funcionario".'
      transformRows={async (rows) => {
        const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[]
        if (!userIds.length) return rows.map(r => ({ ...r, usuario: null }))
        const { data: perfiles } = await supabase
          .from('profiles')
          .select('id,name,email')
          .in('id', userIds)
        const byId = Object.fromEntries((perfiles ?? []).map(p => [p.id, p]))
        return rows.map(r => ({
          ...r,
          usuario: r.user_id ? byId[r.user_id] ?? null : null,
        }))
      }}
      columns={[
        { key: 'nombre_completo', label: 'Nombre' },
        { key: 'numero_documento', label: 'Documento' },
        { key: 'correo', label: 'Correo' },
        { key: 'cargo', label: 'Cargo' },
        {
          key: 'area.nombre',
          label: 'Área',
          sortKey: 'area.nombre',
          render: (r: any) => r.area?.nombre || '—',
        },
        {
          key: 'usuario.email',
          label: 'Usuario sistema',
          sortKey: 'usuario.email',
          render: (r: any) => {
            const u = r.usuario
            if (!u) return <span className="text-slate-400">Sin asociar</span>
            const label = (u.name || u.email || '—').trim()
            return (
              <span className="text-sm text-slate-700" title={u.email || undefined}>
                {label}
                {u.email && u.name ? (
                  <span className="mt-0.5 block text-[11px] text-slate-400">{u.email}</span>
                ) : null}
              </span>
            )
          },
        },
        { key: 'direccion', label: 'Dirección' },
      ]}
      fields={[
        { name: 'nombre_completo', label: 'Nombre completo', type: 'text', required: true },
        { name: 'numero_documento', label: 'N° de documento', type: 'text' },
        { name: 'correo', label: 'Correo', type: 'text' },
        { name: 'cargo', label: 'Cargo', type: 'text' },
        { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
        {
          name: 'area_id',
          label: 'Área',
          type: 'fk',
          fk: {
            table: 'areas',
            select: 'id,nombre,descripcion',
            label: r => r.nombre,
            sub: r => r.descripcion ?? '',
            orderBy: 'nombre',
          },
        },
        {
          name: 'user_id',
          label: 'Usuario del sistema',
          type: 'fk',
          fk: {
            table: 'profiles',
            select: 'id,name,email,role',
            label: r => (r.name || r.email || r.id),
            sub: r => [r.email, r.role].filter(Boolean).join(' · '),
            orderBy: 'name',
          },
        },
        { name: 'direccion', label: 'Dirección', type: 'text', colSpan2: true },
      ]}
    />
  )
}

export { ObjetosGasto } from './ObjetosGasto'
