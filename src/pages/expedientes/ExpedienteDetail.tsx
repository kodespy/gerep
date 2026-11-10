import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import ModuleTabs from '../../components/ModuleTabs'
import {
  ArrowLeft, Building2, CalendarDays, Check, ChevronRight, FileText, FolderKanban,
  GitBranch, Inbox, LayoutList, Mailbox, MapPinned, MessageSquareText, Paperclip, Pencil,
  RotateCcw, Send, Undo2, UserRound,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, Card, ConfirmDialog, EstadoBadge, Modal, Spinner } from '../../components/ui'
import { RecordForm, type FieldDef } from '../../components/CrudModule'
import ExpedienteAdjuntosPanel from '../../components/ExpedienteAdjuntosPanel'
import ExpedienteRendicionFormExtra from '../../components/ExpedienteRendicionFormExtra'
import ExpedienteSeguimientoPanel, { fetchSeguimientoStats } from '../../components/ExpedienteSeguimientoPanel'
import ExpedienteDerivarModal from '../../components/ExpedienteDerivarModal'
import ExpedienteRecepcionExternaModal from '../../components/ExpedienteRecepcionExternaModal'
import ExpedienteRetornoExternaModal from '../../components/ExpedienteRetornoExternaModal'
import ExpedienteDesarrollosPanel from '../../components/ExpedienteDesarrollosPanel'
import ConstanciaRecepcionRendicionButton from '../../components/ConstanciaRecepcionRendicionButton'
import { fmtDateTime, fmtMoney, nowDatetimeLocalValue, nowTimestamptz } from '../../lib/format'
import {
  areaActualId,
  areaOrigenUltimaDerivacionId,
  dependenciaActualNombre,
  enDependenciaExterna,
  esInicioTramite,
  pendienteRecepcion,
  pendienteRecepcionExterna,
  ultimaDerivacionId,
} from '../../lib/expedienteWorkflow'
import { resolveUsuarioAreaContexto, usuarioPuedeEnArea } from '../../lib/expedienteUsuarioAreas'
import { canReactivarExpediente, esExpedienteFinalizado, isAdminOrDev } from '../../lib/roles'
import { reabrirExpediente } from '../../lib/expedienteReabrir'
import {
  ensureDatosRendicionStrNumero,
  expedienteSchemaHint,
  expedienteTipoFields,
  flattenDatosRendicion,
  isRendicionExpediente,
  packExpedientePayload,
  rendicionDatosFromRow,
} from '../../lib/expedienteRendicion'

const ESTADOS = ['Inicio de trámite', 'Recibido', 'En proceso', 'Derivado', 'Finalizado', 'Anulado'] as const

const FIELDS: FieldDef[] = [
  { name: 'numero_expediente', label: 'Número de expediente', type: 'text', required: true },
  { name: 'fecha_recepcion', label: 'Fecha de recepción', type: 'datetime', required: true, defaultValue: nowDatetimeLocalValue() },
  ...expedienteTipoFields(),
  { name: 'asunto', label: 'Asunto', type: 'textarea', required: true },
  {
    name: 'entidad_id', label: 'Entidad remitente', type: 'fk', required: true,
    fk: {
      table: 'entidades', select: 'id,razon_social,ruc',
      label: r => r.razon_social,
      sub: r => 'RUC ' + (r.ruc ?? '—'),
      orderBy: 'razon_social',
    },
  },
  {
    name: 'estado', label: 'Estado', type: 'select', required: true,
    options: ESTADOS.map(v => ({ value: v, label: v })),
  },
  { name: 'estado_finalizado', label: 'Marcar como finalizado', type: 'boolean', defaultValue: false },
]

type ExpedienteDetailRow = {
  id: string
  numero_expediente: string | null
  asunto: string | null
  tipo?: string | null
  datos_rendicion?: { str_id?: string | null; str_numero?: string | null; monto?: number | null; observaciones?: string | null } | null
  fecha_recepcion: string | null
  estado: string | null
  estado_finalizado: boolean | null
  entidad_id: string | null
  user_id?: string | null
  situacion_actual?: string | null
  situacion_actual_at?: string | null
  situacion_actual_by?: string | null
  entidad?: { razon_social: string | null; ruc?: string | null } | null
  creador?: { name: string | null; email: string | null } | null
  estado_actual?: {
    area_actual_id: string | null
    estado_actual?: string | null
    area?: { nombre: string | null } | null
  } | {
    area_actual_id: string | null
    estado_actual?: string | null
    area?: { nombre: string | null } | null
  }[] | null
  seguimiento?: {
    id?: string
    estado: string | null
    area_destino_id: string | null
    fecha_derivacion: string | null
    fecha_hora_recepcion?: string | null
    created_at?: string | null
    area_destino?: { nombre: string | null } | null
  }[] | null
}

type ProyectoVinculado = {
  id: string
  descripcion: string | null
  monto: number | null
  convenio?: string | null
  componente?: {
    codigo?: string | null
    descripcion?: string | null
    programa?: { codigo?: string | null; descripcion?: string | null } | null
  } | null
}

type Stats = {
  movimientos: number
  derivaciones: number
  recepciones: number
  adjuntos: number
  proyectos: number
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutList },
  { id: 'seguimiento', label: 'Seguimiento', icon: GitBranch },
  { id: 'adjuntos', label: 'Adjuntos', icon: Paperclip },
  { id: 'proyectos', label: 'Proyectos', icon: FolderKanban },
] as const

type TabId = typeof TABS[number]['id']

const PIPELINE: { tab: TabId; label: string; count: (s: Stats) => number; hint?: (s: Stats) => string }[] = [
  { tab: 'seguimiento', label: 'Derivaciones', count: s => s.derivaciones },
  { tab: 'seguimiento', label: 'Recepciones', count: s => s.recepciones },
  { tab: 'adjuntos', label: 'Adjuntos', count: s => s.adjuntos },
  { tab: 'proyectos', label: 'Proyectos', count: s => s.proyectos },
]

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  return String(v)
}

function dependenciaActual(row: ExpedienteDetailRow): string {
  return dependenciaActualNombre(row)
}

export default function ExpedienteDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [exp, setExp] = useState<ExpedienteDetailRow | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [proyectos, setProyectos] = useState<ProyectoVinculado[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabId = (['resumen', 'seguimiento', 'adjuntos', 'proyectos'] as const).includes(searchParams.get('tab') as TabId)
    ? (searchParams.get('tab') as TabId)
    : 'resumen'
  const setTab = (next: TabId) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      if (next === 'resumen') n.delete('tab')
      else n.set('tab', next)
      return n
    }, { replace: false })
  }
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [derivarOpen, setDerivarOpen] = useState(false)
  const [misAreaIds, setMisAreaIds] = useState<string[]>([])
  const [misResponsableAreaIds, setMisResponsableAreaIds] = useState<string[]>([])
  const [recibiendo, setRecibiendo] = useState(false)
  const [recibirConfirmOpen, setRecibirConfirmOpen] = useState(false)
  const [recepcionExternaOpen, setRecepcionExternaOpen] = useState(false)
  const [retornoExternaOpen, setRetornoExternaOpen] = useState(false)
  const [reactivando, setReactivando] = useState(false)
  const [reactivarConfirmOpen, setReactivarConfirmOpen] = useState(false)
  const [segKey, setSegKey] = useState(0)

  const userEmail = (profile?.email || session?.user?.email || '').trim().toLowerCase()
  const userId = session?.user?.id ?? null

  const loadMiArea = async () => {
    const ctx = await resolveUsuarioAreaContexto({ email: userEmail, userId })
    setMisAreaIds(ctx.areaIds)
    setMisResponsableAreaIds(ctx.responsableAreaIds)
  }

  const loadStats = async () => {
    const [seg, adj, proy] = await Promise.all([
      fetchSeguimientoStats(id),
      supabase.from('expediente_adjuntos').select('id', { count: 'exact', head: true }).eq('expediente_id', id),
      supabase
        .from('proyectos')
        .select(`
          id, descripcion, monto, convenio,
          componente:componentes_programa(codigo, descripcion, programa:programas(codigo, descripcion))
        `)
        .eq('expediente_id', id)
        .order('descripcion', { ascending: true })
        .limit(200),
    ])
    setProyectos((proy.data as ProyectoVinculado[]) ?? [])
    setStats({
      ...seg,
      adjuntos: adj.count ?? 0,
      proyectos: proy.data?.length ?? 0,
    })
  }

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const { data, error } = await supabase
      .from('expedientes')
      .select(`
        *,
        entidad:entidades(razon_social,ruc),
        creador:profiles!user_id(name,email),
        estado_actual:expediente_estado_actual(
          area_actual_id,
          estado_actual,
          area:areas!area_actual_id(nombre)
        ),
        seguimiento:expediente_seguimiento(
          id,
          estado,
          area_origen_id,
          area_destino_id,
          fecha_derivacion,
          fecha_hora_recepcion,
          created_at,
          area_destino:areas!area_destino_id(nombre,is_external)
        )
      `)
      .eq('id', id)
      .maybeSingle()
    if (error) console.error('[expediente detail]', error.message)
    setExp((data as ExpedienteDetailRow) ?? null)
    await loadStats()
    if (!opts?.silent) setLoading(false)
  }

  useEffect(() => { void load() }, [id])
  useEffect(() => { void loadMiArea() }, [userEmail, userId])
  useEffect(() => { if (!loading) void loadStats() }, [tab])

  const puedeRecibir = (): boolean => {
    if (!exp || esExpedienteFinalizado(exp)) return false
    if (!pendienteRecepcion(exp)) return false
    if (pendienteRecepcionExterna(exp)) {
      if (isAdminOrDev(profile?.role)) return true
      return usuarioPuedeEnArea(misAreaIds, areaOrigenUltimaDerivacionId(exp))
    }
    return usuarioPuedeEnArea(misResponsableAreaIds, areaActualId(exp))
  }

  const solicitarRecepcion = () => {
    if (!exp || !puedeRecibir()) return
    if (pendienteRecepcionExterna(exp)) {
      setRecepcionExternaOpen(true)
      return
    }
    setRecibirConfirmOpen(true)
  }

  const puedeRetornarDesdeExterna = (): boolean => {
    if (!exp || esExpedienteFinalizado(exp)) return false
    if (!enDependenciaExterna(exp)) return false
    if (isAdminOrDev(profile?.role)) return true
    if (usuarioPuedeEnArea(misAreaIds, areaOrigenUltimaDerivacionId(exp))) return true
    return misAreaIds.length > 0
  }

  const puedeDerivar = (): boolean => {
    if (!exp) return false
    if (esExpedienteFinalizado(exp)) return false
    if (pendienteRecepcion(exp)) return false
    if (esInicioTramite(exp)) return true
    if (!misAreaIds.length) return false
    return usuarioPuedeEnArea(misAreaIds, areaActualId(exp))
  }

  /** Solo el responsable del área donde está el expediente (ya recepcionado). */
  const puedeAgregarDesarrollo = (): boolean => {
    if (!exp) return false
    if (esExpedienteFinalizado(exp)) return false
    if (pendienteRecepcion(exp)) return false
    return usuarioPuedeEnArea(misResponsableAreaIds, areaActualId(exp))
  }

  const puedeReactivar = (): boolean => {
    if (!exp || !esExpedienteFinalizado(exp)) return false
    return canReactivarExpediente(profile?.role)
  }

  const reactivar = async () => {
    if (!exp || !puedeReactivar()) return
    setReactivarConfirmOpen(false)
    setReactivando(true)
    try {
      await reabrirExpediente(exp.id)
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo reactivar el expediente.')
    } finally {
      setReactivando(false)
    }
  }

  const recibir = async () => {
    if (!exp || !puedeRecibir() || !userId) return
    const areaId = areaActualId(exp)
    if (!areaId) return
    setRecibirConfirmOpen(false)
    setRecibiendo(true)
    try {
      const ahora = nowTimestamptz()
      const { error } = await supabase.from('expediente_seguimiento').insert({
        expediente_id: exp.id,
        area_origen_id: areaId,
        area_destino_id: areaId,
        estado: 'Recibido',
        user_id: userId,
        fecha_derivacion: ahora,
        fecha_hora_recepcion: ahora,
        observacion: 'Recepción del expediente',
      })
      if (error) throw error
      await supabase.from('expedientes').update({ estado: 'Recibido' }).eq('id', exp.id)
      setSegKey(k => k + 1)
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo registrar la recepción.')
    } finally {
      setRecibiendo(false)
    }
  }

  const saveEdit = async (values: Record<string, any>) => {
    if (!exp) return
    const wasFinal = esExpedienteFinalizado(exp)
    const willFinal = !!values.estado_finalizado || String(values.estado ?? '').toLowerCase() === 'finalizado'
    if (wasFinal && !willFinal && !canReactivarExpediente(profile?.role)) {
      throw new Error('Solo un administrador o un desarrollador puede reactivar un expediente finalizado.')
    }
    if (wasFinal && !canReactivarExpediente(profile?.role) && values.estado_finalizado === false) {
      throw new Error('Solo un administrador o un desarrollador puede reactivar un expediente finalizado.')
    }
    const payload: Record<string, any> = await ensureDatosRendicionStrNumero(packExpedientePayload({
      ...values,
      asunto: typeof values.asunto === 'string' ? values.asunto.trim().toUpperCase() : values.asunto,
    }))
    // Si no es admin/dev, no permitir bajar el flag de finalizado vía edición
    if (wasFinal && !canReactivarExpediente(profile?.role)) {
      payload.estado_finalizado = true
      if (String(payload.estado ?? '').toLowerCase() !== 'finalizado' && esExpedienteFinalizado(exp)) {
        // conservar estado actual si intentan quitar Finalizado
        payload.estado = exp.estado
      }
    }
    const { error } = await supabase.from('expedientes').update(payload).eq('id', exp.id)
    if (error) throw new Error(expedienteSchemaHint(error) ?? error.message)
    setEditing(false)
    await load()
  }

  if (loading) return <Spinner label="Cargando ficha del expediente…" />
  if (!exp) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400">Expediente no encontrado.</p>
        <Link to="/expedientes" className="mt-3 inline-flex text-sm text-brand-600 hover:underline">
          Volver a expedientes
        </Link>
      </div>
    )
  }

  const creador = asText(exp.creador?.name) || asText(exp.creador?.email) || '—'
  const inicio = esInicioTramite(exp)

  return (
    <div className="fade-up">
      <div className="mb-4">
        <Link to="/expedientes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Expedientes
        </Link>

        <Card className="overflow-hidden !bg-brand-100/80 border-brand-200/50 p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[7fr_3fr] md:gap-8">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-wider text-brand-600 uppercase">N° Expediente</p>
              <h1 className="text-xl font-bold leading-snug text-slate-800 dark:text-slate-100">
                {exp.numero_expediente || '—'}
              </h1>
              <p className="mt-2 text-sm font-medium uppercase leading-snug text-slate-700 dark:text-slate-200">
                {exp.asunto || 'Sin asunto'}
              </p>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entidad remitente</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700 dark:text-slate-200">
                    {exp.entidad?.razon_social || '—'}
                    {exp.entidad?.ruc ? ` · RUC ${exp.entidad.ruc}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dependencia actual</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700 dark:text-slate-200">
                    {dependenciaActual(exp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Creado por</dt>
                  <dd className="mt-0.5 font-medium leading-snug text-slate-700 dark:text-slate-200">{creador}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col items-start justify-between gap-4 border-t border-brand-200/40 pt-4 md:items-end md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <div className="md:text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 md:justify-end">
                  <EstadoBadge estado={exp.estado} />
                  {isRendicionExpediente(exp.tipo) && <Badge color="brand">Rendición de Cuentas</Badge>}
                  {esExpedienteFinalizado(exp)
                    ? <Badge color="green">Finalizado</Badge>
                    : <Badge color="amber">En trámite</Badge>}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Mesa: {fmtDateTime(exp.fecha_recepcion)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {isRendicionExpediente(exp.tipo) && (
                  <ConstanciaRecepcionRendicionButton expedienteId={exp.id} />
                )}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-brand-300 hover:text-brand-700"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                {inicio ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                    <Mailbox className="h-3.5 w-3.5" /> Inicio de trámite
                  </span>
                ) : pendienteRecepcion(exp) && !esExpedienteFinalizado(exp) ? (
                  <button
                    type="button"
                    disabled={!puedeRecibir() || recibiendo}
                    onClick={() => solicitarRecepcion()}
                    title={
                      puedeRecibir()
                        ? (pendienteRecepcionExterna(exp)
                          ? 'Registrar recepción en dependencia externa'
                          : 'Registrar recepción: expediente derivado a su dependencia')
                        : (pendienteRecepcionExterna(exp)
                          ? 'Solo el área que derivó o un administrador/desarrollador pueden registrar la recepción externa'
                          : 'Solo el responsable del área destino puede recepcionar')
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-50"
                  >
                    <Inbox className="h-4 w-4" />
                    {recibiendo
                      ? 'Recibiendo…'
                      : (pendienteRecepcionExterna(exp) ? 'Recepción externa' : 'Recepcionar')}
                  </button>
                ) : enDependenciaExterna(exp) && !esExpedienteFinalizado(exp) ? (
                  <button
                    type="button"
                    disabled={!puedeRetornarDesdeExterna()}
                    onClick={() => setRetornoExternaOpen(true)}
                    title={
                      puedeRetornarDesdeExterna()
                        ? 'Registrar que la dependencia externa devolvió el expediente y recepcionarlo en un área interna'
                        : 'Necesitás pertenecer a un área (o ser admin) para registrar el retorno'
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" />
                    Recepcionar retorno
                  </button>
                ) : null}
                {esExpedienteFinalizado(exp) ? (
                  puedeReactivar() ? (
                    <button
                      type="button"
                      disabled={reactivando}
                      onClick={() => setReactivarConfirmOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-bold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {reactivando ? 'Reactivando…' : 'Reactivar'}
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500"
                      title="Solo un administrador o un desarrollador puede reactivar un expediente finalizado"
                    >
                      Cerrado · sin derivación
                    </span>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={!puedeDerivar()}
                    onClick={() => setDerivarOpen(true)}
                    title={
                      puedeDerivar()
                        ? 'Derivar a otra dependencia'
                        : 'Solo activo si el expediente está en tu dependencia y ya fue recepcionado'
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send className="h-4 w-4" /> Derivar
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <ExpedienteDesarrollosPanel
          expedienteId={exp.id}
          areaId={areaActualId(exp)}
          dependenciaNombre={dependenciaActual(exp)}
          canAdd={puedeAgregarDesarrollo()}
          userId={userId}
          situacionPrevia={exp.situacion_actual}
          onChanged={() => void load({ silent: true })}
        />
      </Card>

      {stats && (
        <Card className="mb-4 overflow-x-auto p-3">
          <div className="flex min-w-max items-center">
            {PIPELINE.map((st, i) => {
              const count = st.count(stats)
              const active = tab === st.tab
              const done = count > 0
              return (
                <div key={`${st.label}-${i}`} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setTab(st.tab)}
                    className={`flex min-w-[104px] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : done
                          ? 'border-emerald-200 bg-emerald-50/50 hover:border-brand-300'
                          : 'border-dashed border-slate-200 bg-white hover:border-brand-300'
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {count}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      active ? 'text-brand-700' : done ? 'text-emerald-700' : 'text-slate-400'
                    }`}>
                      {st.label}
                    </span>
                    {st.hint && (
                      <span className="text-[10px] tabular-nums text-slate-400">{st.hint(stats)}</span>
                    )}
                  </button>
                  {i < PIPELINE.length - 1 && <ChevronRight className="mx-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <ModuleTabs
        tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <t.icon className="h-4 w-4" aria-hidden /> }))}
        value={tab}
        onChange={setTab}
        ariaLabel="Secciones del expediente"
      />

      {tab === 'resumen' && stats && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">Ciclo del expediente</h3>
            {[
              { label: 'Movimientos de seguimiento', v: stats.movimientos, color: 'bg-brand-500', max: Math.max(stats.movimientos, 1) },
              { label: 'Derivaciones', v: stats.derivaciones, color: 'bg-sky-500', max: Math.max(stats.movimientos, 1) },
              { label: 'Recepciones', v: stats.recepciones, color: 'bg-emerald-500', max: Math.max(stats.movimientos, 1) },
              { label: 'Adjuntos', v: stats.adjuntos, color: 'bg-amber-500', max: Math.max(stats.adjuntos, 1) },
              { label: 'Proyectos vinculados', v: stats.proyectos, color: 'bg-teal-500', max: Math.max(stats.proyectos, 1) },
            ].map(row => {
              const pct = Math.min(100, Math.round((row.v / row.max) * 100))
              return (
                <div key={row.label} className="mb-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-500">{row.label}</span>
                    <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{row.v}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-100/70 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.v ? Math.max(pct, 8) : 0}%` }} />
                  </div>
                </div>
              )
            })}
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">Datos generales</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><FileText className="h-3.5 w-3.5" /> Número</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{exp.numero_expediente || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><FileText className="h-3.5 w-3.5" /> Tipo</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{exp.tipo || 'General'}</dd>
              </div>
              {(() => {
                const rc = rendicionDatosFromRow(exp)
                if (!rc) return null
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                      Datos del formulario de rendición
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">STR</dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                          {rc.str_numero ? (
                            <Link to="/pagos/str" className="text-brand-700 hover:underline">
                              STR {rc.str_numero}
                            </Link>
                          ) : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Monto</dt>
                        <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                          {rc.monto != null ? fmtMoney(rc.monto) : '—'}
                        </dd>
                      </div>
                      {rc.observaciones ? (
                        <p className="whitespace-pre-wrap pt-1 text-slate-600 dark:text-slate-300">{rc.observaciones}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })()}
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><Building2 className="h-3.5 w-3.5" /> Entidad</dt>
                <dd className="max-w-[60%] text-right font-medium text-slate-700 dark:text-slate-200">
                  {exp.entidad?.razon_social || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><MapPinned className="h-3.5 w-3.5" /> Dependencia</dt>
                <dd className="max-w-[60%] text-right font-medium text-slate-700 dark:text-slate-200">
                  {dependenciaActual(exp)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><UserRound className="h-3.5 w-3.5" /> Creado por</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{creador}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><CalendarDays className="h-3.5 w-3.5" /> Recepción mesa</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{fmtDateTime(exp.fecha_recepcion)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><Check className="h-3.5 w-3.5" /> Trámite</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">
                  {esExpedienteFinalizado(exp) ? 'Finalizado' : 'En trámite'}
                </dd>
              </div>
              {exp.situacion_actual?.trim() ? (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <dt className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <MessageSquareText className="h-3.5 w-3.5" /> Último desarrollo
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                    {exp.situacion_actual.trim()}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-400"><FolderKanban className="h-3.5 w-3.5" /> Proyectos</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{stats.proyectos}</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Use el <span className="font-semibold">pipeline superior</span> para saltar a seguimiento, adjuntos o proyectos vinculados.
            </div>
          </Card>
        </div>
      )}

      {tab === 'seguimiento' && (
        <Card className="p-5">
          <ExpedienteSeguimientoPanel
            expedienteId={exp.id}
            numeroExpediente={exp.numero_expediente}
            asunto={exp.asunto}
            reloadKey={segKey}
            onChanged={() => void load()}
          />
        </Card>
      )}

      {tab === 'adjuntos' && (
        <Card className="p-5">
          <ExpedienteAdjuntosPanel expedienteId={exp.id} />
        </Card>
      )}

      {tab === 'proyectos' && (
        <div className="space-y-3">
          {proyectos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">
              No hay proyectos vinculados a este expediente.
            </Card>
          ) : (
            proyectos.map(p => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/proyectos/${p.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/proyectos/${p.id}`) }}
                className="cursor-pointer rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(47,28,106,0.06)] transition hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{p.descripcion || 'Proyecto'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.componente?.programa
                        ? `${p.componente.programa.codigo ?? ''} — ${p.componente.programa.descripcion ?? ''}`
                        : 'Sin programa'}
                      {p.componente
                        ? ` · ${p.componente.codigo ?? ''} — ${p.componente.descripcion ?? ''}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto</p>
                    <p className="font-bold tabular-nums text-brand-700">{fmtMoney(p.monto)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={<span className="flex items-center gap-2"><Mailbox className="h-5 w-5 text-brand-600" /> Expediente {exp.numero_expediente}</span>}
        wide
      >
        <RecordForm
          key={exp.id}
          fields={FIELDS}
          initial={flattenDatosRendicion(exp)}
          onCancel={() => setEditing(false)}
          onSubmit={v => saveEdit(v)}
          formExtra={(values, helpers) => (
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <ExpedienteRendicionFormExtra
                values={values}
                patchValues={helpers.patchValues}
                expedienteId={exp.id}
              />
            </div>
          )}
        />
      </Modal>

      <ExpedienteDerivarModal
        open={derivarOpen}
        onClose={() => setDerivarOpen(false)}
        expedienteId={exp.id}
        numeroExpediente={exp.numero_expediente}
        asunto={exp.asunto}
        areaOrigenId={areaActualId(exp) ?? misAreaIds[0] ?? null}
        onDerivado={() => {
          setSegKey(k => k + 1)
          void load()
        }}
      />

      <ExpedienteRecepcionExternaModal
        open={recepcionExternaOpen && !!ultimaDerivacionId(exp)}
        onClose={() => setRecepcionExternaOpen(false)}
        expedienteId={exp.id}
        seguimientoId={ultimaDerivacionId(exp) ?? ''}
        numeroExpediente={exp.numero_expediente}
        areaDestinoNombre={dependenciaActualNombre(exp)}
        onSaved={() => {
          setSegKey(k => k + 1)
          void load()
        }}
      />

      <ExpedienteRetornoExternaModal
        open={retornoExternaOpen}
        onClose={() => setRetornoExternaOpen(false)}
        expedienteId={exp.id}
        numeroExpediente={exp.numero_expediente}
        areaExternaId={areaActualId(exp)}
        areaExternaNombre={dependenciaActualNombre(exp)}
        areaDestinoSugeridaId={areaOrigenUltimaDerivacionId(exp)}
        misAreaIds={misAreaIds}
        onSaved={() => {
          setSegKey(k => k + 1)
          void load()
        }}
      />

      <ConfirmDialog
        open={recibirConfirmOpen}
        tone="primary"
        title="Confirmar recepción"
        confirmLabel="Recepcionar"
        message={`¿Confirmar recepción del expediente ${exp.numero_expediente ?? ''}?`}
        onCancel={() => setRecibirConfirmOpen(false)}
        onConfirm={() => void recibir()}
      />
      <ConfirmDialog
        open={reactivarConfirmOpen}
        tone="primary"
        title="Reactivar expediente"
        confirmLabel="Reactivar"
        message={`¿Reactivar el expediente ${exp.numero_expediente ?? ''}? Volverá a quedar en trámite.`}
        onCancel={() => setReactivarConfirmOpen(false)}
        onConfirm={() => void reactivar()}
      />
    </div>
  )
}
