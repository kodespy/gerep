/** Utilidades para HTML de editores enriquecidos. */

/** Normaliza texto legado (plano) a HTML usable por el editor. */
export function toRichTextValue(raw: string | null | undefined): string {
  const s = String(raw ?? '')
  if (!s.trim()) return ''
  if (/<[a-z][\s\S]*>/i.test(s)) return s
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
}

/** Indica si el HTML del editor está vacío (p. ej. `<p><br></p>`). */
export function isEmptyRichText(html: string | null | undefined): boolean {
  if (!html) return true
  if (/<img\b/i.test(html) || /<table\b/i.test(html)) return false
  const t = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return !t
}

export type RichTextAlign = 'left' | 'center' | 'right' | 'justify'

export type RichTextRun = {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
}

export type RichTextTableCell = {
  text: string
  runs: RichTextRun[]
  header?: boolean
}

export type RichTextBlock = {
  text: string
  runs: RichTextRun[]
  align: RichTextAlign
  indent: number
  lineHeight: number
  imageSrc?: string
  table?: RichTextTableCell[][]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function detectAlign(tagOpen: string): RichTextAlign {
  if (/ql-align-justify|text-align:\s*justify/i.test(tagOpen)) return 'justify'
  if (/ql-align-center|text-align:\s*center/i.test(tagOpen)) return 'center'
  if (/ql-align-right|text-align:\s*right/i.test(tagOpen)) return 'right'
  return 'left'
}

function detectIndent(tagOpen: string): number {
  const m = tagOpen.match(/ql-indent-(\d+)/i)
  if (m) return Math.min(8, Math.max(0, Number(m[1]) || 0))
  return 0
}

function detectLineHeight(tagOpen: string): number {
  const style = tagOpen.match(/line-height:\s*([\d.]+)/i)
  if (style) {
    const n = Number(style[1])
    if (Number.isFinite(n) && n >= 1 && n <= 3) return n
  }
  const cls = tagOpen.match(/ql-lineHeight-(\d+(?:-\d+)?)|ql-line-height-(\d+(?:-\d+)?)/i)
  const raw = cls?.[1] || cls?.[2]
  if (raw) {
    if (raw === '115' || raw === '1-15') return 1.15
    if (raw === '15' || raw === '1-5') return 1.5
    const n = Number(raw.replace('-', '.'))
    if (Number.isFinite(n) && n >= 1 && n <= 3) return n
  }
  return 0
}

function firstImageSrc(html: string): string | undefined {
  const m = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)
  if (!m?.[1]) return undefined
  return decodeEntities(m[1].trim()) || undefined
}

function parseInlineRuns(innerHtml: string, blockBold = false): RichTextRun[] {
  const runs: RichTextRun[] = []
  let bold = blockBold ? 1 : 0
  let italic = 0
  let underline = 0

  const push = (raw: string) => {
    const text = decodeEntities(raw.replace(/\u00a0/g, ' '))
    if (!text) return
    const style = { bold: bold > 0, italic: italic > 0, underline: underline > 0 }
    const last = runs[runs.length - 1]
    if (
      last &&
      last.bold === style.bold &&
      last.italic === style.italic &&
      last.underline === style.underline
    ) {
      last.text += text
    } else {
      runs.push({ text, ...style })
    }
  }

  const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>|[^<]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(innerHtml)) !== null) {
    const token = m[0]
    if (token.startsWith('<')) {
      const tag = (m[1] || '').toLowerCase()
      const isClose = /^<\//.test(token)
      if (tag === 'br') {
        push('\n')
        continue
      }
      const delta = isClose ? -1 : 1
      if (tag === 'strong' || tag === 'b') bold = Math.max(0, bold + delta)
      else if (tag === 'em' || tag === 'i') italic = Math.max(0, italic + delta)
      else if (tag === 'u') underline = Math.max(0, underline + delta)
      else if (!isClose && /font-weight:\s*(bold|[5-9]00)/i.test(token)) bold += 1
    } else {
      push(token)
    }
  }
  return trimRuns(runs)
}

function trimRuns(runs: RichTextRun[]): RichTextRun[] {
  const out = runs.filter(r => r.text.length)
  while (out.length && !out[0].text.trim()) out.shift()
  if (out.length) out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') }
  while (out.length && !out[out.length - 1].text.trim()) out.pop()
  if (out.length) {
    const last = out[out.length - 1]
    out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') }
  }
  return out.filter(r => r.text.length)
}

/** Ajusta tablas pegadas (Word) al formato que Quill espera: tbody + data-row por fila. */
export function normalizeRichTextTables(html: string): string {
  if (!html || !/<table/i.test(html) || typeof document === 'undefined') return html
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  wrap.querySelectorAll('table').forEach(table => {
    const directRows = Array.from(table.children).filter(c => c.tagName === 'TR')
    if (directRows.length) {
      let tbody = table.querySelector('tbody')
      if (!tbody) {
        tbody = document.createElement('tbody')
        table.appendChild(tbody)
      }
      directRows.forEach(tr => tbody!.appendChild(tr))
    }
    table.querySelectorAll('tr').forEach(tr => {
      const existing = tr.querySelector('[data-row]')?.getAttribute('data-row')
      const id = existing || `row-${Math.random().toString(36).slice(2, 6)}`
      Array.from(tr.querySelectorAll('th')).forEach(th => {
        const td = document.createElement('td')
        td.innerHTML = `<strong>${th.innerHTML}</strong>`
        Array.from(th.attributes).forEach(attr => td.setAttribute(attr.name, attr.value))
        th.replaceWith(td)
      })
      tr.querySelectorAll('td').forEach(td => {
        if (!td.getAttribute('data-row')) td.setAttribute('data-row', id)
      })
    })
  })
  return wrap.innerHTML
}

function parseHtmlTable(tableHtml: string): RichTextTableCell[][] {
  const rows: RichTextTableCell[][] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(tableHtml)) !== null) {
    const cells: RichTextTableCell[] = []
    const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
    let cell: RegExpExecArray | null
    while ((cell = cellRe.exec(tr[1])) !== null) {
      const header = cell[1].toLowerCase() === 'th'
      const inner = cell[2].replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
      const runs = parseInlineRuns(inner, header)
      const text = runs.map(r => r.text).join('').replace(/[ \t]+\n/g, '\n').replace(/\s+/g, ' ').trim()
      cells.push({ text, runs, header })
    }
    if (cells.length) rows.push(cells)
  }
  return rows
}

function splitHtmlByTables(html: string): { kind: 'html' | 'table'; html: string }[] {
  const parts: { kind: 'html' | 'table'; html: string }[] = []
  const re = /<table\b[\s\S]*?<\/table>/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) parts.push({ kind: 'html', html: html.slice(last, m.index) })
    parts.push({ kind: 'table', html: m[0] })
    last = m.index + m[0].length
  }
  if (last < html.length) parts.push({ kind: 'html', html: html.slice(last) })
  return parts.length ? parts : [{ kind: 'html', html }]
}

function emptyBlock(partial: Partial<RichTextBlock> = {}): RichTextBlock {
  return { text: '', runs: [], align: 'left', indent: 0, lineHeight: 0, ...partial }
}

function parseFlowHtml(html: string, blocks: RichTextBlock[]) {
  const re = /<(p|div|h[1-6]|li)(\s[^>]*)?>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  let orderedIndex = 0
  while ((m = re.exec(html)) !== null) {
    if (!m[1] && /^<img\b/i.test(m[0])) {
      const imageSrc = firstImageSrc(m[0])
      if (imageSrc) blocks.push(emptyBlock({ imageSrc }))
      continue
    }
    const tag = m[1].toLowerCase()
    const attrs = m[2] ?? ''
    const heading = /^h[1-6]$/.test(tag)
    const imageSrc = firstImageSrc(m[3])
    const runs = parseInlineRuns(m[3], heading)
    if (!runs.length && !imageSrc) {
      if (tag !== 'li') orderedIndex = 0
      continue
    }
    if (tag === 'li') {
      const ordered = /data-list\s*=\s*["']ordered["']/i.test(m[0])
      if (ordered) {
        orderedIndex += 1
        runs.unshift({ text: `${orderedIndex}. `, bold: false, italic: false, underline: false })
      } else {
        orderedIndex = 0
        runs.unshift({ text: '• ', bold: false, italic: false, underline: false })
      }
    } else {
      orderedIndex = 0
    }
    const text = runs.map(r => r.text).join('').replace(/[ \t]+\n/g, '\n').trim()
    if (!text && !imageSrc) continue
    blocks.push({
      text,
      runs,
      align: detectAlign(attrs),
      indent: detectIndent(attrs),
      lineHeight: detectLineHeight(attrs),
      imageSrc,
    })
  }
}

/** Bloques de párrafo / tablas (para PDF y búsqueda). */
export function richTextToBlocks(html: string | null | undefined): RichTextBlock[] {
  if (!html || isEmptyRichText(html)) return []
  const blocks: RichTextBlock[] = []
  for (const part of splitHtmlByTables(html)) {
    if (part.kind === 'table') {
      const table = parseHtmlTable(part.html)
      if (table.length) blocks.push(emptyBlock({ table }))
      continue
    }
    parseFlowHtml(part.html, blocks)
  }
  if (!blocks.length) {
    const raw = String(html)
    const imageSrc = firstImageSrc(raw)
    const runs = parseInlineRuns(raw.replace(/<br\s*\/?>/gi, '\n'))
    const text = runs
      .map(r => r.text)
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (text || imageSrc) blocks.push(emptyBlock({ text, runs, imageSrc }))
  }
  return blocks
}

/** Convierte HTML simple a texto plano preservando saltos de párrafo, listas y tablas. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html || isEmptyRichText(html)) return ''
  const blocks = richTextToBlocks(html)
  if (blocks.length) {
    return blocks
      .map(b => {
        if (b.table?.length) {
          return b.table.map(row => row.map(c => c.text).join('\t')).join('\n')
        }
        return b.text
      })
      .filter(Boolean)
      .join('\n\n')
  }
  let s = String(html)
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/?(ul|ol|table|thead|tbody)>/gi, '\n')
  s = s.replace(/<li[^>]*>/gi, '• ')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}
