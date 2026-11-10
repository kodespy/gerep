import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Navigate } from 'react-router'
import {
  ChevronDown, ChevronRight, Download, Filter, RefreshCw, ScrollText, Users, CalendarDays, Database,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { canAccessSistema } from '../lib/roles'
import {
  ACCION_OPTIONS,
  labelAccion,
  labelAccionHumana,
  resumenAuditoria,
  listTablasAuditoria,
  listUsuariosAuditoriaApp,
  loadAuditoria,
  type AuditoriaRow,
} from '../lib/auditoria'
import { Badge, Card, PageHeader, Spinner, StatCard } from '../components/ui'
import { Label, TextInput, SelectInput } from '../components/fields'
import { fmtDateTime } from '../lib/format'
import { exportRowsToExcel } from '../lib/exportTableExcel'

const PAGE_SIZE = 50

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

function initialFrom(name?: string | null, email?: string | null) {
  return (name || email || '?').trim().slice(0, 1).toUpperCase()
}

export default function Auditoria() {
  const { profile } = useAuth()
  const allowed = canAccessSistema(profile?.role)

  const today = useMemo(() => new Date(), [])
  const defaultDesde = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toDateInput(d)
  }, [])

  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(toDateInput(today))
  const [actorId, setActorId] = useState('')
  const [accion, setAccion] = useState('')
  const [tabla, setTabla] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [usuarios, setUsuarios] = useState<{ id: string; name: string | null; email: string | null }[]>([])
  const [tablas, setTablas] = useState<string[]>([])
  const [rows, setRows] = useState<AuditoriaRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!allowed) return
    void (async () => {
      // Solo actores de esta app (audit_logs.app_id), no todos los profiles del proyecto Supabase
      setUsuarios(await listUsuariosAuditoriaApp())
      setTablas(await listTablasAuditoria())
    })()
  }, [allowed])

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    setError(null)
    const { data, error: err, total: count } = await loadAuditoria({
      desde,
      hasta,
      actorId: actorId || null,
      accion: accion || null,
      tabla: tabla || null,
      q: q || null,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
    setRows(data)
    setTotal(count)
    setError(err)
    setLoading(false)
    if (!err) {
      const nextTablas = [...new Set(data.map(r => r.tabla).filter(Boolean) as string[])].sort()
      if (nextTablas.length) setTablas(prev => [...new Set([...prev, ...nextTablas])].sort())
    }
  }, [allowed, desde, hasta, actorId, accion, tabla, q, page])

  useEffect(() => {
    void load()
  }, [load])

  // Al cambiar filtros, volver a página 0
  useEffect(() => {
    setPage(0)
  }, [desde, hasta, actorId, accion, tabla, q])

  const stats = useMemo(() => {
    const byAccion = new Map<string, number>()
    const byActor = new Set<string>()
    for (const r of rows) {
      const key = labelAccion(r.accion)
      byAccion.set(key, (byAccion.get(key) ?? 0) + 1)
      if (r.actor_id) byActor.add(r.actor_id)
    }
    return {
      total: total ?? rows.length,
      usuarios: byActor.size,
      altas: byAccion.get('INSERT') ?? 0,
      cambios: byAccion.get('UPDATE') ?? 0,
      bajas: byAccion.get('DELETE') ?? 0,
    }
  }, [rows, total])

  const usuarioOptions = useMemo(
    () => [
      { value: '', label: 'Todos los usuarios' },
      ...usuarios.map(u => ({
        value: u.id,
        label: u.name || u.email || u.id,
      })),
    ],
    [usuarios],
  )

  const tablaOptions = useMemo(
    () => [
      { value: '', label: 'Todas las tablas' },
      ...tablas.map(t => ({ value: t, label: t })),
    ],
    [tablas],
  )

  if (!allowed) return <Navigate to="/" replace />

  const from = total === 0 || total == null ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total ?? rows.length)
  const pageCount = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1

  const exportExcel = () => {
    exportRowsToExcel(
      rows.map(r => ({
        fecha: fmtDateTime(r.created_at),
        usuario: r.actor?.name || r.actor?.email || r.actor_id || '—',
        accion: labelAccion(r.accion),
        tabla: r.tabla || '—',
        descripcion: r.resumen || '—',
        ip: r.ip_address || '—',
      })),
      [
        { key: 'fecha', label: 'Fecha y hora' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'accion', label: 'Acción' },
        { key: 'tabla', label: 'Tabla' },
        { key: 'descripcion', label: 'Descripción del cambio' },
        { key: 'ip', label: 'IP' },
      ],
      { sheetName: 'Auditoría', filename: `auditoria_${desde}_${hasta}` },
    )
  }

  return (
    <div className="fade-up space-y-4">
      <PageHeader
        eyebrow="Sistema"
        title="Bitácora de actividad"
        subtitle="Registro de altas, modificaciones, bajas e inicios de sesión de GEREP. El detalle técnico se abre al expandir cada fila."
      />

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="h-4 w-4 text-brand-600" />
          Filtros
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <Label text="Desde" />
            <TextInput type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div>
            <Label text="Hasta" />
            <TextInput type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div>
            <Label text="Usuario" />
            <SelectInput value={actorId} options={usuarioOptions} onChange={e => setActorId(e.target.value)} />
          </div>
          <div>
            <Label text="Acción" />
            <SelectInput value={accion} options={ACCION_OPTIONS} onChange={e => setAccion(e.target.value)} />
          </div>
          <div>
            <Label text="Tabla" />
            <SelectInput value={tabla} options={tablaOptions} onChange={e => setTabla(e.target.value)} />
          </div>
          <div>
            <Label text="Buscar" />
            <TextInput
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Descripción, tabla, JSON (id, montos…)"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Eventos (filtro)" value={loading ? '…' : String(stats.total)} icon={<ScrollText className="h-4 w-4" />} />
        <StatCard label="Usuarios en esta página" value={loading ? '…' : String(stats.usuarios)} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Altas en esta página" value={loading ? '…' : String(stats.altas)} icon={<CalendarDays className="h-4 w-4" />} />
        <StatCard label="Cambios / bajas (página)" value={loading ? '…' : `${stats.cambios} / ${stats.bajas}`} icon={<Database className="h-4 w-4" />} />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500">
          <span>
            {total != null
              ? `Mostrando ${from} - ${to} de ${total} registros`
              : loading
                ? 'Cargando…'
                : `${rows.length} registros`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
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
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner label="Cargando auditoría…" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-600">
            {(q || actorId || accion || tabla)
              ? 'Sin coincidencias para estos filtros. Pruebe ampliar el rango o limpiar la búsqueda.'
              : 'Todavía no hay eventos en el período seleccionado.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-600">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-4 py-2.5">Fecha y Hora</th>
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="px-4 py-2.5">Tabla</th>
                  <th className="px-4 py-2.5">Acción</th>
                  <th className="px-4 py-2.5">Descripción del Cambio</th>
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
                        <td className="px-4 py-2.5 text-sm text-slate-700">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                              {initialFrom(r.actor?.name, r.actor?.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{r.actor?.name || '—'}</div>
                              <div className="truncate text-xs text-slate-400">
                                {r.actor?.email || r.actor_id || ''}
                              </div>
                            </div>
                          </div>
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
                          <Badge color={accionColor(r.accion)}>{labelAccionHumana(r.accion)}</Badge>
                        </td>
                        <td className="max-w-lg truncate px-4 py-2.5 text-sm text-slate-700" title={resumenAuditoria(r)}>
                          {resumenAuditoria(r)}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid gap-3 text-sm lg:grid-cols-2">
                              <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resumen</p>
                                <p className="mt-0.5 text-slate-800">{resumenAuditoria(r)}</p>
                                <p className="mt-1 text-[11px] text-slate-600">
                                  Acción técnica: {labelAccion(r.accion)} · tabla {r.tabla || '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Registro / IP</p>
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
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Payload</p>
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
      </Card>
    </div>
  )
}
