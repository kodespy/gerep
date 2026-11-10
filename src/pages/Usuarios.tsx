import { useState } from 'react'
import { Navigate } from 'react-router'
import { Dices, Plus } from 'lucide-react'
import CrudModule from '../components/CrudModule'
import UsuarioModulosPanel from '../components/UsuarioModulosPanel'
import { Badge, Modal } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { createUsuario } from '../lib/createUsuario'
import { generatePassword, PASSWORD_RULES_HINT, validatePassword } from '../lib/generatePassword'
import { canManageUsuarios } from '../lib/roles'
import { fmtDate } from '../lib/format'

const ROLE_OPTIONS = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'desarrollador', label: 'Desarrollador' },
]

function roleBadge(role: string | null | undefined) {
  const r = (role ?? 'usuario').toLowerCase()
  if (r === 'administrador') return <Badge color="brand">{r}</Badge>
  if (r === 'desarrollador') return <Badge color="blue">{r}</Badge>
  return <Badge color="slate">{r}</Badge>
}

export default function Usuarios() {
  const { profile } = useAuth()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [listKey, setListKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'usuario',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!canManageUsuarios(profile?.role)) return <Navigate to="/" replace />

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', role: 'usuario', phone: '' })
    setFormError(null)
    setCreating(true)
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const pwdErr = validatePassword(form.password)
    if (pwdErr) {
      setFormError(pwdErr)
      return
    }
    setSaving(true)
    const result = await createUsuario({
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      phone: form.phone || null,
    })
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setCreating(false)
    setListKey(k => k + 1)
  }

  return (
    <>
      <CrudModule
        key={listKey}
        table="profiles"
        title="Usuarios"
        singular="Usuario"
        subtitle="Cuentas del sistema: rol global, módulos permitidos y bloqueo de acceso"
        select="id, name, email, role, phone, address, is_blocked, created_at, updated_at"
        orderBy={{ column: 'name', ascending: true }}
        limit={5000}
        userIdField={null}
        canCreate={false}
        canDelete={false}
        emptyHint="No hay usuarios. Use el botón Usuario para crear el primero."
        expandedRowId={expandedId}
        onRowClick={row => setExpandedId(cur => (cur === row.id ? null : String(row.id)))}
        toolbarExtra={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Usuario
          </button>
        }
        renderRowDetail={row => (
          <UsuarioModulosPanel
            userId={String(row.id)}
            userName={row.name || row.email || undefined}
          />
        )}
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'email', label: 'Correo' },
          {
            key: 'role',
            label: 'Rol global',
            render: r => roleBadge(r.role),
          },
          { key: 'phone', label: 'Teléfono' },
          {
            key: 'is_blocked',
            label: 'Estado',
            render: r => (
              <Badge color={r.is_blocked ? 'red' : 'green'}>
                {r.is_blocked ? 'Bloqueado' : 'Activo'}
              </Badge>
            ),
          },
          {
            key: 'created_at',
            label: 'Alta',
            render: r => fmtDate(r.created_at),
          },
        ]}
        fields={[
          { name: 'name', label: 'Nombre', type: 'text', required: true },
          { name: 'email', label: 'Correo', type: 'text', required: true },
          {
            name: 'role',
            label: 'Rol global',
            type: 'select',
            required: true,
            options: ROLE_OPTIONS,
            defaultValue: 'usuario',
          },
          { name: 'phone', label: 'Teléfono', type: 'text' },
          { name: 'address', label: 'Dirección', type: 'textarea', colSpan2: true },
          {
            name: 'is_blocked',
            label: 'Usuario bloqueado',
            type: 'boolean',
            defaultValue: false,
          },
        ]}
      />

      <Modal open={creating} onClose={() => !saving && setCreating(false)} title="Nuevo · Usuario">
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-slate-700">Contraseña temporal</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, password: generatePassword(12) }))}
                className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                <Dices className="h-3 w-3" />
                Generar
              </button>
            </div>
            <input
              type="text"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-1 text-xs text-slate-400">{PASSWORD_RULES_HINT}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Rol global</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
