import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import TruncatedText from '../../components/TruncatedText'
import {
  Plus, Pencil, Trash2, Search, Mailbox, Building2, CalendarDays, Paperclip,
  ChevronLeft, ChevronRight, RefreshCw, UserRound, MapPinned, Check, Inbox, GitBranch, Send, Undo2,
  MessageSquareText,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Card, Modal, ConfirmDialog, DeleteBlockedDialog, Spinner, EmptyState, PageHeader, Badge, EstadoBadge } from '../../components/ui'
import { RecordForm, type FieldDef } from '../../components/CrudModule'
import ExpedienteAdjuntosPanel, { ExpedienteAdjuntosCell, type ExpedienteAdjunto } from '../../components/ExpedienteAdjuntosPanel'
import ExpedienteRendicionFormExtra from '../../components/ExpedienteRendicionFormExtra'
import ConstanciaRecepcionRendicionButton from '../../components/ConstanciaRecepcionRendicionButton'
import ExpedienteSeguimientoModal from '../../components/ExpedienteSeguimientoModal'
import ExpedienteDerivarModal from '../../components/ExpedienteDerivarModal'
import ExpedienteRecepcionExternaModal from '../../components/ExpedienteRecepcionExternaModal'
import ExpedienteRetornoExternaModal from '../../components/ExpedienteRetornoExternaModal'
import { fmtDateTime, nowDatetimeLocalValue, nowTimestamptz } from '../../lib/format'
import { fetchNextExpedienteNumero } from '../../lib/expedienteUtils'
import {
  deleteConfirmMessage,
  findDeleteVinculos,
  friendlyDeleteError,
  safeDeleteById,
  type DeleteVinculo,
} from '../../lib/deleteGuard'
import {
  areaActualId,
  areaOrigenUltimaDerivacionId,
  cicloRecibido,
  dependenciaActualNombre,
  enDependenciaExterna,
  esInicioTramite,
  fechaHoraRecepcionCiclo,
  pendienteRecepcion,
  pendienteRecepcionExterna,
  ultimaDerivacionId,
} from '../../lib/expedienteWorkflow'
import { resolveUsuarioAreaContexto, usuarioPuedeEnArea } from '../../lib/expedienteUsuarioAreas'
import { canReactivarExpediente, esExpedienteFinalizado, isAdminOrDev } from '../../lib/roles'
import {
  ensureDatosRendicionStrNumero,
  expedienteSchemaHint,
  expedienteTipoFields,
  flattenDatosRendicion,
  isRendicionExpediente,
  packExpedientePayload,
  rendicionDatosFromRow,
  TIPOS_EXPEDIENTE,
  TIPO_EXPEDIENTE_GENERAL,
} from '../../lib/expedienteRendicion'

const PAGE_SIZE = 12

const ESTADOS = ['Inicio de trámite', 'Recibido', 'En proceso', 'Derivado', 'Finalizado', 'Anulado'] as const
const ESTADO_INICIO = 'Inicio de trámite'

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
    defaultValue: ESTADO_INICIO,
  },
  { name: 'estado_finalizado', label: 'Marcar como finalizado', type: 'boolean', defaultValue: false },
]

type ExpedienteRow = {
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
  entidad?: { razon_social: string | null } | null
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
  adjuntos?: ExpedienteAdjunto[] | null
}

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function dependenciaActual(row: ExpedienteRow): string {
  return dependenciaActualNombre(row)
}

function creadoPor(row: ExpedienteRow): string {
  return asText(row.creador?.name) || asText(row.creador?.email) || 'Usuario desconocido'
}

function fechaHoraRecepcion(row: ExpedienteRow): string | null {
  return fechaHoraRecepcionCiclo(row)
}

export default function Expedientes() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [rows, setRows] = useState<ExpedienteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fSituacion, setFSituacion] = useState<'all' | 'tramite' | 'finalizado'>('all')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [createInitial, setCreateInitial] = useState<Record<string, any> | null>(null)
  const [editing, setEditing] = useState<ExpedienteRow | null>(null)
  const [deleting, setDeleting] = useState<ExpedienteRow | null>(null)
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null)
  const [blockedDelete, setBlockedDelete] = useState<{ row: ExpedienteRow; vinculos: DeleteVinculo[] } | null>(null)
  const [seguimientoExp, setSeguimientoExp] = useState<ExpedienteRow | null>(null)
  const [derivarExp, setDerivarExp] = useState<ExpedienteRow | null>(null)
  /** Áreas del usuario: pertenencia (area_id) + áreas donde es responsable. */
  const [misAreaIds, setMisAreaIds] = useState<string[]>([])
  const [misResponsableAreaIds, setMisResponsableAreaIds] = useState<string[]>([])
  const [recibiendoId, setRecibiendoId] = useState<string | null>(null)
  const [recibirConfirm, setRecibirConfirm] = useState<ExpedienteRow | null>(null)
  const [recepcionExternaExp, setRecepcionExternaExp] = useState<ExpedienteRow | null>(null)
  const [retornoExternaExp, setRetornoExternaExp] = useState<ExpedienteRow | null>(null)

  const userEmail = (profile?.email || session?.user?.email || '').trim().toLowerCase()
  const userId = session?.user?.id ?? null

  const loadMiArea = async () => {
    const ctx = await resolveUsuarioAreaContexto({ email: userEmail, userId })
    setMisAreaIds(ctx.areaIds)
    setMisResponsableAreaIds(ctx.responsableAreaIds)
  }

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('expedientes')
      .select(`
        *,
        entidad:entidades(razon_social),
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
        ),
        adjuntos:expediente_adjuntos(id,file_path,file_name,file_type,descripcion,created_at)
      `)
      .order('fecha_recepcion', { ascending: false })
      .limit(2000)
    if (error) {
      console.error('[expedientes]', error.message)
      setLoadError(error.message)
      setRows([])
    } else {
      setRows((data as ExpedienteRow[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { void loadMiArea() }, [userEmail, userId])

  /** Interno: solo el responsable del área destino. Externo: origen de la derivación o admin/dev. */
  const puedeRecibir = (row: ExpedienteRow): boolean => {
    if (esExpedienteFinalizado(row)) return false
    if (!pendienteRecepcion(row)) return false
    if (pendienteRecepcionExterna(row)) {
      if (isAdminOrDev(profile?.role)) return true
      return usuarioPuedeEnArea(misAreaIds, areaOrigenUltimaDerivacionId(row))
    }
    return usuarioPuedeEnArea(misResponsableAreaIds, areaActualId(row))
  }

  const solicitarRecepcion = (exp: ExpedienteRow) => {
    if (!puedeRecibir(exp)) return
    if (pendienteRecepcionExterna(exp)) {
      setRecepcionExternaExp(exp)
      return
    }
    setRecibirConfirm(exp)
  }

  /** Retorno desde externa: ya está “recibido” afuera y vuelve a un área interna. */
  const puedeRetornarDesdeExterna = (row: ExpedienteRow): boolean => {
    if (esExpedienteFinalizado(row)) return false
    if (!enDependenciaExterna(row)) return false
    if (isAdminOrDev(profile?.role)) return true
    if (usuarioPuedeEnArea(misAreaIds, areaOrigenUltimaDerivacionId(row))) return true
    return misAreaIds.length > 0
  }

  /** Derivar: no finalizados; no pendiente de recepción; en mesa sí; luego solo en tu dependencia ya recepcionada. */
  const puedeDerivar = (row: ExpedienteRow): boolean => {
    if (esExpedienteFinalizado(row)) return false
    if (pendienteRecepcion(row)) return false
    if (esInicioTramite(row)) return true
    if (!misAreaIds.length) return false
    return usuarioPuedeEnArea(misAreaIds, areaActualId(row))
  }

  const recibirExpediente = async (exp: ExpedienteRow) => {
    if (!puedeRecibir(exp) || !userId) return
    const areaId = areaActualId(exp)
    if (!areaId) return

    setRecibiendoId(exp.id)
    setRecibirConfirm(null)
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

      // Alinear estado del expediente si el campo existe
      await supabase.from('expedientes').update({ estado: 'Recibido' }).eq('id', exp.id)

      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo registrar la recepción.')
    } finally {
      setRecibiendoId(null)
    }
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = rows.filter(r => {
      if (fEstado && (r.estado ?? '') !== fEstado) return false
      if (fTipo && (r.tipo || TIPO_EXPEDIENTE_GENERAL) !== fTipo) return false
      if (fSituacion === 'tramite' && esExpedienteFinalizado(r)) return false
      if (fSituacion === 'finalizado' && !esExpedienteFinalizado(r)) return false
      if (!t) return true
      return (
        (r.numero_expediente ?? '') + ' ' +
        (r.asunto ?? '') + ' ' +
        (r.entidad?.razon_social ?? '') + ' ' +
        (r.estado ?? '') + ' ' +
        (r.tipo ?? '') + ' ' +
        (r.datos_rendicion?.str_numero ?? '') + ' ' +
        creadoPor(r) + ' ' +
        dependenciaActual(r)
      ).toLowerCase().includes(t)
    })
    // Siempre: fecha de recepción descendente (más reciente primero)
    return list.sort((a, b) => {
      const fa = a.fecha_recepcion ?? ''
      const fb = b.fecha_recepcion ?? ''
      if (fa === fb) return 0
      if (!fa) return 1
      if (!fb) return -1
      return fb.localeCompare(fa)
    })
  }, [rows, q, fEstado, fTipo, fSituacion])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  )

  useEffect(() => { setPage(1) }, [q, fEstado, fTipo, fSituacion])

  const openCreate = async () => {
    setCreating(true)
    setCreateInitial(null)
    try {
      const numero = await fetchNextExpedienteNumero()
      setCreateInitial({
        numero_expediente: numero,
        estado: ESTADO_INICIO,
        estado_finalizado: false,
        tipo: TIPO_EXPEDIENTE_GENERAL,
      })
    } catch {
      setCreateInitial({ estado: ESTADO_INICIO, estado_finalizado: false, tipo: TIPO_EXPEDIENTE_GENERAL })
    }
  }

  const save = async (values: Record<string, any>, existing?: ExpedienteRow) => {
    const payload: Record<string, any> = await ensureDatosRendicionStrNumero(packExpedientePayload({
      ...values,
      asunto: typeof values.asunto === 'string' ? values.asunto.trim().toUpperCase() : values.asunto,
    }))
    if (existing) {
      const wasFinal = esExpedienteFinalizado(existing)
      const willUnfinalize =
        wasFinal &&
        (payload.estado_finalizado === false ||
          (String(payload.estado ?? '').toLowerCase() !== 'finalizado' &&
            String(existing.estado ?? '').toLowerCase() === 'finalizado'))
      if (wasFinal && !canReactivarExpediente(profile?.role)) {
        if (willUnfinalize || payload.estado_finalizado === false) {
          throw new Error('Solo un administrador o un desarrollador puede reactivar un expediente finalizado.')
        }
        payload.estado_finalizado = true
      }
      const { error } = await supabase.from('expedientes').update(payload).eq('id', existing.id)
      if (error) throw new Error(expedienteSchemaHint(error) ?? error.message)
      setEditing(null)
    } else {
      // Alta: siempre inicia el trámite en mesa, listo para derivar
      payload.estado = ESTADO_INICIO
      payload.estado_finalizado = false
      const { data: u } = await supabase.auth.getUser()
      if (u.user?.id) payload.user_id = u.user.id
      const { error } = await supabase.from('expedientes').insert(payload)
      if (error) throw new Error(expedienteSchemaHint(error) ?? error.message)
      setCreating(false)
    }
    await load()
  }

  const tryDelete = async (row: ExpedienteRow) => {
    setCheckingDeleteId(String(row.id))
    try {
      const vinculos = await findDeleteVinculos('expedientes', String(row.id))
      if (vinculos.length > 0) setBlockedDelete({ row, vinculos })
      else setDeleting(row)
    } finally {
      setCheckingDeleteId(null)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById('expedientes', String(deleting.id))
      setDeleting(null)
      await load()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar el expediente.')
      setDeleting(null)
    }
  }

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="General"
        title="Expedientes"
        subtitle="Cada ficha resume el expediente — haga clic para abrir su vista 360°"
        actions={
          <>
            <button
              type="button"
              onClick={() => void load()}
              title="Actualizar"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void openCreate()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Expediente
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por número, asunto, entidad o STR…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={fEstado}
          onChange={e => setFEstado(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={fTipo}
          onChange={e => setFTipo(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_EXPEDIENTE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={fSituacion}
          onChange={e => setFSituacion(e.target.value as typeof fSituacion)}
          className="rounded-xl border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="all">Todas las situaciones</option>
          <option value="tramite">En trámite</option>
          <option value="finalizado">Finalizados</option>
        </select>
        {(q || fEstado || fTipo || fSituacion !== 'all') && (
          <button
            type="button"
            onClick={() => { setQ(''); setFEstado(''); setFTipo(''); setFSituacion('all') }}
            className="rounded-xl px-2.5 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto shrink-0 text-xs font-medium text-slate-400">
          {filtered.length} expediente{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {loadError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar: {loadError}
        </div>
      )}

      {loading ? (
        <Spinner label="Cargando expedientes…" />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={(q || fEstado || fTipo || fSituacion !== 'all') ? 'Sin coincidencias' : 'Todavía no hay expedientes'}
            hint={(q || fEstado || fTipo || fSituacion !== 'all')
              ? 'Ningún expediente coincide con la búsqueda o los filtros.'
              : 'Cree el primero con el botón "Expediente".'}
            action={(q || fEstado || fTipo || fSituacion !== 'all') ? (
              <button
                type="button"
                onClick={() => { setQ(''); setFEstado(''); setFTipo(''); setFSituacion('all') }}
                className="mt-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                Limpiar filtros
              </button>
            ) : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map(exp => {
            const adjCount = exp.adjuntos?.length ?? 0
            return (
              <div
                key={exp.id}
                className="group rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(47,28,106,0.06)] transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-600"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <Link to={`/expedientes/${exp.id}`} className="min-w-0 hover:underline">
                    <p className="text-[10px] font-bold tracking-wider text-brand-700 uppercase">N° Expediente</p>
                    <p className="truncate text-lg font-extrabold tracking-tight text-brand-950 dark:text-brand-100">
                      {exp.numero_expediente || '—'}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isRendicionExpediente(exp.tipo) && (
                      <ConstanciaRecepcionRendicionButton expedienteId={exp.id} variant="icon" />
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(exp)}
                      title="Editar"
                      aria-label="Editar expediente"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void tryDelete(exp)}
                      disabled={checkingDeleteId === String(exp.id)}
                      title="Eliminar"
                      aria-label="Eliminar expediente"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <Link to={`/expedientes/${exp.id}`} className="mb-3 block hover:underline">
                  {exp.asunto
                    ? <TruncatedText text={exp.asunto} lines={3} className="text-sm leading-snug font-medium text-slate-800 uppercase dark:text-slate-200" />
                    : <span className="italic text-slate-600 normal-case">Sin asunto</span>}
                </Link>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={exp.estado} />
                  {isRendicionExpediente(exp.tipo) && <Badge color="brand">Rendición de Cuentas</Badge>}
                  {esExpedienteFinalizado(exp)
                    ? <Badge color="green">Finalizado</Badge>
                    : <Badge color="amber">En trámite</Badge>}
                </div>
                {(() => {
                  const rc = rendicionDatosFromRow(exp)
                  if (!rc?.str_numero) return null
                  return (
                    <p className="mb-3 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      STR {rc.str_numero}
                    </p>
                  )
                })()}

                <div className="mb-3 space-y-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2 font-medium">
                      {exp.entidad?.razon_social || 'Sin entidad'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-1">
                      <span className="text-slate-400">Creado por:</span>{' '}
                      <span className="font-medium text-slate-600 dark:text-slate-300">{creadoPor(exp)}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">
                      <span className="text-slate-400">Dependencia actual:</span>{' '}
                      <span className="font-medium text-slate-600 dark:text-slate-300">{dependenciaActual(exp)}</span>
                    </span>
                  </div>
                  {exp.situacion_actual?.trim() ? (
                    <div className="flex items-start gap-2">
                      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-violet" />
                      <span className="line-clamp-2">
                        <span className="text-slate-400">Desarrollo:</span>{' '}
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {exp.situacion_actual.trim()}
                        </span>
                      </span>
                    </div>
                  ) : null}
                  {fechaHoraRecepcion(exp) && (
                    <div className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-1">
                        <span className="text-slate-400">Recepción:</span>{' '}
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {fmtDateTime(fechaHoraRecepcion(exp))}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                  {(() => {
                    if (esInicioTramite(exp)) {
                      return (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300"
                          title="Expediente en mesa de entrada, listo para derivar"
                        >
                          <Mailbox className="h-3.5 w-3.5" />
                          Inicio de trámite
                        </span>
                      )
                    }
                    const yaRecibido = cicloRecibido(exp)
                    const activo = puedeRecibir(exp)
                    const externa = pendienteRecepcionExterna(exp)
                    const enExt = enDependenciaExterna(exp)
                    if (yaRecibido) {
                      return (
                        <>
                          <span
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300"
                            title={
                              enExt
                                ? `En dependencia externa · ${fmtDateTime(fechaHoraRecepcion(exp))}`
                                : `Recepcionado: ${fmtDateTime(fechaHoraRecepcion(exp))}`
                            }
                          >
                            <Check className="h-3.5 w-3.5" />
                            {enExt ? 'En externa' : 'Recibido'}
                          </span>
                          {enExt ? (
                            <button
                              type="button"
                              disabled={!puedeRetornarDesdeExterna(exp)}
                              onClick={() => setRetornoExternaExp(exp)}
                              title={
                                puedeRetornarDesdeExterna(exp)
                                  ? 'Registrar que la dependencia externa devolvió el expediente y recepcionarlo en un área interna'
                                  : 'Necesitás pertenecer a un área (o ser admin) para registrar el retorno'
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Recepcionar retorno
                            </button>
                          ) : null}
                        </>
                      )
                    }
                    return (
                      <button
                        type="button"
                        disabled={!activo || recibiendoId === exp.id}
                        onClick={() => solicitarRecepcion(exp)}
                        title={
                          activo
                            ? (externa
                              ? 'Registrar recepción en dependencia externa'
                              : 'Registrar recepción: expediente derivado a su dependencia')
                            : (externa
                              ? 'Solo el área que derivó o un administrador/desarrollador pueden registrar la recepción externa'
                              : 'Solo el responsable del área destino puede recepcionar')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                      >
                        <Inbox className="h-3.5 w-3.5" />
                        {recibiendoId === exp.id
                          ? 'Recibiendo…'
                          : (externa ? 'Recepción externa' : 'Recepcionar')}
                      </button>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={() => setSeguimientoExp(exp)}
                    title="Ver seguimiento del expediente"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Seguimiento
                  </button>
                  <button
                    type="button"
                    disabled={!puedeDerivar(exp)}
                    onClick={() => setDerivarExp(exp)}
                    title={
                      puedeDerivar(exp)
                        ? esInicioTramite(exp)
                          ? 'Derivar desde mesa de entrada a una dependencia'
                          : 'Derivar a otra dependencia'
                        : esExpedienteFinalizado(exp)
                          ? 'Expediente finalizado: no se puede derivar. Solo un administrador o un desarrollador puede reactivarlo.'
                          : 'Solo activo si el expediente está en tu dependencia y ya fue recepcionado'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Derivar
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Mesa: {fmtDateTime(exp.fecha_recepcion)}
                  </span>
                  <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Paperclip className="h-3.5 w-3.5" />
                    {adjCount > 0
                      ? <ExpedienteAdjuntosCell adjuntos={exp.adjuntos} />
                      : 'Sin adjuntos'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Mostrando{' '}
            <b className="text-slate-600 dark:text-slate-300">
              {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)}
            </b>{' '}
            de <b className="text-slate-600 dark:text-slate-300">{filtered.length}</b> expedientes
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - pageSafe) <= 2)
                .map((n, i, arr) => (
                  <span key={n} className="flex items-center">
                    {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-xs text-slate-300">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold shadow-sm ${
                        n === pageSafe
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                ))}
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageSafe === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={<span className="flex items-center gap-2"><Mailbox className="h-5 w-5 text-brand-600" /> Nuevo expediente</span>}
        wide
      >
        {creating && (
          createInitial === null
            ? <Spinner label="Preparando formulario…" />
            : (
              <RecordForm
                fields={FIELDS}
                initial={createInitial}
                onCancel={() => setCreating(false)}
                onSubmit={v => save(v)}
                submitLabel="Crear"
                formExtra={(values, helpers) => (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <ExpedienteRendicionFormExtra
                      values={values}
                      patchValues={helpers.patchValues}
                    />
                    <ExpedienteAdjuntosPanel expedienteId={undefined} />
                  </div>
                )}
              />
            )
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={<span className="flex items-center gap-2"><Mailbox className="h-5 w-5 text-brand-600" /> Expediente {editing?.numero_expediente}</span>}
        wide
      >
        {editing && (
          <RecordForm
            key={editing.id}
            fields={FIELDS}
            initial={flattenDatosRendicion(editing)}
            onCancel={() => setEditing(null)}
            onSubmit={v => save(v, editing)}
            formExtra={(values, helpers) => (
              <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <ExpedienteRendicionFormExtra
                  values={values}
                  patchValues={helpers.patchValues}
                  expedienteId={editing.id}
                />
                <ExpedienteAdjuntosPanel expedienteId={editing.id} />
              </div>
            )}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({
          singular: 'expediente',
          label: deleting?.numero_expediente,
        })}
      />
      <ConfirmDialog
        open={!!recibirConfirm}
        tone="primary"
        title="Confirmar recepción"
        confirmLabel="Recepcionar"
        message={`¿Confirmar recepción del expediente ${recibirConfirm?.numero_expediente ?? ''}?`}
        onCancel={() => setRecibirConfirm(null)}
        onConfirm={() => {
          if (recibirConfirm) void recibirExpediente(recibirConfirm)
        }}
      />
      <DeleteBlockedDialog
        open={!!blockedDelete}
        onClose={() => setBlockedDelete(null)}
        vinculos={blockedDelete?.vinculos ?? []}
        description={
          blockedDelete ? (
            <>
              El expediente <b className="text-slate-800">"{blockedDelete.row.numero_expediente}"</b> tiene
              registros vinculados y no puede eliminarse:
            </>
          ) : undefined
        }
      />

      <ExpedienteSeguimientoModal
        open={!!seguimientoExp}
        onClose={() => setSeguimientoExp(null)}
        expedienteId={seguimientoExp?.id ?? null}
        numeroExpediente={seguimientoExp?.numero_expediente}
        asunto={seguimientoExp?.asunto}
      />

      <ExpedienteDerivarModal
        open={!!derivarExp}
        onClose={() => setDerivarExp(null)}
        expedienteId={derivarExp?.id ?? null}
        numeroExpediente={derivarExp?.numero_expediente}
        asunto={derivarExp?.asunto}
        areaOrigenId={derivarExp ? (areaActualId(derivarExp) ?? misAreaIds[0] ?? null) : null}
        onDerivado={() => void load()}
      />

      <ExpedienteRecepcionExternaModal
        open={!!recepcionExternaExp && !!ultimaDerivacionId(recepcionExternaExp)}
        onClose={() => setRecepcionExternaExp(null)}
        expedienteId={recepcionExternaExp?.id ?? ''}
        seguimientoId={recepcionExternaExp ? (ultimaDerivacionId(recepcionExternaExp) ?? '') : ''}
        numeroExpediente={recepcionExternaExp?.numero_expediente}
        areaDestinoNombre={recepcionExternaExp ? dependenciaActualNombre(recepcionExternaExp) : null}
        onSaved={() => void load()}
      />

      <ExpedienteRetornoExternaModal
        open={!!retornoExternaExp}
        onClose={() => setRetornoExternaExp(null)}
        expedienteId={retornoExternaExp?.id ?? ''}
        numeroExpediente={retornoExternaExp?.numero_expediente}
        areaExternaId={retornoExternaExp ? areaActualId(retornoExternaExp) : null}
        areaExternaNombre={retornoExternaExp ? dependenciaActualNombre(retornoExternaExp) : null}
        areaDestinoSugeridaId={retornoExternaExp ? areaOrigenUltimaDerivacionId(retornoExternaExp) : null}
        misAreaIds={misAreaIds}
        onSaved={() => void load()}
      />
    </div>
  )
}
