import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Clock, FileText, Pencil, Plus, Ban, Trash2,
} from 'lucide-react'
import CdpPdfDownloadButton from './CdpPdfDownloadButton'
import CdpsListPdfButton from './CdpsListPdfButton'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fmtMoney } from '../lib/format'
import { proyectoConComponenteLabel } from '../lib/proyectoLabel'
import { cdpCompAnterior, cdpEstaAnulado, cdpInsertPayload, cdpMontoVigente } from '../lib/cdpUtils'
import { fetchCdpsForPlanAdmin, withPlanAdminCdpLink } from '../lib/planAdminCdp'
import { Badge, ConfirmDialog, Modal, Spinner } from './ui'
import { deleteConfirmMessage, friendlyDeleteError, safeDeleteById } from '../lib/deleteGuard'
import { RecordForm } from './CrudModule'
import CdpCreateForm from './CdpCreateForm'
import { cdpConfig } from '../config/modules'

const PAGE_SIZE = 10

interface PlanAdminCdpPanelProps {
  planId: string
  planLabel?: string
  reloadKey?: string | number
  onMutated?: () => void
}

export default function PlanAdminCdpPanel({ planId, planLabel, reloadKey = 0, onMutated }: PlanAdminCdpPanelProps) {
  const cfg = useMemo(() => cdpConfig(), [])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)
  const [anulando, setAnulando] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await fetchCdpsForPlanAdmin(planId)
    if (error) {
      console.error('[CDP plan admin]', error)
      setLoadError(error)
      setRows([])
    } else {
      setRows(data)
    }
    setLoading(false)
  }, [planId])

  useEffect(() => { load() }, [load, reloadKey])
  useEffect(() => { setPage(1) }, [planId, rows.length])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageRows = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const save = async (values: Record<string, any>, existing?: any) => {
    if (existing) {
      const payload = withPlanAdminCdpLink(planId, values)
      const { error } = await supabase.from('budget_commitments').update(payload).eq('id', existing.id)
      if (error) throw error
      setEditing(null)
    } else {
      const payload = cdpInsertPayload(withPlanAdminCdpLink(planId, values))
      const { data: u } = await supabase.auth.getUser()
      if (u.user) payload.user_id = u.user.id
      const { error } = await supabase.from('budget_commitments').insert(payload)
      if (error) throw error
      setCreating(false)
    }
    await load()
    onMutated?.()
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById('budget_commitments', String(deleting.id))
      setDeleting(null)
      await load()
      onMutated?.()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar el CDP.')
      setDeleting(null)
    }
  }

  const doAnular = async () => {
    if (!anulando) return
    const { error } = await supabase.from('budget_commitments').update({
      estado: 'anulado',
      tipo_movimiento: 'Anulación',
    }).eq('id', anulando.id)
    if (error) alert('No se pudo anular: ' + error.message)
    setAnulando(null)
    await load()
    onMutated?.()
  }

  const comprometido = rows.reduce((s, r) => s + cdpMontoVigente(r), 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="h-4 w-4 text-brand-600" />
          CDP vinculados
          <span className="font-normal text-slate-400">
            · {rows.length} registro{rows.length === 1 ? '' : 's'} · {fmtMoney(comprometido)} comprometido
          </span>
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <CdpsListPdfButton
            rows={rows}
            subtitle={planLabel}
            filename="Listado_CDP"
          />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo CDP
          </button>
        </div>
      </div>

      {loadError && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudieron cargar los CDP: {loadError}
        </p>
      )}

      {loading ? (
        <Spinner label="Cargando CDP…" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          Sin CDP para este plan. Use <b>Comprometer</b> o <b>Nuevo CDP</b>.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="data-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-slate-600">
                  <th className="px-3 py-2">CDP #</th>
                  <th className="px-3 py-2">Fecha CDP</th>
                  <th className="px-3 py-2">Proyecto</th>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2 text-right">Comp. ant.</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="w-36 px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const anulado = cdpEstaAnulado(row)
                  return (
                    <tr key={row.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2"><Badge color="brand">{row.cdp_numero ?? 's/n'}</Badge></td>
                      <td className="px-3 py-2 text-slate-600">{fmtDateTime(row.cdp_date)}</td>
                      <td className="px-3 py-2 text-slate-600">{proyectoConComponenteLabel(row.proyecto)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.usuario?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMoney(cdpCompAnterior(row, rows))}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${anulado ? 'text-slate-400 line-through' : 'text-brand-700'}`}>
                        {fmtMoney(row.monto_comprometido)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <CdpPdfDownloadButton cdpId={row.id} />
                          <button type="button" title="Modificar" onClick={() => setEditing(row)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" title="Ver detalle" onClick={() => setEditing(row)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <FileText className="h-4 w-4" />
                          </button>
                          {!anulado && (
                            <button type="button" title="Anular" onClick={() => setAnulando(row)}
                              className="rounded-md p-1.5 text-amber-500 hover:bg-amber-50 hover:text-amber-600">
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                          <button type="button" title="Eliminar" onClick={() => setDeleting(row)}
                            className="rounded-md p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(p => p - 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-white">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>Pg {pageSafe}/{totalPages}</span>
              <button type="button" disabled={pageSafe >= totalPages} onClick={() => setPage(p => p + 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-white">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo · CDP">
        {creating && (
          <CdpCreateForm key="create" fields={cfg.fields} formExtra={cfg.formExtra?.({ rows })}
            onCancel={() => setCreating(false)} onSubmit={v => save(v)} submitLabel="Crear" />
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar · CDP">
        {editing && (
          <RecordForm key={editing.id} fields={cfg.fields} initial={editing}
            formExtra={cfg.formExtra?.({ rows, initial: editing })}
            onCancel={() => setEditing(null)} onSubmit={v => save(v, editing)} />
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} onCancel={() => setDeleting(null)} onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({ singular: 'CDP', label: deleting?.cdp_numero })} />
      <ConfirmDialog open={!!anulando} onCancel={() => setAnulando(null)} onConfirm={doAnular}
        message={`¿Anular el CDP ${anulando?.cdp_numero ?? ''}?`} />
    </div>
  )
}
