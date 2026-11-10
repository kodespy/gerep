import JSZip from 'jszip'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export type ParsedRendicionFormulario = {
  asunto?: string
  strNumero?: string
  monto?: number
  fecha?: string
  periodo?: string
  observaciones?: string
  entidadNombre?: string
  ruc?: string
}

function decodePdfLiteral(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}

function extractPdfText(buf: ArrayBuffer): string {
  const raw = new TextDecoder('latin1').decode(buf)
  const out: string[] = []
  const re = /\((?:\\.|[^\\)])*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const t = decodePdfLiteral(m[0].slice(1, -1)).replace(/\s+/g, ' ').trim()
    if (t && /[\p{L}\d]/u.test(t)) out.push(t)
  }
  return out.join(' ')
}

async function extractDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('El Word no tiene word/document.xml.')
  const xml = await entry.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('El Word no se pudo leer (XML inválido).')
  }
  return Array.from(doc.getElementsByTagNameNS(W_NS, 't'))
    .map(n => n.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFechaLoose(raw: string): string | null {
  const t = raw.trim().replace(/[.,;]+$/, '')
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return t
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseMontoGs(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '').replace(/gs\.?|₲/gi, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

function capture(text: string, re: RegExp): string | undefined {
  const m = text.match(re)
  const v = (m?.[1] ?? '').replace(/\s+/g, ' ').trim()
  return v || undefined
}

export function parseRendicionFormularioText(text: string): ParsedRendicionFormulario {
  const t = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ')
  const out: ParsedRendicionFormulario = {}

  out.strNumero = capture(
    t,
    /\bSTR\s*(?:n[°ºo.]?\s*)?[:\-]?\s*([A-Z0-9][A-Z0-9/\-.]{1,28})/i,
  ) ?? capture(t, /solicitud\s+de\s+transferencia[^0-9]{0,24}(\d[\w/\-.]{1,20})/i)

  const montoRaw = capture(
    t,
    /(?:monto(?:\s+(?:de\s+la\s+)?rendici[oó]n)?|importe\s+rendido|total\s+rendido)\s*[:\-]?\s*([\d.]+(?:,\d{1,2})?)/i,
  ) ?? capture(t, /(?:gs\.?|guaran[ií]es|₲)\s*[:\-]?\s*([\d.]+(?:,\d{1,2})?)/i)
  if (montoRaw) {
    const n = parseMontoGs(montoRaw)
    if (n) out.monto = n
  }

  const fechaRaw = capture(t, /fecha(?:\s+de\s+(?:presentaci[oó]n|control|rendici[oó]n))?\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}|\d{4}-\d{2}-\d{2})/i)
    ?? capture(t, /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})\b/)
  if (fechaRaw) {
    const f = parseFechaLoose(fechaRaw)
    if (f) out.fecha = f
  }

  out.periodo = capture(t, /per[ií]odo(?:\s+rendido)?\s*[:\-]?\s*([^\n]{3,60})/i)
  out.asunto = capture(t, /asunto\s*[:\-]?\s*([^\n]{5,160})/i)
  out.ruc = capture(t, /\b(\d{5,8}-\d)\b/)
  out.entidadNombre = capture(
    t,
    /(?:entidad(?:\s+(?:remitente|proponente|beneficiaria))?|proponente|raz[oó]n\s+social)\s*[:\-]?\s*([^\n]{4,90})/i,
  )
  out.observaciones = capture(t, /observaciones?\s*[:\-]?\s*([^\n]{4,240})/i)

  if (out.asunto && /rendici[oó]n\s+de\s+cuentas/i.test(out.asunto) === false && /rendici[oó]n/i.test(t)) {
    if (out.asunto.length < 12) out.asunto = `RENDICIÓN DE CUENTAS · ${out.asunto}`
  }

  return out
}

export async function parseRendicionFormularioFile(file: File): Promise<ParsedRendicionFormulario> {
  const name = file.name.toLowerCase()
  let text = ''
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    text = extractPdfText(await file.arrayBuffer())
  } else if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    text = await extractDocxText(file)
  } else if (name.endsWith('.txt') || file.type.startsWith('text/')) {
    text = await file.text()
  } else if (name.endsWith('.doc')) {
    throw new Error('El .doc antiguo no se puede leer. Use PDF o Word .docx.')
  } else {
    throw new Error('Use un PDF, Word .docx o TXT del formulario.')
  }
  if (!text.trim()) {
    throw new Error('No se pudo extraer texto del archivo. Complete los datos a mano.')
  }
  const parsed = parseRendicionFormularioText(text)
  if (!parsed.strNumero && !parsed.monto && !parsed.fecha && !parsed.asunto && !parsed.periodo) {
    throw new Error('No se reconocieron datos del formulario. Revise el archivo o complete a mano.')
  }
  return parsed
}

export function parsedToFormPatch(parsed: ParsedRendicionFormulario): Record<string, any> {
  const patch: Record<string, any> = {}
  if (parsed.strNumero) patch.rc_str_numero = parsed.strNumero
  if (parsed.monto != null) patch.rc_monto = parsed.monto
  if (parsed.observaciones) patch.rc_observaciones = parsed.observaciones
  if (parsed.asunto) patch.asunto = parsed.asunto.toUpperCase()
  return patch
}
