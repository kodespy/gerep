import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { EmptyState, LoadErrorState, Modal, Spinner } from './ui'
import { fmtDate, fmtMoney } from '../lib/format'
import {
  esParticipacionParcial,
  loadProyectosVinculados,
  totalesProveedor,
  type ProveedorRef,
  type ProyectoVinculado,
} from '../lib/proveedorProyectos'
import { exportProveedorProyectosExcel, exportProveedorProyectosPdf } from '../lib/proveedorProyectosExport'

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
            {esParticipacionParcial(p) && (
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
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(p.strBruto)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{p.devoluciones ? fmtMoney(p.devoluciones) : '—'}</td>
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
  proveedor: ProveedorRef | null
  onClose: () => void
}) {
  const [proyectos, setProyectos] = useState<ProyectoVinculado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null)
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

  const totales = useMemo(() => totalesProveedor(proyectos ?? []), [proyectos])

  const runExport = async (kind: 'pdf' | 'xlsx') => {
    if (!proveedor || !proyectos?.length) return
    setExporting(kind)
    try {
      if (kind === 'pdf') await exportProveedorProyectosPdf(proveedor, proyectos)
      else await exportProveedorProyectosExcel(proveedor, proyectos)
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar el archivo.')
    } finally {
      setExporting(null)
    }
  }

  const exportBtn = 'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40'

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
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pdf')}
              className={`${exportBtn} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}
            >
              {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('xlsx')}
              className={`${exportBtn} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
            >
              {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel
            </button>
          </div>
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
