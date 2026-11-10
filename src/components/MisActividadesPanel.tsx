import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileDown, RefreshCw, ScrollText } from 'lucide-react'
import {
  ACCION_OPTIONS,
  labelAccion,
  loadAuditoria,
  type AuditoriaRow,
} from '../lib/auditoria'
import { exportMisActividadesPdf } from '../lib/misActividadesPdf'
import { useAuth } from '../context/AuthContext'
import { fmtDateTime } from '../lib/format'
import { Badge, Spinner } from './ui'
import { Label, SelectInput } from './fields'

const PDF_FETCH_LIMIT = 2000

const PAGE_SIZE = 25

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function accionColor(accion: string): string {
  const a = labelAccion(accion).toUpperCase()
  if (a === 'INSERT' || a === 'LOGIN') return 'green'
  if (a === 'UPDATE') return 'blue'
  if (a === 'DELETE' || a === 'LOGOUT') return 'red'
  return 'slate'
}

export default function MisActividadesPanel({ userId }: { userId: string }) {
  const { profile, session } = useAuth()
  const today = useMemo(() => new Date(), [])
  const defaultDesde = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return toDateInput(d)
  }, [])

  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(toDateInput(today))
  const [accion, setAccion] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<AuditoriaRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    const { data, error: err, total: count } = await loadAuditoria({
      desde,
      hasta,
      actorId: userId,
      accion: accion || null,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
    setRows(data)
    setTotal(count)
    setError(err)
    setLoading(false)
  }, [userId, desde, hasta, accion, page])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(0)
  }, [desde, hasta, accion, userId])

  const exportPdf = async () => {
    if (!userId || exportingPdf) return
    setExportingPdf(true)
    setError(null)
    try {
      const all: AuditoriaRow[] = []
      let offset = 0
      let totalCount: number | null = null
      while (true) {
        const { data, error: err, total: count } = await loadAuditoria({
          desde,
          hasta,
          actorId: userId,
          accion: accion || null,
          limit: PAGE_SIZE,
          offset,
        })
        if (err) throw new Error(err)
        all.push(...data)
        totalCount = count
        if (data.length < PAGE_SIZE) break
        if (totalCount != null && all.length >= totalCount) break
        if (all.length >= PDF_FETCH_LIMIT) break
        offset += PAGE_SIZE
      }

      const accionLabel = ACCION_OPTIONS.find(o => o.value === accion)?.label
      await exportMisActividadesPdf(all, {
        usuarioNombre: profile?.name,
        usuarioEmail: profile?.email ?? session?.user?.email,
        desde,
        hasta,
        accionLabel: accion ? accionLabel : null,
      })
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setExportingPdf(false)
    }
  }

  const pageCount = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : page + 1
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = total == null ? rows.length : Math.min(total, (page + 1) * PAGE_SIZE)
  const canExport = !loading && !exportingPdf && (total == null ? rows.length > 0 : total > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-brand-950">Mis actividades</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Historial de tus acciones en el sistema: altas, cambios, bajas e inicios de sesión.
          </p>
        </div>
        <button
          type="button"
          disabled={!canExport}
          onClick={() => void exportPdf()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
        >
          <FileDown className="h-4 w-4" />
          {exportingPdf ? 'Generando PDF…' : 'Imprimir PDF'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label text="Desde" />
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div>
          <Label text="Hasta" />
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div>
          <Label text="Acción" />
          <SelectInput value={accion} options={ACCION_OPTIONS} onChange={e => setAccion(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ScrollText className="h-4 w-4" />
            {total != null
              ? `Mostrando ${from} - ${to} de ${total}`
              : loading
                ? 'Cargando…'
                : `${rows.length} registros`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={loading || (total != null ? (page + 1) * PAGE_SIZE >= total : rows.length < PAGE_SIZE)}
              onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner label="Cargando tus actividades…" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            No hay actividades registradas en el período seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-white text-left text-slate-600">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-4 py-2.5">Fecha y hora</th>
                  <th className="px-4 py-2.5">Tabla</th>
                  <th className="px-4 py-2.5">Acción</th>
                  <th className="px-4 py-2.5">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const open = expandedId === r.id
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-slate-50 hover:bg-brand-50/40">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : r.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label={open ? 'Contraer' : 'Expandir'}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-700">
                          {fmtDateTime(r.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.tabla ? (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200/80">
                              {r.tabla}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge color={accionColor(r.accion)}>{labelAccion(r.accion)}</Badge>
                        </td>
                        <td className="max-w-lg truncate px-4 py-2.5 text-sm text-slate-700" title={r.resumen ?? ''}>
                          {r.resumen || '—'}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="grid gap-3 text-sm lg:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registro / IP</p>
                                <p className="font-mono text-slate-700">
                                  {r.registro_id || '—'} · {r.ip_address || 'sin IP'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Descripción</p>
                                <p className="text-slate-800">{r.resumen || '—'}</p>
                              </div>
                              {(r.datos_anteriores || r.datos_nuevos || r.payload) && (
                                <>
                                  {r.datos_anteriores && (
                                    <div>
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Anterior</p>
                                      <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-[11px] text-slate-700 ring-1 ring-slate-200">
                                        {JSON.stringify(r.datos_anteriores, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {r.datos_nuevos && (
                                    <div>
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Nuevo</p>
                                      <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-[11px] text-slate-700 ring-1 ring-slate-200">
                                        {JSON.stringify(r.datos_nuevos, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {!r.datos_anteriores && !r.datos_nuevos && r.payload && (
                                    <div className="lg:col-span-2">
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Detalle</p>
                                      <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-[11px] text-slate-700 ring-1 ring-slate-200">
                                        {JSON.stringify(r.payload, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
