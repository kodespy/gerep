import { supabase } from './supabase'
import { ajusteAdenda } from './planVigente'
import { calcAvanceDesembolso, calcSaldoDisponible, calcStrNeto } from './proyectoSaldos'

export type ProveedorRef = {
  id: string
  razon_social?: string | null
  documento?: string | null
}

export type StrDetalle = {
  id: string
  numero: string
  fecha: string | null
  og: string
  fuente: string
  monto: number
  devoluciones: number
  neto: number
  /** Saldo del proyecto después de este STR (plan vigente − STR neto acumulado). */
  saldo: number
}

export type ProyectoVinculado = {
  id: string
  descripcion: string
  /** Suma de las líneas del plan financiero asignadas a este proveedor. */
  montoProveedor: number
  planBase: number
  planVigente: number
  strBruto: number
  devoluciones: number
  strNeto: number
  saldo: number
  avancePct: number
  strs: StrDetalle[]
}

export type ProveedorProyectosTotales = {
  monto: number
  ejecutado: number
  saldo: number
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

export function sumBy<T>(rows: T[], fn: (r: T) => number): number {
  return rows.reduce((s, r) => s + fn(r), 0)
}

export function totalesProveedor(proyectos: ProyectoVinculado[]): ProveedorProyectosTotales {
  return {
    monto: sumBy(proyectos, p => p.planVigente),
    ejecutado: sumBy(proyectos, p => p.strNeto),
    saldo: sumBy(proyectos, p => p.saldo),
  }
}

/** El proveedor no cubre todo el plan del proyecto (hay otros proveedores en el plan). */
export function esParticipacionParcial(p: ProyectoVinculado): boolean {
  return Math.round(p.montoProveedor) !== Math.round(p.planBase)
}

/** Proyectos donde el proveedor figura en el plan financiero, con saldos por STR. */
export async function loadProyectosVinculados(proveedorId: string): Promise<ProyectoVinculado[]> {
  const { data: lineas, error: lineasErr } = await supabase
    .from('planes_financieros')
    .select('proyecto_id, monto')
    .eq('proveedor_id', proveedorId)
  if (lineasErr) throw lineasErr

  const ids = [...new Set((lineas ?? []).map(l => String(l.proyecto_id ?? '')).filter(Boolean))]
  if (!ids.length) return []

  const [proys, planes, adendas, strs, devs] = await Promise.all([
    supabase.from('proyectos').select('id, descripcion, monto').in('id', ids),
    supabase.from('planes_financieros').select('proyecto_id, monto').in('proyecto_id', ids),
    supabase
      .from('adendas')
      .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)')
      .in('plan.proyecto_id', ids),
    supabase
      .from('strs')
      .select('id, proyecto_id, numero, fecha, monto, og:objetos_de_gastos(codigo), fuente:fuentes_financiamiento(descripcion)')
      .in('proyecto_id', ids)
      .order('fecha', { ascending: true })
      .order('numero', { ascending: true }),
    supabase
      .from('devoluciones')
      .select('str_id, monto, str:strs!inner(proyecto_id)')
      .in('str.proyecto_id', ids),
  ])
  const failed = [proys, planes, adendas, strs, devs].find(r => r.error)
  if (failed?.error) throw failed.error

  const devPorStr = new Map<string, number>()
  for (const d of devs.data ?? []) {
    const key = String(d.str_id ?? '')
    devPorStr.set(key, (devPorStr.get(key) ?? 0) + (Number(d.monto) || 0))
  }

  return (proys.data ?? [])
    .map(p => {
      const id = String(p.id)
      const planBase = sumBy((planes.data ?? []).filter(l => String(l.proyecto_id) === id), l => Number(l.monto) || 0)
        || Number(p.monto) || 0
      const adendaTotal = sumBy(
        (adendas.data ?? []).filter((a: any) => String(nest(a.plan)?.proyecto_id) === id),
        (a: any) => ajusteAdenda(a),
      )
      const planVigente = planBase + adendaTotal

      let netoAcumulado = 0
      const strRows: StrDetalle[] = (strs.data ?? [])
        .filter(s => String(s.proyecto_id) === id)
        .map((s: any) => {
          const monto = Number(s.monto) || 0
          const devoluciones = devPorStr.get(String(s.id)) ?? 0
          const neto = calcStrNeto(monto, devoluciones)
          netoAcumulado += neto
          return {
            id: String(s.id),
            numero: String(s.numero ?? '—'),
            fecha: s.fecha ?? null,
            og: nest(s.og)?.codigo ?? '—',
            fuente: nest(s.fuente)?.descripcion ?? '—',
            monto,
            devoluciones,
            neto,
            saldo: planVigente - netoAcumulado,
          }
        })

      const strBruto = sumBy(strRows, s => s.monto)
      const devolTotal = sumBy(strRows, s => s.devoluciones)
      const strNeto = calcStrNeto(strBruto, devolTotal)
      return {
        id,
        descripcion: String(p.descripcion ?? '—'),
        montoProveedor: sumBy((lineas ?? []).filter(l => String(l.proyecto_id) === id), l => Number(l.monto) || 0),
        planBase,
        planVigente,
        strBruto,
        devoluciones: devolTotal,
        strNeto,
        saldo: calcSaldoDisponible(planVigente, strBruto, devolTotal),
        avancePct: calcAvanceDesembolso(planVigente, strNeto),
        strs: strRows,
      }
    })
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
}
