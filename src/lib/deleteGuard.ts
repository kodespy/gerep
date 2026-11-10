import { supabase } from './supabase'

export type DeleteDependency = {
  table: string
  column: string
  label: string
}

export type DeleteVinculo = {
  label: string
  count: number
}

/**
 * Dependencias conocidas: si existen filas hijas, se bloquea el borrado del padre.
 * Ampliar aquí cuando se agreguen nuevas relaciones.
 */
export const TABLE_DELETE_DEPENDENCIES: Record<string, DeleteDependency[]> = {
  proyectos: [
    { table: 'planes_financieros', column: 'proyecto_id', label: 'Líneas de plan financiero' },
    { table: 'budget_commitments', column: 'proyecto_id', label: 'CDP' },
    { table: 'actas', column: 'proyecto_id', label: 'Actas' },
    { table: 'resolution_proyectos', column: 'proyecto_id', label: 'Resoluciones' },
    { table: 'convenios', column: 'proyecto_id', label: 'Convenios' },
    { table: 'strs', column: 'proyecto_id', label: 'STR · Pagos' },
    { table: 'proyecto_adjuntos', column: 'proyecto_id', label: 'Archivos' },
    { table: 'proyecto_control_formularios', column: 'proyecto_id', label: 'Formularios de control' },
    { table: 'proyecto_informes_tecnicos', column: 'proyecto_id', label: 'Informes técnicos' },
  ],
  planes_financieros: [
    { table: 'adendas', column: 'plan_financiero_id', label: 'Adendas' },
    { table: 'cronograma_financiero', column: 'plan_financiero_id', label: 'Cronograma financiero' },
    { table: 'acta_items', column: 'plan_financiero_id', label: 'Ítems de actas' },
  ],
  adendas: [
    { table: 'acta_items', column: 'adenda_id', label: 'Ítems de actas (aprobación / desembolso de la adenda)' },
  ],
  planes_financieros_administrativos: [
    { table: 'cronograma_administrativo', column: 'plan_administrativo_id', label: 'Cronograma administrativo' },
    { table: 'modificaciones_administrativas', column: 'plan_administrativo_id', label: 'Modificaciones' },
    { table: 'proyectos', column: 'plan_administrativo_id', label: 'Proyectos' },
  ],
  actas: [
    { table: 'acta_items', column: 'acta_id', label: 'Ítems del acta' },
    { table: 'strs', column: 'acta_id', label: 'STR vinculados' },
  ],
  resolutions: [
    { table: 'resolution_items', column: 'resolution_id', label: 'Ítems del plan presupuestario' },
    { table: 'resolution_proyectos', column: 'resolution_id', label: 'Proyectos vinculados' },
    { table: 'strs', column: 'resolution_id', label: 'STR' },
  ],
  resolution_items: [
    { table: 'strs', column: 'resolution_item_id', label: 'STR' },
  ],
  strs: [
    { table: 'devoluciones', column: 'str_id', label: 'Devoluciones' },
    { table: 'rendiciones_cuentas', column: 'str_id', label: 'Rendiciones' },
    { table: 'str_archivos', column: 'str_id', label: 'Archivos del STR' },
    { table: 'str_documento_control', column: 'str_id', label: 'Formularios de control documental' },
  ],
  rendiciones_cuentas: [
    { table: 'rendicion_archivos', column: 'rendicion_id', label: 'Archivos de rendición' },
    { table: 'rendicion_control_formularios', column: 'rendicion_id', label: 'Formularios de control' },
  ],
  expedientes: [
    { table: 'proyectos', column: 'expediente_id', label: 'Proyectos' },
    { table: 'expediente_adjuntos', column: 'expediente_id', label: 'Adjuntos' },
    { table: 'expediente_seguimiento', column: 'expediente_id', label: 'Seguimientos' },
    { table: 'expediente_desarrollos', column: 'expediente_id', label: 'Ítems de desarrollo' },
  ],
  programas: [
    { table: 'actividades', column: 'programa_id', label: 'Actividades' },
    { table: 'planes_financieros_administrativos', column: 'programa_id', label: 'Planes administrativos' },
  ],
  actividades: [
    { table: 'componentes_programa', column: 'actividad_id', label: 'Componentes' },
    { table: 'planes_financieros_administrativos', column: 'actividad_id', label: 'Planes administrativos' },
  ],
  componentes_programa: [
    { table: 'proyectos', column: 'componente_id', label: 'Proyectos' },
  ],
  proveedores: [
    { table: 'planes_financieros', column: 'proveedor_id', label: 'Líneas de plan financiero' },
  ],
  objetos_de_gastos: [
    { table: 'planes_financieros', column: 'objeto_de_gasto_id', label: 'Líneas de plan financiero' },
    { table: 'strs', column: 'og_id', label: 'STR' },
    { table: 'devoluciones', column: 'objeto_gasto_id', label: 'Devoluciones' },
    { table: 'resolution_items', column: 'og_id', label: 'Ítems de resoluciones' },
  ],
  fuentes_financiamiento: [
    { table: 'planes_financieros', column: 'fuente_financiamiento_id', label: 'Líneas de plan financiero' },
    { table: 'strs', column: 'fuente_id', label: 'STR' },
  ],
  funcionarios: [
    { table: 'memos', column: 'de_funcionario_id', label: 'Memos (De)' },
    { table: 'memos', column: 'para_funcionario_id', label: 'Memos (Para)' },
  ],
}

/** Mensaje estándar de confirmación antes de borrar. */
export function deleteConfirmMessage(opts?: {
  singular?: string
  label?: string | null
}): string {
  const singular = (opts?.singular ?? '').trim()
  const label = (opts?.label ?? '').trim()
  if (label) {
    const what = singular || 'registro'
    return `¿Desea eliminar ${what.toLowerCase()} "${label}"? Esta acción no se puede deshacer.`
  }
  if (singular) {
    return `¿Desea eliminar este registro (${singular})? Esta acción no se puede deshacer.`
  }
  return '¿Desea eliminar este registro? Esta acción no se puede deshacer.'
}

/** Interpreta errores de FK / restricciones al borrar. */
export function friendlyDeleteError(error: { message?: string; code?: string; details?: string } | null | undefined): string {
  if (!error) return 'No se pudo eliminar el registro.'
  const msg = `${error.message ?? ''} ${error.details ?? ''}`
  const code = error.code ?? ''
  if (
    code === '23503'
    || /23503/.test(msg)
    || /foreign key|violates foreign key|is still referenced|restrict|clave foránea|integridad referencial/i.test(msg)
  ) {
    return 'No se puede eliminar el registro porque está vinculado con otros datos del sistema. Elimine o reasigne los registros relacionados e intente nuevamente.'
  }
  return (error.message ?? '').trim() || 'No se pudo eliminar el registro.'
}

/** Cuenta vínculos en tablas dependientes conocidas. */
export async function findDeleteVinculos(
  table: string,
  id: string,
  extra?: DeleteDependency[],
): Promise<DeleteVinculo[]> {
  const deps = [
    ...(TABLE_DELETE_DEPENDENCIES[table] ?? []),
    ...(extra ?? []),
  ]
  if (!deps.length || !id) return []

  const results = await Promise.all(
    deps.map(async dep => {
      try {
        const { count, error } = await supabase
          .from(dep.table)
          .select('id', { count: 'exact', head: true })
          .eq(dep.column, id)
        if (error) {
          // Columna/tabla inexistente en este entorno: ignorar
          if (/does not exist|PGRST|column|schema cache/i.test(error.message)) return null
          console.warn(`deleteGuard: ${dep.table}.${dep.column}`, error.message)
          return null
        }
        const n = count ?? 0
        return n > 0 ? { label: dep.label, count: n } : null
      } catch {
        return null
      }
    }),
  )

  return results.filter((v): v is DeleteVinculo => !!v)
}

/** Intenta borrar; si hay FK u otro error, lanza Error con mensaje amigable. */
export async function safeDeleteById(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(friendlyDeleteError(error))
}
