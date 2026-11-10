import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FkSelect, type FkOption } from './fields'
import {
  clearResolutionProyectosDraft,
  getResolutionProyectosDraft,
  newResolutionProyectoKey,
  setResolutionProyectosDraft,
  type ResolutionProyectoDraft,
} from '../lib/resolutionProyectosDraft'

type ProyectoOption = {
  id: string
  descripcion?: string | null
  componente?: {
    codigo?: string | null
    descripcion?: string | null
  } | null
}

type LinkRow = {
  id: string
  proyecto_id: string
  proyecto?: ProyectoOption | ProyectoOption[] | null
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function componenteNombre(p: ProyectoOption | null | undefined): string {
  const c = p?.componente
  if (!c) return ''
  const desc = String(c.descripcion ?? '').trim()
  if (desc) return desc
  return String(c.codigo ?? '').trim()
}

function proyectoLabel(p: ProyectoOption | null | undefined): string {
  if (!p) return '—'
  const nombre = (p.descripcion ?? '').trim() || 'Sin descripción'
  const comp = componenteNombre(p)
  return comp ? `${nombre} - ${comp}` : nombre
}

const PROYECTO_SELECT =
  'id, descripcion, componente:componentes_programa(codigo, descripcion)'

/** Proyectos afectados por la resolución (uno o varios). */
export default function ResolutionProyectosPanel({
  resolutionId,
  defaultProyectoId,
  onChanged,
}: {
  resolutionId?: string | null
  /** Al crear desde ficha de proyecto, preselecciona ese proyecto. */
  defaultProyectoId?: string | null
  onChanged?: () => void
}) {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [draft, setDraft] = useState<ResolutionProyectoDraft[]>(() => {
    if (resolutionId) return []
    const existing = getResolutionProyectosDraft()
    if (existing.length) return existing
    const def = String(defaultProyectoId ?? '').trim()
    if (!def) return []
    return [{ key: newResolutionProyectoKey(), proyecto_id: def }]
  })
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickId, setPickId] = useState('')
  const loadReq = useRef(0)
  const seeded = useRef(false)

  const normalizeProyecto = (raw: any): ProyectoOption => ({
    id: String(raw.id),
    descripcion: raw.descripcion,
    componente: asOne(raw.componente),
  })

  const loadProyectos = async (): Promise<ProyectoOption[]> => {
    const { data, error: err } = await supabase
      .from('proyectos')
      .select(PROYECTO_SELECT)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (err) throw err
    return ((data ?? []) as any[]).map(normalizeProyecto)
  }

  const loadLinks = async (): Promise<LinkRow[]> => {
    if (!resolutionId) return []
    const full = await supabase
      .from('resolution_proyectos')
      .select(`id, proyecto_id, proyecto:proyectos(${PROYECTO_SELECT})`)
      .eq('resolution_id', resolutionId)
      .order('created_at', { ascending: true })
    if (full.error) {
      const basic = await supabase
        .from('resolution_proyectos')
        .select('id, proyecto_id')
        .eq('resolution_id', resolutionId)
        .order('created_at', { ascending: true })
      if (basic.error) throw basic.error
      const rows = (basic.data ?? []) as LinkRow[]
      const ids = [...new Set(rows.map(r => String(r.proyecto_id)).filter(Boolean))]
      if (!ids.length) return rows
      const { data: proy } = await supabase
        .from('proyectos')
        .select(PROYECTO_SELECT)
        .in('id', ids)
      const byId = new Map((proy ?? []).map((p: any) => [String(p.id), normalizeProyecto(p)]))
      return rows.map(r => ({
        ...r,
        proyecto: byId.get(String(r.proyecto_id)) ?? null,
      }))
    }
    return ((full.data ?? []) as any[]).map(r => ({
      id: String(r.id),
      proyecto_id: String(r.proyecto_id),
      proyecto: normalizeProyecto(asOne(r.proyecto) ?? { id: r.proyecto_id }),
    }))
  }

  useEffect(() => {
    let alive = true
    const req = ++loadReq.current
    setError(null)
    setLoading(true)
    ;(async () => {
      try {
        const nextProys = await loadProyectos()
        if (!alive || req !== loadReq.current) return
        setProyectos(nextProys)
        if (resolutionId) {
          const nextLinks = await loadLinks()
          if (!alive || req !== loadReq.current) return
          setLinks(nextLinks)
        }
      } catch (err: any) {
        if (alive && req === loadReq.current) {
          setError(err?.message ?? 'No se pudieron cargar los proyectos.')
        }
      } finally {
        if (alive && req === loadReq.current) setLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionId])

  useEffect(() => {
    if (resolutionId || seeded.current) return
    const def = String(defaultProyectoId ?? '').trim()
    if (!def) return
    seeded.current = true
    setDraft(prev => {
      if (prev.some(d => d.proyecto_id === def)) return prev
      return [...prev, { key: newResolutionProyectoKey(), proyecto_id: def }]
    })
  }, [resolutionId, defaultProyectoId])

  useEffect(() => {
    if (!resolutionId) setResolutionProyectosDraft(draft)
  }, [resolutionId, draft])

  useEffect(() => () => {
    if (resolutionId) clearResolutionProyectosDraft()
  }, [resolutionId])

  const selectedIds = useMemo(() => {
    if (resolutionId) return new Set(links.map(l => String(l.proyecto_id)))
    return new Set(draft.map(d => d.proyecto_id))
  }, [resolutionId, links, draft])

  const displayRows = useMemo(() => {
    if (resolutionId) {
      return links.map(l => ({
        key: l.id,
        proyectoId: String(l.proyecto_id),
        proyecto: asOne(l.proyecto) ?? proyectos.find(p => p.id === String(l.proyecto_id)) ?? null,
        persisted: true as const,
      }))
    }
    return draft.map(d => ({
      key: d.key,
      proyectoId: d.proyecto_id,
      proyecto: proyectos.find(p => p.id === d.proyecto_id) ?? null,
      persisted: false as const,
    }))
  }, [resolutionId, links, draft, proyectos])

  const proyectoOptions: FkOption[] = useMemo(
    () => proyectos
      .filter(p => !selectedIds.has(p.id))
      .map(p => ({
        value: p.id,
        label: proyectoLabel(p),
      })),
    [proyectos, selectedIds],
  )

  const addProyecto = async () => {
    const pid = String(pickId || '').trim()
    if (!pid) {
      setError('Seleccione un proyecto.')
      return
    }
    if (selectedIds.has(pid)) {
      setError('Ese proyecto ya está vinculado.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (!resolutionId) {
        setDraft(prev => [...prev, { key: newResolutionProyectoKey(), proyecto_id: pid }])
      } else {
        const { error: err } = await supabase.from('resolution_proyectos').insert({
          resolution_id: resolutionId,
          proyecto_id: pid,
        })
        if (err) throw err
        setLinks(await loadLinks())
        onChanged?.()
      }
      setPickId('')
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo vincular el proyecto.')
    } finally {
      setBusy(false)
    }
  }

  const removeProyecto = async (key: string, proyectoId: string, persisted: boolean) => {
    if (!confirm(persisted
      ? '¿Quitar este proyecto de la resolución?'
      : '¿Quitar este proyecto del borrador?')) return
    setBusy(true)
    setError(null)
    try {
      if (!persisted || !resolutionId) {
        setDraft(prev => prev.filter(d => d.key !== key && d.proyecto_id !== proyectoId))
      } else {
        const { error: err } = await supabase.from('resolution_proyectos').delete().eq('id', key)
        if (err) throw err
        setLinks(await loadLinks())
        onChanged?.()
      }
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo quitar el proyecto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Proyectos afectados
        </h4>
        <p className="text-[11px] text-slate-400">
          Una resolución puede afectar a uno o varios proyectos.
        </p>
      </div>

      {loading && (
        <p className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">Agregar proyecto</label>
          <FkSelect
            value={pickId}
            onChange={setPickId}
            options={proyectoOptions}
            placeholder="Buscar proyecto…"
          />
        </div>
        <button
          type="button"
          disabled={!pickId || busy}
          onClick={() => void addProyecto()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>

      {!loading && displayRows.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:bg-slate-800/40">
          Sin proyectos. Agregue al menos uno.
        </p>
      )}

      {displayRows.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {displayRows.map(row => (
            <li key={row.key} className="flex items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                {proyectoLabel(row.proyecto)}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeProyecto(row.key, row.proyectoId, row.persisted)}
                className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Quitar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
