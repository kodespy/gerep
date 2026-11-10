/** Catálogo de informes administrativos y financieros. */

export type InformeFilterMode = 'range' | 'month' | 'year'

export type InformeReportId =
  | 'cartera_360'
  | 'pulso_mensual'
  | 'cadena_ejecucion'
  | 'acta_resolucion_str'
  | 'mapa_og_ff'
  | 'radar_rendiciones'
  | 'cronometro_vs_real'
  | 'plan_vs_str'

export type InformeReportDef = {
  id: InformeReportId
  title: string
  tagline: string
  description: string
  filterMode: InformeFilterMode
  accent: string
  requiresMonth?: boolean
}

export const INFORMES_ADMIN_REPORTS: InformeReportDef[] = [
  {
    id: 'cartera_360',
    title: 'Cartera 360°',
    tagline: 'Plan, pagos y saldo en un vistazo',
    description:
      'Listado de proyectos filtrado por estructura programática y fechas, con plan vigente, STR neto, avance y saldo disponible.',
    filterMode: 'range',
    accent: 'from-slate-700 to-slate-800',
  },
  {
    id: 'pulso_mensual',
    title: 'Pulso del mes',
    tagline: 'Saldos previos y compromisos del mes',
    description:
      'Saldo anterior, CDP y desembolsos del mes elegido, y disponible al cierre para anticipar compromisos.',
    filterMode: 'month',
    accent: 'from-teal-600 to-teal-700',
    requiresMonth: true,
  },
  {
    id: 'cadena_ejecucion',
    title: 'Cadena de ejecución',
    tagline: 'CDP → Actas → STR',
    description:
      'Compara compromiso, actas aprobadas y desembolsos por proyecto para detectar brechas de sub o sobre-ejecución.',
    filterMode: 'range',
    accent: 'from-amber-600 to-orange-700',
  },
  {
    id: 'acta_resolucion_str',
    title: 'Acta · Resolución · STR',
    tagline: 'Comparativo por cada STR',
    description:
      'Por cada STR: monto del proyecto (con modificaciones), STR ejecutado, saldo del proyecto (Proy. total − STR ejec.), plan/ejecutado/saldo de la resolución y acta aprobado/ejecutado/saldo de la acta vinculada.',
    filterMode: 'range',
    accent: 'from-violet-600 to-indigo-700',
  },
  {
    id: 'mapa_og_ff',
    title: 'Mapa OG × Fuente',
    tagline: 'Plan vs ejecutado cruzado',
    description:
      'Cruza objeto de gasto y fuente de financiamiento: plan vigente frente a STR neto.',
    filterMode: 'range',
    accent: 'from-sky-600 to-sky-700',
  },
  {
    id: 'radar_rendiciones',
    title: 'Radar CGR',
    tagline: 'Rendiciones y atrasos',
    description:
      'Estado de rendiciones: a rendir, presentadas, atrasadas y montos asociados a cada STR/proyecto.',
    filterMode: 'range',
    accent: 'from-rose-600 to-rose-700',
  },
  {
    id: 'cronometro_vs_real',
    title: 'Cronómetro vs real',
    tagline: 'Programado vs desembolsado',
    description:
      'Compara el cronograma financiero programado con los desembolsos STR reales por mes.',
    filterMode: 'range',
    accent: 'from-emerald-600 to-emerald-700',
  },
  {
    id: 'plan_vs_str',
    title: 'Plan financiero vs pagos',
    tagline: 'Seguimiento de ejecución de caja',
    description:
      'Visualiza la desviación entre la programación financiera mensual y los pagos efectivamente realizados (STR), con diferencia y total general.',
    filterMode: 'year',
    accent: 'from-cyan-700 to-teal-800',
  },
]

export function informeById(id: InformeReportId): InformeReportDef | undefined {
  return INFORMES_ADMIN_REPORTS.find(r => r.id === id)
}
