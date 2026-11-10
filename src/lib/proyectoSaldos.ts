/** Saldo disponible = Plan vigente − Desembolsado STR (neto). */
export function calcSaldoPorDesembolsar(planVigente: number, desembolsadoStrNeto: number): number {
  return planVigente - desembolsadoStrNeto
}

/** STR neto efectivo = STR bruto − Devoluciones. */
export function calcStrNeto(strBruto: number, devoluciones: number): number {
  return strBruto - devoluciones
}

/**
 * Saldo disponible = Plan vigente − STR neto efectivo.
 */
export function calcSaldoDisponible(planVigente: number, strBruto: number, devoluciones: number): number {
  return calcSaldoPorDesembolsar(planVigente, calcStrNeto(strBruto, devoluciones))
}

/** Avance de desembolso (%) sobre el plan vigente. */
export function calcAvanceDesembolso(planVigente: number, desembolsadoStrNeto: number): number {
  if (planVigente <= 0) return 0
  return Math.min(100, Math.round((desembolsadoStrNeto / planVigente) * 100))
}
