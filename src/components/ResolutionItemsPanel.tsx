import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtMoney } from '../lib/format'
import { FkSelect, type FkOption } from './fields'
import {
  clearResolutionItemsDraft,
  getResolutionItemsDraft,
  newResolutionItemKey,
  setResolutionItemsDraft,
  type ResolutionItemDraft,
} from '../lib/resolutionItemsDraft'

type OgOption = {
  id: string
  codigo?: string | null
  descripcion?: string | null
}

type ItemRow = {
  id: string
  og_id: string
  monto: number | null
  og?: OgOption | OgOption[] | null
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function ogLabel(o: OgOption | null | undefined): string {
  if (!o) return '—'
  const code = (o.codigo ?? '').trim()
  const desc = (o.descripcion ?? '').trim()
  if (code && desc) return `OG ${code} — ${desc}`
  if (code) return `OG ${code}`
  return desc || 'Sin OG'
}

/** Plan presupuestario aprobado: uno o varios ítems con OG y monto. */
export default function ResolutionItemsPanel({
  resolutionId,
  onChanged,
}: {
  resolutionId?: string | null
  onChanged?: () => void
}) {
  const [items, setItems] = useState<ItemRow[]>([])
  const [draft, setDraft] = useState<ResolutionItemDraft[]>(() =>
    (!resolutionId ? getResolutionItemsDraft() : []),
  )
  const [ogs, setOgs] = useState<OgOption[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [pickOgId, setPickOgId] = useState('')
  const [pickMonto, setPickMonto] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingPersisted, setEditingPersisted] = useState(false)
  const loadReq = useRef(0)

  const loadOgs = async (): Promise<OgOption[]> => {
    const { data, error: err } = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion')
      .order('codigo', { ascending: true })
      .limit(5000)
    if (err) throw err
    return ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      codigo: r.codigo,
      descripcion: r.descripcion,
    }))
  }

  const loadItems = async (): Promise<ItemRow[]> => {
    if (!resolutionId) return []
    const full = await supabase
      .from('resolution_items')
      .select('id, og_id, monto, og:objetos_de_gastos(id, codigo, descripcion)')
      .eq('resolution_id', resolutionId)
      .order('created_at', { ascending: true })
    if (full.error) {
      const basic = await supabase
        .from('resolution_items')
        .select('id, og_id, monto')
        .eq('resolution_id', resolutionId)
        .order('created_at', { ascending: true })
      if (basic.error) throw basic.error
      const rows = (basic.data ?? []) as ItemRow[]
      const ogIds = [...new Set(rows.map(r => String(r.og_id)).filter(Boolean))]
      if (!ogIds.length) return rows
      const { data: ogRows } = await supabase
        .from('objetos_de_gastos')
        .select('id, codigo, descripcion')
        .in('id', ogIds)
      const byId = new Map((ogRows ?? []).map((o: any) => [String(o.id), o as OgOption]))
      return rows.map(r => ({
        ...r,
        og: byId.get(String(r.og_id)) ?? null,
      }))
    }
    return ((full.data ?? []) as any[]).map(r => ({
      id: String(r.id),
      og_id: String(r.og_id),
      monto: r.monto,
      og: asOne(r.og),
    }))
  }

  useEffect(() => {
    let alive = true
    const req = ++loadReq.current
    setError(null)
    setLoading(true)
    ;(async () => {
      try {
        const nextOgs = await loadOgs()
        if (!alive || req !== loadReq.current) return
        setOgs(nextOgs)
        if (resolutionId) {
          const nextItems = await loadItems()
          if (!alive || req !== loadReq.current) return
          setItems(nextItems)
        } else if (alive && req === loadReq.current) {
          setDraft(getResolutionItemsDraft())
        }
      } catch (err: any) {
        if (alive && req === loadReq.current) {
          setError(err?.message ?? 'No se pudieron cargar los ítems / OGs.')
        }
      } finally {
        if (alive && req === loadReq.current) setLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionId])

  useEffect(() => {
    if (!resolutionId) setResolutionItemsDraft(draft)
  }, [resolutionId, draft])

  useEffect(() => () => {
    if (resolutionId) clearResolutionItemsDraft()
  }, [resolutionId])

  const displayRows = useMemo(() => {
    if (resolutionId) {
      return items.map(i => ({
        key: i.id,
        ogId: String(i.og_id),
        og: asOne(i.og) ?? ogs.find(o => o.id === String(i.og_id)) ?? null,
        monto: Number(i.monto) || 0,
        persisted: true as const,
      }))
    }
    return draft.map(d => ({
      key: d.key,
      ogId: d.og_id,
      og: ogs.find(o => o.id === d.og_id) ?? null,
      monto: d.monto,
      persisted: false as const,
    }))
  }, [resolutionId, items, draft, ogs])

  const total = displayRows.reduce((s, r) => s + (Number(r.monto) || 0), 0)

  const ogOptions: FkOption[] = useMemo(
    () => ogs.map(o => {
      const code = (o.codigo ?? '').trim()
      const desc = (o.descripcion ?? '').trim()
      return {
        value: o.id,
        label: code ? `OG ${code}` : (desc || 'Sin código'),
        sub: code && desc ? desc : undefined,
      }
    }),
    [ogs],
  )

  const resetForm = () => {
    setOpenForm(false)
    setEditingKey(null)
    setEditingPersisted(false)
    setPickOgId('')
    setPickMonto('')
  }

  const startAdd = () => {
    setEditingKey(null)
    setEditingPersisted(false)
    setPickOgId('')
    setPickMonto('')
    setOpenForm(true)
    setError(null)
  }

  const startEdit = (row: { key: string; ogId: string; monto: number; persisted: boolean }) => {
    setEditingKey(row.key)
    setEditingPersisted(row.persisted)
    setPickOgId(row.ogId)
    setPickMonto(row.monto ? String(row.monto) : '')
    setOpenForm(true)
    setError(null)
  }

  const saveItem = async () => {
    if (!pickOgId) {
      setError('Seleccione un objeto de gasto (OG).')
      return
    }
    const monto = Number(pickMonto)
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('Ingrese un monto mayor a cero.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (!resolutionId) {
        setDraft(prev => {
          if (editingKey) {
            return prev.map(d =>
              d.key === editingKey ? { ...d, og_id: pickOgId, monto } : d,
            )
          }
          return [...prev, { key: newResolutionItemKey(), og_id: pickOgId, monto }]
        })
      } else if (editingKey && editingPersisted) {
        const { error: err } = await supabase
          .from('resolution_items')
          .update({ og_id: pickOgId, monto })
          .eq('id', editingKey)
        if (err) throw err
        setItems(await loadItems())
        onChanged?.()
      } else {
        const { data: session } = await supabase.auth.getUser()
        const row: Record<string, any> = {
          resolution_id: resolutionId,
          og_id: pickOgId,
          monto,
        }
        if (session.user) row.created_by = session.user.id
        const { error: err } = await supabase.from('resolution_items').insert(row)
        if (err) throw err
        setItems(await loadItems())
        onChanged?.()
      }
      resetForm()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar el ítem.')
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (key: string, persisted: boolean) => {
    if (!confirm(persisted
      ? '¿Desea eliminar este ítem del plan? Esta acción no se puede deshacer.'
      : '¿Desea quitar este ítem del borrador?')) return
    setBusy(true)
    setError(null)
    try {
      if (!persisted || !resolutionId) {
        setDraft(prev => prev.filter(d => d.key !== key))
      } else {
        const { error: err } = await supabase.from('resolution_items').delete().eq('id', key)
        if (err) throw err
        setItems(await loadItems())
        onChanged?.()
      }
      if (editingKey === key) resetForm()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo quitar el ítem.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Plan presupuestario aprobado
          </h4>
          <p className="text-[11px] text-slate-400">
            Cada ítem requiere OG y monto. Puede cargar uno o varios.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => (openForm && !editingKey ? resetForm() : startAdd())}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {openForm && !editingKey ? 'Cerrar' : 'Agregar ítem'}
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {openForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-950/20">
          <div className="text-xs font-semibold text-brand-800 dark:text-brand-200">
            {editingKey ? 'Modificar ítem' : 'Nuevo ítem'}
          </div>
          <label className="block text-xs font-medium text-slate-600">Objeto de gasto (OG)</label>
          <FkSelect
            value={pickOgId}
            onChange={setPickOgId}
            options={ogOptions}
            placeholder="Buscar por código o descripción…"
          />
          <label className="block text-xs font-medium text-slate-600">Monto</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={pickMonto}
            onChange={e => setPickMonto(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400"
            placeholder="0"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pickOgId || busy}
              onClick={() => void saveItem()}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'Guardando…' : editingKey ? 'Guardar cambios' : 'Agregar ítem'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetForm}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!loading && displayRows.length === 0 && !openForm && (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/40">
          Sin ítems. Use <span className="font-semibold">Agregar ítem</span> para cargar OG y monto.
        </p>
      )}

      {displayRows.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {displayRows.map(row => (
              <li key={row.key} className="flex items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {ogLabel(row.og)}
                  </div>
                  <div className="text-xs tabular-nums text-slate-500">
                    {fmtMoney(row.monto)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(row)}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeItem(row.key, row.persisted)}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-700">
            <span className="font-medium text-slate-600">Total plan</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtMoney(total)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
