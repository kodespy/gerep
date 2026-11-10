import type { CrudConfig, FieldDef, ColDef } from '../components/CrudModule'
import { Link } from 'react-router'
import { Badge, EstadoBadge } from '../components/ui'
import ArchivoAdjuntoLink from '../components/ArchivoAdjuntoLink'
import ActaFormResumenPanel from '../components/ActaFormResumenPanel'
import ActaTipoNumeroSync from '../components/ActaTipoNumeroSync'
import ActaItemsPanel from '../components/ActaItemsPanel'
import ResolutionItemsPanel from '../components/ResolutionItemsPanel'
import ResolutionProyectosPanel from '../components/ResolutionProyectosPanel'
import StrResolucionSaldoPanel from '../components/StrResolucionSaldoPanel'
import ConvenioAdendasPanel from '../components/ConvenioAdendasPanel'
import { asGs, fmtMoney, fmtDate, fmtDateTime, fmtMes, MESES, addBusinessDays } from '../lib/format'
import { STORAGE_BUCKET_ACTA_ARCHIVOS, STORAGE_BUCKET_CONVENIOS_ADJUNTOS, STORAGE_BUCKET_PROYECTO_ADJUNTOS, STORAGE_BUCKET_RESOLUTIONS_ARCHIVOS } from '../lib/storage'
import { cdpCompAnterior, cdpMontoVigente, fetchNextCdpNumero } from '../lib/cdpUtils'
import { proyectoConComponenteLabel } from '../lib/proyectoLabel'
import { ajusteAdenda, ajusteModificacionAdmin } from '../lib/planVigente'
import {
  netModificacionesPlanAdmin,
  presupuestoComprometidoPlanAdmin,
  presupuestoInicialPlanAdmin,
  presupuestoVigentePlanAdminRow,
  saldoPresupuestarioPlanAdmin,
} from '../lib/planAdminFinanciero'
import { CodigoDescripcionCell } from '../components/CodigoDescripcionCell'
import CdpPdfDownloadButton from '../components/CdpPdfDownloadButton'
import {
  RendicionDiasAtrasoCell,
  RendicionEstadoBadge,
  RendicionStrCell,
  fmtDateCompact,
  fmtDateOrPendiente,
  fmtMoneyCompactCell,
  rendicionSaldoARendir,
} from '../components/RendicionTableCells'
import RendicionAdjuntosButton from '../components/RendicionAdjuntosButton'
import RendicionControlFormularioButton from '../components/RendicionControlFormularioButton'
import StrAdjuntosButton from '../components/StrAdjuntosButton'
import StrControlFormularioButton from '../components/StrControlFormularioButton'
import { supabase } from '../lib/supabase'
import { takeActaItemsDraft } from '../lib/actaItemsDraft'
import {
  attachActasAdendaLabels,
  friendlyActaAdendaSaveError,
  isMissingAdendaColumn,
} from '../lib/actaAdenda'
import { clearResolutionItemsDraft, takeResolutionItemsDraft } from '../lib/resolutionItemsDraft'
import { takeResolutionProyectosDraft } from '../lib/resolutionProyectosDraft'
import { prepareStrResolucionPayload, attachResolutionEjecutadoFromStrs, fetchResolutionSaldoResumen } from '../lib/resolutionSaldos'
import { attachStrOgTransferencia } from '../lib/ogTransferencia'
import { persistConvenioAdendasDraft } from '../lib/persistConvenioAdendasDraft'
import {
  attachStrRendicionSaldos,
  fetchSaldoDisponibleStr,
  fetchStrSaldoDisponibleMap,
  peekStrSaldoFormCache,
  setStrSaldoFormCacheEntry,
} from '../lib/rendicionSaldos'
import {
  RESOLUCION_TIPO_APROBACION,
  RESOLUCION_TIPO_OPTIONS,
  RESOLUCION_TIPO_PLAN,
  isResolucionSoloAprobacion,
} from '../lib/resolucionTipo'
import { actaTipoFromNumero, compareActaNumero, fetchNextActaNumero, isActaExtraordinaria, normalizeActaNumero, normalizeActaTipo, resolveFormularioControlNumero, yearFromActaFecha, ACTA_TIPO_OPTIONS, ACTA_TIPO_ORDINARIA } from '../lib/actaNumero'
import { isActaSoloAprobacion, promoteActaEstadoSiTieneMontoAprobado } from '../lib/actaEstado'
import { attachActasSaldoProyecto, fetchActaSaldoDisponibleMap } from '../lib/actasSaldo'

/**
 * Configuraciones compartidas de los módulos del flujo.
 * Cada builder acepta un proyectoId opcional: con él, el módulo queda embebido
 * en la ficha del proyecto (filtrado y con el proyecto fijado al crear);
 * sin él, funciona como listado global con selector de proyecto.
 */

const proyectoFk: FieldDef = {
  name: 'proyecto_id', label: 'Proyecto', type: 'fk', required: true,
  fk: { table: 'proyectos', select: 'id,descripcion', label: r => r.descripcion, orderBy: 'created_at' },
}

const proyectoCol: ColDef = {
  key: 'proyecto.descripcion', label: 'Proyecto', sortKey: 'proyecto.descripcion',
  render: (r: any) => <span className="block text-slate-500">{r.proyecto?.descripcion ?? '—'}</span>,
}

/** Selector / columna de proyecto con componente (usado en STR y CDP). */
const proyectoFkConComponente: FieldDef = {
  name: 'proyecto_id', label: 'Proyecto', type: 'fk', required: true,
  fk: {
    table: 'proyectos',
    select: 'id, descripcion, componente:componentes_programa(codigo, descripcion)',
    label: r => proyectoConComponenteLabel(r),
    orderBy: 'created_at',
  },
}

const proyectoColConComponente: ColDef = {
  key: 'proyecto.descripcion',
  label: 'Proyecto',
  sortKey: 'proyecto.descripcion',
  render: (r: any) => {
    const id = String(r.proyecto?.id ?? r.proyecto_id ?? '').trim()
    const label = proyectoConComponenteLabel(r.proyecto)
    if (!id || label === '—') {
      return <span className="block text-[11px] leading-snug text-slate-900 dark:text-slate-100">{label}</span>
    }
    return (
      <Link
        to={`/proyectos/${id}`}
        onClick={ev => ev.stopPropagation()}
        className="block text-[11px] leading-snug text-slate-900 no-underline hover:no-underline focus:outline-none dark:text-slate-100"
        title={label}
      >
        {label}
      </Link>
    )
  },
}

// ---------- 1 · PLANIFICACIÓN ----------

export function planesFinancierosAdministrativosConfig(): CrudConfig {
  return {
    table: 'planes_financieros_administrativos',
    eyebrow: 'Planificación',
    title: 'Planes financieros administrativos',
    singular: 'Plan administrativo',
    subtitle: 'Presupuesto administrativo anual por programa, actividad, objeto de gasto y fuente',
    select: '*, programa:programas(codigo,descripcion), actividad:actividades(codigo,descripcion), objeto:objetos_de_gastos(codigo,descripcion), fuente:fuentes_financiamiento(descripcion), modificaciones:modificaciones_administrativas(monto, tipo_modificacion)',
    orderBy: { column: 'anio', ascending: false },
    columns: [
      { key: 'anio', label: 'Año' },
      {
        key: 'programa.codigo', label: 'Programa', sortKey: 'programa.codigo',
        render: (r: any) => <CodigoDescripcionCell codigo={r.programa?.codigo} descripcion={r.programa?.descripcion} />,
      },
      {
        key: 'actividad.codigo', label: 'Actividad', sortKey: 'actividad.codigo',
        render: (r: any) => <CodigoDescripcionCell codigo={r.actividad?.codigo} descripcion={r.actividad?.descripcion} />,
      },
      {
        key: 'objeto.codigo', label: 'Obj. gasto', sortKey: 'objeto.codigo',
        render: (r: any) => <CodigoDescripcionCell codigo={r.objeto?.codigo} descripcion={r.objeto?.descripcion} />,
      },
      { key: 'fuente.descripcion', label: 'Fuente' },
      {
        key: 'monto_total', label: 'Presupuesto inicial', align: 'right',
        render: (r: any) => <span className="font-medium tabular-nums">{fmtMoney(presupuestoInicialPlanAdmin(r))}</span>,
      },
      {
        key: 'modificaciones_netas', label: 'Modificaciones (+/−)', align: 'right',
        sortFn: (a, b) => netModificacionesPlanAdmin(a) - netModificacionesPlanAdmin(b),
        render: (r: any) => {
          const net = netModificacionesPlanAdmin(r)
          return (
            <span className={`font-semibold tabular-nums ${net < 0 ? 'text-rose-600' : net > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
              {net >= 0 ? '+' : ''}{fmtMoney(net)}
            </span>
          )
        },
      },
      {
        key: 'presupuesto_vigente', label: 'Presupuesto vigente', align: 'right',
        sortFn: (a, b) => presupuestoVigentePlanAdminRow(a) - presupuestoVigentePlanAdminRow(b),
        render: (r: any) => (
          <span className="font-bold tabular-nums text-brand-700">{fmtMoney(presupuestoVigentePlanAdminRow(r))}</span>
        ),
      },
      {
        key: 'presupuesto_comprometido', label: 'Presupuesto comprometido', align: 'right',
        sortFn: (a, b) => presupuestoComprometidoPlanAdmin(a) - presupuestoComprometidoPlanAdmin(b),
        render: (r: any) => (
          <span className="font-semibold tabular-nums text-sky-700">{fmtMoney(presupuestoComprometidoPlanAdmin(r))}</span>
        ),
      },
      {
        key: 'saldo_presupuestario', label: 'Saldo presupuestario', align: 'right',
        sortFn: (a, b) => saldoPresupuestarioPlanAdmin(a) - saldoPresupuestarioPlanAdmin(b),
        render: (r: any) => {
          const saldo = saldoPresupuestarioPlanAdmin(r)
          return (
            <span className={`font-bold tabular-nums ${saldo < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {fmtMoney(saldo)}
            </span>
          )
        },
      },
    ],
    fields: [
      { name: 'anio', label: 'Año fiscal', type: 'number', required: true, defaultValue: new Date().getFullYear() },
      { name: 'programa_id', label: 'Programa', type: 'fk', fk: { table: 'programas', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'actividad_id', label: 'Actividad', type: 'fk', fk: { table: 'actividades', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'objeto_de_gasto_id', label: 'Objeto de gasto', type: 'fk', fk: { table: 'objetos_de_gastos', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'fuente_financiamiento_id', label: 'Fuente de financiamiento', type: 'fk', fk: { table: 'fuentes_financiamiento', select: 'id,descripcion', label: r => r.descripcion, orderBy: 'descripcion' } },
      { name: 'monto_total', label: 'Monto total', type: 'money' },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    sumColumns: ['monto_total', 'modificaciones_netas', 'presupuesto_vigente', 'presupuesto_comprometido', 'saldo_presupuestario'],
    sumFns: {
      monto_total: rows => rows.reduce((s, r) => s + presupuestoInicialPlanAdmin(r), 0),
      modificaciones_netas: rows => rows.reduce((s, r) => s + netModificacionesPlanAdmin(r), 0),
      presupuesto_vigente: rows => rows.reduce((s, r) => s + presupuestoVigentePlanAdminRow(r), 0),
      presupuesto_comprometido: rows => rows.reduce((s, r) => s + presupuestoComprometidoPlanAdmin(r), 0),
      saldo_presupuestario: rows => rows.reduce((s, r) => s + saldoPresupuestarioPlanAdmin(r), 0),
    },
  }
}

export function cronogramaAdministrativoConfig(planAdminId: string): CrudConfig {
  const mesOptions = MESES.map((label, i) => ({ value: String(i + 1), label }))
  return {
    table: 'cronograma_administrativo',
    title: 'Distribución mensual',
    singular: 'Mes',
    embedded: true,
    userIdField: 'user_id',
    fixed: { plan_administrativo_id: planAdminId },
    orderBy: { column: 'anio', ascending: true },
    emptyHint: 'Registre el monto programado para cada mes del plan administrativo.',
    columns: [
      { key: 'mes', label: 'Mes', render: (r: any) => fmtMes(r.mes) },
      { key: 'anio', label: 'Año', align: 'center' },
      { key: 'monto_programado', label: 'Monto programado', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto_programado)}</span> },
    ],
    fields: [
      { name: 'mes', label: 'Mes', type: 'select', required: true, options: mesOptions },
      { name: 'anio', label: 'Año', type: 'number', required: true, defaultValue: new Date().getFullYear() },
      { name: 'monto_programado', label: 'Monto programado', type: 'money', required: true },
    ],
    sumColumns: ['monto_programado'],
  }
}

export function modificacionesAdministrativasConfig(planAdminId: string): CrudConfig {
  return {
    table: 'modificaciones_administrativas',
    title: 'Gestión de Modificaciones (Adendas)',
    singular: 'Modificación',
    embedded: true,
    userIdField: 'user_id',
    fixed: { plan_administrativo_id: planAdminId },
    orderBy: { column: 'fecha_modificacion', ascending: false },
    emptyHint: 'Las modificaciones aumentan o disminuyen el presupuesto vigente del plan administrativo.',
    columns: [
      { key: 'fecha_modificacion', label: 'Fecha', render: (r: any) => fmtDate(r.fecha_modificacion) },
      {
        key: 'tipo_modificacion', label: 'Tipo de ajuste',
        render: (r: any) => (
          <Badge color={(r.tipo_modificacion ?? '').toLowerCase().includes('dis') ? 'red' : 'green'}>
            {(r.tipo_modificacion ?? '').toLowerCase().includes('dis') ? 'Disminución (Reducción)' : 'Aumento (Ampliación)'}
          </Badge>
        ),
      },
      {
        key: 'monto', label: 'Monto de ajuste', align: 'right',
        render: (r: any) => {
          const net = ajusteModificacionAdmin(r)
          return (
            <span className={`font-semibold tabular-nums ${net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {net >= 0 ? '+' : ''}{fmtMoney(net)}
            </span>
          )
        },
      },
      { key: 'descripcion', label: 'Descripción / Justificación', render: (r: any) => <span className="text-slate-600">{r.descripcion ?? '—'}</span> },
    ],
    fields: [
      { name: 'fecha_modificacion', label: 'Fecha', type: 'date', required: true },
      {
        name: 'tipo_modificacion', label: 'Tipo de Ajuste', type: 'select', required: true,
        options: [
          { value: 'aumento', label: 'Aumento (Ampliación)' },
          { value: 'disminucion', label: 'Disminución (Reducción)' },
        ],
      },
      { name: 'monto', label: 'Monto de Ajuste', type: 'money', required: true },
      { name: 'descripcion', label: 'Descripción / Justificación', type: 'textarea', placeholder: 'Motivo del ajuste...' },
    ],
    sumColumns: ['monto'],
    sumFns: { monto: rows => rows.reduce((s, r) => s + ajusteModificacionAdmin(r), 0) },
  }
}

/** @deprecated Use modificacionesAdministrativasConfig */
export const adendasAdministrativoConfig = modificacionesAdministrativasConfig

// ---------- 2 · EJECUCIÓN ----------

export function planesFinancierosConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'planes_financieros',
    title: 'Plan financiero',
    singular: 'Línea de plan',
    select: '*, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo,descripcion), fuente:fuentes_financiamiento(descripcion)' + (proyectoId ? '' : ', proyecto:proyectos(descripcion)'),
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    emptyHint: 'Cargue las líneas del plan financiero: proveedor, objeto de gasto, fuente y monto.',
    columns: [
      ...(proyectoId ? [] : [proyectoCol]),
      { key: 'proveedor.razon_social', label: 'Proveedor' },
      { key: 'objeto.codigo', label: 'OG', render: (r: any) => <Badge color="slate">{r.objeto?.codigo ?? '—'}</Badge> },
      { key: 'objeto.descripcion', label: 'Descripción OG' },
      { key: 'fuente.descripcion', label: 'Fuente' },
      { key: 'monto', label: 'Monto', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto)}</span> },
    ],
    fields: [
      ...(proyectoId ? [] : [proyectoFk]),
      { name: 'proveedor_id', label: 'Proveedor', type: 'fk', required: true, fk: { table: 'proveedores', select: 'id,razon_social,documento', label: r => r.razon_social, sub: r => 'RUC ' + (r.documento ?? '—'), orderBy: 'razon_social' } },
      { name: 'objeto_de_gasto_id', label: 'Objeto de gasto', type: 'fk', required: true, fk: { table: 'objetos_de_gastos', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'fuente_financiamiento_id', label: 'Fuente de financiamiento', type: 'fk', required: true, fk: { table: 'fuentes_financiamiento', select: 'id,descripcion', label: r => r.descripcion, orderBy: 'descripcion' } },
      { name: 'monto', label: 'Monto', type: 'money', required: true },
    ],
    sumColumns: ['monto'],
  }
}

export function adendasConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'adendas',
    title: 'Adendas del plan financiero',
    singular: 'Adenda',
    select: '*, plan:planes_financieros' + (proyectoId ? '!inner' : '') + '(id, monto, proyecto_id, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo, descripcion))',
    filter: proyectoId ? { 'plan.proyecto_id': proyectoId } : undefined,
    embedded: true,
    emptyHint: 'Las adendas ajustan (aumentan o disminuyen) una línea del plan financiero. Al aprobar o desembolsar el ajuste, vincule la adenda en el acta.',
    columns: [
      { key: 'numero_adenda', label: 'N°', render: (r: any) => <Badge color="brand">{r.numero_adenda}</Badge> },
      { key: 'fecha_adenda', label: 'Fecha', render: (r: any) => fmtDate(r.fecha_adenda) },
      { key: 'plan.proveedor.razon_social', label: 'Línea del plan (proveedor)' },
      { key: 'plan.objeto.codigo', label: 'OG', render: (r: any) => <Badge color="slate">{r.plan?.objeto?.codigo ?? '—'}</Badge> },
      { key: 'tipo_ajuste', label: 'Tipo', render: (r: any) => <Badge color={r.tipo_ajuste?.toLowerCase().includes('dis') ? 'red' : 'green'}>{r.tipo_ajuste}</Badge> },
      { key: 'monto_ajuste', label: 'Ajuste', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto_ajuste)}</span> },
      { key: 'estado', label: 'Estado', render: (r: any) => <EstadoBadge estado={r.estado} /> },
    ],
    fields: [
      {
        name: 'plan_financiero_id', label: 'Línea del plan financiero', type: 'fk', required: true,
        fk: {
          table: 'planes_financieros', select: 'id, monto, proveedor:proveedores(razon_social)',
          label: (r: any) => `${r.proveedor?.razon_social ?? 'Plan'} · ${fmtMoney(r.monto)}`,
          filter: proyectoId ? (q: any) => q.eq('proyecto_id', proyectoId) : undefined,
        },
      },
      { name: 'numero_adenda', label: 'Número de adenda', type: 'text', required: true },
      { name: 'fecha_adenda', label: 'Fecha', type: 'date', required: true },
      { name: 'tipo_ajuste', label: 'Tipo de ajuste', type: 'select', required: true, options: [{ value: 'aumento', label: 'Aumento' }, { value: 'disminucion', label: 'Disminución' }] },
      { name: 'monto_ajuste', label: 'Monto del ajuste', type: 'money', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    /**
     * La BD tiene adendas_estado_check (valores en minúscula).
     * No enviar "Pendiente" capitalizado: viola el check.
     */
    insertDefaults: { estado: 'pendiente' },
    sumColumns: ['monto_ajuste'],
    sumFns: { monto_ajuste: rows => rows.reduce((s, r) => s + ajusteAdenda(r), 0) },
  }
}

export function cronogramaFinancieroConfig(proyectoId?: string): CrudConfig {
  const mesOptions = MESES.map((label, i) => ({ value: String(i + 1), label }))
  return {
    table: 'cronograma_financiero',
    title: 'Plan de distribución mensual',
    singular: 'Distribución mensual',
    select: '*, plan:planes_financieros' + (proyectoId ? '!inner' : '') + '(id, monto, proyecto_id, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo), proyecto:proyectos(descripcion))',
    filter: proyectoId ? { 'plan.proyecto_id': proyectoId } : undefined,
    orderBy: { column: 'anio', ascending: true },
    embedded: true,
    emptyHint: 'Registre el monto programado por mes para cada línea del plan financiero.',
    columns: [
      ...(proyectoId ? [] : [{ key: 'plan.proyecto.descripcion', label: 'Proyecto', sortKey: 'plan.proyecto.descripcion', render: (r: any) => <span className="block text-slate-500">{r.plan?.proyecto?.descripcion ?? '—'}</span> } as ColDef]),
      { key: 'plan.proveedor.razon_social', label: 'Línea del plan (proveedor)' },
      { key: 'plan.objeto.codigo', label: 'OG', render: (r: any) => <Badge color="slate">{r.plan?.objeto?.codigo ?? '—'}</Badge> },
      { key: 'mes', label: 'Mes', render: (r: any) => fmtMes(r.mes) },
      { key: 'anio', label: 'Año', align: 'center' },
      { key: 'monto_programado', label: 'Monto programado', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto_programado)}</span> },
    ],
    fields: [
      {
        name: 'plan_financiero_id', label: 'Línea del plan financiero', type: 'fk', required: true,
        fk: {
          table: 'planes_financieros', select: 'id, monto, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo)',
          label: (r: any) => `${r.proveedor?.razon_social ?? 'Plan'} · OG ${r.objeto?.codigo ?? '—'} · ${fmtMoney(r.monto)}`,
          filter: proyectoId ? (q: any) => q.eq('proyecto_id', proyectoId) : undefined,
        },
      },
      { name: 'mes', label: 'Mes', type: 'select', required: true, options: mesOptions },
      { name: 'anio', label: 'Año', type: 'number', required: true, defaultValue: new Date().getFullYear() },
      { name: 'monto_programado', label: 'Monto programado', type: 'money', required: true },
    ],
    sumColumns: ['monto_programado'],
  }
}

export function cdpConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'budget_commitments',
    eyebrow: 'Ejecución',
    title: 'CDP · Certificados de disponibilidad presupuestaria',
    singular: 'CDP',
    subtitle: proyectoId ? undefined : 'Compromisos presupuestarios por proyecto',
    select: '*' + (proyectoId ? '' : ', proyecto:proyectos(id, descripcion, componente:componentes_programa(codigo, descripcion))') + ', usuario:profiles!user_id(name)',
    orderBy: { column: 'cdp_date', ascending: false },
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    userIdField: 'user_id',
    emptyHint: 'Registre los compromisos presupuestarios (CDP) que respaldan el proyecto.',
    columns: [
      { key: 'cdp_numero', label: 'CDP', render: (r: any) => <Badge color="brand">{r.cdp_numero ?? 's/n'}</Badge> },
      { key: 'cdp_date', label: 'Fecha CDP', render: (r: any) => fmtDateTime(r.cdp_date) },
      ...(proyectoId ? [] : [proyectoColConComponente]),
      { key: 'usuario.name', label: 'Usuario', render: (r: any) => <span className="text-slate-600">{r.usuario?.name ?? '—'}</span> },
      {
        key: '__comp_ant', label: 'Comp. ant.', align: 'right',
        sortFn: (a, b, rows) => cdpCompAnterior(a, rows) - cdpCompAnterior(b, rows),
        render: (r: any, ctx) => fmtMoney(cdpCompAnterior(r, ctx?.rows ?? [])),
      },
      {
        key: 'monto_comprometido', label: 'Monto', align: 'right',
        render: (r: any) => (
          <span className={`font-semibold tabular-nums ${(r.estado ?? '').toLowerCase().includes('anulad') ? 'text-slate-400 line-through' : 'text-brand-700'}`}>
            {fmtMoney(r.monto_comprometido)}
          </span>
        ),
      },
    ],
    fields: [
      ...(proyectoId ? [] : [{
        ...proyectoFkConComponente,
        fk: { ...proyectoFkConComponente.fk!, fetchAll: true, limit: 10_000, orderAscending: false },
      }]),
      { name: 'cdp_numero', label: 'Número de CDP', type: 'text', required: true, placeholder: 'CDP-008-2026' },
      { name: 'cdp_date', label: 'Fecha del CDP', type: 'datetime', required: true },
      { name: 'monto_comprometido', label: 'Monto', type: 'money', required: true },
      { name: 'estado', label: 'Estado', type: 'select', options: [{ value: 'activo', label: 'Activo' }, { value: 'anulado', label: 'Anulado (no suma en resúmenes)' }], defaultValue: 'activo' },
    ],
    formExtra: ({ rows, initial }) => {
      const comp = initial?.id
        ? cdpCompAnterior(initial, rows)
        : rows.reduce((s, r) => s + cdpMontoVigente(r), 0)
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-500">Compromiso anterior: </span>
          <span className="font-semibold tabular-nums text-slate-800">{fmtMoney(comp)}</span>
        </div>
      )
    },
    sumColumns: ['monto_comprometido'],
    sumFns: {
      monto_comprometido: rows => rows.reduce((s, r) => s + cdpMontoVigente(r), 0),
    },
    resolveCreateInitial: async () => ({ cdp_numero: await fetchNextCdpNumero() }),
    insertDefaults: { tipo_movimiento: 'Compromiso' },
    rowActions: (row: any) => <CdpPdfDownloadButton cdpId={row.id} />,
  }
}

export function actasConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'actas',
    eyebrow: 'Ejecución',
    title: 'Actas',
    singular: 'Acta',
    subtitle: proyectoId ? undefined : 'Actas de aprobación de desembolsos por proyecto',
    select: 'id, numero, fecha, hora_inicio, hora_fin, numero_desembolso, formulario_control, monto_solicitado, monto_aprobado, estado, observaciones, archivo_firmado, proyecto_id, created_at, items:acta_items(id, plan_financiero_id, plan:planes_financieros(id, monto, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo, descripcion)))'
      + (proyectoId ? '' : ', proyecto:proyectos(id, descripcion, componente:componentes_programa(codigo, descripcion))'),
    orderBy: { column: 'numero', ascending: false },
    limit: 5000,
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    emptyHint: 'Las actas aprueban desembolsos sobre el plan financiero o sobre una adenda del proyecto.',
    modalWide: true,
    formExtraPlacement: 'side',
    transformRows: async rows => {
      const prepared = [...rows]
        .map(r => {
          const tipo = actaTipoFromNumero(r.numero)
          const next = { ...r, tipo }
          return isActaSoloAprobacion(next.estado)
            ? { ...next, monto_aprobado: 0, monto_solicitado: 0 }
            : next
        })
        .sort((a, b) => compareActaNumero(b?.numero, a?.numero))
      const withSaldo = await attachActasSaldoProyecto(prepared)
      return attachActasAdendaLabels(withSaldo)
    },
    resolveCreateInitial: async () => {
      const [numero, formulario_control] = await Promise.all([
        fetchNextActaNumero().catch(() => ''),
        proyectoId
          ? resolveFormularioControlNumero(proyectoId).catch(() => '')
          : Promise.resolve(''),
      ])
      return {
        tipo: ACTA_TIPO_ORDINARIA,
        ...(numero ? { numero } : {}),
        ...(formulario_control ? { formulario_control } : {}),
        estado: 'Aprobación',
        monto_aprobado: 0,
        monto_solicitado: 0,
      }
    },
    formExtra: ({ values, fixed, initial, patchValues }) => {
      const pid = String(
        values?.proyecto_id || fixed?.proyecto_id || initial?.proyecto_id || '',
      ).trim() || null
      const soloAprobacion = isActaSoloAprobacion(values?.estado)
      // Resumen proyecta con monto aprobado a desembolsar (nunca solicitado).
      const montoActa = soloAprobacion ? 0 : (Number(values?.monto_aprobado) || 0)
      const actaId = initial?.id ? String(initial.id) : null
      return (
        <div className="max-h-[min(70vh,640px)] space-y-3 overflow-y-auto pr-1">
          <ActaTipoNumeroSync
            tipo={values?.tipo}
            fecha={values?.fecha}
            patchValues={patchValues}
          />
          <ActaFormResumenPanel proyectoId={pid} montoActa={montoActa} />
          <ActaItemsPanel
            key={`items-${pid ?? 'none'}-${actaId ?? 'new'}-${soloAprobacion ? 'aprob' : 'desemb'}`}
            actaId={actaId}
            proyectoId={pid}
            soloAprobacion={soloAprobacion}
          />
        </div>
      )
    },
    beforeSave: async ({ values, isCreate }) => {
      const { tipo: tipoRaw, ...rest } = values as Record<string, any>
      const tipo = normalizeActaTipo(tipoRaw || actaTipoFromNumero(rest.numero))
      const anio = yearFromActaFecha(rest.fecha)
      let numero = normalizeActaNumero(rest.numero, tipo)
      if (!numero && isCreate) {
        numero = await fetchNextActaNumero(anio, tipo).catch(() => '')
      }
      if (!numero) throw new Error('El N° de acta es obligatorio (001-2026 o 001-E-2026).')
      const estado = promoteActaEstadoSiTieneMontoAprobado(rest.estado, rest.monto_aprobado)
      const next = { ...rest, numero, estado, tipo: undefined }
      // Solo «Aprobación» sin monto: forzar montos en 0
      if (isActaSoloAprobacion(next.estado)) {
        return { ...next, monto_aprobado: 0, monto_solicitado: 0 }
      }
      return next
    },
    afterSave: async ({ id, isCreate, values }) => {
      const soloAprobacion = isActaSoloAprobacion(values?.estado)
      if (isCreate) {
        const drafts = takeActaItemsDraft()
        if (drafts.length) {
          const { data: session } = await supabase.auth.getUser()
          const rows = drafts.map(d => {
            const row: Record<string, any> = {
              acta_id: id,
              plan_financiero_id: d.plan_financiero_id,
              // Solo aprobación: ítems del plan sin monto a desembolsar
              monto_ejecutado: soloAprobacion ? 0 : d.monto_ejecutado,
            }
            if (d.adenda_id) row.adenda_id = d.adenda_id
            if (session.user) row.user_id = session.user.id
            return row
          })
          let { error } = await supabase.from('acta_items').insert(rows)
          if (error && /column .*monto_ejecutado/i.test(error.message)) {
            const withoutMonto = rows.map(({ monto_ejecutado: _m, ...r }) => r)
            const retry = await supabase.from('acta_items').insert(withoutMonto)
            error = retry.error
          }
          if (error && isMissingAdendaColumn(error.message)) {
            const withoutAdenda = rows.map(({ adenda_id: _a, ...r }) => r)
            const retry = await supabase.from('acta_items').insert(withoutAdenda)
            error = retry.error
            if (!error) {
              throw new Error(
                'Acta creada, pero no se pudo vincular la adenda. Ejecute la migración 042_acta_items_adenda.sql en Supabase.',
              )
            }
          }
          if (error) {
            const friendly = friendlyActaAdendaSaveError(error.message)
            throw new Error(`Acta creada, pero no se pudieron guardar los ítems: ${friendly ?? error.message}`)
          }
        }
      }
      if (soloAprobacion) {
        const { error } = await supabase
          .from('acta_items')
          .update({ monto_ejecutado: 0 })
          .eq('acta_id', id)
        if (error && !/column .*monto_ejecutado/i.test(error.message)) {
          console.warn('[actas] no se pudo poner monto_ejecutado=0 en ítems:', error.message)
        }
      }
    },
    columns: [
      {
        key: 'numero',
        label: 'N° Acta',
        defaultAsc: false,
        sortFn: (a, b) => compareActaNumero(a?.numero, b?.numero),
        render: (r: any) => (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Badge color="brand">{r.numero}</Badge>
            {isActaExtraordinaria(r.numero) ? <Badge color="amber">Extraordinaria</Badge> : null}
            {(r._adendaNumeros as string[] | undefined)?.map(n => (
              <Badge key={n} color="mint">Adenda {n}</Badge>
            ))}
          </span>
        ),
      },
      ...(proyectoId ? [] : [proyectoColConComponente]),
      { key: 'formulario_control', label: 'N° FC', render: (r: any) => r.formulario_control || '—' },
      { key: 'fecha', label: 'Fecha', render: (r: any) => fmtDate(r.fecha) },
      { key: 'numero_desembolso', label: 'Desembolso N°', align: 'center' },
      { key: 'monto_solicitado', label: 'Solicitado', align: 'right', render: (r: any) => fmtMoney(r.monto_solicitado) },
      { key: 'monto_aprobado', label: 'Aprob. a desembolsar', align: 'right', render: (r: any) => <span className="font-semibold text-emerald-700">{fmtMoney(r.monto_aprobado)}</span> },
      {
        key: 'saldo',
        label: 'Saldo',
        align: 'right',
        sortKey: 'saldo',
        render: (r: any) => {
          if (r.saldo == null) return <span className="text-slate-400">—</span>
          const n = Number(r.saldo) || 0
          return (
            <span className={`font-semibold tabular-nums ${n < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {fmtMoney(n)}
            </span>
          )
        },
      },
      { key: 'estado', label: 'Estado', render: (r: any) => <EstadoBadge estado={r.estado} /> },
    ],
    fields: [
      ...(proyectoId ? [] : [{ ...proyectoFkConComponente, required: true }]),
      {
        name: 'tipo',
        label: 'Tipo de acta',
        type: 'select',
        required: true,
        options: ACTA_TIPO_OPTIONS,
        defaultValue: ACTA_TIPO_ORDINARIA,
        derive: async (value, values) => {
          const tipo = normalizeActaTipo(value)
          const anio = yearFromActaFecha(values?.fecha)
          const numero = await fetchNextActaNumero(anio, tipo).catch(() => '')
          return numero ? { numero } : {}
        },
      },
      {
        name: 'numero',
        label: 'Número de acta',
        type: 'text',
        required: true,
        placeholder: '001-2026 · Extra: 001-E-2026',
      },
      {
        name: 'formulario_control',
        label: 'N° de Formulario de Control',
        type: 'text',
        placeholder: 'FC-2026-0001',
      },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'hora_inicio', label: 'Hora inicio', type: 'time' },
      { name: 'hora_fin', label: 'Hora fin', type: 'time' },
      { name: 'numero_desembolso', label: 'N° de desembolso', type: 'number' },
      { name: 'monto_solicitado', label: 'Monto solicitado', type: 'money' },
      {
        name: 'monto_aprobado',
        label: 'Monto aprobado a desembolsar',
        type: 'money',
        derive: (value, values) => {
          const estado = promoteActaEstadoSiTieneMontoAprobado(values?.estado, value)
          return estado !== String(values?.estado ?? '').trim() ? { estado } : {}
        },
      },
      {
        name: 'estado',
        label: 'Estado',
        type: 'select',
        required: true,
        options: ['Aprobación', 'Desembolso', 'Aprobación y desembolso'].map(v => ({ value: v, label: v })),
        defaultValue: 'Aprobación',
        derive: value => (isActaSoloAprobacion(value)
          ? { monto_aprobado: 0, monto_solicitado: 0 }
          : {}),
      },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
      {
        name: 'archivo_firmado', label: 'Acta firmada', type: 'file', colSpan2: true,
        storageBucket: STORAGE_BUCKET_ACTA_ARCHIVOS,
        storagePathPrefix: 'actas',
        accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png',
      },
    ],
    sumColumns: ['monto_solicitado', 'monto_aprobado', 'saldo'],
  }
}

export function resolucionesConfig(proyectoId?: string): CrudConfig {
  const proyEmbed = proyectoId
    ? 'proyectos_link:resolution_proyectos!inner(proyecto_id, proyecto:proyectos(id, descripcion, componente:componentes_programa(codigo, descripcion)))'
    : 'proyectos_link:resolution_proyectos(proyecto_id, proyecto:proyectos(id, descripcion, componente:componentes_programa(codigo, descripcion)))'

  return {
    table: 'resolutions',
    eyebrow: 'Ejecución',
    title: 'Resoluciones',
    singular: 'Resolución',
    subtitle: proyectoId
      ? undefined
      : 'Resoluciones de solo aprobación o con plan presupuestario, vinculadas a uno o varios proyectos',
    select: `*, items:resolution_items(id, monto, og:objetos_de_gastos(codigo)), ${proyEmbed}`,
    filter: proyectoId ? { 'proyectos_link.proyecto_id': proyectoId } : undefined,
    embedded: !!proyectoId,
    userIdField: 'created_by',
    emptyHint: 'Registre resoluciones de solo aprobación o con plan presupuestario aprobado.',
    modalWide: true,
    pageSize: 12,
    transformRows: rows => attachResolutionEjecutadoFromStrs(rows),
    formExtra: ({ initial, values }) => {
      const tipo = values?.tipo ?? initial?.tipo ?? RESOLUCION_TIPO_APROBACION
      const soloAprobacion = isResolucionSoloAprobacion(tipo)
      return (
        <div className="space-y-3">
          <ResolutionProyectosPanel
            key={`res-proy-${initial?.id ?? 'new'}-${proyectoId ?? ''}`}
            resolutionId={initial?.id ? String(initial.id) : null}
            defaultProyectoId={proyectoId ?? null}
          />
          {soloAprobacion ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              Esta resolución es <span className="font-semibold">solo aprobación</span>: no se vincula a un plan presupuestario aprobado.
            </div>
          ) : (
            <ResolutionItemsPanel
              key={`res-items-${initial?.id ?? 'new'}`}
              resolutionId={initial?.id ? String(initial.id) : null}
            />
          )}
        </div>
      )
    },
    beforeSave: async ({ values, isCreate, existing }) => {
      if (!isResolucionSoloAprobacion(values.tipo)) return values
      clearResolutionItemsDraft()
      if (!isCreate && existing?.id) {
        const { count, error } = await supabase
          .from('resolution_items')
          .select('id', { count: 'exact', head: true })
          .eq('resolution_id', existing.id)
        if (error) throw error
        if ((count ?? 0) > 0) {
          throw new Error(
            'Esta resolución tiene ítems de plan presupuestario. Elimínelos antes de marcarla como solo aprobación.',
          )
        }
      }
      return { ...values, tipo: RESOLUCION_TIPO_APROBACION }
    },
    afterSave: async ({ id, isCreate }) => {
      if (!isCreate) return
      const proyDrafts = takeResolutionProyectosDraft()
      if (proyDrafts.length) {
        const { error: proyErr } = await supabase.from('resolution_proyectos').insert(
          proyDrafts.map(d => ({
            resolution_id: id,
            proyecto_id: d.proyecto_id,
          })),
        )
        if (proyErr) {
          throw new Error(`Resolución creada, pero no se pudieron vincular los proyectos: ${proyErr.message}`)
        }
      } else if (proyectoId) {
        const { error: proyErr } = await supabase.from('resolution_proyectos').insert({
          resolution_id: id,
          proyecto_id: proyectoId,
        })
        if (proyErr) {
          throw new Error(`Resolución creada, pero no se pudo vincular el proyecto: ${proyErr.message}`)
        }
      }

      const drafts = takeResolutionItemsDraft()
      if (!drafts.length) return
      const { data: session } = await supabase.auth.getUser()
      const rows = drafts.map(d => {
        const row: Record<string, any> = {
          resolution_id: id,
          og_id: d.og_id,
          monto: d.monto,
        }
        if (session.user) row.created_by = session.user.id
        return row
      })
      const { error } = await supabase.from('resolution_items').insert(rows)
      if (error) {
        throw new Error(`Resolución creada, pero no se pudieron guardar los ítems del plan: ${error.message}`)
      }
    },
    columns: [
      { key: 'numero', label: 'N° Resolución', render: (r: any) => <Badge color="brand">{r.numero}</Badge> },
      {
        key: 'tipo',
        label: 'Tipo',
        excelValue: (r: any) => (isResolucionSoloAprobacion(r.tipo) ? 'Solo aprobación' : 'Con plan'),
        render: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) {
            return <Badge color="slate">Solo aprobación</Badge>
          }
          return <Badge color="brand">Con plan</Badge>
        },
      },
      ...(proyectoId ? [] : [{
        key: 'proyectos_link',
        label: 'Proyectos',
        sortable: false,
        excelValue: (r: any) => {
          const links = Array.isArray(r.proyectos_link) ? r.proyectos_link : []
          if (!links.length) return null
          return links.map((l: any) => {
            const p = Array.isArray(l.proyecto) ? l.proyecto[0] : l.proyecto
            const proy = String(p?.descripcion ?? '').trim() || 'Sin descripción'
            const compRaw = Array.isArray(p?.componente) ? p.componente[0] : p?.componente
            const comp = String(compRaw?.descripcion ?? compRaw?.codigo ?? '').trim()
            return comp ? `${proy} - ${comp}` : proy
          }).join('; ')
        },
        render: (r: any) => {
          const links = Array.isArray(r.proyectos_link) ? r.proyectos_link : []
          if (!links.length) return <span className="text-slate-400">—</span>
          const entries = links.map((l: any) => {
            const p = Array.isArray(l.proyecto) ? l.proyecto[0] : l.proyecto
            const id = String(p?.id ?? l.proyecto_id ?? '').trim()
            const proy = String(p?.descripcion ?? '').trim() || 'Sin descripción'
            const compRaw = Array.isArray(p?.componente) ? p.componente[0] : p?.componente
            const comp = String(compRaw?.descripcion ?? compRaw?.codigo ?? '').trim()
            const label = comp ? `${proy} - ${comp}` : proy
            return id ? { id, label } : null
          }).filter(Boolean) as { id: string; label: string }[]
          if (!entries.length) {
            return <span className="text-slate-500">{links.length} proyecto{links.length === 1 ? '' : 's'}</span>
          }
          const shown = entries.slice(0, 2)
          const more = entries.length > 2 ? entries.length - 2 : 0
          return (
            <span className="flex flex-col gap-0.5 text-[11px] leading-snug" title={entries.map(e => e.label).join('\n')}>
              {shown.map(e => (
                <Link
                  key={e.id}
                  to={`/proyectos/${e.id}`}
                  onClick={ev => ev.stopPropagation()}
                  className="text-[11px] text-slate-900 no-underline hover:no-underline focus:outline-none dark:text-slate-100"
                >
                  {e.label}
                </Link>
              ))}
              {more > 0 ? <span className="text-slate-400">+{more} más</span> : null}
            </span>
          )
        },
      } as ColDef]),
      { key: 'fecha', label: 'Fecha', render: (r: any) => fmtDate(r.fecha) },
      { key: 'fecha_recepcion', label: 'Recepción', render: (r: any) => fmtDate(r.fecha_recepcion) },
      {
        key: 'monto_plan',
        label: 'Plan',
        align: 'right',
        sortable: false,
        excelValue: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) return null
          return Number(r.monto_plan)
            || (Array.isArray(r.items)
              ? r.items.reduce((s: number, i: any) => s + (Number(i.monto) || 0), 0)
              : 0)
        },
        render: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) {
            return <span className="text-[11px] text-slate-400">Sin plan</span>
          }
          const items = Array.isArray(r.items) ? r.items : []
          if (!items.length && !(Number(r.monto_plan) > 0)) return <span className="text-slate-400">—</span>
          const total = Number(r.monto_plan) || items.reduce((s: number, i: any) => s + (Number(i.monto) || 0), 0)
          const ogs = items
            .map((i: any) => i.og?.codigo)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ')
          return (
            <span className="block text-[11px] leading-snug">
              <span className="font-semibold tabular-nums text-slate-800">{fmtMoney(total)}</span>
              {ogs ? <span className="mt-0.5 block text-slate-500">{ogs}{items.length > 3 ? '…' : ''}</span> : null}
            </span>
          )
        },
      },
      {
        key: 'ejecutado_str',
        label: 'Ejecutado',
        align: 'right',
        sortable: false,
        excelValue: (r: any) => (isResolucionSoloAprobacion(r.tipo) ? null : (Number(r.ejecutado_str) || 0)),
        render: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) {
            return <span className="text-[11px] text-slate-400">—</span>
          }
          return (
            <span className="font-semibold tabular-nums text-[11px] text-slate-800">
              {fmtMoney(Number(r.ejecutado_str) || 0)}
            </span>
          )
        },
      },
      {
        key: 'saldo_str',
        label: 'Saldos',
        align: 'right',
        sortable: false,
        excelValue: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) return null
          if (r.saldo_str != null) return Number(r.saldo_str) || 0
          const plan = Number(r.monto_plan)
            || (Array.isArray(r.items)
              ? r.items.reduce((s: number, i: any) => s + (Number(i.monto) || 0), 0)
              : 0)
          return plan - (Number(r.ejecutado_str) || 0)
        },
        render: (r: any) => {
          if (isResolucionSoloAprobacion(r.tipo)) {
            return <span className="text-[11px] text-slate-400">—</span>
          }
          const plan = Number(r.monto_plan)
            || (Array.isArray(r.items)
              ? r.items.reduce((s: number, i: any) => s + (Number(i.monto) || 0), 0)
              : 0)
          const ejecutado = Number(r.ejecutado_str) || 0
          const saldo = r.saldo_str != null ? Number(r.saldo_str) : plan - ejecutado
          const color = saldo < 0
            ? 'text-rose-700'
            : saldo === 0 && plan > 0
              ? 'text-slate-500'
              : 'text-emerald-700'
          return (
            <span className={`font-semibold tabular-nums text-[11px] ${color}`}>
              {fmtMoney(saldo)}
            </span>
          )
        },
      },
      { key: 'archivo_url', label: 'Adjunto', align: 'center', render: (r: any) => (
        <ArchivoAdjuntoLink
          path={r.archivo_url}
          bucket={STORAGE_BUCKET_RESOLUTIONS_ARCHIVOS}
          badgeCount={r.archivo_url ? 1 : 0}
        />
      ) },
    ],
    sumColumns: ['monto_plan', 'ejecutado_str', 'saldo_str'],
    sumFns: {
      monto_plan: rows => rows.reduce((s, r) => {
        if (isResolucionSoloAprobacion(r.tipo)) return s
        return s + (Number(r.monto_plan)
          || (Array.isArray(r.items)
            ? r.items.reduce((a: number, i: any) => a + (Number(i.monto) || 0), 0)
            : 0))
      }, 0),
      ejecutado_str: rows => rows.reduce((s, r) => {
        if (isResolucionSoloAprobacion(r.tipo)) return s
        return s + (Number(r.ejecutado_str) || 0)
      }, 0),
      saldo_str: rows => rows.reduce((s, r) => {
        if (isResolucionSoloAprobacion(r.tipo)) return s
        if (r.saldo_str != null) return s + (Number(r.saldo_str) || 0)
        const plan = Number(r.monto_plan)
          || (Array.isArray(r.items)
            ? r.items.reduce((a: number, i: any) => a + (Number(i.monto) || 0), 0)
            : 0)
        return s + (plan - (Number(r.ejecutado_str) || 0))
      }, 0),
    },
    fields: [
      { name: 'numero', label: 'Número', type: 'text', required: true },
      {
        name: 'tipo',
        label: 'Tipo de resolución',
        type: 'select',
        required: true,
        defaultValue: RESOLUCION_TIPO_APROBACION,
        options: [...RESOLUCION_TIPO_OPTIONS],
        derive: value => {
          if (isResolucionSoloAprobacion(value)) clearResolutionItemsDraft()
          return {}
        },
      },
      { name: 'fecha', label: 'Fecha de la resolución', type: 'date', required: true },
      { name: 'fecha_recepcion', label: 'Fecha de recepción', type: 'date' },
      {
        name: 'archivo_url', label: 'Archivo adjunto', type: 'file', colSpan2: true, formSection: 'end',
        storageBucket: STORAGE_BUCKET_RESOLUTIONS_ARCHIVOS,
        storagePathPrefix: 'resoluciones',
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
      },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', formSection: 'end' },
    ],
  }
}
export function conveniosConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'convenios',
    eyebrow: 'Ejecución',
    title: 'Convenios',
    singular: 'Convenio',
    subtitle: proyectoId ? undefined : 'Convenios firmados por proyecto',
    select: '*, adendas:convenio_adendas(id, numero, fecha, archivo_firmado)' + (proyectoId ? '' : ', proyecto:proyectos(descripcion)'),
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    userIdField: 'created_by',
    modalWide: true,
    emptyHint: 'Registre el convenio firmado. Si corresponde, agregue una o varias adendas con su PDF firmado.',
    afterSave: async ({ id, isCreate }) => {
      if (!isCreate) return
      await persistConvenioAdendasDraft(id)
    },
    formExtra: ({ initial }) => (
      <ConvenioAdendasPanel
        key={`conv-adendas-${initial?.id ?? 'new'}`}
        convenioId={initial?.id ? String(initial.id) : null}
      />
    ),
    columns: [
      { key: 'number', label: 'N° Convenio', render: (r: any) => <Badge color="brand">{r.number}</Badge> },
      ...(proyectoId ? [] : [proyectoCol]),
      { key: 'fecha_convenio', label: 'Fecha', render: (r: any) => fmtDate(r.fecha_convenio) },
      {
        key: 'adendas',
        label: 'Adendas',
        excelValue: (r: any) => {
          const ads = Array.isArray(r.adendas) ? r.adendas : []
          const labels = ads
            .map((a: any) => {
              const n = String(a?.numero ?? '').trim()
              const f = a?.fecha ? fmtDate(a.fecha) : ''
              return n ? (f ? `${n} · ${f}` : n) : ''
            })
            .filter(Boolean)
          return labels.length ? labels.join('; ') : null
        },
        render: (r: any) => {
          const ads = Array.isArray(r.adendas) ? r.adendas : []
          if (!ads.length) return <span className="text-slate-400">—</span>
          return (
            <span className="inline-flex flex-wrap items-center gap-1">
              {ads.map((a: any) => (
                <Badge key={String(a.id ?? a.numero)} color="amber">{a.numero}</Badge>
              ))}
            </span>
          )
        },
      },
      { key: 'observaciones', label: 'Observaciones' },
      { key: 'archivo_adjunto', label: 'Convenio', align: 'center', render: (r: any) => (
        <ArchivoAdjuntoLink
          path={r.archivo_adjunto}
          bucket={STORAGE_BUCKET_CONVENIOS_ADJUNTOS}
          badgeCount={r.archivo_adjunto ? 1 : 0}
        />
      ) },
      {
        key: 'adendas_pdf',
        label: 'Adendas firmadas',
        align: 'center',
        excelValue: (r: any) => {
          const ads = Array.isArray(r.adendas) ? r.adendas : []
          const n = ads.filter((a: any) => a?.archivo_firmado).length
          return n ? String(n) : null
        },
        render: (r: any) => {
          const ads = Array.isArray(r.adendas) ? r.adendas : []
          const withPdf = ads.filter((a: any) => a?.archivo_firmado)
          if (!withPdf.length) return <span className="text-slate-400">—</span>
          return (
            <span className="inline-flex items-center gap-0.5">
              {withPdf.map((a: any) => (
                <ArchivoAdjuntoLink
                  key={String(a.id)}
                  path={a.archivo_firmado}
                  bucket={STORAGE_BUCKET_CONVENIOS_ADJUNTOS}
                  badgeCount={1}
                />
              ))}
            </span>
          )
        },
      },
    ],
    fields: [
      ...(proyectoId ? [] : [proyectoFk]),
      { name: 'number', label: 'Número de convenio', type: 'text', required: true },
      { name: 'fecha_convenio', label: 'Fecha del convenio', type: 'date', required: true },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
      {
        name: 'archivo_adjunto', label: 'Convenio adjunto', type: 'file', colSpan2: true,
        storageBucket: STORAGE_BUCKET_CONVENIOS_ADJUNTOS,
        storagePathPrefix: 'convenios',
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
      },
    ],
  }
}
// ---------- 3 · PAGOS ----------

export function strsConfig(proyectoId?: string): CrudConfig {
  const proyectoSelect = proyectoId
    ? ''
    : ', proyecto:proyectos(id, descripcion, convenio, componente:componentes_programa(id, codigo, descripcion, actividad:actividades(id, codigo, descripcion), programa:programas(id, codigo, descripcion)))'

  const resolutionSelect =
    'id, numero, fecha, tipo, items:resolution_items!inner(id), proyectos_link:resolution_proyectos!inner(proyecto_id)'

  return {
    table: 'strs',
    eyebrow: 'Pagos',
    title: 'STR · Solicitudes de transferencia de recursos',
    singular: 'STR',
    subtitle: proyectoId ? undefined : 'Pagos y desembolsos vinculados al plan de una resolución',
    select: '*, fuente:fuentes_financiamiento(descripcion, detalle), og:objetos_de_gastos(id, codigo, descripcion, og_principal_id), acta:actas(id, numero, fecha, proyecto_id), resolucion:resolutions(id, numero, fecha, tipo), plan_item:resolution_items(id, monto, og_id, og:objetos_de_gastos(id, codigo, descripcion, og_principal_id)), adjuntos:str_archivos(id)' + proyectoSelect,
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    /** Pagina de a 1000; tope alto para no truncar totales del periodo en el listado. */
    limit: 50_000,
    pageSize: 12,
    denseTable: true,
    modalWide: true,
    emptyHint: 'Cada STR se vincula a una línea del plan presupuestario de una resolución (no aplica a resoluciones de solo aprobación).',
    transformRows: rows => attachStrOgTransferencia(rows),
    formExtra: ({ values, initial, setSubmitBlocked }) => (
      <StrResolucionSaldoPanel
        resolutionId={values?.resolution_id ?? initial?.resolution_id}
        resolutionItemId={values?.resolution_item_id ?? initial?.resolution_item_id}
        strMonto={values?.monto ?? initial?.monto}
        excludeStrId={initial?.id ? String(initial.id) : null}
        onSaldoNegativoChange={setSubmitBlocked}
      />
    ),
    beforeSave: async ({ values, existing }) =>
      prepareStrResolucionPayload(values, {
        excludeStrId: existing?.id ? String(existing.id) : null,
      }),
    columns: [
      { key: 'numero', label: 'N° STR', render: (r: any) => <Badge color="brand">{r.numero}</Badge> },
      ...(proyectoId ? [] : [proyectoColConComponente]),
      { key: 'fecha', label: 'Fecha', render: (r: any) => fmtDate(r.fecha) },
      {
        key: 'resolucion.numero',
        label: 'N° Resolución',
        excelValue: (r: any) => {
          const res = Array.isArray(r.resolucion) ? r.resolucion[0] : r.resolucion
          return res?.numero ? String(res.numero) : (r.nro_resolucion ? String(r.nro_resolucion) : null)
        },
        render: (r: any) => r.resolucion?.numero
          ? <Badge color="brand">{r.resolucion.numero}</Badge>
          : (r.nro_resolucion ? <span className="text-[11px] text-slate-500">{r.nro_resolucion}</span> : <span className="text-slate-400">—</span>),
      },
      {
        key: 'resolucion.fecha',
        label: 'Fecha Resolución',
        excelValue: (r: any) => {
          const res = Array.isArray(r.resolucion) ? r.resolucion[0] : r.resolucion
          const raw = String(res?.fecha ?? r.fecha_resolucion ?? '').slice(0, 10)
          return raw || null
        },
        render: (r: any) => {
          const res = Array.isArray(r.resolucion) ? r.resolucion[0] : r.resolucion
          const raw = res?.fecha ?? r.fecha_resolucion
          return raw ? fmtDate(raw) : <span className="text-slate-400">—</span>
        },
      },
      {
        key: 'acta.numero',
        label: 'N° Acta',
        excelValue: (r: any) => {
          const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
          return acta?.numero ? String(acta.numero) : null
        },
        render: (r: any) => {
          const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
          return acta?.numero
            ? <Badge color="amber">{acta.numero}</Badge>
            : <span className="text-slate-400">—</span>
        },
      },
      {
        key: 'acta.fecha',
        label: 'Fecha de Acta',
        excelValue: (r: any) => {
          const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
          const raw = String(acta?.fecha ?? '').slice(0, 10)
          return raw || null
        },
        render: (r: any) => {
          const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
          return acta?.fecha ? fmtDate(acta.fecha) : <span className="text-slate-400">—</span>
        },
      },
      { key: 'og.codigo', label: 'OG' },
      { key: 'fuente.descripcion', label: 'Fuente' },
      { key: 'fecha_desembolso', label: 'Desembolso', render: (r: any) => fmtDate(r.fecha_desembolso) },
      { key: 'monto', label: 'Monto', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto)}</span> },
    ],
    fields: [
      ...(proyectoId ? [] : [proyectoFkConComponente]),
      { name: 'numero', label: 'Número de STR', type: 'text', required: true },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'monto', label: 'Monto', type: 'money', required: true },
      { name: 'nivel', label: 'Nivel', type: 'text' },
      {
        name: 'resolution_id',
        label: 'Resolución (con plan)',
        type: 'fk',
        required: true,
        fk: {
          table: 'resolutions',
          select: resolutionSelect,
          label: (r: any) => `Res. ${r.numero}`,
          sub: (r: any) => fmtDate(r.fecha),
          orderBy: 'fecha',
          dependsOn: proyectoId ? undefined : 'proyecto_id',
          filterFromValues: (q: any, values: Record<string, any>) => {
            const pid = String(proyectoId || values.proyecto_id || '').trim()
            let next = q.eq('tipo', RESOLUCION_TIPO_PLAN)
            if (!pid) return next.eq('id', '00000000-0000-0000-0000-000000000000')
            return next.eq('proyectos_link.proyecto_id', pid)
          },
        },
      },
      {
        name: 'resolution_item_id',
        label: 'Línea del plan (OG)',
        type: 'fk',
        required: true,
        fk: {
          table: 'resolution_items',
          select: 'id, monto, og_id, og:objetos_de_gastos(codigo, descripcion)',
          label: (r: any) => `OG ${r.og?.codigo ?? '—'} · ${fmtMoney(r.monto)}`,
          sub: (r: any) => r.og?.descripcion ?? '',
          orderBy: 'created_at',
          dependsOn: 'resolution_id',
          filterFromValues: (q: any, values: Record<string, any>) =>
            q.eq('resolution_id', values.resolution_id),
          enrichOptions: async (options, _rows, values, meta) => {
            const rid = String(values.resolution_id ?? '').trim()
            if (!rid || !options.length) return options
            try {
              const resumen = await fetchResolutionSaldoResumen(rid, meta?.recordId ?? null)
              const byId = new Map((resumen?.items ?? []).map(i => [i.itemId, i]))
              const selected = String(values.resolution_item_id ?? '').trim()
              return options.map(o => {
                const item = byId.get(o.value)
                const saldo = item ? Number(item.saldo) || 0 : 0
                const sinSaldo = saldo <= 0.009
                // Mantener habilitada la línea ya elegida en edición
                const disabled = sinSaldo && o.value !== selected
                return {
                  ...o,
                  label: `${o.label} · Saldo ${fmtMoney(saldo)}`,
                  sub: disabled
                    ? `${o.sub ? `${o.sub} · ` : ''}Sin saldo disponible`
                    : o.sub,
                  disabled,
                }
              })
            } catch {
              return options
            }
          },
        },
      },
      {
        name: 'acta_id',
        label: 'Acta vinculada',
        type: 'fk',
        fk: {
          table: 'actas',
          select: 'id,numero,fecha,proyecto_id',
          label: (r: any) => `Acta ${r.numero}`,
          sub: (r: any) => fmtDate(r.fecha),
          orderBy: 'numero',
          dependsOn: proyectoId ? undefined : 'proyecto_id',
          filter: proyectoId ? (q: any) => q.eq('proyecto_id', proyectoId) : undefined,
          filterFromValues: proyectoId
            ? undefined
            : (q: any, values: Record<string, any>) => {
                const pid = String(values.proyecto_id ?? '').trim()
                if (!pid) return q.eq('id', '00000000-0000-0000-0000-000000000000')
                return q.eq('proyecto_id', pid)
              },
          enrichOptions: async (options, _rows, values, meta) => {
            if (!options.length) return options
            try {
              const saldoByActa = await fetchActaSaldoDisponibleMap(
                options.map(o => o.value),
                { excludeStrId: meta?.recordId ?? null },
              )
              const selected = String(values.acta_id ?? '').trim()
              return options.map(o => {
                const saldo = saldoByActa.get(o.value) ?? 0
                const sinSaldo = saldo <= 0.009
                const disabled = sinSaldo && o.value !== selected
                return {
                  ...o,
                  label: `${o.label} · Saldo ${fmtMoney(saldo)}`,
                  sub: disabled
                    ? `${o.sub ? `${o.sub} · ` : ''}Sin saldo disponible`
                    : o.sub,
                  disabled,
                }
              })
            } catch {
              return options
            }
          },
        },
      },
      { name: 'fuente_id', label: 'Fuente de financiamiento', type: 'fk', required: true, fk: { table: 'fuentes_financiamiento', select: 'id,descripcion', label: r => r.descripcion, orderBy: 'descripcion' } },
      { name: 'numero_obligacion', label: 'N° de obligación', type: 'text' },
      { name: 'fecha_obligacion', label: 'Fecha de obligación', type: 'date' },
      { name: 'nro_ot', label: 'N° de OT', type: 'text' },
      {
        name: 'fecha_desembolso',
        label: 'Fecha de desembolso',
        type: 'date',
        derive: (v) => {
          const raw = String(v ?? '').trim()
          if (!raw) return { fecha_rendicion: '' }
          return { fecha_rendicion: addBusinessDays(raw, 60) }
        },
      },
      { name: 'numero_factura', label: 'N° de factura', type: 'text' },
      { name: 'numero_recibo', label: 'N° de recibo', type: 'text' },
      { name: 'fecha_recibo', label: 'Fecha de recibo', type: 'date' },
      {
        name: 'fecha_rendicion',
        label: 'Fecha de rendición',
        type: 'date',
        placeholder: 'Auto: desembolso + 60 días hábiles',
      },
    ],
    rowActions: (row, reload) => (
      <div className="flex items-center gap-0.5">
        <StrControlFormularioButton
          strId={String(row.id)}
          strNumero={row.numero}
          onChanged={reload}
        />
        <StrAdjuntosButton
          strId={String(row.id)}
          strNumero={row.numero}
          adjuntosCount={Array.isArray(row.adjuntos) ? row.adjuntos.length : 0}
          onChanged={reload}
        />
      </div>
    ),
    sumColumns: ['monto'],
  }
}

export function devolucionesConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'devoluciones',
    eyebrow: 'Pagos',
    title: 'Devoluciones',
    singular: 'Devolución',
    subtitle: proyectoId ? undefined : 'Devoluciones de recursos sobre pagos STR',
    select: '*, str:strs' + (proyectoId ? '!inner' : '') + '(numero, proyecto_id), objeto:objetos_de_gastos(codigo)',
    filter: proyectoId ? { 'str.proyecto_id': proyectoId } : undefined,
    embedded: !!proyectoId,
    emptyHint: 'Registre recibos de devolución vinculados a un STR.',
    columns: [
      { key: 'numero_recibo', label: 'N° Recibo', render: (r: any) => <Badge color="brand">{r.numero_recibo}</Badge> },
      { key: 'str.numero', label: 'STR' },
      { key: 'fecha', label: 'Fecha', render: (r: any) => fmtDate(r.fecha) },
      { key: 'objeto.codigo', label: 'OG' },
      { key: 'monto', label: 'Monto', align: 'right', render: (r: any) => <span className="font-semibold">{fmtMoney(r.monto)}</span> },
      { key: 'procesado_en_sico', label: 'SICO', align: 'center', render: (r: any) => r.procesado_en_sico ? <Badge color="green">Procesado</Badge> : <Badge color="amber">Pendiente</Badge> },
    ],
    fields: [
      {
        name: 'str_id', label: 'STR', type: 'fk', required: true,
        fk: {
          table: 'strs', select: 'id,numero,fecha,monto', label: (r: any) => `STR ${r.numero}`, sub: (r: any) => `${fmtDate(r.fecha)} · ${fmtMoney(r.monto)}`,
          filter: proyectoId ? (q: any) => q.eq('proyecto_id', proyectoId) : undefined,
        },
      },
      { name: 'numero_recibo', label: 'Número de recibo', type: 'text', required: true },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'monto', label: 'Monto', type: 'money', required: true },
      { name: 'objeto_gasto_id', label: 'Objeto de gasto', type: 'fk', fk: { table: 'objetos_de_gastos', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'procesado_en_sico', label: 'Procesado en SICO', type: 'boolean', defaultValue: false },
    ],
    sumColumns: ['monto'],
  }
}

export function rendicionesConfig(proyectoId?: string): CrudConfig {
  const strSelect = proyectoId
    ? '*, str:strs!inner(id, numero, monto, nro_ot, fecha_desembolso, fecha_rendicion, proyecto_id), adjuntos:rendicion_archivos(id)'
    : '*, str:strs(id, numero, monto, nro_ot, fecha_desembolso, fecha_rendicion, proyecto_id, proyecto:proyectos(descripcion, componente:componentes_programa(codigo, descripcion))), adjuntos:rendicion_archivos(id)'

  return {
    table: 'rendiciones_cuentas',
    eyebrow: 'Rendición',
    title: 'Rendiciones de cuentas',
    singular: 'Rendición',
    subtitle: proyectoId ? undefined : 'Presentación de rendiciones ante la CGR por cada STR',
    select: strSelect,
    filter: proyectoId ? { 'str.proyecto_id': proyectoId } : undefined,
    embedded: !!proyectoId,
    emptyHint: 'Cada rendición cierra el ciclo de un pago STR ante la CGR.',
    orderBy: { column: 'created_at', ascending: false },
    pageSize: 12,
    denseTable: true,
    transformRows: attachStrRendicionSaldos,
    columns: [
      {
        key: 'str.numero',
        label: 'STR',
        className: proyectoId ? 'w-[14%]' : 'w-[12%]',
        render: (r: any) => <RendicionStrCell row={r} />,
      },
      ...(proyectoId
        ? []
        : [{
            key: 'str.proyecto.descripcion',
            label: 'Proyecto',
            className: 'w-[20%]',
            render: (r: any) => {
              const proy = r.str?.proyecto
              const nombre = (proy?.descripcion ?? '').trim()
              const comp = proy?.componente
              const compNombre = (comp?.descripcion ?? '').trim()
              const label = nombre && compNombre
                ? `${nombre} - ${compNombre}`
                : (nombre || compNombre || '—')
              return (
                <span className="text-[10px] font-medium uppercase leading-snug text-slate-700" title={label}>
                  {label}
                </span>
              )
            },
          } as ColDef]),
      {
        key: 'str.fecha_desembolso',
        label: 'Desembolso',
        className: 'w-[9%]',
        render: (r: any) => fmtDateCompact(r.str?.fecha_desembolso),
      },
      {
        key: 'str.fecha_rendicion',
        label: 'Límite',
        className: 'w-[9%]',
        render: (r: any) => fmtDateCompact(r.str?.fecha_rendicion),
      },
      {
        key: 'fecha_presentacion_cgr',
        label: 'Pres. CGR',
        className: 'w-[9%]',
        render: (r: any) => fmtDateOrPendiente(r.fecha_presentacion_cgr),
      },
      {
        key: '__dias_atraso',
        label: 'Días Atraso',
        className: 'w-[11%] text-center',
        align: 'center',
        sortable: false,
        render: (r: any) => (
          <RendicionDiasAtrasoCell
            fechaLimite={r.str?.fecha_rendicion}
            fechaPresentacionCgr={r.fecha_presentacion_cgr}
          />
        ),
      },
      {
        key: 'monto_rendicion',
        label: 'Rendido',
        align: 'right',
        className: 'w-[11%]',
        render: (r: any) => fmtMoneyCompactCell(r.monto_rendicion),
      },
      {
        key: '__saldo_rendir',
        label: 'Saldo',
        align: 'right',
        className: 'w-[10%]',
        sortable: false,
        sortFn: (a, b) => rendicionSaldoARendir(a) - rendicionSaldoARendir(b),
        render: (r: any) => {
          const saldo = rendicionSaldoARendir(r)
          return (
            <span
              className={`whitespace-nowrap text-[11px] tabular-nums ${
                saldo <= 0.009 ? 'font-semibold text-emerald-700' : 'text-slate-700'
              }`}
              title={
                r.str_rendido_acumulado != null
                  ? `Acumulado hasta esta rendición: ${fmtMoney(r.str_rendido_acumulado)} · Total STR rendido: ${fmtMoney(r.str_rendido_total)}`
                  : undefined
              }
            >
              {fmtMoney(saldo)}
            </span>
          )
        },
      },
      {
        key: 'estado',
        label: 'Estado',
        className: 'w-[9%]',
        render: (r: any) => <RendicionEstadoBadge estado={r.estado} />,
      },
    ],
    fields: [
      {
        name: 'str_id',
        label: 'STR a rendir',
        type: 'fk',
        required: true,
        fk: {
          table: 'strs',
          select: 'id,numero,fecha,monto,nro_ot',
          label: (r: any) => `STR ${r.numero}`,
          sub: (r: any) => fmtDate(r.fecha),
          filter: proyectoId ? (q: any) => q.eq('proyecto_id', proyectoId) : undefined,
          enrichOptions: async (options, rows, values, meta) => {
            if (!options.length) return options
            try {
              const saldoByStr = await fetchStrSaldoDisponibleMap(
                rows.map((r: any) => ({ id: String(r.id), monto: r.monto })),
                meta?.recordId ?? null,
              )
              const selected = String(values.str_id ?? '').trim()
              return options.map(o => {
                const saldo = saldoByStr.get(o.value) ?? 0
                const sinSaldo = saldo <= 0.009
                const disabled = sinSaldo && o.value !== selected
                return {
                  ...o,
                  label: `${o.label} · Saldo ${fmtMoney(saldo)}`,
                  sub: disabled
                    ? 'Sin saldo disponible'
                    : o.sub
                      ? `${o.sub} · Solo saldo pendiente`
                      : 'Solo saldo pendiente',
                  disabled,
                }
              })
            } catch {
              return options
            }
          },
        },
        derive: async (value, values) => {
          const sid = String(value ?? '').trim()
          if (!sid) return { monto_rendicion: '' }
          const cached = peekStrSaldoFormCache(sid)
          const { data: str, error } = await supabase
            .from('strs')
            .select('id, monto')
            .eq('id', sid)
            .maybeSingle()
          if (error || !str) {
            if (cached == null) return {}
            return { monto_rendicion: cached > 0 ? cached : 0 }
          }
          const saldo = await fetchSaldoDisponibleStr(
            sid,
            Number(str.monto) || 0,
            values?.id ? String(values.id) : null,
          )
          setStrSaldoFormCacheEntry(sid, saldo)
          return { monto_rendicion: saldo > 0 ? saldo : 0 }
        },
      },
      {
        name: 'expediente_id',
        label: 'Expediente',
        type: 'fk',
        fk: {
          table: 'expedientes',
          select: 'id,numero_expediente,asunto,fecha_recepcion',
          label: (r: any) => r.numero_expediente,
          sub: (r: any) => r.asunto ?? '',
          orderBy: 'fecha_recepcion',
          orderAscending: false,
          fetchAll: true,
          limit: 10_000,
        },
      },
      { name: 'fecha_presentacion_cgr', label: 'Fecha de presentación a CGR', type: 'date' },
      { name: 'monto_rendicion', label: 'Monto de la rendición', type: 'money', required: true },
      {
        name: 'estado',
        label: 'Estado',
        type: 'select',
        options: ['Presentada', 'Observada', 'Aprobada'].map(v => ({
          value: v,
          label: v,
        })),
        defaultValue: 'Presentada',
      },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ],
    beforeSave: async ({ values, existing }) => {
      const strId = String(values.str_id ?? '').trim()
      const monto = asGs(values.monto_rendicion)
      if (!strId) throw new Error('Seleccioná una STR a rendir.')
      if (monto <= 0) throw new Error('El monto de la rendición debe ser mayor a cero.')

      const { data: str, error } = await supabase
        .from('strs')
        .select('id, monto, numero')
        .eq('id', strId)
        .maybeSingle()
      if (error) throw error
      if (!str) throw new Error('No se encontró la STR seleccionada.')

      const saldo = await fetchSaldoDisponibleStr(
        strId,
        Number(str.monto) || 0,
        existing?.id ? String(existing.id) : null,
      )
      if (monto > saldo + 0.009) {
        throw new Error(
          `El monto supera el saldo disponible de la STR ${str.numero ?? ''}: ${fmtMoney(saldo)} ` +
            `(ya se descontaron las rendiciones anteriores).`,
        )
      }
    },
    rowActions: (row: any, reload) => (
      <div className="flex items-center gap-0.5">
        <RendicionControlFormularioButton
          rendicionId={String(row.id)}
          strNumero={row.str?.numero}
          onChanged={reload}
        />
        <RendicionAdjuntosButton
          rendicionId={String(row.id)}
          strNumero={row.str?.numero}
          adjuntosCount={Array.isArray(row.adjuntos) ? row.adjuntos.length : 0}
          onChanged={reload}
        />
      </div>
    ),
    sumColumns: ['monto_rendicion'],
  }
}

export function proyectoDocumentosConfig(proyectoId?: string): CrudConfig {
  return {
    table: 'proyecto_adjuntos',
    title: 'Archivos',
    singular: 'Archivo',
    subtitle: proyectoId ? undefined : 'Archivos complementarios por proyecto',
    select: '*' + (proyectoId ? '' : ', proyecto:proyectos(descripcion)'),
    fixed: proyectoId ? { proyecto_id: proyectoId } : undefined,
    embedded: !!proyectoId,
    userIdField: 'user_id',
    hideExcelExport: true,
    orderBy: { column: 'created_at', ascending: false },
    emptyHint: 'Agregue archivos con una descripción.',
    columns: [
      ...(proyectoId ? [] : [proyectoCol]),
      { key: 'descripcion', label: 'Descripción' },
      {
        key: 'file_name',
        label: 'Archivo',
        align: 'center',
        render: (r: any) => (
          <ArchivoAdjuntoLink path={r.file_path} bucket={STORAGE_BUCKET_PROYECTO_ADJUNTOS} />
        ),
      },
      { key: 'created_at', label: 'Fecha', render: (r: any) => fmtDate(r.created_at) },
    ],
    fields: [
      ...(proyectoId ? [] : [proyectoFk]),
      { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan2: true },
      {
        name: 'file_path',
        label: 'Archivo',
        type: 'file',
        required: true,
        colSpan2: true,
        storageBucket: STORAGE_BUCKET_PROYECTO_ADJUNTOS,
        storagePathPrefix: proyectoId ? `proyectos/${proyectoId}` : 'proyectos',
        storageFileNameField: 'file_name',
        storageFileTypeField: 'file_type',
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip',
      },
    ],
  }
}
