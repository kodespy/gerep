/** Helpers de flujo Derivar / Recepcionar basados en el historial real de seguimiento. */

export type SegMovimiento = {
  id?: string | null
  estado: string | null
  area_destino_id?: string | null
  area_origen_id?: string | null
  fecha_derivacion?: string | null
  fecha_hora_recepcion?: string | null
  created_at?: string | null
  area_destino?: { nombre?: string | null; is_external?: boolean | null } | null
}

export type ExpedienteWorkflowRow = {
  estado?: string | null
  estado_actual?:
    | {
        area_actual_id?: string | null
        estado_actual?: string | null
        area?: { nombre?: string | null } | null
      }
    | {
        area_actual_id?: string | null
        estado_actual?: string | null
        area?: { nombre?: string | null } | null
      }[]
    | null
  seguimiento?: SegMovimiento[] | null
}

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function estadoActualOf(row: ExpedienteWorkflowRow) {
  const raw = row.estado_actual
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

function isDerivado(estado: string | null | undefined): boolean {
  return asText(estado).toLowerCase().includes('derivad')
}

function isRecibido(estado: string | null | undefined): boolean {
  return asText(estado).toLowerCase().includes('recibid')
}

/**
 * Filas que cuentan como “derivación” en el historial.
 * Incluye recepción externa: a veces la misma fila pasa a estado Recibido
 * pero sigue siendo el tramo hacia un área externa (origen ≠ destino).
 */
function esMovimientoDerivacion(m: SegMovimiento): boolean {
  if (isDerivado(m.estado)) return true
  if (
    isRecibido(m.estado) &&
    m.area_destino?.is_external &&
    m.fecha_hora_recepcion &&
    m.area_origen_id &&
    m.area_destino_id &&
    String(m.area_origen_id) !== String(m.area_destino_id)
  ) {
    return true
  }
  return false
}

/** Clave de ordenamiento: created_at > fecha_derivacion > id (más reciente primero). */
function movKey(m: SegMovimiento): string {
  return `${m.created_at || ''}|${m.fecha_derivacion || ''}|${m.id || ''}`
}

export function sortSeguimientoDesc(list: SegMovimiento[]): SegMovimiento[] {
  return [...list].sort((a, b) => movKey(b).localeCompare(movKey(a)))
}

/** True si `a` ocurrió después de `b`. */
function ocurrioDespues(a: SegMovimiento, b: SegMovimiento): boolean {
  return movKey(a).localeCompare(movKey(b)) > 0
}

/** Última derivación del expediente (más reciente). */
export function ultimaDerivacion(row: ExpedienteWorkflowRow): SegMovimiento | null {
  const list = sortSeguimientoDesc(row.seguimiento ?? []).filter(esMovimientoDerivacion)
  return list[0] ?? null
}

/**
 * Hay recepción del ciclo de esa derivación:
 * - la fila Derivado ya tiene fecha_hora_recepcion (recepción externa), o
 * - existe un movimiento Recibido posterior a esa derivación.
 */
export function hayRecepcionTrasDerivacion(
  row: ExpedienteWorkflowRow,
  derivacion: SegMovimiento,
): boolean {
  if (derivacion.fecha_hora_recepcion) return true
  for (const m of row.seguimiento ?? []) {
    if (!isRecibido(m.estado)) continue
    if (ocurrioDespues(m, derivacion)) return true
  }
  return false
}

/** Sin movimientos = mesa de entrada. */
export function esInicioTramite(row: ExpedienteWorkflowRow): boolean {
  return !(row.seguimiento?.length)
}

/**
 * Pendiente de recepción: existe una derivación cuya recepción aún no ocurrió.
 * No confía en expediente_estado_actual (puede quedar desfasado).
 */
export function pendienteRecepcion(row: ExpedienteWorkflowRow): boolean {
  const der = ultimaDerivacion(row)
  if (!der) return false
  return !hayRecepcionTrasDerivacion(row, der)
}

/** Última derivación pendiente apunta a un área externa. */
export function pendienteRecepcionExterna(row: ExpedienteWorkflowRow): boolean {
  if (!pendienteRecepcion(row)) return false
  const der = ultimaDerivacion(row)
  return !!der?.area_destino?.is_external
}

/**
 * Expediente ya recepcionado en una dependencia externa (ellos no usan la app).
 * En este estado hace falta “retornar” / recepcionar de vuelta a un área interna.
 */
export function enDependenciaExterna(row: ExpedienteWorkflowRow): boolean {
  if (!cicloRecibido(row)) return false
  const der = ultimaDerivacion(row)
  return !!der?.area_destino?.is_external
}

/** Área origen de la última derivación (quien envió). */
export function areaOrigenUltimaDerivacionId(row: ExpedienteWorkflowRow): string | null {
  const der = ultimaDerivacion(row)
  return der?.area_origen_id ? String(der.area_origen_id) : null
}

/** Id del movimiento de la última derivación (para actualizar recepción externa). */
export function ultimaDerivacionId(row: ExpedienteWorkflowRow): string | null {
  const der = ultimaDerivacion(row)
  return der?.id ? String(der.id) : null
}

/** Ciclo actual ya recepcionado (última derivación ya tiene recepción). */
export function cicloRecibido(row: ExpedienteWorkflowRow): boolean {
  const der = ultimaDerivacion(row)
  if (!der) {
    // Solo recepciones sin derivación previa (raro): último mov Recibido
    const ultimo = sortSeguimientoDesc(row.seguimiento ?? [])[0]
    return !!ultimo && isRecibido(ultimo.estado)
  }
  return hayRecepcionTrasDerivacion(row, der)
}

/**
 * Área donde “está” el expediente para botones:
 * - si pendiente de recepción → destino de la última derivación
 * - si ya recepcionado → destino de la recepción posterior (o del Derivado externo)
 * - fallback vista / null
 */
export function areaActualId(row: ExpedienteWorkflowRow): string | null {
  const der = ultimaDerivacion(row)
  if (der) {
    if (!hayRecepcionTrasDerivacion(row, der)) {
      return der.area_destino_id ? String(der.area_destino_id) : null
    }
    // Buscar recepción posterior
    const recibos = sortSeguimientoDesc(row.seguimiento ?? []).filter(
      m => isRecibido(m.estado) && ocurrioDespues(m, der),
    )
    if (recibos[0]?.area_destino_id) return String(recibos[0].area_destino_id)
    if (der.area_destino_id) return String(der.area_destino_id)
  }

  const fromView = estadoActualOf(row)?.area_actual_id
  if (fromView) return String(fromView)

  const ultimo = sortSeguimientoDesc(row.seguimiento ?? [])[0]
  return ultimo?.area_destino_id ? String(ultimo.area_destino_id) : null
}

/** Estado textual vigente para UI (Derivado / Recibido / …). */
export function estadoVigente(row: ExpedienteWorkflowRow): string {
  const der = ultimaDerivacion(row)
  if (der) {
    if (!hayRecepcionTrasDerivacion(row, der)) return 'derivado'
    return 'recibido'
  }
  const fromView = asText(estadoActualOf(row)?.estado_actual).toLowerCase()
  if (fromView) return fromView
  const ultimo = sortSeguimientoDesc(row.seguimiento ?? [])[0]
  return asText(ultimo?.estado).toLowerCase()
}

/** Nombre de dependencia actual (prioriza lógica de seguimiento sobre la vista). */
export function dependenciaActualNombre(row: ExpedienteWorkflowRow): string {
  const der = ultimaDerivacion(row)
  if (der) {
    const nombreDer = asText(der.area_destino?.nombre)
    if (!hayRecepcionTrasDerivacion(row, der)) {
      return nombreDer || 'Dependencia destino'
    }
    const recibos = sortSeguimientoDesc(row.seguimiento ?? []).filter(
      m => isRecibido(m.estado) && ocurrioDespues(m, der),
    )
    const nombreRec = asText(recibos[0]?.area_destino?.nombre)
    if (nombreRec) return nombreRec
    if (nombreDer) return nombreDer
  }

  const ea = estadoActualOf(row)
  const n = asText(ea?.area?.nombre)
  if (n) return n
  if (esInicioTramite(row)) return 'Inicio de trámite (Mesa de entrada)'
  return 'Sin dependencia asignada'
}

/** Fecha/hora de recepción del ciclo actual. */
export function fechaHoraRecepcionCiclo(row: ExpedienteWorkflowRow): string | null {
  const der = ultimaDerivacion(row)
  if (!der) return null
  if (der.fecha_hora_recepcion) return der.fecha_hora_recepcion
  const recibos = sortSeguimientoDesc(row.seguimiento ?? []).filter(
    m => isRecibido(m.estado) && ocurrioDespues(m, der),
  )
  const r = recibos[0]
  if (!r) return null
  return r.fecha_hora_recepcion || r.fecha_derivacion || null
}
