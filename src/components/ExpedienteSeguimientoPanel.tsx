import { useEffect, useState } from 'react'
import {
  Check, FileDown, History, Loader2, Trash2, UserCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog, EmptyState, EstadoBadge, Badge } from './ui'
import {
  fmtDateTime,
  fromDatetimeLocalValue,
  nowDateInputValue,
  toDateInputValue,
} from '../lib/format'
import { exportSeguimientoExpedientePdf } from '../lib/seguimientoExpedientePdf'
import { canEliminarHistorialExpediente } from '../lib/roles'
import { deleteConfirmMessage } from '../lib/deleteGuard'

export type SeguimientoMovimiento = {
  id: string
  estado: string | null
  observacion: string | null
  observacion_recepcion?: string | null
  fecha_derivacion: string | null
  fecha_hora_recepcion: string | null
  quien_recibio?: string | null
  nro_expediente_asignado?: string | null
  area_destino_id?: string | null
  created_at: string | null
  area_origen?: { nombre: string | null } | null
  area_destino?: { nombre: string | null; is_external?: boolean | null } | null
  usuario?: { name: string | null; email: string | null } | null
}

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  return String(v)
}

function isDerivado(estado: string | null | undefined): boolean {
  return String(estado ?? '').toLowerCase().includes('derivad')
}

function isRecibido(estado: string | null | undefined): boolean {
  return String(estado ?? '').toLowerCase().includes('recibid')
}

function pendienteRecepcionExterna(m: SeguimientoMovimiento): boolean {
  return !!m.area_destino?.is_external && isDerivado(m.estado) && !m.fecha_hora_recepcion
}

/** Timestamp del evento mostrado (recepción > derivación > created_at). */
function movimientoTs(m: SeguimientoMovimiento): number {
  const vals = [m.fecha_hora_recepcion, m.fecha_derivacion, m.created_at]
    .map(v => (v ? Date.parse(String(v)) : NaN))
    .filter(n => Number.isFinite(n))
  return vals.length ? Math.max(...vals) : 0
}

/** Más recientes primero (arriba). */
function sortMovimientosNewestFirst(list: SeguimientoMovimiento[]): SeguimientoMovimiento[] {
  return [...list].sort((a, b) => {
    const diff = movimientoTs(b) - movimientoTs(a)
    if (diff !== 0) return diff
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
      || String(b.id).localeCompare(String(a.id))
  })
}

const SELECT_FULL = `
  id,
  estado,
  observacion,
  observacion_recepcion,
  fecha_derivacion,
  fecha_hora_recepcion,
  quien_recibio,
  nro_expediente_asignado,
  area_destino_id,
  created_at,
  area_origen:areas!area_origen_id(nombre),
  area_destino:areas!area_destino_id(nombre,is_external),
  usuario:profiles!user_id(name,email)
`

const SELECT_MIN = `
  id,
  estado,
  observacion,
  fecha_derivacion,
  fecha_hora_recepcion,
  area_destino_id,
  created_at,
  area_origen:areas!area_origen_id(nombre),
  area_destino:areas!area_destino_id(nombre,is_external),
  usuario:profiles!user_id(name,email)
`

export default function ExpedienteSeguimientoPanel({
  expedienteId,
  numeroExpediente,
  asunto,
  reloadKey = 0,
  onChanged,
}: {
  expedienteId: string | null
  numeroExpediente?: string | null
  asunto?: string | null
  reloadKey?: number
  onChanged?: () => void
}) {
  const { session, profile } = useAuth()
  const [items, setItems] = useState<SeguimientoMovimiento[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deletingMov, setDeletingMov] = useState<SeguimientoMovimiento | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [formMovId, setFormMovId] = useState<string | null>(null)
  const [fechaRec, setFechaRec] = useState(nowDateInputValue())
  const [nroAsignado, setNroAsignado] = useState('')
  const [quienRecibio, setQuienRecibio] = useState('')
  const [obsRec, setObsRec] = useState('')
  const [savingRec, setSavingRec] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const puedeEliminarHistorial = canEliminarHistorialExpediente(profile?.role)

  const load = async () => {
    if (!expedienteId) {
      setItems([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    let res: { data: any[] | null; error: any } = await supabase
      .from('expediente_seguimiento')
      .select(SELECT_FULL)
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false })
      .order('fecha_derivacion', { ascending: false })

    if (res.error && /quien_recibio|nro_expediente_asignado|observacion_recepcion|is_external/i.test(res.error.message)) {
      res = await supabase
        .from('expediente_seguimiento')
        .select(SELECT_MIN)
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
        .order('fecha_derivacion', { ascending: false })
    }

    if (res.error) {
      console.error('[expediente_seguimiento]', res.error.message)
      setError(res.error.message)
      setItems([])
    } else {
      setItems(sortMovimientosNewestFirst((res.data as unknown as SeguimientoMovimiento[]) ?? []))
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [expedienteId, reloadKey])

  const openForm = (m: SeguimientoMovimiento) => {
    setFormMovId(m.id)
    setFechaRec(toDateInputValue(m.fecha_hora_recepcion) || nowDateInputValue())
    setNroAsignado(asText(m.nro_expediente_asignado))
    setQuienRecibio(asText(m.quien_recibio))
    setObsRec(asText(m.observacion_recepcion))
    setFormError(null)
  }

  const closeForm = () => {
    if (savingRec) return
    setFormMovId(null)
    setFormError(null)
  }

  const guardarRecepcionExterna = async (m: SeguimientoMovimiento) => {
    if (!expedienteId) return
    const quien = quienRecibio.trim()
    if (!fechaRec) {
      setFormError('Ingrese la fecha de recepción.')
      return
    }
    if (!quien) {
      setFormError('Indique quién recibió el expediente.')
      return
    }

    setSavingRec(true)
    setFormError(null)
    try {
      const fechaVal = fromDatetimeLocalValue(fechaRec) || fechaRec
      const payload: Record<string, any> = {
        // Mantener "Derivado": la recepción externa se marca con fecha_hora_recepcion.
        fecha_hora_recepcion: fechaVal,
        quien_recibio: quien,
        nro_expediente_asignado: nroAsignado.trim() || null,
        observacion_recepcion: obsRec.trim() || null,
      }
      if (session?.user?.id) payload.user_id = session.user.id

      let { error: updErr } = await supabase
        .from('expediente_seguimiento')
        .update(payload)
        .eq('id', m.id)

      // Compatibilidad si faltan columnas nuevas
      if (updErr && /quien_recibio|nro_expediente_asignado|observacion_recepcion/i.test(updErr.message)) {
        const basic = {
          fecha_hora_recepcion: fechaVal,
          observacion: [
            asText(m.observacion),
            `Recepción externa: ${quien}`,
            nroAsignado.trim() ? `N° asignado: ${nroAsignado.trim()}` : '',
            obsRec.trim(),
          ].filter(Boolean).join(' · '),
          ...(session?.user?.id ? { user_id: session.user.id } : {}),
        }
        const retry = await supabase.from('expediente_seguimiento').update(basic).eq('id', m.id)
        if (retry.error) throw retry.error
        updErr = null
      }
      if (updErr) throw updErr

      await supabase.from('expedientes').update({ estado: 'Recibido' }).eq('id', expedienteId)
      setFormMovId(null)
      await load()
      onChanged?.()
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo registrar la recepción externa.')
    } finally {
      setSavingRec(false)
    }
  }

  const printPdf = async () => {
    if (items.length === 0 || exporting) return
    setExporting(true)
    try {
      await exportSeguimientoExpedientePdf({
        numeroExpediente,
        asunto,
        movimientos: items,
      })
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setExporting(false)
    }
  }

  const eliminarMovimiento = async () => {
    if (!deletingMov || !puedeEliminarHistorial) return
    setDeleting(true)
    try {
      const movId = deletingMov.id
      const { error: tareasErr } = await supabase
        .from('seguimiento_tareas')
        .delete()
        .eq('seguimiento_id', movId)
      if (tareasErr) throw tareasErr
      const { error: delErr } = await supabase
        .from('expediente_seguimiento')
        .delete()
        .eq('id', movId)
      if (delErr) throw delErr
      setDeletingMov(null)
      if (formMovId === movId) setFormMovId(null)
      await load()
      onChanged?.()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo eliminar el movimiento.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <History className="h-4 w-4 text-slate-500" />
          Historial de Movimientos
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400">
            {items.length} movimiento{items.length === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            disabled={loading || !!error || items.length === 0 || exporting}
            onClick={() => void printPdf()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            title="Imprimir seguimiento en PDF"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando seguimiento…</span>
        </div>
      ) : error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      ) : items.length === 0 ? (
        <EmptyState title="Sin movimientos" hint="Aún no hay derivaciones ni recepciones registradas." />
      ) : (
        <div className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-slate-200 dark:before:bg-slate-700">
          {items.map(m => {
            const fecha = m.fecha_hora_recepcion || m.fecha_derivacion || m.created_at
            const userLabel = asText(m.usuario?.name) || asText(m.usuario?.email) || '—'
            const origen = asText(m.area_origen?.nombre) || '—'
            const destino = asText(m.area_destino?.nombre) || '—'
            const externo = !!m.area_destino?.is_external
            const pendienteExt = pendienteRecepcionExterna(m)
            const formOpen = formMovId === m.id
            const obsDeriv = asText(m.observacion)
            const obsRecepcion = asText(m.observacion_recepcion)
            const recibidoExt = externo && !!m.fecha_hora_recepcion

            return (
              <div key={m.id} className="relative pl-6">
                <span className="absolute top-3 left-0 h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900" />

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{destino}</h4>
                        {externo && <Badge color="amber">EXT</Badge>}
                        {!externo && <EstadoBadge estado={m.estado} />}
                      </div>
                      {puedeEliminarHistorial && (
                        <button
                          type="button"
                          title="Eliminar movimiento (administrador / desarrollador)"
                          disabled={deleting}
                          onClick={() => setDeletingMov(m)}
                          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Desde {origen} por {userLabel}
                    </p>
                    <p className="text-xs text-slate-400">{fmtDateTime(fecha)}</p>

                    {obsDeriv && (
                      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {obsDeriv}
                      </div>
                    )}

                    {recibidoExt && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <p className="font-semibold">Recepción externa registrada</p>
                        <p className="mt-1">Fecha: {fmtDateTime(m.fecha_hora_recepcion)}</p>
                        {asText(m.quien_recibio) && <p>Quién recibió: {asText(m.quien_recibio)}</p>}
                        {asText(m.nro_expediente_asignado) && (
                          <p>N° expediente asignado: {asText(m.nro_expediente_asignado)}</p>
                        )}
                        {obsRecepcion && <p className="mt-1">Obs.: {obsRecepcion}</p>}
                      </div>
                    )}

                    {pendienteExt && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                              <UserCheck className="h-3.5 w-3.5" />
                              Estado de Recepción
                            </p>
                            <p className="mt-1 text-sm font-semibold text-amber-600">
                              Pendiente de recepción
                            </p>
                          </div>
                          {!formOpen && (
                            <button
                              type="button"
                              onClick={() => openForm(m)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Recepción Externa
                            </button>
                          )}
                        </div>

                        {formOpen && (
                          <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                              <UserCheck className="h-4 w-4 text-amber-600" />
                              Registrar Recepción en Área Externa
                            </p>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="block text-xs font-semibold text-slate-600">
                                Fecha Recepción <span className="text-rose-500">*</span>
                                <input
                                  type="date"
                                  value={fechaRec}
                                  onChange={e => setFechaRec(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">
                                N° Expediente Asignado
                                <input
                                  type="text"
                                  value={nroAsignado}
                                  onChange={e => setNroAsignado(e.target.value)}
                                  placeholder="Ej. 1234/2024"
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                                />
                              </label>
                            </div>

                            <label className="mt-3 block text-xs font-semibold text-slate-600">
                              Quién Recibió <span className="text-rose-500">*</span>
                              <input
                                type="text"
                                value={quienRecibio}
                                onChange={e => setQuienRecibio(e.target.value)}
                                placeholder="Nombre de la persona o mesa de entrada externa"
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                              />
                            </label>

                            <label className="mt-3 block text-xs font-semibold text-slate-600">
                              Observaciones
                              <textarea
                                value={obsRec}
                                onChange={e => setObsRec(e.target.value)}
                                rows={3}
                                placeholder="Detalles adicionales o comentarios..."
                                className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                              />
                            </label>

                            {formError && (
                              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
                            )}

                            <div className="mt-4 flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={savingRec}
                                onClick={closeForm}
                                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                disabled={savingRec}
                                onClick={() => void guardarRecepcionExterna(m)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {savingRec ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Guardar Recepción
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!externo && m.fecha_hora_recepcion && isRecibido(m.estado) && (
                      <Badge color="green">Recepción {fmtDateTime(m.fecha_hora_recepcion)}</Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingMov}
        tone="danger"
        title="Eliminar movimiento"
        confirmLabel={deleting ? 'Eliminando…' : 'Eliminar'}
        message={deleteConfirmMessage({
          singular: 'movimiento del historial',
          label: deletingMov
            ? `${asText(deletingMov.area_destino?.nombre) || 'movimiento'} · ${fmtDateTime(deletingMov.fecha_hora_recepcion || deletingMov.fecha_derivacion || deletingMov.created_at)}`
            : null,
        })}
        onCancel={() => {
          if (!deleting) setDeletingMov(null)
        }}
        onConfirm={() => {
          if (!deleting) void eliminarMovimiento()
        }}
      />
    </div>
  )
}

/** Contadores útiles para el pipeline de la ficha 360. */
export async function fetchSeguimientoStats(expedienteId: string) {
  const { data } = await supabase
    .from('expediente_seguimiento')
    .select('id,estado')
    .eq('expediente_id', expedienteId)
  const rows = data ?? []
  let derivaciones = 0
  let recepciones = 0
  for (const r of rows as any[]) {
    const est = String(r.estado ?? '').toLowerCase()
    if (est.includes('derivad')) derivaciones += 1
    if (est.includes('recibid')) recepciones += 1
  }
  return {
    movimientos: rows.length,
    derivaciones,
    recepciones,
  }
}
