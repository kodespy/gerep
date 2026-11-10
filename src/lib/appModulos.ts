/** Catálogo de módulos de la aplicación (clave estable → menú / permisos). */
export type ModuloRol = 'usuario' | 'administrador' | 'desarrollador'

export interface AppModuloDef {
  key: string
  label: string
  section: string
  /** Rutas que habilita este módulo (prefijo o path exacto). */
  paths: string[]
}

export const APP_MODULOS: AppModuloDef[] = [
  { key: 'dashboard', label: 'Panel de control', section: 'General', paths: ['/'] },
  { key: 'expedientes', label: 'Expedientes', section: 'General', paths: ['/expedientes'] },
  { key: 'memos', label: 'Memos', section: 'General', paths: ['/memos'] },
  { key: 'actividades', label: 'Actividades', section: 'Planificación', paths: ['/planificacion/actividades'] },
  { key: 'programas', label: 'Estructura programática', section: 'Planificación', paths: ['/planificacion/programas'] },
  { key: 'planes_admin', label: 'Planes administrativos', section: 'Planificación', paths: ['/planificacion/planes-administrativos'] },
  { key: 'proyectos', label: 'Proyectos', section: 'Ejecución', paths: ['/proyectos'] },
  { key: 'cdp', label: 'CDP', section: 'Ejecución', paths: ['/cdp'] },
  { key: 'actas', label: 'Actas', section: 'Ejecución', paths: ['/actas'] },
  { key: 'resoluciones', label: 'Resoluciones', section: 'Ejecución', paths: ['/resoluciones'] },
  { key: 'convenios', label: 'Convenios', section: 'Ejecución', paths: ['/convenios'] },
  { key: 'str', label: 'STR · Solicitudes', section: 'Pagos', paths: ['/pagos/str'] },
  { key: 'devoluciones', label: 'Devoluciones', section: 'Pagos', paths: ['/pagos/devoluciones'] },
  { key: 'rendiciones', label: 'Rendiciones de cuentas', section: 'Rendición', paths: ['/rendiciones'] },
  {
    key: 'informes_admin_fin',
    label: 'Informes administrativos y financieros',
    section: 'Informes',
    paths: ['/informes/admin-financieros'],
  },
  {
    key: 'asistente_informes',
    label: 'Asistente de informes',
    section: 'Informes',
    paths: ['/informes/asistente'],
  },
  { key: 'entidades', label: 'Entidades', section: 'Catálogos', paths: ['/catalogos/entidades'] },
  { key: 'proveedores', label: 'Proveedores', section: 'Catálogos', paths: ['/catalogos/proveedores'] },
  { key: 'fuentes', label: 'Fuentes de financiamiento', section: 'Catálogos', paths: ['/catalogos/fuentes'] },
  { key: 'objetos_gasto', label: 'Objetos de gasto', section: 'Catálogos', paths: ['/catalogos/objetos-gasto'] },
  { key: 'areas', label: 'Áreas', section: 'RRHH', paths: ['/catalogos/areas'] },
  { key: 'funcionarios', label: 'Funcionarios', section: 'RRHH', paths: ['/catalogos/funcionarios'] },
  { key: 'marcaciones', label: 'Reporte de marcaciones', section: 'RRHH', paths: ['/marcaciones'] },
  { key: 'usuarios', label: 'Usuarios', section: 'Sistema', paths: ['/usuarios'] },
  { key: 'auditoria', label: 'Auditoría', section: 'Sistema', paths: ['/auditoria'] },
  {
    key: 'control_documental_proyectos',
    label: 'Control documental de proyectos',
    section: 'Sistema',
    paths: ['/sistema/control-documental-proyectos'],
  },
  {
    key: 'control_documental_str',
    label: 'Control documental de STR',
    section: 'Sistema',
    paths: ['/sistema/control-documental-str'],
  },
  {
    key: 'control_rendiciones_cuentas',
    label: 'Control de rendiciones de cuentas',
    section: 'Sistema',
    paths: ['/sistema/control-rendiciones-cuentas'],
  },
  { key: 'perfil', label: 'Mi perfil', section: 'General', paths: ['/perfil'] },
  {
    key: 'documentaciones',
    label: 'Documentaciones',
    section: 'General',
    paths: ['/documentaciones'],
  },
]

export const MODULO_ROL_OPTIONS: { value: ModuloRol; label: string }[] = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'desarrollador', label: 'Desarrollador' },
]

export function moduloByKey(key: string): AppModuloDef | undefined {
  return APP_MODULOS.find(m => m.key === key)
}

/** Agrupa módulos por sección para la UI. */
export function modulosPorSeccion(): { section: string; items: AppModuloDef[] }[] {
  const map = new Map<string, AppModuloDef[]>()
  for (const m of APP_MODULOS) {
    const list = map.get(m.section)
    if (list) list.push(m)
    else map.set(m.section, [m])
  }
  return [...map.entries()].map(([section, items]) => ({ section, items }))
}

/** Resuelve la clave de módulo a partir de una ruta. */
export function moduloKeyFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  // Match longest path first
  const sorted = [...APP_MODULOS].sort((a, b) => {
    const pa = a.paths[0]?.length ?? 0
    const pb = b.paths[0]?.length ?? 0
    return pb - pa
  })
  for (const m of sorted) {
    for (const p of m.paths) {
      if (p === '/') {
        if (path === '/') return m.key
        continue
      }
      if (path === p || path.startsWith(p + '/')) return m.key
    }
  }
  return null
}
