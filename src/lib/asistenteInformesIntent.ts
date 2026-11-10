import { nowDateInputValue } from './format'
import {
  ASISTENTE_REPORTS,
  asistenteReportById,
  type AsistenteReportId,
  type InformeFormato,
} from './asistenteInformesCatalog'
import { describeWhere, detectWhereFilters, type RowFilter } from './asistenteInformesFilters'

export type AsistenteIntent = {
  reportId: AsistenteReportId
  formato: InformeFormato
  desde?: string | null
  hasta?: string | null
  anio?: number | null
  mes?: number | null
  /** Filtro de situación de expediente. */
  situacion?: 'finalizado' | 'tramite' | null
  /** Texto libre a buscar (asunto, número, descripción…). */
  q?: string | null
  /** Condiciones WHERE / JOIN en filas del informe (ej. alerta = Atrasada). */
  where?: RowFilter[] | null
  confidence: number
  explanation: string
  source: 'rules' | 'llm' | 'user'
}

export type IntentCandidate = {
  id: AsistenteReportId
  label: string
  score: number
  kind: 'listado' | 'informe'
}

export type ResolveIntentResult =
  | { status: 'ok'; intent: AsistenteIntent }
  | { status: 'ambiguous'; candidates: IntentCandidate[]; formato: InformeFormato; partial: Omit<AsistenteIntent, 'reportId' | 'explanation' | 'source' | 'confidence'>; explanation: string }
  | { status: 'none'; explanation: string }

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasWord(hay: string, needle: string): boolean {
  const n = norm(needle)
  if (!n) return false
  if (n.includes(' ')) return hay.includes(n)
  // palabra completa (evita que "str" mate dentro de "registro")
  return new RegExp(`(?:^|[^a-z0-9])${escapeRe(n)}(?:[^a-z0-9]|$)`).test(hay)
}

function detectFormato(text: string): InformeFormato | null {
  const t = norm(text)
  if (/\b(excel|xlsx|hoja de calculo|spreadsheet)\b/.test(t)) return 'excel'
  if (/\b(word|docx|documento word)\b/.test(t)) return 'word'
  if (/\b(pdf|informe pdf)\b/.test(t)) return 'pdf'
  return null
}

function detectSituacion(t: string): 'finalizado' | 'tramite' | null {
  if (/\b(finalizado|finalizados|cerrado|cerrados|concluido|concluidos)\b/.test(t)) return 'finalizado'
  if (/\b(en tramite|en trámites|tramite|abierto|abiertos|pendiente|pendientes)\b/.test(t)) return 'tramite'
  return null
}

function detectQuery(text: string): string | null {
  const t = text.trim()
  // "buscar X", "que contenga X", "con asunto X", entre comillas
  const quoted = t.match(/["“”']([^"“”']{2,80})["“”']/)
  if (quoted) return quoted[1].trim()
  const m =
    t.match(/\b(?:buscar|busque|contenga|contienen|asunto|numero|n[°º]|entidad)\s*[:\-]?\s*(.+)$/i) ||
    t.match(/\bde(?:l)?\s+(?:expediente|proyecto|str)\s+([A-Za-z0-9\/\-. ]{3,60})$/i)
  if (m) {
    const q = m[1].replace(/\ben\s+(pdf|excel|word).*$/i, '').trim()
    if (q.length >= 2 && !/^(pdf|excel|word)$/i.test(q)) return q
  }
  return null
}

function monthFromText(t: string): number | null {
  const months: [RegExp, number][] = [
    [/\bener[oa]\b/, 1],
    [/\bfebrer[oa]\b/, 2],
    [/\bmarz[oa]\b/, 3],
    [/\babril\b/, 4],
    [/\bmay[oa]\b/, 5],
    [/\bjunio\b/, 6],
    [/\bjuli[oa]\b/, 7],
    [/\bagost[oa]\b/, 8],
    [/\bseptiembr[ea]\b|\bsetiembr[ea]\b/, 9],
    [/\boctubr[ea]\b/, 10],
    [/\bnoviembr[ea]\b/, 11],
    [/\bdiciembr[ea]\b/, 12],
  ]
  for (const [re, m] of months) {
    if (re.test(t)) return m
  }
  const n = t.match(/\bmes\s*(\d{1,2})\b/)
  if (n) {
    const m = Number(n[1])
    if (m >= 1 && m <= 12) return m
  }
  return null
}

function yearFromText(t: string): number | null {
  const y = t.match(/\b(20\d{2})\b/)
  return y ? Number(y[1]) : null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function parseDmy(s: string): string | null {
  const m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/)
  if (!m) return null
  return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`
}

function rangeFromText(text: string): { desde?: string; hasta?: string; anio?: number; mes?: number } {
  const t = norm(text)
  const today = nowDateInputValue()
  const [cy, cm] = today.split('-').map(Number)
  const anio = yearFromText(t) ?? cy
  const mes = monthFromText(t)

  const isoDesde = t.match(/\bdesde\s+(\d{4}-\d{2}-\d{2})\b/)
  const isoHasta = t.match(/\bhasta\s+(\d{4}-\d{2}-\d{2})\b/)
  if (isoDesde || isoHasta) {
    return { desde: isoDesde?.[1], hasta: isoHasta?.[1], anio }
  }

  const dmyAll = [...text.matchAll(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]20\d{2})\b/g)].map(x => parseDmy(x[1]!)).filter(Boolean) as string[]
  if (dmyAll.length >= 2) return { desde: dmyAll[0], hasta: dmyAll[1], anio: Number(dmyAll[0].slice(0, 4)) }
  if (dmyAll.length === 1 && /\bdesde\b/.test(t)) return { desde: dmyAll[0], anio: Number(dmyAll[0].slice(0, 4)) }
  if (dmyAll.length === 1 && /\bhasta\b/.test(t)) return { hasta: dmyAll[0], anio: Number(dmyAll[0].slice(0, 4)) }

  if (/\b(mes actual|este mes|del mes)\b/.test(t) && !mes) {
    return {
      desde: `${cy}-${pad2(cm)}-01`,
      hasta: `${cy}-${pad2(cm)}-${pad2(lastDayOfMonth(cy, cm))}`,
      anio: cy,
      mes: cm,
    }
  }
  if (/\b(ano actual|este ano|este año)\b/.test(t) && !mes) {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, anio }
  }
  if (/\b(ultimo trimestre|último trimestre|trimestre actual)\b/.test(t)) {
    const q = Math.ceil(cm / 3)
    const startM = (q - 1) * 3 + 1
    const endM = q * 3
    return {
      desde: `${cy}-${pad2(startM)}-01`,
      hasta: `${cy}-${pad2(endM)}-${pad2(lastDayOfMonth(cy, endM))}`,
      anio: cy,
    }
  }
  if (mes) {
    return {
      desde: `${anio}-${pad2(mes)}-01`,
      hasta: `${anio}-${pad2(mes)}-${pad2(lastDayOfMonth(anio, mes))}`,
      anio,
      mes,
    }
  }
  if (yearFromText(t) && !mes) {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, anio }
  }
  return {}
}

function scoreReport(hay: string, r: (typeof ASISTENTE_REPORTS)[number]): number {
  let score = 0

  for (const ph of r.phrases ?? []) {
    const p = norm(ph)
    if (p && hay.includes(p)) score += 12 + Math.min(8, p.length / 2)
  }

  for (const a of r.aliases) {
    if (!hasWord(hay, a)) continue
    const al = norm(a)
    // alias cortos pesan menos salvo que sean muy específicos
    if (al.length <= 3) score += 4
    else if (al.length <= 6) score += 6
    else score += 8
  }

  const idPhrase = norm(r.id.replace(/_/g, ' '))
  if (hay.includes(idPhrase)) score += 10

  const label = norm(r.label)
  if (hay.includes(label)) score += 14

  for (const neg of r.negative ?? []) {
    if (hasWord(hay, neg) || hay.includes(norm(neg))) score -= 6
  }

  // Preferir informe específico si pide "informe" + keyword de informe
  if (r.kind === 'informe' && /\binforme\b/.test(hay)) score += 3
  if (r.kind === 'listado' && /\b(listado|listar|exportar listado)\b/.test(hay)) score += 5
  if (r.kind === 'informe' && /\b(listado generico|solo listado|listado simple)\b/.test(hay)) score -= 10

  // Preferir Radar si habla de atrasadas / presentación CGR
  if (r.id === 'radar_rendiciones' && /\b(atrasad|presentacion|radar|cgr|rendicion)\b/.test(hay)) {
    score += 8
  }

  // boost priority as tie-breaker component
  score += r.priority / 100

  return score
}

function buildPartial(text: string, formatoForced?: InformeFormato | null, reportId?: string | null) {
  const t = norm(text)
  const formato = formatoForced ?? detectFormato(text) ?? 'pdf'
  const range = rangeFromText(text)
  const situacion = detectSituacion(t)
  const q = detectQuery(text)
  const where = detectWhereFilters(text, reportId)
  return {
    formato,
    desde: range.desde ?? null,
    hasta: range.hasta ?? null,
    anio: range.anio ?? null,
    mes: range.mes ?? null,
    situacion,
    q,
    where,
  }
}

function explainIntent(defLabel: string, partial: ReturnType<typeof buildPartial>): string {
  const bits = [defLabel, `formato ${partial.formato.toUpperCase()}`]
  if (partial.situacion === 'finalizado') bits.push('solo finalizados')
  if (partial.situacion === 'tramite') bits.push('solo en trámite')
  if (partial.desde || partial.hasta) bits.push(`periodo ${partial.desde ?? '…'} → ${partial.hasta ?? '…'}`)
  if (partial.q) bits.push(`búsqueda “${partial.q}”`)
  const wh = describeWhere(partial.where)
  if (wh) bits.push(`filtro ${wh}`)
  return `Interpreté: ${bits.join(' · ')}.`
}

export function parseIntentRules(prompt: string): ResolveIntentResult {
  const text = prompt.trim()
  if (!text) return { status: 'none', explanation: 'Escribí qué informe necesitás.' }

  const hay = norm(text)
  const partial = buildPartial(text)

  const ranked = ASISTENTE_REPORTS
    .map(r => ({
      id: r.id,
      label: r.label,
      score: scoreReport(hay, r),
      kind: r.kind,
      priority: r.priority,
    }))
    .filter(x => x.score >= 4)
    .sort((a, b) => b.score - a.score || b.priority - a.priority)

  if (!ranked.length) {
    return {
      status: 'none',
      explanation:
        'No identifiqué el informe. Indicá el módulo (Expedientes, STR, Proyectos, Cartera 360, Radar CGR…) y el formato (PDF/Excel/Word).',
    }
  }

  // Pedidos de atrasadas / presentación → priorizar Radar CGR
  if (/\b(atrasad|fecha\s+(de\s+)?presentacion|radar\s*cgr)\b/.test(hay)) {
    const ri = ranked.findIndex(r => r.id === 'radar_rendiciones')
    if (ri > 0) {
      const [radar] = ranked.splice(ri, 1)
      ranked.unshift({ ...radar, score: radar.score + 20 })
    }
  }

  const top = ranked[0]
  const second = ranked[1]
  // Ambiguo: dos orígenes cercanos (p. ej. Proyectos vs Cartera 360)
  const closeScores = !!second && top.score - second.score < 4 && second.score >= 6
  const crossKind = !!second && top.kind !== second.kind && top.score - second.score < 5 && second.score >= 5
  const nearPriority = !!second && top.score - second.score < 3 && second.score >= 8
  const ambiguous = closeScores || crossKind || nearPriority

  if (ambiguous && second) {
    const candidates = ranked.slice(0, 3).map(c => ({
      id: c.id,
      label: c.label,
      score: Math.round(c.score * 10) / 10,
      kind: c.kind,
    }))
    const partialAmb = buildPartial(text, partial.formato, top.id)
    return {
      status: 'ambiguous',
      candidates,
      formato: partialAmb.formato,
      partial: {
        formato: partialAmb.formato,
        desde: partialAmb.desde,
        hasta: partialAmb.hasta,
        anio: partialAmb.anio,
        mes: partialAmb.mes,
        situacion: partialAmb.situacion,
        q: partialAmb.q,
        where: partialAmb.where,
      },
      explanation:
        `Encontré más de una opción posible. ¿Cuál querés?\n` +
        candidates.map((c, i) => `${i + 1}) ${c.label} (${c.kind})`).join('\n') +
        `\nFormato: ${partialAmb.formato.toUpperCase()}` +
        (partialAmb.desde || partialAmb.hasta ? `\nPeriodo: ${partialAmb.desde ?? '…'} → ${partialAmb.hasta ?? '…'}` : '') +
        (describeWhere(partialAmb.where) ? `\nFiltro: ${describeWhere(partialAmb.where)}` : ''),
    }
  }

  const def = asistenteReportById(top.id)!
  const refined = buildPartial(text, partial.formato, top.id)
  const fmt = def.formats.includes(refined.formato) ? refined.formato : def.formats[0]
  const intent: AsistenteIntent = {
    reportId: top.id,
    formato: fmt,
    desde: refined.desde,
    hasta: refined.hasta,
    anio: refined.anio,
    mes: refined.mes,
    situacion: refined.situacion,
    q: refined.q,
    where: refined.where,
    confidence: Math.min(0.97, 0.5 + top.score / 30),
    explanation: explainIntent(def.label, { ...refined, formato: fmt }),
    source: 'rules',
  }
  return { status: 'ok', intent }
}

export async function parseIntentWithLlm(prompt: string): Promise<AsistenteIntent | null> {
  const key = (import.meta as any).env?.VITE_OPENAI_API_KEY as string | undefined
  if (!key?.trim()) return null

  const catalog = ASISTENTE_REPORTS.map(r => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    formats: r.formats,
    description: r.description,
    phrases: r.phrases,
  }))

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Planificador de informes UEP. Responde SOLO JSON: ' +
              '{reportId, formato(pdf|excel|word), desde, hasta, anio, mes, situacion(finalizado|tramite|null), q, ' +
              'where:[{field,op,value,label}]|null, explanation, ambiguous:[{id,label}]|null}. ' +
              'Para Radar CGR, "fecha de presentación atrasada" o "atrasadas" => where:[{field:"alerta",op:"eq",value:"Atrasada",label:"alerta = Atrasada"}]. ' +
              'Si hay duda entre listado genérico e informe específico, rellena ambiguous. Usa SOLO ids del catálogo. No inventes datos.',
          },
          {
            role: 'user',
            content: JSON.stringify({ pedido: prompt, catalogo: catalog, hoy: nowDateInputValue() }),
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.ambiguous) && parsed.ambiguous.length >= 2) {
      // Signal ambiguity via throwing a special path — handled in resolveIntent
      ;(parseIntentWithLlm as any)._lastAmbiguous = parsed
      return null
    }
    const def = asistenteReportById(String(parsed.reportId ?? ''))
    if (!def) return null
    let formato = String(parsed.formato ?? 'pdf').toLowerCase() as InformeFormato
    if (!def.formats.includes(formato)) formato = def.formats[0]
    const situacion =
      parsed.situacion === 'finalizado' || parsed.situacion === 'tramite' ? parsed.situacion : null
    const whereFromNl = detectWhereFilters(prompt, def.id)
    const whereFromLlm = Array.isArray(parsed.where)
      ? parsed.where.filter((w: any) => w && w.field && w.op).map((w: any) => ({
          field: String(w.field),
          op: w.op,
          value: w.value,
          label: String(w.label || `${w.field} ${w.op} ${w.value}`),
        }))
      : []
    const where = whereFromLlm.length ? whereFromLlm : whereFromNl
    return {
      reportId: def.id,
      formato,
      desde: parsed.desde ?? null,
      hasta: parsed.hasta ?? null,
      anio: parsed.anio ?? null,
      mes: parsed.mes ?? null,
      situacion,
      q: parsed.q ? String(parsed.q) : null,
      where,
      confidence: 0.92,
      explanation: String(parsed.explanation ?? explainIntent(def.label, {
        formato,
        desde: parsed.desde ?? null,
        hasta: parsed.hasta ?? null,
        anio: parsed.anio ?? null,
        mes: parsed.mes ?? null,
        situacion,
        q: parsed.q ? String(parsed.q) : null,
        where,
      })),
      source: 'llm',
    }
  } catch {
    return null
  }
}

export function intentFromChoice(
  reportId: AsistenteReportId,
  partial: {
    formato: InformeFormato
    desde?: string | null
    hasta?: string | null
    anio?: number | null
    mes?: number | null
    situacion?: 'finalizado' | 'tramite' | null
    q?: string | null
    where?: RowFilter[] | null
  },
): AsistenteIntent | null {
  const def = asistenteReportById(reportId)
  if (!def) return null
  const formato = def.formats.includes(partial.formato) ? partial.formato : def.formats[0]
  return {
    reportId,
    formato,
    desde: partial.desde ?? null,
    hasta: partial.hasta ?? null,
    anio: partial.anio ?? null,
    mes: partial.mes ?? null,
    situacion: partial.situacion ?? null,
    q: partial.q ?? null,
    where: partial.where ?? null,
    confidence: 1,
    explanation: explainIntent(def.label, {
      formato,
      desde: partial.desde ?? null,
      hasta: partial.hasta ?? null,
      anio: partial.anio ?? null,
      mes: partial.mes ?? null,
      situacion: partial.situacion ?? null,
      q: partial.q ?? null,
      where: partial.where ?? [],
    }),
    source: 'user',
  }
}

export async function resolveIntent(prompt: string): Promise<ResolveIntentResult> {
  // LLM primero si hay key
  const key = (import.meta as any).env?.VITE_OPENAI_API_KEY as string | undefined
  if (key?.trim()) {
    ;(parseIntentWithLlm as any)._lastAmbiguous = null
    const llm = await parseIntentWithLlm(prompt)
    const amb = (parseIntentWithLlm as any)._lastAmbiguous
    if (amb?.ambiguous?.length >= 2) {
      const partial = buildPartial(prompt, amb.formato ? String(amb.formato).toLowerCase() as InformeFormato : null)
      const candidates: IntentCandidate[] = amb.ambiguous
        .map((c: any) => {
          const def = asistenteReportById(String(c.id))
          if (!def) return null
          return { id: def.id, label: def.label, score: 10, kind: def.kind }
        })
        .filter(Boolean)
      if (candidates.length >= 2) {
        return {
          status: 'ambiguous',
          candidates,
          formato: partial.formato,
          partial,
          explanation: String(amb.explanation ?? 'Hay varias opciones. Elegí una:'),
        }
      }
    }
    if (llm) return { status: 'ok', intent: llm }
  }
  return parseIntentRules(prompt)
}
