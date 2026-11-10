import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, FileDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate, nowDateInputValue } from '../lib/format'
import { exportRendicionControlFormularioPdf } from '../lib/rendicionControlFormularioPdf'
import {
  fetchNextRendicionControlNumero,
  formatRendicionControlNumero,
  normalizeRendicionControlNumero,
  parseRendicionControlNumero,
  rendicionControlNumeroExists,
} from '../lib/rendicionControlNumero'
import { Badge, Card, ConfirmDialog, EmptyState, Modal, Spinner } from './ui'
import { deleteConfirmMessage } from '../lib/deleteGuard'

type Resultado = 'cumple' | 'no_cumple' | 'no_aplica'

type PredefItem = {
  id: string
  orden: number | null
  nombre: string | null
  descripcion: string | null
  activo: boolean | null
}

type DbRow = {
  id: string
  rendicion_id: string
  numero_formulario: string | null
  descripcion: string | null
  cumple: boolean | null
  no_cumple: boolean | null
  no_aplica: boolean | null
  observaciones: string | null
  fecha: string | null
  created_at?: string | null
}

type ItemDraft = {
  key: string
  id: string | null
  descripcion: string
  resultado: Resultado | ''
  observaciones: string
  fromPredef: boolean
}

type FormGroup = {
  numero: string
  fecha: string | null
  items: DbRow[]
  counts: { cumple: number; noCumple: number; noAplica: number; total: number }
}

function normDesc(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function predefLabel(p: PredefItem): string {
  return normDesc(p.nombre) || normDesc(p.descripcion)
}

function toDateInput(v: string | null | undefined): string {
  if (!v) return nowDateInputValue()
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return nowDateInputValue()
}

function resultadoFromRow(r: DbRow): Resultado | '' {
  if (r.cumple) return 'cumple'
  if (r.no_cumple) return 'no_cumple'
  if (r.no_aplica) return 'no_aplica'
  return ''
}

function flagsFromResultado(resultado: Resultado | '') {
  return {
    cumple: resultado === 'cumple',
    no_cumple: resultado === 'no_cumple',
    no_aplica: resultado === 'no_aplica',
  }
}

function newItemKey() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyCustomItem(): ItemDraft {
  return {
    key: newItemKey(),
    id: null,
    descripcion: '',
    resultado: 'no_aplica',
    observaciones: '',
    fromPredef: false,
  }
}

const GROUPS_PAGE_SIZE = 12
const ITEMS_PAGE_SIZE = 10

function itemsFromPredef(predefs: PredefItem[]): ItemDraft[] {
  return [...predefs]
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map(p => ({
      key: `predef-${p.id}`,
      id: null,
      descripcion: predefLabel(p),
      resultado: 'no_aplica' as const,
      observaciones: '',
      fromPredef: true,
    }))
}

/** Índice descripción/nombre → orden de configuración. */
function predefOrdenMap(predefs: PredefItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of predefs) {
    const orden = Number(p.orden)
    if (!Number.isFinite(orden)) continue
    const keys = [predefLabel(p), normDesc(p.nombre), normDesc(p.descripcion)]
      .map(k => k.toLowerCase())
      .filter(Boolean)
    for (const k of keys) {
      if (!map.has(k)) map.set(k, orden)
    }
  }
  return map
}

function sortByPredefOrden<T extends { descripcion?: string | null; created_at?: string | null }>(
  items: T[],
  predefs: PredefItem[],
): T[] {
  const idx = predefOrdenMap(predefs)
  return [...items].sort((a, b) => {
    const oa = idx.get(normDesc(a.descripcion).toLowerCase())
    const ob = idx.get(normDesc(b.descripcion).toLowerCase())
    if (oa != null && ob != null && oa !== ob) return oa - ob
    if (oa != null && ob == null) return -1
    if (oa == null && ob != null) return 1
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}

function PaginationBar({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (n: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">
        Página <span className="font-semibold text-slate-800">{page}</span> de{' '}
        <span className="font-semibold text-slate-800">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
            acc.push(p)
            return acc
          }, [])
          .map((p, idx) =>
            p === '…' ? (
              <span key={`e-${idx}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                className={`min-w-[1.75rem] rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  p === page
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ),
          )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function RendicionControlFormularioPanel({ rendicionId }: { rendicionId: string }) {
  const [rows, setRows] = useState<DbRow[]>([])
  const [predefs, setPredefs] = useState<PredefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingNumero, setEditingNumero] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(nowDateInputValue())
  const [items, setItems] = useState<ItemDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [originalIds, setOriginalIds] = useState<string[]>([])

  const [deleteNumero, setDeleteNumero] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedNumero, setExpandedNumero] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [creatingNumero, setCreatingNumero] = useState(false)
  const [groupsPage, setGroupsPage] = useState(1)
  const [itemsPage, setItemsPage] = useState(1)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [formRes, predefRes] = await Promise.all([
        supabase
          .from('rendicion_control_formularios')
          .select('id, rendicion_id, numero_formulario, descripcion, cumple, no_cumple, no_aplica, observaciones, fecha, created_at')
          .eq('rendicion_id', rendicionId)
          .order('created_at', { ascending: false }),
        supabase
          .from('rendiciones_cuentas_items_predeterminados')
          .select('id, orden, nombre, descripcion, activo')
          .eq('activo', true)
          .order('orden', { ascending: true }),
      ])
      if (formRes.error) throw formRes.error
      if (predefRes.error) throw predefRes.error
      setRows((formRes.data ?? []) as DbRow[])
      setPredefs((predefRes.data ?? []) as PredefItem[])
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar el formulario de control.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setGroupsPage(1)
    void load()
  }, [rendicionId])

  const groups = useMemo<FormGroup[]>(() => {
    const map = new Map<string, DbRow[]>()
    for (const r of rows) {
      const num = (r.numero_formulario ?? '').trim() || 'Sin número'
      if (!map.has(num)) map.set(num, [])
      map.get(num)!.push(r)
    }
    return [...map.entries()].map(([numero, items]) => {
      const fecha = items.find(i => i.fecha)?.fecha ?? null
      const counts = {
        total: items.length,
        cumple: items.filter(i => i.cumple).length,
        noCumple: items.filter(i => i.no_cumple).length,
        noAplica: items.filter(i => i.no_aplica).length,
      }
      // Orden según Configuración de Control de Rendiciones (campo orden)
      const sorted = sortByPredefOrden(items, predefs)
      return { numero, fecha, items: sorted, counts }
    }).sort((a, b) => {
      const fa = a.fecha ?? ''
      const fb = b.fecha ?? ''
      if (fa !== fb) return fb.localeCompare(fa)
      return b.numero.localeCompare(a.numero)
    })
  }, [rows, predefs])

  const groupsTotalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PAGE_SIZE))
  const groupsPageSafe = Math.min(groupsPage, groupsTotalPages)
  const pagedGroups = useMemo(
    () => groups.slice((groupsPageSafe - 1) * GROUPS_PAGE_SIZE, groupsPageSafe * GROUPS_PAGE_SIZE),
    [groups, groupsPageSafe],
  )

  const itemsTotalPages = Math.max(1, Math.ceil(items.length / ITEMS_PAGE_SIZE))
  const itemsPageSafe = Math.min(itemsPage, itemsTotalPages)
  const pagedItems = useMemo(
    () => items.slice((itemsPageSafe - 1) * ITEMS_PAGE_SIZE, itemsPageSafe * ITEMS_PAGE_SIZE),
    [items, itemsPageSafe],
  )

  useEffect(() => {
    if (groupsPage > groupsTotalPages) setGroupsPage(groupsTotalPages)
  }, [groupsPage, groupsTotalPages])

  useEffect(() => {
    if (itemsPage > itemsTotalPages) setItemsPage(itemsTotalPages)
  }, [itemsPage, itemsTotalPages])

  const openCreate = async () => {
    setEditingNumero(null)
    setFecha(nowDateInputValue())
    setItems(predefs.length ? itemsFromPredef(predefs) : [emptyCustomItem()])
    setOriginalIds([])
    setFormError(null)
    setCreatingNumero(true)
    setNumero('')
    setItemsPage(1)
    setModalOpen(true)
    try {
      const next = await fetchNextRendicionControlNumero()
      setNumero(next)
    } catch (e: any) {
      const year = new Date().getFullYear()
      let max = 0
      for (const g of groups) {
        const p = parseRendicionControlNumero(g.numero)
        if (p && p.anio === year && p.secuencia > max) max = p.secuencia
      }
      setNumero(formatRendicionControlNumero(max + 1, year))
      setFormError(e?.message ? `No se pudo leer la serie global. Se propuso ${formatRendicionControlNumero(max + 1, year)}.` : null)
    } finally {
      setCreatingNumero(false)
    }
  }

  const openEdit = (group: FormGroup) => {
    setEditingNumero(group.numero === 'Sin número' ? null : group.numero)
    setNumero(group.numero === 'Sin número' ? '' : group.numero)
    setFecha(toDateInput(group.fecha))
    setItems(
      group.items.map(r => ({
        key: r.id,
        id: r.id,
        descripcion: r.descripcion ?? '',
        resultado: resultadoFromRow(r),
        observaciones: r.observaciones ?? '',
        fromPredef: false,
      })),
    )
    setOriginalIds(group.items.map(r => r.id))
    setFormError(null)
    setItemsPage(1)
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

  const addCustomItem = () => {
    setItems(prev => [...prev, emptyCustomItem()])
    setItemsPage(Math.ceil((items.length + 1) / ITEMS_PAGE_SIZE))
  }

  const removeItem = (key: string) => {
    setItems(prev => (prev.length <= 1 ? prev : prev.filter(it => it.key !== key)))
  }

  const validate = async (): Promise<string | null> => {
    const num = normalizeRendicionControlNumero(numero) ?? numero.trim().toUpperCase()
    if (!num) return 'Ingrese el Nº de formulario.'
    if (!parseRendicionControlNumero(num)) {
      return 'El Nº de formulario debe tener el formato RC-YYYY-#### (ej. RC-2026-0007).'
    }
    if (!fecha) return 'Ingrese la fecha de control.'
    if (!items.length) return 'Agregue al menos un ítem de verificación.'
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!normDesc(it.descripcion)) return `Complete la descripción del ítem #${i + 1}.`
      if (!it.resultado) return `Seleccione el resultado del ítem #${i + 1}.`
    }
    try {
      if (await rendicionControlNumeroExists(num, editingNumero)) {
        return `Ya existe un formulario con el número ${num}. Use el siguiente correlativo global.`
      }
    } catch (e: any) {
      return e?.message ?? 'No se pudo validar el número de formulario.'
    }
    return null
  }

  const save = async () => {
    const err = await validate()
    if (err) {
      setFormError(err)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const { data: session } = await supabase.auth.getUser()
      const userId = session.user?.id ?? null
      const num = normalizeRendicionControlNumero(numero) ?? numero.trim().toUpperCase()
      const fechaVal = fecha

      const keepIds = new Set(items.filter(it => it.id).map(it => it.id!))
      const toDelete = originalIds.filter(id => !keepIds.has(id))
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from('rendicion_control_formularios')
          .delete()
          .in('id', toDelete)
        if (delErr) throw delErr
      }

      for (const it of items.filter(i => i.id)) {
        const flags = flagsFromResultado(it.resultado)
        const { error: updErr } = await supabase
          .from('rendicion_control_formularios')
          .update({
            numero_formulario: num,
            descripcion: normDesc(it.descripcion),
            ...flags,
            observaciones: it.observaciones.trim() || null,
            fecha: fechaVal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', it.id!)
        if (updErr) throw updErr
      }

      const toInsert = items.filter(i => !i.id)
      if (toInsert.length) {
        const payload = toInsert.map(it => {
          const flags = flagsFromResultado(it.resultado)
          const row: Record<string, any> = {
            rendicion_id: rendicionId,
            numero_formulario: num,
            descripcion: normDesc(it.descripcion),
            ...flags,
            observaciones: it.observaciones.trim() || null,
            fecha: fechaVal,
          }
          if (userId) row.user_id = userId
          return row
        })
        const { error: insErr } = await supabase.from('rendicion_control_formularios').insert(payload)
        if (insErr) throw insErr
      }

      if (editingNumero && editingNumero.toUpperCase() !== num) {
        const { error: renErr } = await supabase
          .from('rendicion_control_formularios')
          .update({ numero_formulario: num, fecha: fechaVal, updated_at: new Date().toISOString() })
          .eq('rendicion_id', rendicionId)
          .eq('numero_formulario', editingNumero)
        if (renErr) throw renErr
      }

      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo guardar el formulario.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteNumero) return
    setDeleting(true)
    try {
      let q = supabase
        .from('rendicion_control_formularios')
        .delete()
        .eq('rendicion_id', rendicionId)
      if (deleteNumero === 'Sin número') {
        q = q.or('numero_formulario.is.null,numero_formulario.eq.')
      } else {
        q = q.eq('numero_formulario', deleteNumero)
      }
      const { error: delErr } = await q
      if (delErr) throw delErr
      setDeleteNumero(null)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo eliminar el formulario.')
      setDeleteNumero(null)
    } finally {
      setDeleting(false)
    }
  }

  const generarPdf = async (num: string, soloSustanciales = false) => {
    if (!num || num === 'Sin número') return
    const key = `${num}:${soloSustanciales ? 'sust' : 'full'}`
    setPdfLoading(key)
    try {
      await exportRendicionControlFormularioPdf(rendicionId, num, { soloSustanciales })
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF del formulario.')
    } finally {
      setPdfLoading(null)
    }
  }

  if (loading) return <Spinner label="Cargando formularios de control…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <ClipboardList className="h-5 w-5 text-brand-600" />
            Formulario de Control
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Verificación de rendición de cuentas. Los ítems base provienen de la configuración de Sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openCreate()}
          disabled={creatingNumero}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {creatingNumero ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Formulario
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {!groups.length ? (
        <Card className="p-6">
          <EmptyState
            title="Sin formularios de control"
            hint='Cree el primero con el botón "Formulario". Los ítems predeterminados se cargarán automáticamente.'
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {pagedGroups.map(g => {
            const open = expandedNumero === g.numero
            return (
              <Card key={g.numero} className={`overflow-hidden ${open ? 'ring-1 ring-brand-200' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedNumero(cur => (cur === g.numero ? null : g.numero))}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    aria-expanded={open}
                  >
                    <span className="mt-0.5 shrink-0 text-slate-400">
                      {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="brand">{g.numero}</Badge>
                        <span className="text-sm text-slate-500">
                          Fecha: <span className="font-medium text-slate-700">{fmtDate(g.fecha)}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          {g.counts.total} ítems
                        </span>
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                          {g.counts.cumple} cumplen
                        </span>
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                          {g.counts.noCumple} no cumplen
                        </span>
                        <span className="rounded-md bg-slate-50 px-2 py-0.5 font-medium text-slate-500">
                          {g.counts.noAplica} no aplican
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Generar PDF del formulario"
                      disabled={!!pdfLoading || g.numero === 'Sin número'}
                      onClick={() => void generarPdf(g.numero, false)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pdfLoading === `${g.numero}:full`
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <FileDown className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      title="PDF solo Doc. sustanciales"
                      disabled={!!pdfLoading || g.numero === 'Sin número'}
                      onClick={() => void generarPdf(g.numero, true)}
                      className="relative rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pdfLoading === `${g.numero}:sust`
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : (
                          <>
                            <FileDown className="h-4 w-4" />
                            <span className="absolute -bottom-0.5 -right-0.5 rounded bg-brand-600 px-0.5 text-[8px] font-bold leading-none text-white">S</span>
                          </>
                        )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteNumero(g.numero)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4 pt-3">
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {g.items.map((it, idx) => {
                        const res = resultadoFromRow(it)
                        return (
                          <div
                            key={it.id}
                            className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto_1.2fr] sm:items-start"
                          >
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                #{idx + 1}
                              </p>
                              <p className="whitespace-pre-wrap text-sm leading-snug text-slate-700">
                                {normDesc(it.descripcion) || '—'}
                              </p>
                            </div>
                            <div className="sm:pt-4">
                              {res === 'cumple' && <Badge color="green">Cumple</Badge>}
                              {res === 'no_cumple' && <Badge color="red">No Cumple</Badge>}
                              {res === 'no_aplica' && <Badge color="slate">No Aplica</Badge>}
                              {!res && <Badge color="amber">Sin resultado</Badge>}
                            </div>
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
                  </div>
                )}
              </Card>
            )
          })}
          {groups.length > GROUPS_PAGE_SIZE && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
              <PaginationBar
                page={groupsPageSafe}
                totalPages={groupsTotalPages}
                onPage={setGroupsPage}
              />
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        wide
        title={editingNumero ? 'Editar Formulario de Control' : 'Nuevo Formulario de Control'}
      >
        <div className="-mx-5 -mb-4 flex max-h-[min(85vh,760px)] flex-col">
          <div className="shrink-0 space-y-4 px-5">
            <p className="-mt-1 text-sm text-slate-500">
              {editingNumero
                ? 'Modifique los datos del formulario de verificación.'
                : 'Complete los datos del nuevo formulario de verificación.'}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Nº de Formulario <span className="text-rose-500">*</span>
                <input
                  type="text"
                  value={numero}
                  onChange={e => setNumero(e.target.value.toUpperCase())}
                  placeholder="RC-2026-0007"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-400">
                  Correlativo global: RC-AÑO-(última numeración + 1)
                </span>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Fecha de Control <span className="text-rose-500">*</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Ítems de verificación
                {items.length > 0 && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                    {(itemsPageSafe - 1) * ITEMS_PAGE_SIZE + 1}–{Math.min(itemsPageSafe * ITEMS_PAGE_SIZE, items.length)} de {items.length}
                  </span>
                )}
              </h4>
              <button
                type="button"
                onClick={addCustomItem}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar Fila
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-3">
            {pagedItems.map((it, idx) => {
              const globalIdx = (itemsPageSafe - 1) * ITEMS_PAGE_SIZE + idx
              return (
              <div
                key={it.key}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Ítem {globalIdx + 1}
                    {it.fromPredef ? '' : ' · personalizado'}
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

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_0.9fr_1.1fr]">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Descripción del control <span className="text-rose-500">*</span>
                    <textarea
                      value={it.descripcion}
                      onChange={e => patchItem(it.key, { descripcion: e.target.value })}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </label>

                  <fieldset className="block">
                    <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Resultado <span className="text-rose-500">*</span>
                    </legend>
                    <div className="mt-2 space-y-2">
                      {(
                        [
                          { value: 'cumple', label: 'Cumple', color: 'text-emerald-700' },
                          { value: 'no_cumple', label: 'No Cumple', color: 'text-rose-700' },
                          { value: 'no_aplica', label: 'No Aplica', color: 'text-slate-600' },
                        ] as const
                      ).map(opt => (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                            it.resultado === opt.value
                              ? 'border-brand-300 bg-white shadow-sm'
                              : 'border-transparent bg-white/70 hover:border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`resultado-${it.key}`}
                            checked={it.resultado === opt.value}
                            onChange={() => patchItem(it.key, { resultado: opt.value })}
                            className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className={`font-medium ${opt.color}`}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Observaciones
                    <textarea
                      value={it.observaciones}
                      onChange={e => patchItem(it.key, { observaciones: e.target.value })}
                      rows={3}
                      placeholder="Detalles adicionales..."
                      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </label>
                </div>
              </div>
              )
            })}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
            {itemsTotalPages > 1 && (
              <div className="mb-3">
                <PaginationBar
                  page={itemsPageSafe}
                  totalPages={itemsTotalPages}
                  onPage={setItemsPage}
                />
              </div>
            )}
            {formError && (
              <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingNumero ? 'Guardar cambios' : 'Registrar formulario'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteNumero}
        onCancel={() => { if (!deleting) setDeleteNumero(null) }}
        onConfirm={() => void confirmDelete()}
        message={deleteConfirmMessage({
          singular: 'formulario',
          label: deleteNumero,
        })}
      />
    </div>
  )
}
