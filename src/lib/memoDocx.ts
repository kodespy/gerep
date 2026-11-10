import JSZip from 'jszip'
import { formatMemoNumero, normalizeMemoNumero } from './memoNumero'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export type ParsedMemoDocx = {
  numero: string | null
  fecha: string | null
  deNombre: string
  deCargo: string
  paraNombre: string
  paraCargo: string
  cc: { nombre: string; cargo: string }[]
  asunto: string
  cuerpoHtml: string
  cuerpoTexto: string
}

type DocLine = { text: string; html: string }

function xmlAttr(el: Element, local: string): string | null {
  return el.getAttribute(`w:${local}`) ?? el.getAttributeNS(W_NS, local)
}

function wOn(rPr: Element | null, tag: string): boolean {
  if (!rPr) return false
  const nodes = rPr.getElementsByTagNameNS(W_NS, tag)
  if (!nodes.length) return false
  const val = xmlAttr(nodes[0], 'val')
  if (val === '0' || /^false$/i.test(val ?? '')) return false
  return true
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function runText(run: Element): string {
  let out = ''
  for (const child of Array.from(run.childNodes)) {
    if (child.nodeType !== 1) continue
    const el = child as Element
    if (el.namespaceURI === W_NS && el.localName === 't') out += el.textContent ?? ''
    else if (el.namespaceURI === W_NS && (el.localName === 'tab' || el.localName === 'ptab')) out += ' '
    else if (el.namespaceURI === W_NS && el.localName === 'br') out += '\n'
  }
  return out
}

function paragraphToLine(p: Element): DocLine {
  const runs = p.getElementsByTagNameNS(W_NS, 'r')
  let text = ''
  let html = ''
  for (const run of Array.from(runs)) {
    const rPr = run.getElementsByTagNameNS(W_NS, 'rPr')[0] ?? null
    const raw = runText(run)
    if (!raw) continue
    text += raw
    let piece = esc(raw).replace(/\n/g, '<br/>')
    if (wOn(rPr, 'b')) piece = `<strong>${piece}</strong>`
    if (wOn(rPr, 'i')) piece = `<em>${piece}</em>`
    if (wOn(rPr, 'u')) piece = `<u>${piece}</u>`
    html += piece
  }
  return { text: text.replace(/\s+/g, ' ').trim(), html: html.trim() }
}

function labelKey(raw: string): 'de' | 'para' | 'cc' | 'asunto' | 'fecha' | null {
  const t = raw.replace(/:$/, '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (t === 'de') return 'de'
  if (t === 'para') return 'para'
  if (t === 'cc' || t === 'c.c' || t === 'c.c.' || t === 'c/c' || t === 'con copia') return 'cc'
  if (t === 'asunto') return 'asunto'
  if (t === 'fecha') return 'fecha'
  return null
}

function isAtentamente(text: string): boolean {
  return /^(atentamente|atte)[.,\s]*$/i.test(text.trim())
}

function parseFecha(raw: string): string | null {
  const t = String(raw ?? '').trim().replace(/[.,;]+$/, '')
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

function numeroFromTitle(text: string): string | null {
  const m = text.match(/memor[aá]ndum\s+uep\s*n[°ºo.]?\s*(\d+)\s*\/\s*(\d{4})/i)
  if (!m) return null
  return formatMemoNumero(Number(m[1]), Number(m[2]))
}

export function numeroFromMemoFilename(name: string): string | null {
  const base = name.replace(/\.[^.]+$/, '').trim()
  const m = base.match(/^(\d+)\s*[-–]\s*(\d{4})\b/)
  if (!m) return null
  return formatMemoNumero(Number(m[1]), Number(m[2]))
}

function splitPersona(lines: string[]): { nombre: string; cargo: string } {
  const cleaned = lines.map(s => s.trim()).filter(Boolean)
  if (!cleaned.length) return { nombre: '', cargo: '' }
  const first = cleaned[0]
  const rest = cleaned.slice(1)
  const comma = first.lastIndexOf(',')
  if (comma > 0) {
    return {
      nombre: first.slice(0, comma).replace(/\s+/g, ' ').trim(),
      cargo: [first.slice(comma + 1).trim(), ...rest].filter(Boolean).join('\n'),
    }
  }
  return { nombre: first, cargo: rest.join('\n') }
}

function bodyToHtml(lines: DocLine[]): string {
  const paras = lines.filter(l => l.text && !isAtentamente(l.text))
  if (!paras.length) return ''
  return paras
    .map(l => `<p class="ql-align-justify">${l.html || esc(l.text)}</p>`)
    .join('')
}

export function parseMemoDocumentXml(xml: string, filename = ''): ParsedMemoDocx {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('El Word no se pudo leer (XML inválido).')
  }
  const paras = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'))
  const lines = paras.map(paragraphToLine)

  let numero = lines.map(l => numeroFromTitle(l.text)).find(Boolean) ?? numeroFromMemoFilename(filename)

  const fields: Record<string, string[]> = {}
  let i = 0
  while (i < lines.length) {
    const key = labelKey(lines[i].text)
    if (!key) {
      i += 1
      continue
    }
    i += 1
    while (i < lines.length && (!lines[i].text || lines[i].text === ':')) i += 1
    const collected: string[] = []
    if (key === 'fecha') {
      if (i < lines.length && lines[i].text && !labelKey(lines[i].text)) {
        collected.push(lines[i].text)
        i += 1
      }
    } else {
      while (i < lines.length) {
        const t = lines[i].text
        if (labelKey(t) || isAtentamente(t) || numeroFromTitle(t)) break
        if (t) collected.push(t)
        i += 1
      }
    }
    fields[key] = collected
    if (key === 'fecha') break
  }

  const bodyLines: DocLine[] = []
  while (i < lines.length) {
    if (isAtentamente(lines[i].text)) break
    if (lines[i].text) bodyLines.push(lines[i])
    i += 1
  }

  const de = splitPersona(fields.de ?? [])
  const para = splitPersona(fields.para ?? [])
  const ccRaw = fields.cc ?? []
  const cc: { nombre: string; cargo: string }[] = []
  if (ccRaw.length) {
    const chunk: string[] = []
    const flush = () => {
      const p = splitPersona(chunk.splice(0))
      if (p.nombre) cc.push(p)
    }
    for (const line of ccRaw) {
      if (chunk.length && /,/.test(line)) flush()
      chunk.push(line)
    }
    flush()
  }

  return {
    numero: normalizeMemoNumero(numero),
    fecha: parseFecha((fields.fecha ?? []).join(' ')),
    deNombre: de.nombre,
    deCargo: de.cargo,
    paraNombre: para.nombre,
    paraCargo: para.cargo,
    cc,
    asunto: (fields.asunto ?? []).join(' ').replace(/\s+/g, ' ').trim(),
    cuerpoHtml: bodyToHtml(bodyLines),
    cuerpoTexto: bodyLines.map(l => l.text).join('\n\n').trim(),
  }
}

export async function fileLooksLikeDocx(file: File): Promise<boolean> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) return false
  const buf = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b
}

export async function parseMemoDocxFile(file: File): Promise<ParsedMemoDocx> {
  const ok = await fileLooksLikeDocx(file)
  if (!ok) throw new Error('No es un Word .docx (ZIP). El .doc antiguo no se puede importar.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('El archivo no tiene word/document.xml.')
  const xml = await entry.async('string')
  return parseMemoDocumentXml(xml, file.name)
}
