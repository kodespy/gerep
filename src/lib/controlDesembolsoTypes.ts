/** Tipos y plantilla del Control de Desembolsos · Gestión Operacional. */

import {
  formatObjetosGasto,
  newItem,
  parseObjetosGasto,
  type EstadoVerif,
  type ItemVerif,
  type ObjetoGastoRef,
} from './informeTecnicoTypes'

export type { EstadoVerif, ItemVerif, ObjetoGastoRef }
export { formatObjetosGasto, parseObjetosGasto }

export type ControlDesembolsoDraft = {
  id?: string
  numero: string
  entidad_proponente: string
  monto_total: string
  monto_desembolsado: string
  monto_solicitado: string
  objetos_gasto: ObjetoGastoRef[]
  marco_normativo: string
  fecha_verificacion: string
  elaborador_por: string
  verificacion_documental: ItemVerif[]
  /** HTML de texto enriquecido. */
  observaciones: string
  archivo_firmado?: string | null
}

/** Checklist del formato institucional de aprobación de desembolso. */
export function defaultDesembolsoDocumental(): ItemVerif[] {
  return [
    newItem('Fecha de Ingreso (Primeros 10 días hábiles de cada mes)', ''),
    newItem('Nota de Solicitud de Desembolso', '', {
      detalle: 'Dirigida a la Coord. Gral. de la UEP, firmada por autoridades.',
    }),
    newItem('Informe de Rendición de Cuentas', '', {
      detalle: 'De desembolsos anteriores (periodos bimestrales).',
    }),
    newItem('Acta Extraordinaria de Comisión Directiva (COP)', '', {
      detalle: 'Aprobación interna para la prosecución del proyecto.',
    }),
    newItem('Certificado de Avance (Solo Obras)', '', {
      detalle: 'Con firma de fiscalización y contratista.',
    }),
    newItem('Cuadro de Desembolso', '', {
      detalle: 'Con firmas originales de los responsables financieros.',
    }),
    newItem('Registro de Entidad', '', {
      detalle: 'Documentación actualizada en el Registro de Entidades.',
    }),
  ]
}

export function emptyControlDesembolsoDraft(
  partial?: Partial<ControlDesembolsoDraft>,
): ControlDesembolsoDraft {
  return {
    numero: '',
    entidad_proponente: '',
    monto_total: '',
    monto_desembolsado: '',
    monto_solicitado: '',
    objetos_gasto: [],
    marco_normativo: 'Resolución SND N.º 227/2026',
    fecha_verificacion: '',
    elaborador_por: '',
    verificacion_documental: defaultDesembolsoDocumental(),
    observaciones: '',
    archivo_firmado: null,
    ...partial,
  }
}

export function suggestNumeroControlDesembolso(existing: string[]): string {
  const year = new Date().getFullYear()
  const prefix = `FC-${year}-`
  let max = 0
  for (const n of existing) {
    const m = String(n).trim().toUpperCase().match(/^FC-(\d{4})-(\d{4})$/)
    if (!m) continue
    if (Number(m[1]) !== year) continue
    max = Math.max(max, Number(m[2]) || 0)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function controlDesembolsoStats(d: ControlDesembolsoDraft) {
  const items = d.verificacion_documental
  const total = items.length
  const done = items.filter(i => i.estado).length
  const cumple = items.filter(i => i.estado === 'cumple').length
  const noCumple = items.filter(i => i.estado === 'no_cumple').length
  const noAplica = items.filter(i => i.estado === 'no_aplica').length
  const pct = total ? Math.round((done / total) * 100) : 0
  return { total, done, cumple, noCumple, noAplica, pct }
}
