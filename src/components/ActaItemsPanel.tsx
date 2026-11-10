import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtMoney } from '../lib/format'
import {
  clearActaItemsDraft,
  getActaItemsDraft,
  setActaItemsDraft,
  type ActaItemDraft,
} from '../lib/actaItemsDraft'
import {
  adendaMontoSugerido,
  adendaPickValue,
  actaItemDraftKey,
  fetchUsedAdendaIds,
  formatAdendaOptionLabel,
  friendlyActaAdendaSaveError,
  isMissingAdendaColumn,
  parseActaItemPick,
  planPickValue,
} from '../lib/actaAdenda'
import { Badge } from './ui'

type PlanLine = {
  id: string
  monto?: number | null
  proveedor?: { razon_social?: string | null } | null
  objeto?: { codigo?: string | null; descripcion?: string | null } | null
}

type AdendaLine = {
  id: string
  numero_adenda?: string | null
  monto_ajuste?: number | null
  tipo_ajuste?: string | null
  estado?: string | null
  plan_financiero_id: string
  plan?: PlanLine | PlanLine[] | null
}

type ActaItemRow = {
  id: string
  plan_financiero_id: string
  monto_ejecutado?: number | null
  adenda_id?: string | null
  plan?: PlanLine | PlanLine[] | null
  adenda?: AdendaLine | AdendaLine[] | null
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function planLabel(p: PlanLine | null | undefined): string {
  if (!p) return '—'
  const og = p.objeto?.codigo ? `OG ${p.objeto.codigo}` : 'Sin OG'
  const desc = p.objeto?.descripcion ? ` — ${p.objeto.descripcion}` : ''
  const prov = p.proveedor?.razon_social ? ` · ${p.proveedor.razon_social}` : ''
  return `${og}${desc}${prov}`
}

function adendaActiva(a: { estado?: string | null }): boolean {
  const e = (a.estado ?? '').toLowerCase()
  return !e.includes('rechaz') && !e.includes('anulad')
}

const PLAN_SELECT_FULL =
  'id, monto, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo, descripcion)'
const PLAN_SELECT_MIN =
  'id, monto, objeto_de_gasto_id, objeto:objetos_de_gastos(codigo, descripcion)'

/** Detalle de ejecución del acta: alta / edición / baja de acta_items. */
export default function ActaItemsPanel({
  actaId,
  proyectoId,
  soloAprobacion = false,
  onChanged,
}: {
  actaId?: string | null
  proyectoId: string | null | undefined
  /** Si el acta es solo "Aprobación", el monto a desembolsar por ítem es 0. */
  soloAprobacion?: boolean
  onChanged?: () => void
}) {
  const [items, setItems] = useState<ActaItemRow[]>([])
  const [draft, setDraft] = useState<ActaItemDraft[]>(() => (!actaId ? getActaItemsDraft() : []))
  const [planes, setPlanes] = useState<PlanLine[]>([])
  const [adendas, setAdendas] = useState<AdendaLine[]>([])
  const [usedAdendaElsewhere, setUsedAdendaElsewhere] = useState<Set<string>>(new Set())
  const [resolvedPid, setResolvedPid] = useState<string>((proyectoId ?? '').trim())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [pickId, setPickId] = useState('')
  const [pickMonto, setPickMonto] = useState('')
  /** id de acta_items (persistido) o draftKey (borrador) */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingPersisted, setEditingPersisted] = useState(false)
  const loadReq = useRef(0)

  const pid = resolvedPid

  useEffect(() => {
    const incoming = (proyectoId ?? '').trim()
    if (incoming) {
      setResolvedPid(incoming)
      return
    }
    if (!actaId) {
      setResolvedPid('')
      return
    }
    let alive = true
    void supabase
      .from('actas')
      .select('proyecto_id')
      .eq('id', actaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setResolvedPid(data?.proyecto_id ? String(data.proyecto_id) : '')
      })
    return () => { alive = false }
  }, [proyectoId, actaId])

  const normalizePlan = (raw: any): PlanLine => ({
    id: String(raw.id),
    monto: raw.monto,
    proveedor: asOne(raw.proveedor),
    objeto: asOne(raw.objeto),
  })

  const loadPlanes = async (projectId: string): Promise<PlanLine[]> => {
    if (!projectId) return []

    const trySelect = async (select: string) =>
      supabase
        .from('planes_financieros')
        .select(select)
        .eq('proyecto_id', projectId)
        .order('id', { ascending: true })

    let res: Awaited<ReturnType<typeof trySelect>> | { data: any[] | null; error: any } = await trySelect(PLAN_SELECT_FULL)
    if (res.error) res = await trySelect(PLAN_SELECT_MIN)
    if (res.error) {
      res = await supabase
        .from('planes_financieros')
        .select('id, monto, objeto_de_gasto_id')
        .eq('proyecto_id', projectId)
        .order('id', { ascending: true })
      if (res.error) throw res.error
      const rows = (res.data ?? []) as any[]
      const ogIds = [...new Set(rows.map(r => r.objeto_de_gasto_id).filter(Boolean).map(String))]
      let ogMap = new Map<string, { codigo?: string; descripcion?: string }>()
      if (ogIds.length) {
        const { data: ogs } = await supabase
          .from('objetos_de_gastos')
          .select('id, codigo, descripcion')
          .in('id', ogIds)
        ogMap = new Map((ogs ?? []).map((o: any) => [String(o.id), o]))
      }
      return rows.map(r => ({
        id: String(r.id),
        monto: r.monto,
        objeto: r.objeto_de_gasto_id ? ogMap.get(String(r.objeto_de_gasto_id)) ?? null : null,
        proveedor: null,
      }))
    }

    return ((res.data ?? []) as any[]).map(normalizePlan)
  }

  const loadAdendas = async (projectId: string): Promise<AdendaLine[]> => {
    if (!projectId) return []
    const full = await supabase
      .from('adendas')
      .select(`
        id, numero_adenda, monto_ajuste, tipo_ajuste, estado, plan_financiero_id,
        plan:planes_financieros!inner(${PLAN_SELECT_MIN}, proyecto_id)
      `)
      .eq('plan.proyecto_id', projectId)
      .order('numero_adenda', { ascending: true })
    if (full.error) {
      const basic = await supabase
        .from('adendas')
        .select('id, numero_adenda, monto_ajuste, tipo_ajuste, estado, plan_financiero_id')
      if (basic.error) return []
      const rows = ((basic.data ?? []) as AdendaLine[]).filter(adendaActiva)
      const planIds = [...new Set(rows.map(r => String(r.plan_financiero_id)).filter(Boolean))]
      if (!planIds.length) return rows
      const { data: plansExtra } = await supabase
        .from('planes_financieros')
        .select(`${PLAN_SELECT_MIN}, proyecto_id`)
        .in('id', planIds)
        .eq('proyecto_id', projectId)
      const allowed = new Set((plansExtra ?? []).map((p: any) => String(p.id)))
      const byId = new Map((plansExtra ?? []).map((p: any) => [String(p.id), normalizePlan(p)]))
      return rows
        .filter(r => allowed.has(String(r.plan_financiero_id)))
        .map(r => ({ ...r, plan: byId.get(String(r.plan_financiero_id)) ?? null }))
    }
    return ((full.data ?? []) as any[])
      .filter(adendaActiva)
      .map(r => ({
        ...r,
        id: String(r.id),
        plan_financiero_id: String(r.plan_financiero_id),
        plan: normalizePlan(asOne(r.plan) ?? { id: r.plan_financiero_id }),
      }))
  }

  const loadItems = async (): Promise<ActaItemRow[]> => {
    if (!actaId) return []
    const full = await supabase
      .from('acta_items')
      .select(`
        id, plan_financiero_id, monto_ejecutado, adenda_id,
        adenda:adendas(id, numero_adenda, monto_ajuste, tipo_ajuste, estado),
        plan:planes_financieros(${PLAN_SELECT_MIN})
      `)
      .eq('acta_id', actaId)
      .order('id', { ascending: true })
    if (full.error) {
      const basic = await supabase
        .from('acta_items')
        .select('id, plan_financiero_id, monto_ejecutado, adenda_id')
        .eq('acta_id', actaId)
        .order('id', { ascending: true })
      const src = basic.error
        ? await supabase
            .from('acta_items')
            .select('id, plan_financiero_id, monto_ejecutado')
            .eq('acta_id', actaId)
            .order('id', { ascending: true })
        : basic
      if (src.error) {
        const bare = await supabase
          .from('acta_items')
          .select('id, plan_financiero_id')
          .eq('acta_id', actaId)
        if (bare.error) throw bare.error
        return (bare.data ?? []) as ActaItemRow[]
      }
      const rows = (src.data ?? []) as ActaItemRow[]
      const planIds = [...new Set(rows.map(r => String(r.plan_financiero_id)).filter(Boolean))]
      const adendaIds = [...new Set(rows.map(r => String(r.adenda_id ?? '')).filter(Boolean))]
      let planById = new Map<string, PlanLine>()
      if (planIds.length) {
        const { data: plansExtra } = await supabase
          .from('planes_financieros')
          .select(PLAN_SELECT_MIN)
          .in('id', planIds)
        planById = new Map((plansExtra ?? []).map((p: any) => [String(p.id), normalizePlan(p)]))
      }
      let adendaById = new Map<string, AdendaLine>()
      if (adendaIds.length) {
        const { data: adExtra } = await supabase
          .from('adendas')
          .select('id, numero_adenda, monto_ajuste, tipo_ajuste, estado, plan_financiero_id')
          .in('id', adendaIds)
        adendaById = new Map((adExtra ?? []).map((a: any) => [String(a.id), a]))
      }
      return rows.map(r => ({
        ...r,
        plan: planById.get(String(r.plan_financiero_id)) ?? null,
        adenda: r.adenda_id ? adendaById.get(String(r.adenda_id)) ?? null : null,
      }))
    }
    return ((full.data ?? []) as any[]).map(r => ({
      ...r,
      plan: normalizePlan(asOne(r.plan) ?? { id: r.plan_financiero_id }),
      adenda: asOne(r.adenda),
    }))
  }

  useEffect(() => {
    let alive = true
    const req = ++loadReq.current
    setError(null)
    setLoading(true)
    ;(async () => {
      try {
        const [nextPlanes, nextAdendas, used] = await Promise.all([
          loadPlanes(pid),
          loadAdendas(pid),
          fetchUsedAdendaIds(actaId),
        ])
        if (!alive || req !== loadReq.current) return
        setPlanes(nextPlanes)
        setAdendas(nextAdendas)
        setUsedAdendaElsewhere(used)
        if (actaId) {
          const nextItems = await loadItems()
          if (!alive || req !== loadReq.current) return
          setItems(nextItems)
        } else if (alive && req === loadReq.current) {
          setDraft(getActaItemsDraft())
        }
      } catch (err: any) {
        if (alive && req === loadReq.current) {
          setError(err?.message ?? 'No se pudieron cargar el plan financiero / ítems.')
        }
      } finally {
        if (alive && req === loadReq.current) setLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actaId, pid])

  useEffect(() => {
    if (!actaId) setActaItemsDraft(draft)
  }, [actaId, draft])

  useEffect(() => {
    if (!soloAprobacion || actaId) return
    setDraft(prev => {
      if (!prev.some(d => (Number(d.monto_ejecutado) || 0) !== 0)) return prev
      return prev.map(d => ({ ...d, monto_ejecutado: 0 }))
    })
    setPickMonto('0')
  }, [soloAprobacion, actaId])

  useEffect(() => () => {
    if (actaId) clearActaItemsDraft()
  }, [actaId])

  const usedKeys = useMemo(() => {
    if (actaId) {
      return new Set(items.map(i => actaItemDraftKey(String(i.plan_financiero_id), i.adenda_id)))
    }
    return new Set(draft.map(i => actaItemDraftKey(i.plan_financiero_id, i.adenda_id)))
  }, [actaId, items, draft])

  const displayRows = actaId
    ? items.map(i => {
        const adenda = asOne(i.adenda)
        return {
          key: i.id,
          planId: String(i.plan_financiero_id),
          adendaId: i.adenda_id ? String(i.adenda_id) : null,
          adendaNumero: adenda?.numero_adenda ? String(adenda.numero_adenda) : null,
          plan: asOne(i.plan),
          montoEjecutado: soloAprobacion ? 0 : (Number(i.monto_ejecutado) || 0),
          persisted: true as const,
        }
      })
    : draft.map(d => {
        const adenda = d.adenda_id ? adendas.find(a => a.id === d.adenda_id) ?? null : null
        return {
          key: actaItemDraftKey(d.plan_financiero_id, d.adenda_id),
          planId: d.plan_financiero_id,
          adendaId: d.adenda_id ? String(d.adenda_id) : null,
          adendaNumero: adenda?.numero_adenda ? String(adenda.numero_adenda) : null,
          plan: planes.find(p => p.id === d.plan_financiero_id) ?? asOne(adenda?.plan) ?? null,
          montoEjecutado: soloAprobacion ? 0 : d.monto_ejecutado,
          persisted: false as const,
        }
      })

  const resetForm = () => {
    setOpenForm(false)
    setEditingKey(null)
    setEditingPersisted(false)
    setPickId('')
    setPickMonto('')
  }

  const startAdd = () => {
    setEditingKey(null)
    setEditingPersisted(false)
    setPickId('')
    setPickMonto('')
    setOpenForm(true)
    setError(null)
  }

  const startEdit = (row: {
    key: string
    planId: string
    adendaId: string | null
    montoEjecutado: number
    persisted: boolean
  }) => {
    setEditingKey(row.key)
    setEditingPersisted(row.persisted)
    setPickId(row.adendaId ? adendaPickValue(row.adendaId) : planPickValue(row.planId))
    setPickMonto(row.montoEjecutado ? String(row.montoEjecutado) : '')
    setOpenForm(true)
    setError(null)
  }

  const applyPick = (value: string) => {
    setPickId(value)
    const parsed = parseActaItemPick(value)
    if (parsed?.kind === 'adenda' && !soloAprobacion) {
      const a = adendas.find(x => x.id === parsed.id)
      if (a) setPickMonto(String(adendaMontoSugerido(a) || ''))
    }
  }

  const resolvePick = (): { planId: string; adendaId: string | null } | null => {
    const parsed = parseActaItemPick(pickId)
    if (!parsed) return null
    if (parsed.kind === 'plan') return { planId: parsed.id, adendaId: null }
    const a = adendas.find(x => x.id === parsed.id)
    if (!a) return null
    return { planId: String(a.plan_financiero_id), adendaId: String(a.id) }
  }

  const editingDraftKey = editingKey && !editingPersisted ? editingKey : ''
  const editingPersistedKey = editingKey && editingPersisted
    ? (() => {
        const it = items.find(i => i.id === editingKey)
        return it ? actaItemDraftKey(String(it.plan_financiero_id), it.adenda_id) : ''
      })()
    : ''
  const currentEditKey = editingPersisted ? editingPersistedKey : editingDraftKey

  const saveItem = async () => {
    const resolved = resolvePick()
    if (!resolved) {
      setError('Seleccione un plan financiero / OG o una adenda.')
      return
    }
    if (!pid) {
      setError('Seleccione un proyecto primero.')
      return
    }
    const nextKey = actaItemDraftKey(resolved.planId, resolved.adendaId)
    if (usedKeys.has(nextKey) && nextKey !== currentEditKey) {
      setError(resolved.adendaId
        ? 'Esa adenda ya está vinculada a este acta.'
        : 'Esa línea del plan ya está vinculada a este acta.')
      return
    }
    if (resolved.adendaId && usedAdendaElsewhere.has(resolved.adendaId) && nextKey !== currentEditKey) {
      setError('Esa adenda ya está vinculada a otra acta.')
      return
    }
    setBusy(true)
    setError(null)
    const monto = soloAprobacion ? 0 : (Number(pickMonto) || 0)
    try {
      if (!actaId) {
        setDraft(prev => {
          const rest = prev.filter(d => actaItemDraftKey(d.plan_financiero_id, d.adenda_id) !== currentEditKey)
          return [...rest, {
            plan_financiero_id: resolved.planId,
            monto_ejecutado: monto,
            adenda_id: resolved.adendaId,
          }]
        })
      } else if (editingKey && editingPersisted) {
        const payload: Record<string, any> = {
          plan_financiero_id: resolved.planId,
          monto_ejecutado: monto,
          adenda_id: resolved.adendaId,
        }
        const { error: err } = await supabase.from('acta_items').update(payload).eq('id', editingKey)
        if (err) {
          const friendly = friendlyActaAdendaSaveError(err.message)
          if (friendly && !isMissingAdendaColumn(err.message)) throw new Error(friendly)
          if (/column .*monto_ejecutado/i.test(err.message) || isMissingAdendaColumn(err.message)) {
            const slim: Record<string, any> = { plan_financiero_id: resolved.planId }
            if (!isMissingAdendaColumn(err.message)) slim.adenda_id = resolved.adendaId
            if (!/column .*monto_ejecutado/i.test(err.message)) slim.monto_ejecutado = monto
            const { error: err2 } = await supabase.from('acta_items').update(slim).eq('id', editingKey)
            if (err2) throw err2
          } else {
            throw err
          }
        }
        setItems(await loadItems())
        setUsedAdendaElsewhere(await fetchUsedAdendaIds(actaId))
        onChanged?.()
      } else {
        const { data: session } = await supabase.auth.getUser()
        const row: Record<string, any> = {
          acta_id: actaId,
          plan_financiero_id: resolved.planId,
          monto_ejecutado: monto,
          adenda_id: resolved.adendaId,
        }
        if (session.user) row.user_id = session.user.id
        const { error: err } = await supabase.from('acta_items').insert(row)
        if (err) {
          const friendly = friendlyActaAdendaSaveError(err.message)
          if (friendly && !isMissingAdendaColumn(err.message)) throw new Error(friendly)
          if (isMissingAdendaColumn(err.message) && /does not exist|schema cache|Could not find/i.test(err.message)) {
            const { adenda_id: _a, ...withoutAdenda } = row
            const retry = await supabase.from('acta_items').insert(withoutAdenda)
            if (retry.error) throw retry.error
            if (resolved.adendaId) {
              setError('Ítem guardado sin vínculo a la adenda. Ejecute la migración 042_acta_items_adenda.sql en Supabase.')
            }
          } else if (/column .*monto_ejecutado/i.test(err.message)) {
            const { monto_ejecutado: _e, ...basic } = row
            const retry = await supabase.from('acta_items').insert(basic)
            if (retry.error) throw retry.error
          } else {
            throw err
          }
        }
        setItems(await loadItems())
        setUsedAdendaElsewhere(await fetchUsedAdendaIds(actaId))
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
      ? '¿Desea eliminar este ítem del acta? Esta acción no se puede deshacer.'
      : '¿Desea quitar este ítem del borrador?')) return
    setBusy(true)
    setError(null)
    try {
      if (!persisted || !actaId) {
        setDraft(prev => prev.filter(d => actaItemDraftKey(d.plan_financiero_id, d.adenda_id) !== key))
      } else {
        const { error: err } = await supabase.from('acta_items').delete().eq('id', key)
        if (err) throw err
        setItems(await loadItems())
        setUsedAdendaElsewhere(await fetchUsedAdendaIds(actaId))
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
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Detalle de ejecución del acta
          </h4>
          <p className="text-[11px] text-slate-400">
            {soloAprobacion
              ? 'Vincule líneas del plan o una adenda. En solo aprobación el monto a desembolsar es 0.'
              : 'Vincule líneas del plan financiero o una adenda, y el monto a desembolsar.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!pid || busy}
          onClick={() => (openForm && !editingKey ? resetForm() : startAdd())}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {openForm && !editingKey ? 'Cerrar' : 'Añadir / Editar ítems'}
        </button>
      </div>

      {!pid && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Seleccione un proyecto para gestionar los ítems del acta.
        </p>
      )}
      {pid && loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {openForm && pid && (
        <div className="mb-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-950/20">
          <div className="text-xs font-semibold text-brand-800 dark:text-brand-200">
            {editingKey ? 'Modificar ítem' : 'Nuevo ítem'}
          </div>
          <label className="block text-xs font-medium text-slate-600">Plan financiero / Adenda</label>
          <select
            value={pickId}
            onChange={e => applyPick(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400"
          >
            <option value="">Seleccionar…</option>
            {planes.length > 0 && (
              <optgroup label="Plan financiero (original)">
                {planes.map(p => {
                  const key = actaItemDraftKey(p.id, null)
                  const used = usedKeys.has(key) && key !== currentEditKey
                  return (
                    <option key={planPickValue(p.id)} value={planPickValue(p.id)} disabled={used}>
                      {planLabel(p)} · {fmtMoney(p.monto)}{used ? ' (ya agregada)' : ''}
                    </option>
                  )
                })}
              </optgroup>
            )}
            {adendas.length > 0 && (
              <optgroup label="Adendas (aprobación / desembolso del ajuste)">
                {adendas.map(a => {
                  const key = actaItemDraftKey(String(a.plan_financiero_id), a.id)
                  const usedHere = usedKeys.has(key) && key !== currentEditKey
                  const usedOther = usedAdendaElsewhere.has(a.id) && key !== currentEditKey
                  const used = usedHere || usedOther
                  const hint = usedHere ? ' (ya en este acta)' : usedOther ? ' (vinculada a otra acta)' : ''
                  return (
                    <option key={adendaPickValue(a.id)} value={adendaPickValue(a.id)} disabled={used}>
                      {formatAdendaOptionLabel({ ...a, plan: asOne(a.plan) })}{hint}
                    </option>
                  )
                })}
              </optgroup>
            )}
          </select>
          {!loading && planes.length === 0 && adendas.length === 0 && (
            <p className="text-xs text-amber-700">
              Este proyecto no tiene líneas en el plan financiero ni adendas.
            </p>
          )}
          {parseActaItemPick(pickId)?.kind === 'adenda' && (
            <p className="text-[11px] text-brand-800 dark:text-brand-200">
              Este ítem corresponde a la adenda (no al plan original). El PDF y el listado lo identifican.
            </p>
          )}
          <label className="block text-xs font-medium text-slate-600">
            {soloAprobacion ? 'Monto a desembolsar' : 'Monto a desembolsar / ejecutado'}
          </label>
          <input
            type="number"
            value={soloAprobacion ? '0' : pickMonto}
            onChange={e => setPickMonto(e.target.value)}
            disabled={soloAprobacion}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400 disabled:bg-slate-100 disabled:text-slate-500"
            placeholder="0"
          />
          {soloAprobacion && (
            <p className="text-[11px] text-slate-500">
              Estado «Aprobación»: el monto a desembolsar queda en 0.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pickId || busy}
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

      {!loading && displayRows.length === 0 && pid && !openForm && (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/40">
          Sin ítems. Use <span className="font-semibold">Añadir / Editar ítems</span> para vincular OGs o adendas.
        </p>
      )}

      {displayRows.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {displayRows.map(row => (
            <li key={row.key} className="flex items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <span>{planLabel(row.plan)}</span>
                  {row.adendaNumero && (
                    <Badge color="brand">Adenda {row.adendaNumero}</Badge>
                  )}
                </div>
                <div className="text-xs tabular-nums text-slate-500">
                  {row.adendaId
                    ? `Ajuste de adenda · A desembolsar: ${fmtMoney(row.montoEjecutado)}`
                    : `Plan: ${fmtMoney(row.plan?.monto)} · A desembolsar: ${fmtMoney(row.montoEjecutado)}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  title="Modificar"
                  disabled={busy}
                  onClick={() => startEdit(row)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Quitar"
                  disabled={busy}
                  onClick={() => void removeItem(row.key, row.persisted)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}
      {!actaId && displayRows.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Los ítems se guardarán al crear el acta.
        </p>
      )}
    </div>
  )
}
