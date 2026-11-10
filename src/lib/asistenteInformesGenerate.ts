import { emptyInformesFilters } from '../components/InformesFiltersBar'
import { exportRowsToExcel, type ExcelColumn, type ExcelHeaderGroup } from './exportTableExcel'
import { exportInformeAdminPdf } from './informesAdminPdf'
import { loadInformePayload, type InformePayload } from './informesAdminData'
import type { InformeReportId } from './informesAdminCatalog'
import { createPdfDoc, pdfFinishAndSave, preparePdfLayout } from './pdf'
import { drawPdfTable, pdfBodyText, pdfSectionHeading } from './pdfTable'
import { dateOnlyIso, fmtDate, fmtDateTime, fmtMoney, nowDateInputValue } from './format'
import { exportStrsListPdf } from './strsListPdf'
import { supabase } from './supabase'
import { loadAuditoria } from './auditoria'
import { applyRowFilters, describeWhere } from './asistenteInformesFilters'
import { asistenteReportById } from './asistenteInformesCatalog'
import type { AsistenteIntent } from './asistenteInformesIntent'

function inRange(iso: string | null | undefined, desde?: string | null, hasta?: string | null): boolean {
  const d = dateOnlyIso(iso)
  if (!d) return !(desde || hasta)
  if (desde && d < desde) return false
  if (hasta && d > hasta) return false
  return true
}

function downloadWordHtml(
  title: string,
  headers: string[],
  rows: (string | number | null)[][],
  filename: string,
  headerGroups?: ExcelHeaderGroup[],
) {
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const th = (label: string, attrs = '') =>
    `<th${attrs} style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:center">${esc(label)}</th>`
  let thead: string
  const groupsOk = Boolean(
    headerGroups?.length
    && headerGroups.reduce((s, g) => s + g.span, 0) === headers.length,
  )
  if (groupsOk && headerGroups) {
    let i = 0
    const top = headerGroups.map(g => {
      if (g.span === 1) {
        i += 1
        return th(g.label, ' rowspan="2"')
      }
      i += g.span
      return th(g.label, ` colspan="${g.span}"`)
    }).join('')
    i = 0
    const sub = headerGroups.flatMap(g => {
      if (g.span === 1) {
        i += 1
        return [] as string[]
      }
      const cells = headers.slice(i, i + g.span).map(h => th(h))
      i += g.span
      return cells
    }).join('')
    thead = `<tr>${top}</tr><tr>${sub}</tr>`
  } else {
    thead = `<tr>${headers.map(h => th(h)).join('')}</tr>`
  }
  const tbody = rows
    .map(
      r =>
        `<tr>${r.map(c => `<td style="border:1px solid #ddd;padding:5px">${esc(c == null ? '' : String(c))}</td>`).join('')}</tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body>
<h2>${esc(title)}</h2>
<p style="color:#64748b;font-size:12px">Generado por Asistente de informes · ${esc(fmtDateTime(new Date().toISOString()))}</p>
<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:11px;width:100%">
<thead>${thead}</thead>
<tbody>${tbody || `<tr><td colspan="${headers.length}">Sin datos</td></tr>`}</tbody>
</table>
</body></html>`
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}.doc`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function exportSimplePdf(
  title: string,
  head: string[][],
  body: string[][],
  filename: string,
) {
  const doc = createPdfDoc({ orientation: 'landscape' })
  const layout = await preparePdfLayout(doc)
  let y = layout.contentTop
  y = pdfSectionHeading(doc, layout, y, title)
  y = pdfBodyText(doc, layout, y, [`Registros: ${body.length}`, `Generado: ${fmtDate(new Date().toISOString())}`])
  if (!body.length) {
    pdfBodyText(doc, layout, y, ['Sin datos para los filtros indicados.'])
  } else {
    drawPdfTable(doc, layout, y, head, body)
  }
  pdfFinishAndSave(doc, layout, filename)
}

function filtersFromIntent(intent: AsistenteIntent) {
  const f = emptyInformesFilters()
  if (intent.desde) f.desde = intent.desde
  if (intent.hasta) f.hasta = intent.hasta
  if (intent.mes) f.mes = String(intent.mes)
  if (intent.anio) f.anio = String(intent.anio)
  return f
}

function flattenAdminPayload(payload: InformePayload): {
  columns: ExcelColumn[]
  rows: any[]
  headerGroups?: ExcelHeaderGroup[]
} {
  if (payload.kind === 'cartera_360') {
    return {
      columns: [
        { key: 'proyecto', label: 'Proyecto' },
        { key: 'actividad', label: 'Actividad' },
        { key: 'programa', label: 'Programa' },
        { key: 'componente', label: 'Componente' },
        { key: 'planVigente', label: 'Plan vigente' },
        { key: 'strNeto', label: 'STR neto' },
        { key: 'saldo', label: 'Saldo' },
        { key: 'avancePct', label: 'Avance %' },
      ],
      rows: payload.rows,
    }
  }
  if (payload.kind === 'acta_resolucion_str') {
    const moneyKeys = [
      'montoProyectoTotal',
      'montoStrEjecutado',
      'montoSaldoProyecto',
      'montoEsteStr',
      'resolucionMontoTotal',
      'resolucionMontoEjecutado',
      'resolucionSaldo',
      'actaAprobado',
      'actaEjecutado',
      'actaSaldo',
    ] as const
    const totalRow: Record<string, string | number> = {
      item: '',
      proyecto: 'TOTAL GENERAL',
      strNumero: '',
      fecha: '',
      resolucionNumero: '',
      actaNumero: '',
    }
    for (const k of moneyKeys) {
      totalRow[k] = payload.rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
    }
    return {
      columns: [
        { key: 'item', label: 'Item' },
        { key: 'proyecto', label: 'Descripción' },
        { key: 'montoProyectoTotal', label: 'Monto Total' },
        { key: 'montoStrEjecutado', label: 'Monto Ejec.' },
        { key: 'montoSaldoProyecto', label: 'Saldo' },
        { key: 'strNumero', label: 'N.º' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'montoEsteStr', label: 'Monto' },
        { key: 'resolucionNumero', label: 'N.º' },
        { key: 'resolucionMontoTotal', label: 'Monto Total' },
        { key: 'resolucionMontoEjecutado', label: 'Monto Ejec.' },
        { key: 'resolucionSaldo', label: 'Saldo' },
        { key: 'actaNumero', label: 'N.º' },
        { key: 'actaAprobado', label: 'Monto Aprob.' },
        { key: 'actaEjecutado', label: 'Monto Ejec.' },
        { key: 'actaSaldo', label: 'Saldos' },
      ],
      headerGroups: [
        { label: 'Item', span: 1 },
        { label: 'Proyecto', span: 4 },
        { label: 'STR', span: 3 },
        { label: 'Resolución', span: 4 },
        { label: 'Actas', span: 4 },
      ],
      rows: [...payload.rows, totalRow],
    }
  }
  if (payload.kind === 'radar_rendiciones') {
    return {
      columns: [
        { key: 'proyecto', label: 'Proyecto' },
        { key: 'str', label: 'STR' },
        { key: 'estado', label: 'Estado' },
        { key: 'montoStr', label: 'Monto STR' },
        { key: 'montoRendicion', label: 'Rendido' },
        { key: 'fechaDesembolso', label: 'Desembolso' },
        { key: 'fechaLimite', label: 'Fecha límite' },
        { key: 'fechaPresentacion', label: 'Presentación' },
        { key: 'alerta', label: 'Alerta' },
        { key: 'diasAtraso', label: 'Días atraso' },
      ],
      rows: payload.rows,
    }
  }
  if (payload.kind === 'pulso_mensual') {
    return {
      columns: Object.keys(payload.rows[0] ?? { proyecto: '', cdpMes: 0 }).map(k => ({ key: k, label: k })),
      rows: payload.rows,
    }
  }
  if (payload.kind === 'plan_vs_str') {
    const rows = payload.blocks.flatMap(b =>
      (b as any).rows ?? [{ bloque: (b as any).titulo ?? (b as any).label, ...b }],
    )
    const sample = rows[0] ?? { detalle: '' }
    return {
      columns: Object.keys(sample).map(k => ({ key: k, label: k })),
      rows,
    }
  }
  const rows = (payload as any).rows ?? []
  const sample = rows[0] ?? {}
  return {
    columns: Object.keys(sample).map(k => ({ key: k, label: k })),
    rows,
  }
}

function matchesQ(haystack: string, q?: string | null): boolean {
  if (!q?.trim()) return true
  const n = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return n(haystack).includes(n(q.trim()))
}

function esFinalizadoRow(r: { estado_finalizado?: boolean | null; estado?: string | null }): boolean {
  if (r.estado_finalizado) return true
  return String(r.estado ?? '').trim().toLowerCase() === 'finalizado'
}

async function genExpedientes(intent: AsistenteIntent) {
  const { data, error } = await supabase
    .from('expedientes')
    .select('numero_expediente, asunto, estado, estado_finalizado, fecha_recepcion, entidad:entidades(razon_social)')
    .order('fecha_recepcion', { ascending: false })
    .limit(3000)
  if (error) throw error
  const rows = (data ?? []).filter(r => {
    if (!inRange(r.fecha_recepcion, intent.desde, intent.hasta)) return false
    if (intent.situacion === 'finalizado' && !esFinalizadoRow(r)) return false
    if (intent.situacion === 'tramite' && esFinalizadoRow(r)) return false
    const entidad = Array.isArray(r.entidad) ? r.entidad[0] : r.entidad
    const blob = `${r.numero_expediente ?? ''} ${r.asunto ?? ''} ${r.estado ?? ''} ${(entidad as any)?.razon_social ?? ''}`
    return matchesQ(blob, intent.q)
  })
  const columns: ExcelColumn[] = [
    { key: 'numero_expediente', label: 'N° expediente' },
    { key: 'asunto', label: 'Asunto' },
    { key: 'entidad.razon_social', label: 'Entidad' },
    { key: 'estado', label: 'Estado' },
    { key: 'estado_finalizado', label: 'Finalizado' },
    { key: 'fecha_recepcion', label: 'Fecha recepción' },
  ]
  const flat = rows.map(r => ({
    ...r,
    estado_finalizado: esFinalizadoRow(r) ? 'Sí' : 'No',
    fecha_recepcion: fmtDateTime(r.fecha_recepcion),
    entidad: Array.isArray(r.entidad) ? r.entidad[0] : r.entidad,
  }))
  const title =
    intent.situacion === 'finalizado'
      ? 'Expedientes finalizados'
      : intent.situacion === 'tramite'
        ? 'Expedientes en trámite'
        : 'Listado de expedientes'
  if (intent.formato === 'excel') {
    exportRowsToExcel(flat, columns, { sheetName: 'Expedientes', filename: 'expedientes' })
  } else if (intent.formato === 'word') {
    downloadWordHtml(
      title,
      columns.map(c => c.label),
      flat.map(r => [
        r.numero_expediente,
        r.asunto,
        (r.entidad as any)?.razon_social ?? '',
        r.estado,
        r.estado_finalizado,
        r.fecha_recepcion,
      ]),
      'expedientes',
    )
  } else {
    await exportSimplePdf(
      title,
      [columns.map(c => c.label)],
      flat.map(r => [
        String(r.numero_expediente ?? ''),
        String(r.asunto ?? '').slice(0, 60),
        String((r.entidad as any)?.razon_social ?? '').slice(0, 40),
        String(r.estado ?? ''),
        String(r.estado_finalizado ?? ''),
        String(r.fecha_recepcion ?? ''),
      ]),
      'expedientes',
    )
  }
  return flat.length
}

async function genStrs(intent: AsistenteIntent) {
  const { data, error } = await supabase
    .from('strs')
    .select(`
      numero, fecha, monto, nro_resolucion, fecha_resolucion, estado,
      proyecto:proyectos(descripcion),
      og:objetos_de_gastos(codigo, descripcion),
      fuente:fuentes_financiamiento(descripcion, detalle),
      resolucion:resolutions(numero, fecha),
      acta:actas(numero, fecha)
    `)
    .order('fecha', { ascending: false })
    .limit(3000)
  if (error) throw error
  const rows = (data ?? []).filter(r => {
    if (!inRange(r.fecha, intent.desde, intent.hasta)) return false
    const proy = Array.isArray(r.proyecto) ? r.proyecto[0] : r.proyecto
    const res = Array.isArray(r.resolucion) ? r.resolucion[0] : r.resolucion
    const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
    const blob = `${r.numero ?? ''} ${r.estado ?? ''} ${r.nro_resolucion ?? ''} ${(res as any)?.numero ?? ''} ${(acta as any)?.numero ?? ''} ${(proy as any)?.descripcion ?? ''}`
    return matchesQ(blob, intent.q)
  })
  const columns: ExcelColumn[] = [
    { key: 'numero', label: 'N° STR' },
    { key: 'fecha', label: 'Fecha' },
    { key: 'proyecto.descripcion', label: 'Proyecto' },
    { key: 'monto', label: 'Monto' },
    { key: 'nro_resolucion', label: 'N° Resolución' },
    { key: 'fecha_resolucion', label: 'Fecha Resolución' },
    { key: 'nro_acta', label: 'N° Acta' },
    { key: 'fecha_acta', label: 'Fecha de Acta' },
    { key: 'estado', label: 'Estado' },
  ]
  const flat = rows.map(r => {
    const res = Array.isArray(r.resolucion) ? r.resolucion[0] : r.resolucion
    const acta = Array.isArray(r.acta) ? r.acta[0] : r.acta
    return {
      ...r,
      fecha: fmtDate(r.fecha),
      nro_resolucion: (res as any)?.numero ?? r.nro_resolucion ?? '',
      fecha_resolucion: fmtDate((res as any)?.fecha ?? r.fecha_resolucion),
      nro_acta: (acta as any)?.numero ?? '',
      fecha_acta: fmtDate((acta as any)?.fecha),
      proyecto: Array.isArray(r.proyecto) ? r.proyecto[0] : r.proyecto,
      monto: Number(r.monto) || 0,
    }
  })
  if (intent.formato === 'excel') {
    exportRowsToExcel(flat, columns, { sheetName: 'STR', filename: 'strs' })
  } else if (intent.formato === 'word') {
    downloadWordHtml(
      'Listado de STR',
      columns.map(c => c.label),
      flat.map(r => [
        r.numero,
        r.fecha,
        (r.proyecto as any)?.descripcion ?? '',
        fmtMoney(r.monto as number),
        r.nro_resolucion,
        r.fecha_resolucion,
        r.nro_acta,
        r.fecha_acta,
        r.estado,
      ]),
      'strs',
    )
  } else {
    await exportStrsListPdf(rows, {
      desde: intent.desde ?? undefined,
      hasta: intent.hasta ?? undefined,
    })
  }
  return rows.length
}

async function genProyectos(intent: AsistenteIntent) {
  const { data, error } = await supabase
    .from('proyectos')
    .select(`
      descripcion, monto, convenio, created_at,
      componente:componentes_programa(codigo, descripcion, programa:programas(codigo, descripcion))
    `)
    .order('descripcion', { ascending: true })
    .limit(3000)
  if (error) throw error
  const rows = (data ?? []).filter(r => {
    if (!inRange(r.created_at, intent.desde, intent.hasta)) return false
    const comp = Array.isArray(r.componente) ? r.componente[0] : r.componente
    const prog = comp?.programa ? (Array.isArray(comp.programa) ? comp.programa[0] : comp.programa) : null
    const blob = `${r.descripcion ?? ''} ${r.convenio ?? ''} ${prog?.descripcion ?? ''} ${comp?.descripcion ?? ''}`
    return matchesQ(blob, intent.q)
  })
  const flat = rows.map(r => {
    const comp = Array.isArray(r.componente) ? r.componente[0] : r.componente
    const prog = comp?.programa
      ? (Array.isArray(comp.programa) ? comp.programa[0] : comp.programa)
      : null
    return {
      descripcion: r.descripcion,
      monto: Number(r.monto) || 0,
      convenio: r.convenio,
      programa: prog ? `${prog.codigo ?? ''} ${prog.descripcion ?? ''}`.trim() : '',
      componente: comp ? `${comp.codigo ?? ''} ${comp.descripcion ?? ''}`.trim() : '',
    }
  })
  const columns: ExcelColumn[] = [
    { key: 'descripcion', label: 'Proyecto' },
    { key: 'programa', label: 'Programa' },
    { key: 'componente', label: 'Componente' },
    { key: 'monto', label: 'Monto' },
    { key: 'convenio', label: 'Convenio' },
  ]
  if (intent.formato === 'excel') {
    exportRowsToExcel(flat, columns, { sheetName: 'Proyectos', filename: 'proyectos' })
  } else if (intent.formato === 'word') {
    downloadWordHtml(
      'Listado de proyectos',
      columns.map(c => c.label),
      flat.map(r => [r.descripcion, r.programa, r.componente, fmtMoney(r.monto), r.convenio]),
      'proyectos',
    )
  } else {
    await exportSimplePdf(
      'Listado de proyectos',
      [columns.map(c => c.label)],
      flat.map(r => [
        String(r.descripcion ?? '').slice(0, 50),
        String(r.programa ?? '').slice(0, 30),
        String(r.componente ?? '').slice(0, 30),
        fmtMoney(r.monto).replace(/[^\d.,\-Gs\s]/g, ''),
        String(r.convenio ?? ''),
      ]),
      'proyectos',
    )
  }
  return flat.length
}

async function genAuditoria(intent: AsistenteIntent) {
  const hasta = intent.hasta || nowDateInputValue()
  const desde = intent.desde || (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return dateOnlyIso(d.toISOString()) || hasta
  })()
  const { data, error } = await loadAuditoria({
    desde,
    hasta,
    limit: 2000,
    offset: 0,
  })
  if (error) throw new Error(error)
  const flat = data.map(r => ({
    created_at: fmtDateTime(r.created_at),
    accion: r.accion,
    tabla: r.tabla,
    usuario: r.actor?.email || r.actor?.name || r.actor_id,
    resumen: r.resumen,
  }))
  const columns: ExcelColumn[] = [
    { key: 'created_at', label: 'Fecha' },
    { key: 'accion', label: 'Acción' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'usuario', label: 'Usuario' },
    { key: 'resumen', label: 'Resumen' },
  ]
  if (intent.formato === 'excel') {
    exportRowsToExcel(flat, columns, { sheetName: 'Auditoría', filename: 'auditoria' })
  } else if (intent.formato === 'word') {
    downloadWordHtml(
      'Auditoría',
      columns.map(c => c.label),
      flat.map(r => [r.created_at, r.accion, r.tabla, r.usuario, String(r.resumen ?? '').slice(0, 200)]),
      'auditoria',
    )
  } else {
    await exportSimplePdf(
      'Auditoría del sistema',
      [columns.map(c => c.label)],
      flat.slice(0, 200).map(r => [
        String(r.created_at ?? ''),
        String(r.accion ?? ''),
        String(r.tabla ?? ''),
        String(r.usuario ?? '').slice(0, 28),
        String(r.resumen ?? '').slice(0, 40),
      ]),
      'auditoria',
    )
  }
  return flat.length
}

async function genAdminInforme(intent: AsistenteIntent) {
  const reportId = intent.reportId as InformeReportId
  const filters = filtersFromIntent(intent)
  let payload = await loadInformePayload(reportId, filters)

  // WHERE / JOIN lógico sobre filas (ej. alerta = Atrasada)
  if (intent.where?.length && 'rows' in payload && Array.isArray((payload as any).rows)) {
    const rows = applyRowFilters((payload as any).rows, intent.where)
    const next: any = { ...payload, rows }
    if (payload.kind === 'radar_rendiciones') {
      next.totals = {
        count: rows.length,
        totalGs: rows.reduce((s: number, r: any) => s + (Number(r.montoStr) || 0), 0),
        secondaryLabel: 'Rendido',
        secondaryGs: rows.reduce((s: number, r: any) => s + (Number(r.montoRendicion) || 0), 0),
      }
      next.filterLabels = [
        ...(payload.filterLabels ?? []),
        `Filtro asistente: ${describeWhere(intent.where)}`,
      ]
    } else if ('totals' in payload && payload.totals) {
      next.totals = { ...payload.totals, count: rows.length }
      next.filterLabels = [
        ...((payload as any).filterLabels ?? []),
        `Filtro asistente: ${describeWhere(intent.where)}`,
      ]
    }
    payload = next
  }

  if (intent.formato === 'pdf') {
    await exportInformeAdminPdf(reportId, payload)
    const preview = (payload as any).totals?.count ?? (payload as any).rows?.length ?? (payload as any).blocks?.length ?? 0
    return Number(preview) || 0
  }
  const { columns, rows, headerGroups } = flattenAdminPayload(payload)
  const def = asistenteReportById(reportId)
  const name = def?.label ?? reportId
  if (intent.formato === 'excel') {
    exportRowsToExcel(rows, columns, {
      sheetName: name.slice(0, 31),
      filename: reportId,
      headerGroups,
    })
  } else {
    downloadWordHtml(
      name,
      columns.map(c => c.label),
      rows.map(r => columns.map(c => {
        const v = c.key.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), r)
        return v == null ? '' : String(v)
      })),
      reportId,
      headerGroups,
    )
  }
  return rows.length
}

export type AsistenteGenerateResult = {
  ok: boolean
  count: number
  message: string
}

export async function generateAsistenteInforme(
  intent: AsistenteIntent,
  opts?: { isAdmin?: boolean },
): Promise<AsistenteGenerateResult> {
  const def = asistenteReportById(intent.reportId)
  if (!def) return { ok: false, count: 0, message: 'Informe no reconocido.' }
  if (def.adminOnly && !opts?.isAdmin) {
    return { ok: false, count: 0, message: 'Este informe requiere rol administrador o desarrollador.' }
  }

  let count = 0
  switch (intent.reportId) {
    case 'expedientes':
      count = await genExpedientes(intent)
      break
    case 'strs':
      count = await genStrs(intent)
      break
    case 'proyectos':
      count = await genProyectos(intent)
      break
    case 'auditoria':
      count = await genAuditoria(intent)
      break
    default:
      count = await genAdminInforme(intent)
      break
  }

  return {
    ok: true,
    count,
    message: `Listo: ${def.label} en ${intent.formato.toUpperCase()} (${count} registro${count === 1 ? '' : 's'}${
      intent.situacion ? `, filtro ${intent.situacion}` : ''
    }${intent.desde || intent.hasta ? `, periodo aplicado` : ''}${intent.q ? `, búsqueda “${intent.q}”` : ''}${
      describeWhere(intent.where) ? `, ${describeWhere(intent.where)}` : ''
    }).`,
  }
}
