export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export interface DistribucionOgRow {
  og: string
  montos: number[]
  total: number
}

export interface DistribucionOgAnio {
  anio: number
  rows: DistribucionOgRow[]
  totalesMes: number[]
  totalAnio: number
}

/** Formato Gs. 1.234.567 (como en el cronograma de referencia). */
export function fmtGs(v: number | null | undefined): string {
  const n = Math.round(Number(v) || 0)
  const formatted = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `Gs. ${n < 0 ? '-' : ''}${formatted}`
}

function ogFromPlan(plan: any): string {
  const codigo = (plan?.objeto?.codigo ?? '').trim()
  return codigo || '—'
}

/** Agrupa la distribución mensual por año y código OG (sumando todas las líneas del plan). */
export function buildDistribucionPorOgAnio(cronograma: any[], planes: any[]): DistribucionOgAnio[] {
  const planById = new Map(planes.map(p => [p.id, p]))
  const byYear = new Map<number, Map<string, number[]>>()

  for (const row of cronograma) {
    const anio = Number(row.anio) || 0
    const mes = Number(row.mes)
    if (!anio || mes < 1 || mes > 12) continue
    const planId = row.plan_financiero_id ?? row.plan?.id
    const plan = planById.get(planId) ?? row.plan
    const og = ogFromPlan(plan)
    if (!byYear.has(anio)) byYear.set(anio, new Map())
    const yearMap = byYear.get(anio)!
    if (!yearMap.has(og)) yearMap.set(og, Array(12).fill(0))
    yearMap.get(og)![mes - 1] += Number(row.monto_programado) || 0
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([anio, ogMap]) => {
      const rows = [...ogMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
        .map(([og, montos]) => ({
          og,
          montos,
          total: montos.reduce((s, m) => s + m, 0),
        }))
      const totalesMes = Array(12).fill(0)
      let totalAnio = 0
      for (const row of rows) {
        row.montos.forEach((m, i) => { totalesMes[i] += m })
        totalAnio += row.total
      }
      return { anio, rows, totalesMes, totalAnio }
    })
}
