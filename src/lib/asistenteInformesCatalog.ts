import type { InformeReportId } from './informesAdminCatalog'
import { INFORMES_ADMIN_REPORTS } from './informesAdminCatalog'

export type InformeFormato = 'pdf' | 'excel' | 'word'

export type AsistenteReportId =
  | 'expedientes'
  | 'strs'
  | 'proyectos'
  | 'auditoria'
  | InformeReportId

/** priority: mayor = más específico (gana ante empates). */
export type AsistenteReportDef = {
  id: AsistenteReportId
  label: string
  aliases: string[]
  /** Frases que deben coincidir casi literalmente (alto peso). */
  phrases?: string[]
  /** Si aparecen, bajan la puntuación de este informe. */
  negative?: string[]
  description: string
  formats: InformeFormato[]
  adminOnly?: boolean
  priority: number
  kind: 'listado' | 'informe'
}

export const ASISTENTE_REPORTS: AsistenteReportDef[] = [
  {
    id: 'expedientes',
    label: 'Listado de expedientes',
    aliases: ['expediente', 'expedientes', 'mesa de entrada'],
    phrases: ['listado de expedientes', 'informe de expedientes', 'expedientes en'],
    negative: ['str', 'proyecto', 'cartera', 'rendicion', 'auditoria'],
    description: 'Expedientes (número, asunto, entidad, estado). Filtros: finalizados / en trámite, fechas.',
    formats: ['pdf', 'excel', 'word'],
    priority: 40,
    kind: 'listado',
  },
  {
    id: 'strs',
    label: 'Listado de STR',
    aliases: ['str', 'strs', 'solicitud de transferencia', 'solicitudes de transferencia'],
    phrases: ['listado de str', 'informe de str', 'strs en', 'solicitudes str'],
    negative: ['cartera', 'pulso', 'cadena', 'cronometro', 'plan vs', 'radar', 'expediente', 'proyecto'],
    description: 'STR con montos, fechas y resoluciones. Filtros por periodo.',
    formats: ['pdf', 'excel', 'word'],
    priority: 45,
    kind: 'listado',
  },
  {
    id: 'proyectos',
    label: 'Listado de proyectos',
    aliases: ['proyecto', 'proyectos'],
    phrases: ['listado de proyectos', 'listado proyectos', 'proyectos en excel', 'proyectos en pdf'],
    negative: ['cartera 360', 'cartera360', 'pulso', 'cadena de ejecucion', 'mapa og', 'radar', 'cronometro', 'plan vs'],
    description: 'Catálogo de proyectos (descripción, programa, componente, monto).',
    formats: ['pdf', 'excel', 'word'],
    priority: 35,
    kind: 'listado',
  },
  {
    id: 'auditoria',
    label: 'Auditoría del sistema',
    aliases: ['auditoria', 'audit', 'logs', 'bitacora'],
    phrases: ['auditoria del sistema', 'logs de auditoria'],
    description: 'Eventos de auditoría (admin/dev).',
    formats: ['excel', 'word', 'pdf'],
    adminOnly: true,
    priority: 50,
    kind: 'listado',
  },
  ...INFORMES_ADMIN_REPORTS.map((r): AsistenteReportDef => {
    const extra: Partial<AsistenteReportDef> = {}
    if (r.id === 'cartera_360') {
      extra.phrases = ['cartera 360', 'cartera360', 'observatorio cartera']
      extra.aliases = ['cartera', '360']
      extra.negative = ['listado de proyectos', 'solo listado']
      extra.priority = 80
    } else if (r.id === 'pulso_mensual') {
      extra.phrases = ['pulso del mes', 'pulso mensual']
      extra.aliases = ['pulso']
      extra.priority = 75
    } else if (r.id === 'cadena_ejecucion') {
      extra.phrases = ['cadena de ejecucion', 'cadena ejecucion', 'cdp actas str']
      extra.aliases = ['cadena']
      extra.priority = 75
    } else if (r.id === 'acta_resolucion_str') {
      extra.phrases = [
        'acta resolucion str',
        'acta vs resolucion vs str',
        'comparar actas resoluciones str',
        'acta resolucion y str',
      ]
      extra.aliases = ['acta resolucion', 'actas resoluciones', 'comparativo acta']
      extra.priority = 78
    } else if (r.id === 'mapa_og_ff') {
      extra.phrases = ['mapa og', 'og x fuente', 'og por fuente', 'mapa og ff']
      extra.aliases = ['mapa', 'og', 'fuente']
      extra.priority = 70
    } else if (r.id === 'radar_rendiciones') {
      extra.phrases = ['radar cgr', 'radar de rendiciones', 'rendiciones atrasadas']
      extra.aliases = ['radar', 'rendicion', 'rendiciones', 'cgr']
      extra.priority = 75
    } else if (r.id === 'cronometro_vs_real') {
      extra.phrases = ['cronometro vs real', 'programado vs desembolsado', 'cronometro']
      extra.aliases = ['cronometro']
      extra.priority = 75
    } else if (r.id === 'plan_vs_str') {
      extra.phrases = ['plan vs str', 'plan financiero vs pagos', 'plan vs pagos']
      extra.aliases = ['plan vs', 'plan financiero']
      extra.priority = 75
    }
    return {
      id: r.id,
      label: r.title,
      aliases: [r.id.replace(/_/g, ' '), ...(extra.aliases ?? [])],
      phrases: [r.title.toLowerCase(), ...(extra.phrases ?? [])],
      negative: extra.negative,
      description: r.description,
      formats: ['pdf', 'excel', 'word'],
      priority: extra.priority ?? 70,
      kind: 'informe',
    }
  }),
]

export function asistenteReportById(id: string): AsistenteReportDef | undefined {
  return ASISTENTE_REPORTS.find(r => r.id === id)
}

export const ASISTENTE_EJEMPLOS = [
  'Radar CGR en Excel que la fecha de presentación esté Atrasada',
  'Expedientes finalizados en Excel',
  'STR en PDF del mes actual',
  'Cartera 360 en PDF 2026',
  'Radar CGR solo presentadas en PDF',
  'Pulso del mes en PDF',
]
