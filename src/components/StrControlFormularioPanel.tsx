import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, FileDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Badge, Card, ConfirmDialog, EmptyState, Modal, Spinner } from './ui'
import { deleteConfirmMessage } from '../lib/deleteGuard'
import { exportStrControlFormularioPdf } from '../lib/strControlFormularioPdf'
import { sortStrControlByPredefOrden } from '../lib/strControlOrden'

/** Valores históricos reales en str_documento_control.si_no */
type SiNo = 'Cumple' | 'No cumple' | 'No Aplica'

type PredefItem = {
  id: string
  orden: number | null
  descripcion: string
  activo: boolean | null
}

type DbRow = {
  id: string
  str_id: string
  documento: string | null
  si_no: string | null
  observaciones: string | null
  user_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type ItemDraft = {
  key: string
  id: string | null
  documento: string
  si_no: SiNo | ''
  observaciones: string
}

const SI_NO_OPTIONS: SiNo[] = ['Cumple', 'No cumple', 'No Aplica']

function normDesc(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function parseSiNo(v: string | null | undefined): SiNo | '' {
  const s = (v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'cumple' || s === 'si' || s === 'sí') return 'Cumple'
  if (s === 'no cumple' || s === 'no_cumple' || s === 'nocumple') return 'No cumple'
  if (s === 'no aplica' || s === 'no_aplica' || s === 'noaplica' || s === 'n/a') return 'No Aplica'
  // match exact casing variants from DB
  if ((v ?? '').trim() === 'Cumple') return 'Cumple'
  if ((v ?? '').trim() === 'No cumple') return 'No cumple'
  if ((v ?? '').trim() === 'No Aplica') return 'No Aplica'
  return ''
}

function flagsFromSiNo(siNo: SiNo | '') {
  return {
    cumple: siNo === 'Cumple',
    no_cumple: siNo === 'No cumple',
    no_aplica: siNo === 'No Aplica',
  }
}

function newItemKey() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyItem(): ItemDraft {
  return {
    key: newItemKey(),
    id: null,
    documento: '',
    si_no: 'No Aplica',
    observaciones: '',
  }
}

function itemsFromPredef(predefs: PredefItem[]): ItemDraft[] {
  return predefs.map(p => ({
    key: `predef-${p.id}`,
    id: null,
    documento: normDesc(p.descripcion),
    si_no: 'No Aplica' as const,
    observaciones: '',
  }))
}

function badgeFor(siNo: SiNo | '') {
  if (siNo === 'Cumple') return <Badge color="green">Cumple</Badge>
  if (siNo === 'No cumple') return <Badge color="red">No cumple</Badge>
  if (siNo === 'No Aplica') return <Badge color="slate">No Aplica</Badge>
  return <Badge color="amber">Sin resultado</Badge>
}

export default function StrControlFormularioPanel({ strId }: { strId: string }) {
  const [rows, setRows] = useState<DbRow[]>([])
  const [predefs, setPredefs] = useState<PredefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [items, setItems] = useState<ItemDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [originalIds, setOriginalIds] = useState<string[]>([])

  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [docsRes, predefRes] = await Promise.all([
        supabase
          .from('str_documento_control')
          .select('id, str_id, documento, si_no, observaciones, user_id, created_at, updated_at')
          .eq('str_id', strId)
          .order('created_at', { ascending: true }),
        supabase
          .from('str_control_items_predefinidos')
          .select('id, orden, descripcion, activo')
          .eq('activo', true)
          .order('orden', { ascending: true }),
      ])
      if (docsRes.error) throw docsRes.error
      if (predefRes.error) throw predefRes.error
      const predefsData = (predefRes.data ?? []) as PredefItem[]
      setPredefs(predefsData)
      setRows(sortStrControlByPredefOrden((docsRes.data ?? []) as DbRow[], predefsData))
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar el control documental del STR.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [strId])

  const counts = useMemo(() => {
    let cumple = 0
    let noCumple = 0
    let noAplica = 0
    let sin = 0
    for (const r of rows) {
      const v = parseSiNo(r.si_no)
      if (v === 'Cumple') cumple += 1
      else if (v === 'No cumple') noCumple += 1
      else if (v === 'No Aplica') noAplica += 1
      else sin += 1
    }
    return { total: rows.length, cumple, noCumple, noAplica, sin }
  }, [rows])

  const openCreate = () => {
    setItems(predefs.length ? itemsFromPredef(predefs) : [emptyItem()])
    setOriginalIds([])
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = () => {
    setItems(
      rows.map(r => ({
        key: r.id,
        id: r.id,
        documento: r.documento ?? '',
        si_no: parseSiNo(r.si_no),
        observaciones: r.observaciones ?? '',
      })),
    )
    setOriginalIds(rows.map(r => r.id))
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setFormError(null)
  }

  const patchItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems(prev => prev.map(it => (it.key === key ? { ...it, ...patch } : it)))
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])

  const removeItem = (key: string) => {
    setItems(prev => (prev.length <= 1 ? prev : prev.filter(it => it.key !== key)))
  }

  const validate = (): string | null => {
    if (!items.length) return 'Agregue al menos un documento de control.'
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!normDesc(it.documento)) return `Complete el documento del ítem #${i + 1}.`
      if (!it.si_no) return `Seleccione Cumple / No cumple / No Aplica en el ítem #${i + 1}.`
    }
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const { data: session } = await supabase.auth.getUser()
      const userId = session.user?.id ?? null

      const keepIds = new Set(items.filter(it => it.id).map(it => it.id!))
      const toDelete = originalIds.filter(id => !keepIds.has(id))
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from('str_documento_control')
          .delete()
          .in('id', toDelete)
        if (delErr) throw delErr
      }

      for (const it of items.filter(i => i.id)) {
        const flags = flagsFromSiNo(it.si_no)
        const { error: updErr } = await supabase
          .from('str_documento_control')
          .update({
            documento: normDesc(it.documento),
            si_no: it.si_no,
            observaciones: it.observaciones.trim() || '',
            ...flags,
            updated_at: new Date().toISOString(),
          })
          .eq('id', it.id!)
        if (updErr) throw updErr
      }

      const toInsert = items.filter(i => !i.id)
      if (toInsert.length) {
        const payload = toInsert.map(it => {
          const flags = flagsFromSiNo(it.si_no)
          const row: Record<string, any> = {
            str_id: strId,
            documento: normDesc(it.documento),
            si_no: it.si_no,
            observaciones: it.observaciones.trim() || '',
            ...flags,
          }
          if (userId) row.user_id = userId
          return row
        })
        const { error: insErr } = await supabase.from('str_documento_control').insert(payload)
        if (insErr) throw insErr
      }

      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo guardar el control documental.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const { error: delErr } = await supabase
        .from('str_documento_control')
        .delete()
        .eq('str_id', strId)
      if (delErr) throw delErr
      setConfirmDeleteAll(false)
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo eliminar el control documental.')
    } finally {
      setDeleting(false)
    }
  }

  const generarPdf = async () => {
    if (!rows.length) return
    setPdfLoading(true)
    try {
      await exportStrControlFormularioPdf(strId)
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Cargando control documental…" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <ClipboardList className="h-5 w-5 text-brand-600" />
            Control documental
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Checklist de documentos del STR (Cumple / No cumple / No Aplica).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <>
              <button
                type="button"
                title="Generar PDF"
                disabled={pdfLoading}
                onClick={() => void generarPdf()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
              >
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                PDF
              </button>
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            </>
          )}
          {!rows.length && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Cargar checklist
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {!rows.length ? (
        <Card className="p-6">
          <EmptyState
            title="Sin control documental"
            hint='Cargue el checklist con el botón "Cargar checklist". Se usarán los ítems predefinidos de configuración.'
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 text-xs">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              {counts.total} documentos
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              {counts.cumple} cumplen
            </span>
            <span className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
              {counts.noCumple} no cumplen
            </span>
            <span className="rounded-md bg-slate-50 px-2 py-0.5 font-medium text-slate-500">
              {counts.noAplica} no aplican
            </span>
            {counts.sin > 0 && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                {counts.sin} sin resultado
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((it, idx) => {
              const res = parseSiNo(it.si_no)
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-1 gap-2 px-4 py-2.5 sm:grid-cols-[1fr_auto_1.2fr] sm:items-start"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      #{idx + 1}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-snug text-slate-700">
                      {normDesc(it.documento) || '—'}
                    </p>
                  </div>
                  <div className="sm:pt-4">{badgeFor(res)}</div>
                  <div className="min-w-0 sm:pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Observaciones
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">
                      {(it.observaciones ?? '').trim() || '—'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        wide
        title={rows.length ? 'Editar control documental' : 'Cargar control documental'}
      >
        <div className="-mx-5 -mb-4 flex max-h-[min(85vh,760px)] flex-col">
          <div className="shrink-0 space-y-2 px-5">
            <p className="-mt-1 text-sm text-slate-500">
              Marque cada documento como Cumple, No cumple o No Aplica. Los ítems se guardan en{' '}
              <span className="font-mono text-xs">str_documento_control</span>.
            </p>
            {formError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-2">
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.key} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Ítem #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      disabled={items.length <= 1}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      title="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-slate-600">Documento</label>
                  <textarea
                    value={it.documento}
                    onChange={e => patchItem(it.key, { documento: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Resultado</label>
                      <select
                        value={it.si_no}
                        onChange={e => patchItem(it.key, { si_no: e.target.value as SiNo })}
                        className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                      >
                        <option value="">Seleccione…</option>
                        {SI_NO_OPTIONS.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Observaciones</label>
                      <input
                        type="text"
                        value={it.observaciones}
                        onChange={e => patchItem(it.key, { observaciones: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar documento
            </button>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteAll}
        onCancel={() => { if (!deleting) setConfirmDeleteAll(false) }}
        onConfirm={() => void confirmDelete()}
        title="Eliminar control documental"
        message={deleteConfirmMessage({ singular: 'control documental', label: 'de este STR' })}
      />
    </div>
  )
}
