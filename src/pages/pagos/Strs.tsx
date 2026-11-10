import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDown, Loader2, PieChart, X } from 'lucide-react'
import CrudModule, { type CrudConfig } from '../../components/CrudModule'
import { strsConfig } from '../../config/modules'
import { exportStrsListPdf } from '../../lib/strsListPdf'
import { exportResumenPagosSaldosFromStrRows } from '../../lib/resumenPagosSaldosPdf'
import { displayOgPrincipal, indexOgs, ogCodigo, type OgLite } from '../../lib/ogTransferencia'
import { supabase } from '../../lib/supabase'

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function optLabel(codigo?: string | null, descripcion?: string | null): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `${c} — ${d}`
  return c || d || '—'
}

const selectCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400'

function strOgPrincipal(row: any, catalog: Map<string, OgLite>): OgLite | null {
  const fromJoin = displayOgPrincipal(nest(row.og), catalog)
  if (fromJoin) return fromJoin
  const id = String(row.og_id ?? '').trim()
  if (!id) return null
  return displayOgPrincipal(catalog.get(id) ?? catalog.get(`codigo:${id}`) ?? { id }, catalog)
}

export default function Strs() {
  const [fActividad, setFActividad] = useState('')
  const [fPrograma, setFPrograma] = useState('')
  const [fComponente, setFComponente] = useState('')
  const [fOgPrincipal, setFOgPrincipal] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [resumenLoading, setResumenLoading] = useState(false)
  const [ogCatalog, setOgCatalog] = useState<Map<string, OgLite>>(() => new Map())

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('objetos_de_gastos')
        .select('id, codigo, descripcion, og_principal_id')
        .limit(5000)
      if (error) {
        console.error('[strs og principal]', error.message)
        return
      }
      setOgCatalog(indexOgs((data ?? []) as OgLite[]))
    })()
  }, [])

  const filterResetKey = `${fActividad}|${fPrograma}|${fComponente}|${fOgPrincipal}|${desde}|${hasta}`

  const clientFilter = useCallback((r: any) => {
    const proy = nest(r.proyecto)
    const comp = nest(proy?.componente)
    const prog = nest(comp?.programa)
    const act = nest(comp?.actividad)
    if (fActividad && String(act?.id ?? '') !== fActividad) return false
    if (fPrograma && String(prog?.id ?? '') !== fPrograma) return false
    if (fComponente && String(comp?.id ?? '') !== fComponente) return false
    if (fOgPrincipal) {
      const codigo = ogCodigo(strOgPrincipal(r, ogCatalog))
      if (codigo !== fOgPrincipal) return false
    }
    const fecha = String(r.fecha ?? '').slice(0, 10)
    if (desde && (!fecha || fecha < desde)) return false
    if (hasta && (!fecha || fecha > hasta)) return false
    return true
  }, [fActividad, fPrograma, fComponente, fOgPrincipal, desde, hasta, ogCatalog])

  const clearFilters = () => {
    setFActividad('')
    setFPrograma('')
    setFComponente('')
    setFOgPrincipal('')
    setDesde('')
    setHasta('')
  }

  const hasFilters = Boolean(fActividad || fPrograma || fComponente || fOgPrincipal || desde || hasta)

  const cfg: CrudConfig = useMemo(() => {
    const base = strsConfig()
    return {
      ...base,
      // Con rango de fechas: filtrar en servidor por fecha STR para no truncar el total
      orderBy: (desde || hasta) ? { column: 'fecha', ascending: false } : base.orderBy,
      applyQuery: (q: any) => {
        let next = q
        if (desde) next = next.gte('fecha', desde)
        if (hasta) next = next.lte('fecha', hasta)
        return next
      },
      queryKey: `${desde}|${hasta}`,
      clientFilter,
      filterResetKey,
      filtersExtra: ({ rows }) => {
        const actividades = new Map<string, string>()
        const programas = new Map<string, { label: string; actividadIds: Set<string> }>()
        const componentes = new Map<string, { label: string; programaId: string; actividadId: string }>()
        const ogPrincipales = new Map<string, string>()

        for (const r of rows) {
          const proy = nest(r.proyecto)
          const comp = nest(proy?.componente)
          const prog = nest(comp?.programa)
          const act = nest(comp?.actividad)
          const actId = String(act?.id ?? '')
          const progId = String(prog?.id ?? '')
          if (act?.id) actividades.set(actId, optLabel(act.codigo, act.descripcion))
          if (prog?.id) {
            const prev = programas.get(progId)
            if (prev) {
              if (actId) prev.actividadIds.add(actId)
            } else {
              programas.set(progId, {
                label: optLabel(prog.codigo, prog.descripcion),
                actividadIds: new Set(actId ? [actId] : []),
              })
            }
          }
          if (comp?.id) {
            componentes.set(String(comp.id), {
              label: optLabel(comp.codigo, comp.descripcion),
              programaId: progId,
              actividadId: actId,
            })
          }
          const principal = strOgPrincipal(r, ogCatalog)
          const codigo = ogCodigo(principal)
          if (codigo) ogPrincipales.set(codigo, optLabel(principal?.codigo, principal?.descripcion))
        }

        const actividadOpts = [...actividades.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
        const programaOpts = [...programas.entries()]
          .filter(([, v]) => !fActividad || v.actividadIds.has(fActividad))
          .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
        const componenteOpts = [...componentes.entries()]
          .filter(([, v]) => {
            if (fActividad && v.actividadId !== fActividad) return false
            if (fPrograma && v.programaId !== fPrograma) return false
            return true
          })
          .sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
        const ogPrincipalOpts = [...ogPrincipales.entries()]
          .sort((a, b) => a[1].localeCompare(b[1], 'es', { numeric: true }))

        return (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Actividad
              <select
                value={fActividad}
                onChange={e => {
                  setFActividad(e.target.value)
                  setFPrograma('')
                  setFComponente('')
                }}
                className={`mt-1 ${selectCls}`}
              >
                <option value="">Todas</option>
                {actividadOpts.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Programa
              <select
                value={fPrograma}
                onChange={e => {
                  setFPrograma(e.target.value)
                  setFComponente('')
                }}
                className={`mt-1 ${selectCls}`}
              >
                <option value="">Todos</option>
                {programaOpts.map(([id, v]) => (
                  <option key={id} value={id}>{v.label}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Componente
              <select
                value={fComponente}
                onChange={e => setFComponente(e.target.value)}
                className={`mt-1 ${selectCls}`}
              >
                <option value="">Todos</option>
                {componenteOpts.map(([id, v]) => (
                  <option key={id} value={id}>{v.label}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              OG principal
              <select
                value={fOgPrincipal}
                onChange={e => setFOgPrincipal(e.target.value)}
                className={`mt-1 ${selectCls}`}
              >
                <option value="">Todos</option>
                {ogPrincipalOpts.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="w-[150px] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Fecha STR desde
              <input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                className={`mt-1 ${selectCls}`}
              />
            </label>
            <label className="w-[150px] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Fecha STR hasta
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                className={`mt-1 ${selectCls}`}
              />
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>
        )
      },
      toolbarExtra: ({ filteredRows, rows }) => {
        const actividades = new Map<string, string>()
        const programas = new Map<string, string>()
        const componentes = new Map<string, string>()
        const ogPrincipales = new Map<string, string>()
        for (const r of rows) {
          const proy = nest(r.proyecto)
          const comp = nest(proy?.componente)
          const prog = nest(comp?.programa)
          const act = nest(comp?.actividad)
          if (act?.id) actividades.set(String(act.id), optLabel(act.codigo, act.descripcion))
          if (prog?.id) programas.set(String(prog.id), optLabel(prog.codigo, prog.descripcion))
          if (comp?.id) componentes.set(String(comp.id), optLabel(comp.codigo, comp.descripcion))
          const principal = strOgPrincipal(r, ogCatalog)
          const codigo = ogCodigo(principal)
          if (codigo) ogPrincipales.set(codigo, optLabel(principal?.codigo, principal?.descripcion))
        }
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Resumen de pagos y saldos (con gráfico)"
              disabled={filteredRows.length === 0 || resumenLoading}
              onClick={async () => {
                setResumenLoading(true)
                try {
                  await exportResumenPagosSaldosFromStrRows(filteredRows)
                } catch (e: any) {
                  alert(e?.message ?? 'No se pudo generar el resumen.')
                } finally {
                  setResumenLoading(false)
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resumenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PieChart className="h-4 w-4" />}
              Resumen pagos
            </button>
            <button
              type="button"
              title="Generar PDF del listado filtrado"
              disabled={filteredRows.length === 0 || pdfLoading}
              onClick={async () => {
                setPdfLoading(true)
                try {
                  await exportStrsListPdf(filteredRows, {
                    actividadLabel: fActividad ? actividades.get(fActividad) : undefined,
                    programaLabel: fPrograma ? programas.get(fPrograma) : undefined,
                    componenteLabel: fComponente ? componentes.get(fComponente) : undefined,
                    ogPrincipalLabel: fOgPrincipal ? ogPrincipales.get(fOgPrincipal) : undefined,
                    desde: desde || undefined,
                    hasta: hasta || undefined,
                  })
                } catch (e: any) {
                  alert(e?.message ?? 'No se pudo generar el PDF.')
                } finally {
                  setPdfLoading(false)
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF
            </button>
          </div>
        )
      },
    }
  }, [clientFilter, filterResetKey, fActividad, fPrograma, fComponente, fOgPrincipal, desde, hasta, hasFilters, pdfLoading, resumenLoading, ogCatalog])

  return <CrudModule {...cfg} />
}
