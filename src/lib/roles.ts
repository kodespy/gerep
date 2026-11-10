export type AppRole = 'administrador' | 'desarrollador' | 'usuario' | string

export function normalizeRole(role: string | null | undefined): string {
  return (role ?? 'usuario').trim().toLowerCase()
}

export function isDesarrollador(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'desarrollador'
}

/** Administrador o desarrollador (acceso a RRHH, usuarios, config avanzada). */
export function isAdminOrDev(role: string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'administrador' || r === 'desarrollador'
}

export function canConfigureAsistencia(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

export function canManageUsuarios(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

/** Menú Sistema (usuarios, auditoría). */
export function canAccessSistema(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

/** Menú y pantallas de RRHH (áreas, funcionarios, reporte de marcaciones). */
export function canAccessRrhh(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

/** Claves de módulo reservadas a admin/dev. */
export const RRHH_MODULO_KEYS = ['areas', 'funcionarios', 'marcaciones'] as const
export const SISTEMA_MODULO_KEYS = [
  'usuarios',
  'auditoria',
  'control_documental_proyectos',
  'control_documental_str',
  'control_rendiciones_cuentas',
] as const

export function isRrhhModulo(moduloKey: string | null | undefined): boolean {
  return !!moduloKey && (RRHH_MODULO_KEYS as readonly string[]).includes(moduloKey)
}

export function isSistemaModulo(moduloKey: string | null | undefined): boolean {
  return !!moduloKey && (SISTEMA_MODULO_KEYS as readonly string[]).includes(moduloKey)
}

/** Administrador o desarrollador pueden reabrir un expediente finalizado. */
export function canReactivarExpediente(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

/** Administrador o desarrollador pueden eliminar un movimiento del historial de expediente. */
export function canEliminarHistorialExpediente(role: string | null | undefined): boolean {
  return isAdminOrDev(role)
}

/** Expediente cerrado: no se deriva ni se mueve el trámite. */
export function esExpedienteFinalizado(row: {
  estado_finalizado?: boolean | null
  estado?: string | null
} | null | undefined): boolean {
  if (!row) return false
  if (row.estado_finalizado) return true
  return String(row.estado ?? '').trim().toLowerCase() === 'finalizado'
}
