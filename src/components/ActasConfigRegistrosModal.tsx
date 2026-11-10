import { useEffect, useState } from 'react'
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog, EmptyState, Modal, Spinner } from './ui'
import { Label, TextArea, TextInput } from './fields'
import { fmtDate, toDateInputValue } from '../lib/format'
import { deleteConfirmMessage, friendlyDeleteError } from '../lib/deleteGuard'

export type ActaConfigRegistro = {
  id: string
  fecha_desde: string | null
  fecha_hasta: string | null
  nro_resolucion: string | null
  resolucion_comite: string | null
  descripcion: string | null
  created_at?: string | null
}

const emptyForm = {
  fecha_desde: '',
  fecha_hasta: '',
  nro_resolucion: '',
  resolucion_comite: '',
  descripcion: '',
}

export default function ActasConfigRegistrosModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { session } = useAuth()
  const [rows, setRows] = useState<ActaConfigRegistro[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ActaConfigRegistro | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleting, setDeleting] = useState<ActaConfigRegistro | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('actas_configuracion_registros')
      .select('id,fecha_desde,fecha_hasta,nro_resolucion,resolucion_comite,descripcion,created_at')
      .order('fecha_desde', { ascending: false })
      .limit(500)
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows((data as ActaConfigRegistro[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    setFormOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setDeleting(null)
    void load()
  }, [open])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
    setError(null)
  }

  const openEdit = (row: ActaConfigRegistro) => {
    setEditing(row)
    setForm({
      fecha_desde: toDateInputValue(row.fecha_desde) || '',
      fecha_hasta: toDateInputValue(row.fecha_hasta) || '',
      nro_resolucion: row.nro_resolucion ?? '',
      resolucion_comite: row.resolucion_comite ?? '',
      descripcion: row.descripcion ?? '',
    })
    setFormOpen(true)
    setError(null)
  }

  const save = async () => {
    if (!form.fecha_desde || !form.fecha_hasta) {
      setError('Indique fecha desde y fecha hasta.')
      return
    }
    if (form.fecha_hasta < form.fecha_desde) {
      setError('La fecha hasta debe ser mayor o igual a la fecha desde.')
      return
    }
    if (!form.nro_resolucion.trim()) {
      setError('Indique el N° de resolución.')
      return
    }
    if (!form.resolucion_comite.trim()) {
      setError('Indique la resolución de comité.')
      return
    }

    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta,
      nro_resolucion: form.nro_resolucion.trim(),
      resolucion_comite: form.resolucion_comite.trim(),
      descripcion: form.descripcion.trim() || null,
    }
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('actas_configuracion_registros')
          .update(payload)
          .eq('id', editing.id)
        if (err) throw err
      } else {
        if (session?.user?.id) payload.user_id = session.user.id
        const { error: err } = await supabase
          .from('actas_configuracion_registros')
          .insert(payload)
        if (err) throw err
      }
      setFormOpen(false)
      setEditing(null)
      setForm(emptyForm)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    const { error: err } = await supabase
      .from('actas_configuracion_registros')
      .delete()
      .eq('id', deleting.id)
    if (err) alert(friendlyDeleteError(err))
    setDeleting(null)
    await load()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title={
          <span className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand-600" />
            Configuración de registros
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Defina periodos, resoluciones y descripción para la generación de actas en PDF.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>

        {error && !formOpen && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <Spinner label="Cargando configuraciones…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin configuraciones"
            hint='Agregue la primera con el botón "Agregar".'
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-3 py-2.5">Fecha desde</th>
                  <th className="px-3 py-2.5">Fecha hasta</th>
                  <th className="px-3 py-2.5">N° resolución</th>
                  <th className="px-3 py-2.5">Resolución comité</th>
                  <th className="px-3 py-2.5">Descripción</th>
                  <th className="w-24 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">{fmtDate(row.fecha_desde)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">{fmtDate(row.fecha_hasta)}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-brand-700">{row.nro_resolucion || '—'}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {row.resolucion_comite || '—'}
                    </td>
                    <td className="max-w-xs px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                      <span className="line-clamp-2">{row.descripcion || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => openEdit(row)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => setDeleting(row)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        nested
        title={editing ? 'Editar configuración' : 'Nueva configuración de registros'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label text="Fecha desde" required />
              <TextInput
                type="date"
                value={form.fecha_desde}
                onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))}
              />
            </div>
            <div>
              <Label text="Fecha hasta" required />
              <TextInput
                type="date"
                value={form.fecha_hasta}
                onChange={e => setForm(f => ({ ...f, fecha_hasta: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label text="N° resolución" required />
            <TextInput
              value={form.nro_resolucion}
              onChange={e => setForm(f => ({ ...f, nro_resolucion: e.target.value }))}
              placeholder="Ej. 227/2026"
            />
          </div>
          <div>
            <Label text="Resolución comité" required />
            <TextInput
              value={form.resolucion_comite}
              onChange={e => setForm(f => ({ ...f, resolucion_comite: e.target.value }))}
              placeholder="Ej. 718/2025"
            />
          </div>
          <div>
            <Label text="Descripción" />
            <TextArea
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={3}
              placeholder="Detalle de la configuración…"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => { setFormOpen(false); setEditing(null) }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : editing ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({ singular: 'configuración' })}
      />
    </>
  )
}

/** Botón para abrir el modal de configuración (usar en toolbar de Actas). */
export function ActasConfigRegistrosButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Configuración de registros"
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
    >
      <Settings2 className="h-4 w-4" /> Config. registros
    </button>
  )
}
