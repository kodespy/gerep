import { supabase } from './supabase'
import { actaMontoAprobadoADesembolsar, isActaSoloAprobacion } from './actaEstado'
import { compareActaNumero, isActaExtraordinaria } from './actaNumero'
import { asGs, fmtMoneyPdf, parseCalendarDateParts, txtPdf } from './format'
import { calcSaldoDisponible } from './proyectoSaldos'
import {
  createPdfDoc, PDF_MARGIN_MM,
  pdfEnsureSpace, pdfFinishAndSave, pdfPageWidth, preparePdfLayout,
} from './pdf'
import { drawPdfTable, PDF_TABLE_FONT } from './pdfTable'

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function sumKey(rows: any[] | null | undefined, key: string): number {
  return (rows ?? []).reduce((s, r) => s + asGs(r[key]), 0)
}

function ajusteAdenda(a: { monto_ajuste?: number; tipo_ajuste?: string | null; estado?: string | null }): number {
  const estado = (a.estado ?? '').toLowerCase()
  if (estado.includes('rechaz') || estado.includes('anulad')) return 0
  const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
  return sign * (Number(a.monto_ajuste) || 0)
}

function fmtHora(v: string | null | undefined): string {
  if (!v) return '---'
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return String(v).slice(0, 5)
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** "a los 3 días del mes de julio del año 2026" */
function fmtFechaLargaEs(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return '---'
  const mes = MESES_ES[p.m - 1] ?? String(p.m)
  return `a los ${p.d} días del mes de ${mes} del año ${p.y}`
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtOg(codigo?: string | null, descripcion?: string | null): string {
  const c = (codigo ?? '').trim()
  const d = (descripcion ?? '').trim()
  if (c && d) return `[${c}] ${d}`
  if (c) return `[${c}]`
  return d || '---'
}

/** Resuelve el OG principal (padre) referenciado por og_principal_id (uuid o código). */
async function resolveOgPrincipal(
  ogPrincipalRef: string | number | null | undefined,
): Promise<{ id?: string | null; codigo?: string | null; descripcion?: string | null } | null> {
  if (ogPrincipalRef == null || String(ogPrincipalRef).trim() === '') return null
  const key = String(ogPrincipalRef).trim()
  const byId = await supabase
    .from('objetos_de_gastos')
    .select('id, codigo, descripcion')
    .eq('id', key)
    .maybeSingle()
  if (byId.data) return byId.data
  const byCodigo = await supabase
    .from('objetos_de_gastos')
    .select('id, codigo, descripcion')
    .eq('codigo', key)
    .maybeSingle()
  return byCodigo.data ?? null
}

/** OG de ejecución = OG del plan; OG transferencia = OG principal de ese OG. */
async function resolveOgsFromPlanObjeto(
  objeto: { id?: string | null; codigo?: string | null; descripcion?: string | null; og_principal_id?: string | number | null } | null,
): Promise<{
  ogEjec: typeof objeto
  ogTrans: { id?: string | null; codigo?: string | null; descripcion?: string | null } | null
}> {
  if (!objeto) return { ogEjec: null, ogTrans: null }
  const ogTrans = await resolveOgPrincipal(objeto.og_principal_id)
  return { ogEjec: objeto, ogTrans }
}

/** Monto previo atribuible a una línea: primer OG de la lista que tenga saldo acumulado. */
function desembolsadoLineaFromOgs(
  desembolsadoByOg: Map<string, number>,
  keys: Array<string | null | undefined>,
): number {
  const seen = new Set<string>()
  for (const raw of keys) {
    const k = raw != null ? String(raw).trim() : ''
    if (!k || seen.has(k)) continue
    seen.add(k)
    const v = desembolsadoByOg.get(k)
    if (v) return asGs(v)
  }
  return 0
}

function isActaRechazadaOAnulada(estado: unknown): boolean {
  const t = String(estado ?? '').toLowerCase()
  return t.includes('anulad') || t.includes('rechaz')
}

/** True si `other` es anterior a `current` (fecha; a igual fecha, por N° de acta). */
function isActaAnteriorA(
  other: { id?: unknown; fecha?: unknown; numero?: unknown },
  current: { id?: unknown; fecha?: unknown; numero?: unknown },
): boolean {
  if (String(other.id ?? '') === String(current.id ?? '')) return false
  const fO = dateOnly(other.fecha as string | null | undefined)
  const fC = dateOnly(current.fecha as string | null | undefined)
  if (fO && fC) {
    if (fO !== fC) return fO < fC
    return compareActaNumero(other.numero, current.numero) < 0
  }
  const byNum = compareActaNumero(other.numero, current.numero)
  if (byNum !== 0) return byNum < 0
  if (fO && !fC) return true
  if (!fO && fC) return false
  return false
}

function addDesembolsadoOg(
  map: Map<string, number>,
  ogId: string | null | undefined,
  monto: number,
): void {
  const k = ogId != null ? String(ogId).trim() : ''
  const m = asGs(monto)
  if (!k || !m) return
  map.set(k, (map.get(k) ?? 0) + m)
}

function actaNumeroCorto(numero: string | null | undefined): string {
  const n = (numero ?? '').trim()
  if (!n) return '---'
  const m = n.match(/^(\d+)/)
  return m?.[1] ?? n
}

function dateOnly(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return ''
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export type ActaPdfConfigResolucion = {
  nro_resolucion: string
  resolucion_comite: string
  descripcion: string | null
}

/** Busca la configuración cuyo rango de fechas cubre la fecha del acta. */
export async function resolveActaConfigResolucion(fechaActa: string | null | undefined): Promise<ActaPdfConfigResolucion | null> {
  const fecha = dateOnly(fechaActa)
  if (!fecha) return null

  const { data, error } = await supabase
    .from('actas_configuracion_registros')
    .select('fecha_desde,fecha_hasta,nro_resolucion,resolucion_comite,descripcion')
    .lte('fecha_desde', fecha)
    .gte('fecha_hasta', fecha)
    .order('fecha_desde', { ascending: false })
    .limit(5)

  if (error) throw new Error(error.message)
  const row = (data ?? [])[0]
  if (!row) return null

  const nro = String(row.nro_resolucion ?? '').trim()
  const comite = String(row.resolucion_comite ?? '').trim() || nro
  if (!nro && !comite) return null

  return {
    nro_resolucion: nro,
    resolucion_comite: comite,
    descripcion: row.descripcion ? String(row.descripcion).trim() : null,
  }
}

export interface ActaPdfLinea {
  ogTransferencia: string
  ogEjecucion: string
  ogTransferenciaId?: string | null
  ogEjecucionId?: string | null
  montoAprobado: number
  montoDesembolsado: number
  montoSolicitado: number
  montoAprobadoDesembolsar: number
  saldo: number
  numeroDesembolso: string
  adendaId?: string | null
  adendaNumero?: string | null
  adendaNota?: string | null
}

/** Una fila por OG (el plan original). Las filas de adenda no se mezclan con el plan. */
function unifyActaPdfLineasPorOg(lineas: ActaPdfLinea[]): ActaPdfLinea[] {
  if (lineas.length <= 1) return lineas
  const map = new Map<string, ActaPdfLinea>()
  const order: string[] = []
  for (const l of lineas) {
    const key = l.adendaId
      ? `adenda:${l.adendaId}`
      : l.ogEjecucionId
        ? `ej:${l.ogEjecucionId}`
        : l.ogTransferenciaId
          ? `tr:${l.ogTransferenciaId}`
          : `lbl:${l.ogEjecucion}|${l.ogTransferencia}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...l })
      order.push(key)
      continue
    }
    prev.montoSolicitado = asGs(prev.montoSolicitado + l.montoSolicitado)
    prev.montoAprobadoDesembolsar = asGs(prev.montoAprobadoDesembolsar + l.montoAprobadoDesembolsar)
    // Aprobado y desembolsado son totales del OG (plan / actas previas), no sumar otra vez.
    prev.montoAprobado = asGs(Math.max(prev.montoAprobado, l.montoAprobado))
    prev.montoDesembolsado = asGs(Math.max(prev.montoDesembolsado, l.montoDesembolsado))
  }
  return order.map(k => {
    const row = map.get(k)!
    row.saldo = asGs(row.montoAprobado - row.montoDesembolsado - row.montoAprobadoDesembolsar)
    return row
  })
}

export interface ActaPdfData {
  acta: any
  proyecto: any
  entidadNombre: string
  componenteNombre: string
  nroResolucionComite: string
  reglamentacionTexto: string
  configDescripcion: string
  /** @deprecated Preferir `lineas` (una fila por OG). */
  ogTransferencia: string
  /** @deprecated Preferir `lineas`. */
  ogEjecucion: string
  montoProyecto: number
  montoDesembolsado: number
  montoSolicitado: number
  montoAprobadoDesembolsar: number
  saldo: number
  numeroDesembolso: string
  lineas: ActaPdfLinea[]
}

export async function loadActaPdfData(actaId: string): Promise<ActaPdfData> {
  const { data: acta, error } = await supabase
    .from('actas')
    .select('*')
    .eq('id', actaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!acta) throw new Error('Acta no encontrada.')

  const config = await resolveActaConfigResolucion(acta.fecha)
  if (!config) {
    throw new Error(
      'No hay configuración de registros para la fecha del acta. Defina un rango (fecha desde/hasta) y N° de resolución en Config. registros.',
    )
  }

  const proyectoId = acta.proyecto_id ? String(acta.proyecto_id) : null
  let proyecto: any = null
  let entidadNombre = 'COMITÉ OLÍMPICO PARAGUAYO'
  let componenteNombre = '---'
  let ogTransferencia = '---'
  let ogEjecucion = '---'
  let montoProyecto = 0
  let montoDesembolsado = 0
  let lineas: ActaPdfLinea[] = []
  const numeroDesembolso = acta.numero_desembolso != null ? String(acta.numero_desembolso) : '---'

  if (proyectoId) {
    const [proy, planes, adendas, actaItemsRes, actasProyRes] = await Promise.all([
      supabase
        .from('proyectos')
        .select(`
          id, descripcion, monto, expediente_id,
          componente:componentes_programa(
            codigo, descripcion,
            programa:programas(codigo, descripcion)
          ),
          expediente:expedientes!expediente_id(
            id,
            numero_expediente,
            entidad_id,
            entidad:entidades!entidad_id(id, razon_social)
          )
        `)
        .eq('id', proyectoId)
        .maybeSingle(),
      supabase
        .from('planes_financieros')
        .select('id, monto, objeto:objetos_de_gastos(id, codigo, descripcion, og_principal_id)')
        .eq('proyecto_id', proyectoId),
      supabase
        .from('adendas')
        .select('monto_ajuste, tipo_ajuste, estado, plan_financiero_id, plan:planes_financieros!inner(proyecto_id)')
        .eq('plan.proyecto_id', proyectoId),
      supabase
        .from('acta_items')
        .select(`
          id, plan_financiero_id, monto_ejecutado, adenda_id,
          adenda:adendas(id, numero_adenda, monto_ajuste, tipo_ajuste, estado),
          plan:planes_financieros(
            id, monto,
            objeto:objetos_de_gastos(id, codigo, descripcion, og_principal_id)
          )
        `)
        .eq('acta_id', acta.id)
        .order('created_at', { ascending: true }),
      // Actas del proyecto para acumular “Monto Desembolsado” = aprobados previos por OG
      supabase
        .from('actas')
        .select('id, numero, fecha, estado, monto_aprobado')
        .eq('proyecto_id', proyectoId)
        .limit(5000),
    ])
    if (actasProyRes.error) throw new Error(actasProyRes.error.message)

    // Si falla el embed o falta alguna columna, degradar sin perder monto_ejecutado.
    let actaItems: any[] = []
    if (!actaItemsRes.error) {
      actaItems = (actaItemsRes.data ?? []) as any[]
    } else if (/column .* does not exist|Could not find/i.test(actaItemsRes.error.message)) {
      const retryMontos = await supabase
        .from('acta_items')
        .select('id, plan_financiero_id, monto_ejecutado, adenda_id')
        .eq('acta_id', acta.id)
        .order('created_at', { ascending: true })
      if (retryMontos.error) {
        const retryBasic = await supabase
          .from('acta_items')
          .select('id, plan_financiero_id, monto_ejecutado')
          .eq('acta_id', acta.id)
          .order('created_at', { ascending: true })
        if (retryBasic.error) {
          const retryBare = await supabase
            .from('acta_items')
            .select('id, plan_financiero_id')
            .eq('acta_id', acta.id)
            .order('created_at', { ascending: true })
          if (retryBare.error) throw new Error(retryBare.error.message)
          actaItems = (retryBare.data ?? []) as any[]
        } else {
          actaItems = (retryBasic.data ?? []) as any[]
        }
      } else {
        actaItems = (retryMontos.data ?? []) as any[]
      }
      // Completar plan/OG si el primer select falló por el embed
      const planIds = [...new Set(actaItems.map(i => i.plan_financiero_id).filter(Boolean).map(String))]
      if (planIds.length) {
        const { data: plansExtra } = await supabase
          .from('planes_financieros')
          .select('id, monto, objeto:objetos_de_gastos(id, codigo, descripcion, og_principal_id)')
          .in('id', planIds)
        const byId = new Map((plansExtra ?? []).map((p: any) => [String(p.id), p]))
        actaItems = actaItems.map(i => ({
          ...i,
          plan: byId.get(String(i.plan_financiero_id)) ?? i.plan ?? null,
        }))
      }
    } else {
      throw new Error(actaItemsRes.error.message)
    }

    const adendaIdsMissing = [...new Set(
      actaItems
        .filter(i => i.adenda_id && !asOne(i.adenda))
        .map(i => String(i.adenda_id)),
    )]
    if (adendaIdsMissing.length) {
      const { data: adExtra } = await supabase
        .from('adendas')
        .select('id, numero_adenda, monto_ajuste, tipo_ajuste, estado, plan_financiero_id')
        .in('id', adendaIdsMissing)
      const adById = new Map((adExtra ?? []).map((a: any) => [String(a.id), a]))
      actaItems = actaItems.map(i => {
        const aid = i.adenda_id ? String(i.adenda_id) : ''
        if (!aid || asOne(i.adenda)) return i
        return { ...i, adenda: adById.get(aid) ?? null }
      })
    }

    if (proy.error) throw new Error(proy.error.message)
    proyecto = proy.data

    // Entidad remitente: proyecto → expediente vinculado → entidades.razon_social
    const exp = Array.isArray(proyecto?.expediente) ? proyecto.expediente[0] : proyecto?.expediente
    const entidadEmbed = Array.isArray(exp?.entidad) ? exp?.entidad[0] : exp?.entidad
    entidadNombre = (entidadEmbed?.razon_social ?? '').trim()

    // Fallback si el embed anidado no trajo la entidad
    if (!entidadNombre && (proyecto?.expediente_id || exp?.id)) {
      const expId = String(proyecto?.expediente_id || exp?.id)
      const { data: expRow } = await supabase
        .from('expedientes')
        .select('id, entidad_id, entidad:entidades!entidad_id(razon_social)')
        .eq('id', expId)
        .maybeSingle()
      const ent = Array.isArray(expRow?.entidad) ? expRow?.entidad[0] : expRow?.entidad
      entidadNombre = (ent?.razon_social ?? '').trim()
      if (!entidadNombre && expRow?.entidad_id) {
        const { data: entRow } = await supabase
          .from('entidades')
          .select('razon_social')
          .eq('id', expRow.entidad_id)
          .maybeSingle()
        entidadNombre = (entRow?.razon_social ?? '').trim()
      }
    }
    if (!entidadNombre) entidadNombre = 'COMITÉ OLÍMPICO PARAGUAYO'

    const comp = Array.isArray(proyecto?.componente) ? proyecto.componente[0] : proyecto?.componente
    if (comp) {
      const cod = (comp.codigo ?? '').trim()
      const desc = (comp.descripcion ?? '').trim()
      componenteNombre = cod && desc ? `${cod} — ${desc}` : (desc || cod || '---')
    }

    const planRows = planes.data ?? []
    const adendaRows = adendas.data ?? []
    const planMonto = sumKey(planRows, 'monto')
    const adendaMonto = adendaRows.reduce((s, a) => s + ajusteAdenda(a as any), 0)
    montoProyecto = asGs(planMonto + adendaMonto || Number(proyecto?.monto) || 0)

    // Monto Desembolsado = Σ montos aprobados a desembolsar de actas anteriores
    // del mismo proyecto, acumulados por OG (orden: fecha, luego N° de acta).
    const desembolsadoByOg = new Map<string, number>()
    let desembolsadoSinOg = 0
    const prevActas = (actasProyRes.data ?? []).filter(a =>
      !isActaRechazadaOAnulada(a.estado) && isActaAnteriorA(a, acta),
    )
    const prevActaIds = prevActas.map(a => String(a.id))
    const prevItemsByActa = new Map<string, any[]>()
    if (prevActaIds.length) {
      const IN_CHUNK = 80
      for (let i = 0; i < prevActaIds.length; i += IN_CHUNK) {
        const chunk = prevActaIds.slice(i, i + IN_CHUNK)
        const { data: prevItems, error: prevItemsErr } = await supabase
          .from('acta_items')
          .select(`
            acta_id, plan_financiero_id, monto_ejecutado, adenda_id,
            plan:planes_financieros(
              id, monto,
              objeto:objetos_de_gastos(id, codigo, descripcion, og_principal_id)
            )
          `)
          .in('acta_id', chunk)
        if (prevItemsErr && /column .*monto_ejecutado/i.test(prevItemsErr.message)) {
          const retry = await supabase
            .from('acta_items')
            .select(`
              acta_id, plan_financiero_id,
              plan:planes_financieros(
                id, monto,
                objeto:objetos_de_gastos(id, codigo, descripcion, og_principal_id)
              )
            `)
            .in('acta_id', chunk)
          if (retry.error) throw new Error(retry.error.message)
          for (const it of retry.data ?? []) {
            const aid = String((it as any).acta_id ?? '')
            if (!aid) continue
            const list = prevItemsByActa.get(aid) ?? []
            list.push(it)
            prevItemsByActa.set(aid, list)
          }
          continue
        }
        if (prevItemsErr) throw new Error(prevItemsErr.message)
        for (const it of prevItems ?? []) {
          const aid = String((it as any).acta_id ?? '')
          if (!aid) continue
          const list = prevItemsByActa.get(aid) ?? []
          list.push(it)
          prevItemsByActa.set(aid, list)
        }
      }
    }
    for (const prev of prevActas) {
      const pid = String(prev.id)
      const items = prevItemsByActa.get(pid) ?? []
      const itemsSum = items.reduce((s, it) => s + asGs(it.monto_ejecutado), 0)
      const aprobado = actaMontoAprobadoADesembolsar(prev, itemsSum)
      if (aprobado <= 0) continue

      if (itemsSum > 0) {
        for (const it of items) {
          const m = asGs(it.monto_ejecutado)
          if (!m) continue
          const objeto = asOne(asOne(it.plan)?.objeto)
          addDesembolsadoOg(desembolsadoByOg, objeto?.id, m)
        }
      } else if (items.length === 1) {
        const objeto = asOne(asOne(items[0].plan)?.objeto)
        if (objeto?.id) addDesembolsadoOg(desembolsadoByOg, objeto.id, aprobado)
        else desembolsadoSinOg += aprobado
      } else if (items.length > 1) {
        const weights = items.map((it: any) => Number(asOne(it.plan)?.monto) || 0)
        const wSum = weights.reduce((a: number, b: number) => a + b, 0)
        items.forEach((it: any, idx: number) => {
          const objeto = asOne(asOne(it.plan)?.objeto)
          const share = wSum > 0
            ? asGs(aprobado * (weights[idx] / wSum))
            : asGs(aprobado / items.length)
          if (objeto?.id) addDesembolsadoOg(desembolsadoByOg, objeto.id, share)
          else desembolsadoSinOg += share
        })
      } else {
        desembolsadoSinOg += aprobado
      }
    }
    montoDesembolsado = asGs(
      [...desembolsadoByOg.values()].reduce((s, v) => s + v, 0) + desembolsadoSinOg,
    )

    const desembolsadoByAdenda = new Map<string, number>()
    for (const prev of prevActas) {
      for (const it of prevItemsByActa.get(String(prev.id)) ?? []) {
        const aid = String((it as any).adenda_id ?? '').trim()
        if (!aid) continue
        const m = asGs((it as any).monto_ejecutado)
        if (!m) continue
        desembolsadoByAdenda.set(aid, (desembolsadoByAdenda.get(aid) ?? 0) + m)
      }
    }

    const adendaByPlan = new Map<string, number>()
    for (const a of adendaRows) {
      const pid = String(a.plan_financiero_id ?? '')
      if (!pid) continue
      adendaByPlan.set(pid, (adendaByPlan.get(pid) ?? 0) + ajusteAdenda(a as any))
    }

    // Monto Aprobado por OG = todas las líneas del plan (+ adendas) de ese OG, no solo las del acta.
    const aprobadoByOgId = new Map<string, number>()
    for (const p of planRows) {
      const objeto = asOne((p as any).objeto)
      const ogId = objeto?.id ? String(objeto.id) : ''
      if (!ogId) continue
      const pid = String((p as any).id ?? '')
      const monto = asGs((Number((p as any).monto) || 0) + (adendaByPlan.get(pid) ?? 0))
      aprobadoByOgId.set(ogId, asGs((aprobadoByOgId.get(ogId) ?? 0) + monto))
    }

    const itemCount = actaItems.length
    const soloAprobacion = isActaSoloAprobacion(acta.estado)
    const actaSolic = soloAprobacion ? 0 : asGs(acta.monto_solicitado)
    // Nunca usar solicitado como “aprobado a desembolsar”.
    const itemsDesembolsarSum = actaItems.reduce((s, it) => s + asGs(it.monto_ejecutado), 0)
    const headerDesembolsar = actaMontoAprobadoADesembolsar(acta, itemsDesembolsarSum)

    for (const item of actaItems) {
      const plan = asOne(item.plan)
      const objeto = asOne(plan?.objeto)
      const { ogEjec, ogTrans } = await resolveOgsFromPlanObjeto(objeto)
      const planId = String(item.plan_financiero_id || plan?.id || '')
      const adenda = asOne(item.adenda)
      const adendaId = item.adenda_id ? String(item.adenda_id) : (adenda?.id ? String(adenda.id) : '')
      const adendaNumero = adenda?.numero_adenda ? String(adenda.numero_adenda).trim() : ''
      const esAdenda = Boolean(adendaId)

      const aprobadoPlanLinea = asGs((Number(plan?.monto) || 0) + (adendaByPlan.get(planId) ?? 0))
      const ogEjecId = ogEjec?.id ? String(ogEjec.id) : ''
      let montoAprobadoLinea = ogEjecId && aprobadoByOgId.has(ogEjecId)
        ? asGs(aprobadoByOgId.get(ogEjecId))
        : aprobadoPlanLinea
      if (esAdenda) {
        montoAprobadoLinea = asGs(Math.abs(ajusteAdenda(adenda ?? {
          monto_ajuste: 0,
          tipo_ajuste: null,
          estado: null,
        })))
      }

      // Aprobados previos del mismo OG (ejecución). Si hay una sola línea de plan, usar el total.
      let montoDesembLinea = desembolsadoLineaFromOgs(desembolsadoByOg, [
        objeto?.id,
        ogEjec?.id,
        objeto?.og_principal_id != null ? String(objeto.og_principal_id) : null,
        ogTrans?.id,
      ])
      if (esAdenda) {
        montoDesembLinea = asGs(desembolsadoByAdenda.get(adendaId) ?? 0)
      } else if (itemCount === 1) {
        montoDesembLinea = montoDesembolsado
      }

      // Monto aprobado a desembolsar por ítem. Solo "Aprobación" ⇒ 0. Nunca solicitado.
      const montoEjecLinea = asGs(item.monto_ejecutado)
      let montoLinea = 0
      if (!soloAprobacion) {
        montoLinea = montoEjecLinea
        if (!montoLinea && itemCount === 1) montoLinea = asGs(acta.monto_aprobado)
      }

      const saldoLinea = asGs(montoAprobadoLinea - montoDesembLinea - montoLinea)
      const ogEjecTxt = ogEjec ? fmtOg(ogEjec.codigo, ogEjec.descripcion) : '---'
      const adendaNota = esAdenda && adendaNumero
        ? `Corresponde a la Adenda N° ${adendaNumero}.`
        : (esAdenda ? 'Corresponde a una adenda del plan financiero.' : null)
      lineas.push({
        ogTransferencia: ogTrans ? fmtOg(ogTrans.codigo, ogTrans.descripcion) : '---',
        ogEjecucion: adendaNumero ? `${ogEjecTxt} · Adenda N° ${adendaNumero}` : ogEjecTxt,
        ogTransferenciaId: ogTrans?.id ? String(ogTrans.id) : null,
        ogEjecucionId: ogEjec?.id ? String(ogEjec.id) : null,
        montoAprobado: montoAprobadoLinea,
        montoDesembolsado: montoDesembLinea,
        montoSolicitado: soloAprobacion ? 0 : (montoEjecLinea || (itemCount === 1 ? actaSolic : 0)),
        montoAprobadoDesembolsar: montoLinea,
        saldo: saldoLinea,
        numeroDesembolso,
        adendaId: adendaId || null,
        adendaNumero: adendaNumero || null,
        adendaNota,
      })
    }
    lineas = unifyActaPdfLineasPorOg(lineas)

    // Fallback: sin ítems, una fila con totales del acta / primer plan
    if (!lineas.length) {
      const planObjeto = asOne(planRows[0]?.objeto)
      const { ogEjec, ogTrans } = await resolveOgsFromPlanObjeto(planObjeto)
      if (ogTrans) ogTransferencia = fmtOg(ogTrans.codigo, ogTrans.descripcion)
      if (ogEjec) ogEjecucion = fmtOg(ogEjec.codigo, ogEjec.descripcion)
      const saldo = calcSaldoDisponible(montoProyecto, montoDesembolsado + headerDesembolsar, 0)
      lineas.push({
        ogTransferencia,
        ogEjecucion,
        montoAprobado: montoProyecto,
        montoDesembolsado,
        montoSolicitado: actaSolic,
        montoAprobadoDesembolsar: headerDesembolsar,
        saldo,
        numeroDesembolso,
      })
    } else {
      ogTransferencia = lineas[0].ogTransferencia
      ogEjecucion = lineas[0].ogEjecucion
    }
  }

  const soloAprobacionActa = isActaSoloAprobacion(acta.estado)
  const montoSolicitado = soloAprobacionActa ? 0 : asGs(acta.monto_solicitado)
  const totalLineasDesembolsar = lineas.reduce((s, l) => s + asGs(l.montoAprobadoDesembolsar), 0)
  // Monto aprobado a desembolsar: ítems o monto_aprobado — nunca monto_solicitado.
  const totalADesembolsar = actaMontoAprobadoADesembolsar(acta, totalLineasDesembolsar)
  const saldo = calcSaldoDisponible(montoProyecto, montoDesembolsado + totalADesembolsar, 0)

  const reglamentacionTexto = config.nro_resolucion
    ? `Resolución ${config.nro_resolucion}`
    : 'la Reglamentación Institucional vigente'
  const configDescripcion = (config.descripcion ?? '').trim()

  return {
    acta,
    proyecto,
    entidadNombre,
    componenteNombre,
    nroResolucionComite: config.resolucion_comite || config.nro_resolucion,
    reglamentacionTexto,
    configDescripcion,
    ogTransferencia,
    ogEjecucion,
    montoProyecto,
    montoDesembolsado,
    montoSolicitado,
    montoAprobadoDesembolsar: totalADesembolsar,
    saldo,
    numeroDesembolso,
    lineas,
  }
}

function wrapParagraph(doc: import('jspdf').default, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[]
}

/** Párrafo justificado; si no entra, continúa en la página siguiente. */
function drawJustifiedParagraph(
  doc: import('jspdf').default,
  layout: import('./pdf').PdfLayout,
  y: number,
  text: string,
  maxWidth: number,
  fontSize = 10,
  gapAfter = 2.4,
): number {
  const lineHeightFactor = 1.45
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(fontSize)
  doc.setLineHeightFactor(lineHeightFactor)
  doc.setTextColor(0, 0, 0)
  const lines = wrapParagraph(doc, text, maxWidth)
  const lineH = fontSize * 0.352778 * lineHeightFactor
  const needed = lines.length * lineH + gapAfter
  y = pdfEnsureSpace(doc, y, needed, layout)
  doc.text(text, PDF_MARGIN_MM, y, { align: 'justify', maxWidth })
  return y + needed
}

const ACTA_TABLE_SIZE = {
  fontSize: 7.5,
  headFontSize: 7.5,
  gapAfter: 2,
  pageBreak: 'auto' as const,
}

/** Separación visual tabla ↔ párrafo (baseline del texto queda debajo del borde). */
const ACTA_TABLE_PARA_GAP_MM = 5

/** Espacio vertical entre las dos filas de firmas (mm). */
const ACTA_FIRMAS_ROW_GAP_MM = 28
/** Distancia etiqueta bajo la línea de firma (mm). */
const ACTA_FIRMAS_LABEL_MM = 4
/** 40px después del último párrafo, antes de las firmas (96 dpi → mm). */
const ACTA_FIRMAS_AFTER_PARA_MM = (40 * 25.4) / 96

export async function exportActaPdf(actaId: string): Promise<void> {
  const data = await loadActaPdfData(actaId)
  const doc = createPdfDoc({ orientation: 'portrait' })
  const layout = await preparePdfLayout(doc)
  const pageW = pdfPageWidth(doc)
  const contentW = pageW - PDF_MARGIN_MM * 2
  let y = layout.contentTop

  const numero = txtPdf(data.acta.numero)
  const titulo = isActaExtraordinaria(data.acta.numero)
    ? `ACTA EXTRAORDINARIA N° ${numero}`
    : `ACTA N° ${numero}`
  const paraSize = 10

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(titulo, pageW / 2, y, { align: 'center' })
  y += 5.5

  doc.setFont(PDF_TABLE_FONT, 'bold')
  doc.setFontSize(10)
  doc.text('COMITÉ EVALUADOR DE PROYECTOS – UNIDAD EJECUTORA DE PROYECTOS (UEP)', pageW / 2, y, { align: 'center' })
  y += 4
  doc.text('SECRETARIA NACIONAL DE DEPORTES', pageW / 2, y, { align: 'center' })
  y += 5.5

  const horaIni = fmtHora(data.acta.hora_inicio)
  const horaFin = fmtHora(data.acta.hora_fin)
  const proyectoNombre = txtPdf(data.proyecto?.descripcion).toUpperCase()

  const p1 =
    `En la Ciudad de Asunción, República del Paraguay ${fmtFechaLargaEs(data.acta.fecha)}, siendo las ${horaIni} ` +
    `horas, se reúnen los miembros del COMITÉ EVALUADOR DE LA UNIDAD EJECUTORA DE PROYECTOS ` +
    `(UEP), de la SECRETARÍA NACIONAL DE DEPORTES, integrada según Resolución SND N° ${txtPdf(data.nroResolucionComite)}, ` +
    `a fin de evaluar la solicitud presentada por ${txtPdf(data.entidadNombre).toUpperCase()} ante la UEP – SND.`

  const p2 =
    `La evaluación se realiza en cumplimiento de lo establecido en la Ley N° 2874/2006 "DEL DEPORTE" y la ` +
    `Reglamentación Institucional ${txtPdf(data.reglamentacionTexto)}, que establece el procedimiento administrativo vigente.`

  const p3 =
    'Se deja constancia que la validez, integridad, actualización, corrección y eventual subsanación de los documentos y ' +
    'procesos administrativos contenidos en el expediente son de exclusiva responsabilidad del Comité Organizador de ' +
    'Grandes Eventos Deportivos.'

  const recomendacion = txtPdf(data.acta.estado).toUpperCase() || 'LA APROBACIÓN Y EL DESEMBOLSO'
  const adendaNumsPdf = [...new Set(
    (data.lineas ?? []).map(l => (l.adendaNumero ?? '').trim()).filter(Boolean),
  )]
  const lineasPdf = data.lineas ?? []
  const allAdenda = lineasPdf.length > 0 && lineasPdf.every(l => l.adendaId)
  const adendaClausula = !adendaNumsPdf.length
    ? ''
    : allAdenda && adendaNumsPdf.length === 1
      ? ` El detalle corresponde a la Adenda N° ${adendaNumsPdf[0]}.`
      : allAdenda
        ? ` El detalle corresponde a las Adendas N° ${adendaNumsPdf.join(', ')}.`
        : adendaNumsPdf.length === 1
          ? ` Incluye la Adenda N° ${adendaNumsPdf[0]}.`
          : ` Incluye las Adendas N° ${adendaNumsPdf.join(', ')}.`
  const p4 =
    'Luego de la evaluación respectiva, los integrantes del COMITÉ EVALUADOR DE PROYECTOS de la UEP de la ' +
    `Secretaría Nacional de Deportes acuerdan recomendar a la Máxima Autoridad Institucional ${recomendacion}, ` +
    `conforme al siguiente detalle:${adendaClausula}`

  for (const para of [p1, p2, p3]) {
    y = drawJustifiedParagraph(doc, layout, y, para, contentW, paraSize)
  }
  y = drawJustifiedParagraph(doc, layout, y, p4, contentW, paraSize, 1.2)

  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Nombre del Proyecto', 'Componente']],
    [[proyectoNombre, txtPdf(data.componenteNombre).toUpperCase()]],
    undefined,
    {
      0: { cellWidth: contentW * 0.55 },
      1: { cellWidth: contentW * 0.45 },
    },
    { ...ACTA_TABLE_SIZE, gapAfter: 0 },
  )
  const montoAprobadoTxt = fmtMoneyPdf(data.montoAprobadoDesembolsar)
  const montoSolicitadoTxt = fmtMoneyPdf(data.montoSolicitado)
  const lineasBody = (data.lineas?.length ? data.lineas : [{
    ogTransferencia: data.ogTransferencia,
    ogEjecucion: data.ogEjecucion,
    montoAprobado: data.montoProyecto,
    montoDesembolsado: data.montoDesembolsado,
    montoAprobadoDesembolsar: data.montoAprobadoDesembolsar,
    saldo: data.saldo,
    numeroDesembolso: data.numeroDesembolso,
  }]).map(l => [
    l.ogTransferencia,
    l.ogEjecucion,
    fmtMoneyPdf(l.montoAprobado),
    fmtMoneyPdf(l.montoDesembolsado),
    l.numeroDesembolso,
    fmtMoneyPdf(l.montoAprobadoDesembolsar),
    fmtMoneyPdf(l.saldo),
  ])
  y = drawPdfTable(
    doc,
    layout,
    y,
    [[
      'OG de Transferencia',
      'OG de Ejecución',
      'Monto Aprobado',
      'Monto Desembolsado',
      'N° Desembolso',
      'Monto aprobado a desembolsar',
      'Saldo',
    ]],
    lineasBody,
    [[
      { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
      {
        content: 'Monto solicitado:',
        styles: {halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] },
      },
      {
        content: montoSolicitadoTxt,
        colSpan: 2,
        styles: {halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], fontSize: 8 },
      },
      {
        content: 'Monto aprobado a desembolsar',
        styles: {halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] },
      },
      {
        content: montoAprobadoTxt,
        styles: {halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], fontSize: 8 },
      },
    ]],
    {
      0: { cellWidth: contentW * 0.14 },
      1: { cellWidth: contentW * 0.14 },
      2: {halign: 'right', cellWidth: contentW * 0.12 },
      3: {halign: 'right', cellWidth: contentW * 0.12 },
      4: {halign: 'center', cellWidth: contentW * 0.12 },
      5: {halign: 'right', cellWidth: contentW * 0.18 },
      6: {halign: 'right', cellWidth: contentW * 0.18 },
    },
    { ...ACTA_TABLE_SIZE, gapAfter: 0 },
  )
  y = drawPdfTable(
    doc,
    layout,
    y,
    [['Monto del Proyecto (incl. Adendas)', 'Monto desembolsado', 'Monto a desembolsar', 'Saldos']],
    [[
      fmtMoneyPdf(data.montoProyecto),
      fmtMoneyPdf(data.montoDesembolsado),
      fmtMoneyPdf(data.montoAprobadoDesembolsar),
      fmtMoneyPdf(data.saldo),
    ]],
    undefined,
    {
      0: {halign: 'right', cellWidth: contentW * 0.25 },
      1: {halign: 'right', cellWidth: contentW * 0.25 },
      2: {halign: 'right', cellWidth: contentW * 0.25 },
      3: {halign: 'right', cellWidth: contentW * 0.25 },
    },
    { ...ACTA_TABLE_SIZE, gapAfter: ACTA_TABLE_PARA_GAP_MM },
  )

  const adendaNotas = [...new Set(
    (data.lineas ?? []).map(l => (l.adendaNota ?? '').trim()).filter(Boolean),
  )]
  if (adendaNotas.length) {
    y = drawJustifiedParagraph(
      doc,
      layout,
      y,
      `Se deja constancia que ${adendaNotas.length === 1 ? 'el siguiente detalle corresponde' : 'los siguientes detalles corresponden'} ` +
      `a adenda(s) del plan financiero: ${adendaNotas.join(' ')}`,
      contentW,
      paraSize,
    )
  }

  const formNro = (String(data.acta.formulario_control ?? '').trim()
    || actaNumeroCorto(data.acta.numero))
  const normativaTxt = txtPdf(data.configDescripcion) || '---'
  const p5 =
    `El expediente que contiene el proyecto aprobado fue verificado, conforme al Formulario de Verificación y Control ` +
    `N° ${txtPdf(formNro)}. Se deja expresa constancia en caso de existir o que cuente con observaciones de carácter no sustancial, se ` +
    `procederá a su aprobación. Las mismas serán subsanadas a través de la gestión articulada de la UEP-SND con la ` +
    `entidad solicitante y el Comité Organizador, antes de la implementación definitiva del proyecto, de conformidad a ` +
    `lo contemplado en ${normativaTxt}.`

  const p6 =
    'Se deja expresamente aclarado que la Secretaría Nacional de Deportes, a través de la Unidad Ejecutora de ' +
    'Proyectos, deslinda cualquier responsabilidad respecto al manejo, administración, selección y contratación de ' +
    'proveedores, siendo estas actividades de exclusiva competencia del Comité Organizador de Grandes Eventos ' +
    'Deportivos y/o de la entidad solicitante.'

  const p7 =
    `Sin más temas que tratar, siendo las ${horaFin} horas, se da por finalizada la reunión del COMITÉ EVALUADOR DE ` +
    `PROYECTOS DE LA UNIDAD EJECUTORA DE PROYECTOS (UEP) de la SECRETARÍA NACIONAL DE DEPORTES.`

  for (const para of [p5, p6, p7]) {
    y = drawJustifiedParagraph(doc, layout, y, para, contentW, paraSize)
  }

  const firmasBlockH = ACTA_FIRMAS_ROW_GAP_MM + ACTA_FIRMAS_LABEL_MM
  y = pdfEnsureSpace(doc, y, ACTA_FIRMAS_AFTER_PARA_MM + firmasBlockH, layout)
  const firmasY = y + ACTA_FIRMAS_AFTER_PARA_MM

  const colGap = 12
  const colW = (contentW - colGap) / 2
  const lineLen = Math.min(62, colW - 4)
  const leftX = PDF_MARGIN_MM + (colW - lineLen) / 2
  const rightX = PDF_MARGIN_MM + colW + colGap + (colW - lineLen) / 2
  const firmas = [
    ['Por Coordinación Adm. y Financiera', 'Por Asesoría Jurídica'],
    ['Secretario de Actas', 'V°B° Coordinador General'],
  ] as const

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.setFont(PDF_TABLE_FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)

  for (let row = 0; row < firmas.length; row++) {
    const ly = firmasY + row * ACTA_FIRMAS_ROW_GAP_MM
    const [leftLabel, rightLabel] = firmas[row]
    doc.line(leftX, ly, leftX + lineLen, ly)
    doc.line(rightX, ly, rightX + lineLen, ly)
    doc.text(leftLabel, leftX + lineLen / 2, ly + ACTA_FIRMAS_LABEL_MM, { align: 'center' })
    doc.text(rightLabel, rightX + lineLen / 2, ly + ACTA_FIRMAS_LABEL_MM, { align: 'center' })
  }

  const slug = String(data.acta.numero ?? actaId).replace(/[^\w.-]+/g, '_')
  const fechaSlug = dateOnly(data.acta.fecha) || 'sin_fecha'
  pdfFinishAndSave(doc, layout, `Acta_${slug}_${fechaSlug}.pdf`)
}
