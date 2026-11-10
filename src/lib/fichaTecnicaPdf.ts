import { supabase } from './supabase'
import { fmtDatePdf, fmtMoneyPdf, txtPdf } from './format'
import { calcSaldoDisponible } from './proyectoSaldos'
import { isResolucionSoloAprobacion } from './resolucionTipo'
import { attachResolutionEjecutadoFromStrs } from './resolutionSaldos'
import {
  createPdfDoc, PDF_MARGIN_MM,
  pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
} from './pdf'
import {
  drawPdfTable, pdfBodyText, pdfSectionHeading,
  PDF_TABLE_FONT,
} from './pdfTable'

function ajusteAdenda(a: { monto_ajuste: number; tipo_ajuste: string | null; estado: string | null }): number {
  const estado = (a.estado ?? '').toLowerCase()
  if (estado.includes('rechaz') || estado.includes('anulad')) return 0
  const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
  return sign * (Number(a.monto_ajuste) || 0)
}

function sumKey(rows: any[] | null, key: string): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

export interface FichaTecnicaData {
  proyecto: any
  montoOriginal: number
  totalAdendas: number
  presupuestoVigente: number
  totalStr: number
  totalDevoluciones: number
  saldoDisponible: number
  planes: any[]
  strs: any[]
  adendas: any[]
  actas: any[]
  rendiciones: any[]
  devoluciones: any[]
  resoluciones: any[]
  convenios: any[]
}

function fmtCatalogoPdf(codigo: string | null | undefined, descripcion: string | null | undefined): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `${c} — ${d}`
  if (c || d) return c || d
  return '---'
}

export async function loadFichaTecnicaData(proyectoId: string): Promise<FichaTecnicaData | null> {
  const [proy, planes, adendas, strs, actas, rends, devs, resol, conv] = await Promise.all([
    supabase.from('proyectos')
      .select('*, componente:componentes_programa(codigo, descripcion, actividad:actividades(codigo, descripcion), programa:programas(codigo, descripcion))')
      .eq('id', proyectoId).maybeSingle(),
    supabase.from('planes_financieros')
      .select('id, monto, proveedor:proveedores(razon_social), objeto:objetos_de_gastos(codigo, descripcion), fuente:fuentes_financiamiento(descripcion)')
      .eq('proyecto_id', proyectoId)
      .order('created_at'),
    supabase.from('adendas')
      .select('numero_adenda, fecha_adenda, tipo_ajuste, monto_ajuste, estado, descripcion, plan:planes_financieros!inner(proyecto_id)')
      .eq('plan.proyecto_id', proyectoId)
      .order('fecha_adenda', { ascending: false }),
    supabase.from('strs')
      .select('numero, fecha, monto, nro_resolucion, fecha_resolucion')
      .eq('proyecto_id', proyectoId)
      .order('fecha', { ascending: false }),
    supabase.from('actas')
      .select('numero, fecha, monto_aprobado, estado')
      .eq('proyecto_id', proyectoId)
      .order('fecha', { ascending: false }),
    supabase.from('rendiciones_cuentas')
      .select('monto_rendicion, fecha_presentacion_cgr, estado, observaciones, str:strs!inner(numero, proyecto_id)')
      .eq('str.proyecto_id', proyectoId)
      .order('fecha_presentacion_cgr', { ascending: false }),
    supabase.from('devoluciones')
      .select('numero_recibo, fecha, monto, str:strs!inner(numero, proyecto_id)')
      .eq('str.proyecto_id', proyectoId)
      .order('fecha', { ascending: false }),
    supabase.from('resolutions')
      .select('id, numero, fecha, fecha_recepcion, tipo, descripcion, observaciones, archivo_url, items:resolution_items(id, monto), proyectos_link:resolution_proyectos!inner(proyecto_id)')
      .eq('proyectos_link.proyecto_id', proyectoId)
      .order('fecha', { ascending: false }),
    supabase.from('convenios')
      .select('number, fecha_convenio, observaciones, archivo_adjunto, adendas:convenio_adendas(numero, fecha, archivo_firmado)')
      .eq('proyecto_id', proyectoId)
      .order('fecha_convenio', { ascending: false }),
  ])

  if (!proy.data) return null

  const planMonto = sumKey(planes.data, 'monto')
  const montoOriginal = planMonto || Number(proy.data.monto) || 0
  const totalAdendas = (adendas.data ?? []).reduce((s, a) => s + ajusteAdenda(a as any), 0)
  const presupuestoVigente = montoOriginal + totalAdendas
  const totalStr = sumKey(strs.data, 'monto')
  const totalDevoluciones = sumKey(devs.data, 'monto')
  const saldoDisponible = calcSaldoDisponible(presupuestoVigente, totalStr, totalDevoluciones)

  return {
    proyecto: proy.data,
    montoOriginal,
    totalAdendas,
    presupuestoVigente,
    totalStr,
    totalDevoluciones,
    saldoDisponible,
    planes: planes.data ?? [],
    strs: strs.data ?? [],
    adendas: adendas.data ?? [],
    actas: actas.data ?? [],
    rendiciones: rends.data ?? [],
    devoluciones: devs.data ?? [],
    resoluciones: await attachResolutionEjecutadoFromStrs(resol.data ?? []),
    convenios: conv.data ?? [],
  }
}

export async function exportFichaTecnicaPdf(proyectoId: string, filename?: string) {
  const data = await loadFichaTecnicaData(proyectoId)
  if (!data) throw new Error('Proyecto no encontrado')

  const doc = createPdfDoc({ orientation: 'portrait' })
  const layout = await preparePdfLayout(doc)
  let y = layout.contentTop

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text('FICHA TÉCNICA DEL PROYECTO', pdfPageWidth(doc) / 2, y, { align: 'center' })
  y += 12

  y = pdfSectionHeading(doc, layout, y, 'Información General')
  const comp = data.proyecto.componente
  const act = comp?.actividad
  const prog = comp?.programa
  y = pdfBodyText(doc, layout, y, [
    `Descripción: ${txtPdf(data.proyecto.descripcion)}`,
    `Nombre de Actividad: ${fmtCatalogoPdf(act?.codigo, act?.descripcion)}`,
    `Programa: ${fmtCatalogoPdf(prog?.codigo, prog?.descripcion)}`,
    `Componentes: ${fmtCatalogoPdf(comp?.codigo, comp?.descripcion)}`,
  ])

  y = pdfSectionHeading(doc, layout, y, 'Resumen Ejecutivo')
  y = drawPdfTable(doc, layout, y,
    [['Concepto', 'Monto']],
    [
      ['Monto Original', fmtMoneyPdf(data.montoOriginal)],
      ['Total Adendas', fmtMoneyPdf(data.totalAdendas)],
      ['Presupuesto Vigente', fmtMoneyPdf(data.presupuestoVigente)],
      ['Total Ejecutado (STRs)', fmtMoneyPdf(data.totalStr)],
      ['Devoluciones', fmtMoneyPdf(data.totalDevoluciones)],
    ],
    [['Saldo Disponible', fmtMoneyPdf(data.saldoDisponible)]],
    { 1: { halign: 'right' } },
  )

  const totalPlan = sumKey(data.planes, 'monto')
  y = pdfSectionHeading(doc, layout, y, `Plan Financiero (${data.planes.length})`)
  if (data.planes.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay líneas de plan financiero registradas'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Proveedor', 'OG', 'Descripción OG', 'Fuente', 'Monto']],
      data.planes.map((p, i) => [
        String(i + 1),
        txtPdf(p.proveedor?.razon_social),
        txtPdf(p.objeto?.codigo),
        txtPdf(p.objeto?.descripcion),
        txtPdf(p.fuente?.descripcion),
        fmtMoneyPdf(p.monto),
      ]),
      [['', '', '', '', 'TOTAL', fmtMoneyPdf(totalPlan)]],
      { 0: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right' } },
    )
  }

  const actaMontoAprobado = (a: { monto_aprobado?: number | null; estado?: string | null }) => {
    const est = String(a.estado ?? '').trim().toLowerCase()
    if (est === 'aprobación' || est === 'aprobacion') return 0
    return Number(a.monto_aprobado) || 0
  }
  const totalActas = data.actas.reduce((s, a) => s + actaMontoAprobado(a), 0)
  y = pdfSectionHeading(doc, layout, y, `Actas Registradas (${data.actas.length})`)
  if (data.actas.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay actas registradas'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Número de Acta', 'Fecha', 'Estado', 'Monto Aprobado']],
      data.actas.map((a, i) => [
        String(i + 1),
        txtPdf(a.numero),
        fmtDatePdf(a.fecha),
        (a.estado ?? '---').toLowerCase(),
        fmtMoneyPdf(actaMontoAprobado(a)),
      ]),
      [['', '', '', 'TOTAL', fmtMoneyPdf(totalActas)]],
      { 0: { halign: 'center', cellWidth: 12 }, 4: { halign: 'right' } },
    )
  }

  y = pdfSectionHeading(doc, layout, y, `Convenios vinculados (${data.convenios.length})`)
  if (data.convenios.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay convenios registrados'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Nro. Convenio', 'Fecha', 'Adenda', 'Adjuntos']],
      data.convenios.map((c, i) => [
        String(i + 1),
        txtPdf(c.number),
        fmtDatePdf(c.fecha_convenio),
        (Array.isArray(c.adendas) ? c.adendas : [])
          .map((a: any) => String(a?.numero ?? '').trim())
          .filter(Boolean)
          .join(', ') || '—',
        [
          c.archivo_adjunto ? 'Convenio' : '',
          (Array.isArray(c.adendas) ? c.adendas : []).some((a: any) => a?.archivo_firmado)
            ? `${(Array.isArray(c.adendas) ? c.adendas : []).filter((a: any) => a?.archivo_firmado).length} adenda(s) firmada(s)`
            : '',
        ].filter(Boolean).join(' · ') || '—',
      ]),
      undefined,
      { 0: { halign: 'center', cellWidth: 12 }, 2: { halign: 'center' } },
    )
  }

  y = pdfSectionHeading(doc, layout, y, `Resoluciones vinculadas (${data.resoluciones.length})`)
  if (data.resoluciones.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay resoluciones registradas'])
  } else {
    const moneyOrDash = (r: any, v: number) =>
      isResolucionSoloAprobacion(r.tipo) ? '—' : fmtMoneyPdf(v)
    const totalMontoRes = data.resoluciones.reduce((s, r) => {
      if (isResolucionSoloAprobacion(r.tipo)) return s
      return s + (Number(r.monto_plan) || 0)
    }, 0)
    const totalSaldoRes = data.resoluciones.reduce((s, r) => {
      if (isResolucionSoloAprobacion(r.tipo)) return s
      if (r.saldo_str != null) return s + (Number(r.saldo_str) || 0)
      return s + ((Number(r.monto_plan) || 0) - (Number(r.ejecutado_str) || 0))
    }, 0)
    y = drawPdfTable(doc, layout, y,
      [['#', 'Nro. Resolución', 'Fecha', 'Recepción', 'Tipo', 'Adjunto', 'Monto de la Resolución', 'Saldo']],
      data.resoluciones.map((r, i) => [
        String(i + 1),
        txtPdf(r.numero),
        fmtDatePdf(r.fecha),
        fmtDatePdf(r.fecha_recepcion),
        isResolucionSoloAprobacion(r.tipo) ? 'Aprobación' : 'Desembolso',
        r.archivo_url ? 'Sí' : '—',
        moneyOrDash(r, Number(r.monto_plan) || 0),
        moneyOrDash(r, r.saldo_str != null
          ? Number(r.saldo_str) || 0
          : (Number(r.monto_plan) || 0) - (Number(r.ejecutado_str) || 0)),
      ]),
      [['', '', '', '', '', 'TOTAL', fmtMoneyPdf(totalMontoRes), fmtMoneyPdf(totalSaldoRes)]],
      {
        0: { halign: 'center', cellWidth: 10 },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
    )
  }

  y = pdfSectionHeading(doc, layout, y, `Solicitudes de Transferencia de Recursos (${data.strs.length})`)
  if (data.strs.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay STR registrados'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Número de STR', 'Fecha de STR', 'Número de Resolución', 'Fecha de Resolución', 'Monto']],
      data.strs.map((s, i) => [
        String(i + 1),
        txtPdf(s.numero),
        fmtDatePdf(s.fecha),
        txtPdf(s.nro_resolucion),
        fmtDatePdf(s.fecha_resolucion),
        fmtMoneyPdf(s.monto),
      ]),
      [['', '', '', '', 'TOTAL', fmtMoneyPdf(data.totalStr)]],
      { 0: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right' } },
    )
  }

  y = pdfSectionHeading(doc, layout, y, `Adendas Registradas (${data.adendas.length})`)
  if (data.adendas.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay adendas registradas'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Número de Adenda', 'Fecha', 'Tipo de Ajuste', 'Observación', 'Monto']],
      data.adendas.map((a, i) => [
        String(i + 1),
        txtPdf(a.numero_adenda),
        fmtDatePdf(a.fecha_adenda),
        (a.tipo_ajuste ?? '---').toLowerCase(),
        txtPdf(a.descripcion),
        fmtMoneyPdf(a.monto_ajuste),
      ]),
      [['', '', '', '', 'TOTAL NETO', fmtMoneyPdf(data.totalAdendas)]],
      { 0: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right' } },
    )
  }

  const totalRend = sumKey(data.rendiciones, 'monto_rendicion')
  y = pdfSectionHeading(doc, layout, y, `Rendiciones de Cuentas (${data.rendiciones.length})`)
  if (data.rendiciones.length === 0) {
    y = pdfBodyText(doc, layout, y, ['No hay rendiciones registradas'])
  } else {
    y = drawPdfTable(doc, layout, y,
      [['#', 'Número de STR', 'Fecha CGR', 'Estado', 'Observaciones', 'Monto Rendido']],
      data.rendiciones.map((r, i) => [
        String(i + 1),
        txtPdf(r.str?.numero),
        fmtDatePdf(r.fecha_presentacion_cgr),
        txtPdf(r.estado),
        txtPdf(r.observaciones),
        fmtMoneyPdf(r.monto_rendicion),
      ]),
      [['', '', '', '', 'TOTAL', fmtMoneyPdf(totalRend)]],
      { 0: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right' } },
    )
  }

  y = pdfSectionHeading(doc, layout, y, 'Devoluciones')
  if (data.devoluciones.length === 0) {
    pdfBodyText(doc, layout, y, ['No hay devoluciones registradas'])
  } else {
    drawPdfTable(doc, layout, y,
      [['#', 'Nro. Recibo', 'STR', 'Fecha', 'Monto']],
      data.devoluciones.map((d, i) => [
        String(i + 1),
        txtPdf(d.numero_recibo),
        txtPdf(d.str?.numero),
        fmtDatePdf(d.fecha),
        fmtMoneyPdf(d.monto),
      ]),
      [['', '', '', 'TOTAL', fmtMoneyPdf(data.totalDevoluciones)]],
      { 0: { halign: 'center', cellWidth: 12 }, 4: { halign: 'right' } },
    )
  }

  const slug = (data.proyecto.descripcion ?? 'proyecto').slice(0, 40).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  pdfFinishAndSave(doc, layout, filename ?? `ficha-tecnica-${slug || proyectoId.slice(0, 8)}`)
}
