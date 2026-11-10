import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, FileDown, Loader2, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseFetchAll } from '../lib/supabaseFetchAll'
import { fmtDate } from '../lib/format'
import { exportRendicionControlFormularioPdf } from '../lib/rendicionControlFormularioPdf'
import { Badge, Card, EmptyState, Modal, Spinner } from './ui'
import RendicionControlFormularioPanel from './RendicionControlFormularioPanel'

const PAGE_SIZE = 12

type FormRow = {
  id: string
  rendicion_id: string
  numero_formulario: string | null
  cumple: boolean | null
  no_cumple: boolean | null
  no_aplica: boolean | null
  fecha: string | null
  created_at?: string | null
  rendicion?: {
    id: string
    expediente?: { numero_expediente?: string | null } | null
    str?: {
      numero?: string | null
      proyecto?: { descripcion?: string | null } | null
    } | null
  } | null
}

type FormGroup = {
  key: string
  rendicionId: string
  numero: string
  fecha: string | null
  strNumero: string
  expNumero: string
  proyecto: string
  counts: { total: number; cumple: number; noCumple: number; noAplica: number }
}

function nest<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default function RendicionControlFormulariosList() {
  const [rows, setRows] = useState<FormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [openRendicionId, setOpenRendicionId] = useState<string | null>(null)
  const [openStrNumero, setOpenStrNumero] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabaseFetchAll<FormRow>(
        () =>
          supabase
            .from('rendicion_control_formularios')
            .select(`
              id, rendicion_id, numero_formulario, cumple, no_cumple, no_aplica, fecha, created_at,
              rendicion:rendiciones_cuentas!rendicion_id(
                id,
                expediente:expedientes(numero_expediente),
                str:strs(numero, proyecto:proyectos(descripcion, componente:componentes_programa(codigo, descripcion)))
              )
            `, { count: 'exact' })
            .order('fecha', { ascending: false, nullsFirst: false })
            .order('id', { ascending: true }),
        50_000,
      )
      if (err) throw err
      setRows(data ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el listado de formularios.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo<FormGroup[]>(() => {
    const map = new Map<string, FormGroup>()
    for (const r of rows) {
      const numero = (r.numero_formulario ?? '').trim() || 'Sin número'
      const key = `${r.rendicion_id}::${numero}`
      const rend = nest(r.rendicion as any)
      const str = nest(rend?.str as any)
      const exp = nest(rend?.expediente as any)
      const proy = nest(str?.proyecto as any)
      const proyNombre = String(proy?.descripcion ?? '').trim()
      const comp = nest(proy?.componente as any)
      const compNombre = String(comp?.descripcion ?? comp?.codigo ?? '').trim()
      const proyectoLabel = (compNombre ? `${proyNombre} - ${compNombre}` : proyNombre).toUpperCase()
      let g = map.get(key)
      if (!g) {
        g = {
          key,
          rendicionId: r.rendicion_id,
          numero,
          fecha: r.fecha ?? null,
          strNumero: (str?.numero ?? '').trim(),
          expNumero: (exp?.numero_expediente ?? '').trim(),
          proyecto: proyectoLabel,
          counts: { total: 0, cumple: 0, noCumple: 0, noAplica: 0 },
        }
        map.set(key, g)
      }
      g.counts.total += 1
      if (r.cumple) g.counts.cumple += 1
      if (r.no_cumple) g.counts.noCumple += 1
      if (r.no_aplica) g.counts.noAplica += 1
      if (r.fecha && (!g.fecha || String(r.fecha) > String(g.fecha))) g.fecha = r.fecha
    }
    return [...map.values()].sort((a, b) => {
      const fa = a.fecha ?? ''
      const fb = b.fecha ?? ''
      if (fa !== fb) return fb.localeCompare(fa)
      return b.numero.localeCompare(a.numero)
    })
  }, [rows])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return groups
    return groups.filter(g =>
      [g.numero, g.strNumero, g.expNumero, g.proyecto, fmtDate(g.fecha)]
        .join(' ')
        .toLowerCase()
        .includes(t),
    )
  }, [groups, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  )

  useEffect(() => { setPage(1) }, [q])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const generarPdf = async (g: FormGroup, soloSustanciales = false) => {
    if (!g.numero || g.numero === 'Sin número') return
    const key = `${g.key}:${soloSustanciales ? 'sust' : 'full'}`
    setPdfLoading(key)
    try {
      await exportRendicionControlFormularioPdf(g.rendicionId, g.numero, { soloSustanciales })
    } catch (err: any) {
      alert(err?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setPdfLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar formulario, STR, expediente…"
              className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {filtered.length === 0
                ? '0 formularios'
                : `${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, filtered.length)} de ${filtered.length}`}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              title="Actualizar"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        {loading ? (
          <Spinner label="Cargando formularios de control…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Sin formularios de control"
            hint="Genere formularios desde cada rendición (ícono de checklist en la hoja de registros)."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table data-table--dense w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-600">
                  <th className="px-3 py-2 font-medium">Nº Formulario</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">STR</th>
                  <th className="px-3 py-2 font-medium">Expediente</th>
                  <th className="px-3 py-2 font-medium">Proyecto</th>
                  <th className="px-3 py-2 text-center font-medium">Ítems</th>
                  <th className="px-3 py-2 text-center font-medium">Resultados</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(g => (
                  <tr key={g.key} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <Badge color="brand">{g.numero}</Badge>
                    </td>
                    <td className="px-3 py-2 text-sm tabular-nums text-slate-700">
                      {fmtDate(g.fecha)}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-slate-800">
                      {g.strNumero || '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {g.expNumero || '—'}
                    </td>
                    <td className="max-w-[280px] px-3 py-2">
                      <span className="text-[11px] font-medium uppercase leading-snug text-slate-700">
                        {g.proyecto || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-sm tabular-nums text-slate-700">
                      {g.counts.total}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-center gap-1 text-[10px]">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                          {g.counts.cumple} C
                        </span>
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">
                          {g.counts.noCumple} NC
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                          {g.counts.noAplica} NA
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Generar PDF"
                          disabled={!!pdfLoading || g.numero === 'Sin número'}
                          onClick={() => void generarPdf(g, false)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40"
                        >
                          {pdfLoading === `${g.key}:full`
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <FileDown className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title="PDF solo Doc. sustanciales"
                          disabled={!!pdfLoading || g.numero === 'Sin número'}
                          onClick={() => void generarPdf(g, true)}
                          className="relative rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40"
                        >
                          {pdfLoading === `${g.key}:sust`
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
                          title="Ver / editar formulario"
                          onClick={() => {
                            setOpenRendicionId(g.rendicionId)
                            setOpenStrNumero(g.strNumero || null)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
                        >
                          <ClipboardList className="h-3.5 w-3.5" /> Abrir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
            <p className="text-xs text-slate-500">
              Página <span className="font-semibold text-slate-800">{pageSafe}</span> de{' '}
              <span className="font-semibold text-slate-800">{totalPages}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pageSafe <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - pageSafe) <= 1)
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
                      onClick={() => setPage(p)}
                      className={`min-w-[1.75rem] rounded-lg px-2 py-1.5 text-xs font-semibold ${
                        p === pageSafe
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
                disabled={pageSafe >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={!!openRendicionId}
        onClose={() => {
          setOpenRendicionId(null)
          setOpenStrNumero(null)
          void load()
        }}
        title={`Control de rendición${openStrNumero ? ` · STR ${openStrNumero}` : ''}`}
        wide
      >
        <div className="max-h-[min(75vh,720px)] overflow-y-auto pr-1">
          {openRendicionId && (
            <RendicionControlFormularioPanel rendicionId={openRendicionId} />
          )}
        </div>
      </Modal>
    </div>
  )
}
