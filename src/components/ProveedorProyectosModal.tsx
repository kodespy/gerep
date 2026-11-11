import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState, LoadErrorState, Modal, Spinner } from './ui'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMoney } from '../lib/format'
import { ajusteAdenda } from '../lib/planVigente'
import { calcAvanceDesembolso, calcSaldoDisponible, calcStrNeto } from '../lib/proyectoSaldos'

type StrDetalle = {
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

type ProyectoVinculado = {
  id: string
  descripcion: string
  /** Suma de las líneas del plan financiero asignadas a este proveedor. */
  montoProveedor: number
  planBase: number
  planVigente: number
  strNeto: number
  saldo: number
  avancePct: number
  strs: StrDetalle[]
}

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function sumBy<T>(rows: T[], fn: (r: T) => number): number {
  return rows.reduce((s, r) => s + fn(r), 0)
}

async function loadProyectosVinculados(proveedorId: string): Promise<ProyectoVinculado[]> {
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
        strNeto,
        saldo: calcSaldoDisponible(planVigente, strBruto, devolTotal),
        avancePct: calcAvanceDesembolso(planVigente, strNeto),
        strs: strRows,
      }
    })
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
}

function Kpi({ label, value, tone = 'text-slate-800' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function saldoTone(v: number): string {
  return v < 0 ? 'text-rose-600' : 'text-emerald-700'
}

function ProyectoBlock({ p, defaultOpen }: { p: ProyectoVinculado; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const devolTotal = sumBy(p.strs, s => s.devoluciones)
  const brutoTotal = sumBy(p.strs, s => s.monto)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 bg-white px-3 py-2.5 text-left hover:bg-brand-50/40 dark:bg-slate-900"
      >
        {open
          ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{p.descripcion}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {p.strs.length} STR · Avance {p.avancePct}%
            {Math.round(p.montoProveedor) !== Math.round(p.planBase) && (
              <> · Líneas del proveedor en el plan: <span className="font-semibold tabular-nums">{fmtMoney(p.montoProveedor)}</span></>
            )}
          </p>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-slate-400">Monto</dt>
            <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{fmtMoney(p.planVigente)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-slate-400">Ejecutado</dt>
            <dd className="font-semibold tabular-nums text-brand-700">{fmtMoney(p.strNeto)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-slate-400">Saldo</dt>
            <dd className={`font-semibold tabular-nums ${saldoTone(p.saldo)}`}>{fmtMoney(p.saldo)}</dd>
          </div>
        </dl>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          {p.strs.length === 0 ? (
            <p className="py-2 text-center text-xs text-slate-400">Sin STR registrados: el saldo es el monto total del proyecto.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-700">
                    <th className="py-1.5 pr-2 font-semibold">N° STR</th>
                    <th className="py-1.5 pr-2 font-semibold">Fecha</th>
                    <th className="py-1.5 pr-2 font-semibold">OG</th>
                    <th className="py-1.5 pr-2 font-semibold">Fuente</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Monto STR</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Devoluciones</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Ejecutado</th>
                    <th className="py-1.5 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {p.strs.map(s => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="py-1.5 pr-2 font-semibold text-brand-700">{s.numero}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{fmtDate(s.fecha)}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{s.og}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{s.fuente}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(s.monto)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                        {s.devoluciones ? fmtMoney(s.devoluciones) : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{fmtMoney(s.neto)}</td>
                      <td className={`py-1.5 text-right font-semibold tabular-nums ${saldoTone(s.saldo)}`}>{fmtMoney(s.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-bold dark:border-slate-600">
                    <td className="py-1.5 pr-2" colSpan={4}>Total</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(brutoTotal)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{devolTotal ? fmtMoney(devolTotal) : '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(p.strNeto)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${saldoTone(p.saldo)}`}>{fmtMoney(p.saldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="mt-2 text-right">
            <Link to={`/proyectos/${p.id}?tab=str`} className="text-xs font-medium text-brand-600 hover:underline">
              Ver ficha del proyecto →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProveedorProyectosModal({
  proveedor,
  onClose,
}: {
  proveedor: { id: string; razon_social?: string | null } | null
  onClose: () => void
}) {
  const [proyectos, setProyectos] = useState<ProyectoVinculado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const proveedorId = proveedor?.id ? String(proveedor.id) : null

  const load = useCallback(async () => {
    if (!proveedorId) return
    setProyectos(null)
    setError(null)
    try {
      setProyectos(await loadProyectosVinculados(proveedorId))
    } catch (e: any) {
      setError(e?.message ?? 'Error desconocido')
    }
  }, [proveedorId])

  useEffect(() => { void load() }, [load])

  const totales = useMemo(() => {
    const list = proyectos ?? []
    return {
      monto: sumBy(list, p => p.planVigente),
      ejecutado: sumBy(list, p => p.strNeto),
      saldo: sumBy(list, p => p.saldo),
    }
  }, [proyectos])

  return (
    <Modal
      open={!!proveedor}
      onClose={onClose}
      wide
      title={(
        <span>
          Proyectos vinculados
          <span className="mt-0.5 block text-sm font-normal text-slate-500">{proveedor?.razon_social ?? ''}</span>
        </span>
      )}
    >
      {error ? (
        <LoadErrorState detail={error} onRetry={() => void load()} />
      ) : !proyectos ? (
        <Spinner label="Cargando proyectos vinculados…" />
      ) : proyectos.length === 0 ? (
        <EmptyState
          title="Sin proyectos vinculados"
          hint="El proveedor no figura en ninguna línea del plan financiero de un proyecto."
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Kpi label={`Monto total (${proyectos.length} proyecto${proyectos.length === 1 ? '' : 's'})`} value={fmtMoney(totales.monto)} />
            <Kpi label="Ejecutado (STR neto)" value={fmtMoney(totales.ejecutado)} tone="text-brand-700" />
            <Kpi label="Saldo" value={fmtMoney(totales.saldo)} tone={saldoTone(totales.saldo)} />
          </div>
          <p className="text-[11px] text-slate-500">
            Monto = plan financiero vigente del proyecto (incluye adendas). Ejecutado = STR menos devoluciones.
            El saldo de cada STR es lo que queda del proyecto después de ese pago.
          </p>
          {proyectos.map(p => (
            <ProyectoBlock key={p.id} p={p} defaultOpen={proyectos.length === 1} />
          ))}
        </div>
      )}
    </Modal>
  )
}
