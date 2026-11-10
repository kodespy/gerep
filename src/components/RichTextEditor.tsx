import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactQuill, { Quill } from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { cn } from '../lib/utils'
import { normalizeRichTextTables } from '../lib/richText'

const LINE_HEIGHTS = ['1', '1.15', '1.5', '2']
const FONT_SIZES = ['11px', '12px', '14px', '16px', '18px']
const TABLE_SIZES = ['2x2', '3x3', '4x3', '4x4', '5x3'] as const
const MAX_IMAGE_EDGE = 1400
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

const TOOLBAR_TITLES: Record<string, string> = {
  undo: 'Deshacer',
  redo: 'Rehacer',
  bold: 'Negrita',
  italic: 'Cursiva',
  underline: 'Subrayado',
  clean: 'Quitar formato',
  image: 'Insertar imagen',
  'indent-1': 'Aumentar sangría',
  indent: 'Reducir sangría',
  list: 'Lista',
  align: 'Alineación',
  header: 'Estilo de párrafo',
  size: 'Tamaño de letra',
  lineHeight: 'Interlineado',
}

type TableModule = {
  insertTable: (rows: number, columns: number) => void
  insertRowBelow: () => void
  insertColumnRight: () => void
  deleteRow: () => void
  deleteColumn: () => void
  deleteTable: () => void
}

type QuillEditor = {
  focus: () => void
  getSelection: (focus?: boolean) => { index: number; length: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, value: unknown, source?: string) => void
  setSelection: (index: number, length: number, source?: string) => void
  getModule: (name: string) => TableModule | undefined
  history?: { undo: () => void; redo: () => void }
  root: HTMLElement
}

let formatsRegistered = false

function registerFormats() {
  if (formatsRegistered) return
  const Parchment = Quill.import('parchment') as {
    StyleAttributor?: new (...args: any[]) => { whitelist?: string[] }
    Scope?: { BLOCK: number; INLINE: number }
  }
  const StyleAttributor = Parchment?.StyleAttributor
  const Scope = Parchment?.Scope
  if (!StyleAttributor || !Scope) return

  const LineHeight = new StyleAttributor('lineHeight', 'line-height', {
    scope: Scope.BLOCK,
    whitelist: LINE_HEIGHTS,
  })
  Quill.register(LineHeight as any, true)

  const Size = new StyleAttributor('size', 'font-size', {
    scope: Scope.INLINE,
    whitelist: FONT_SIZES,
  })
  Quill.register(Size as any, true)
  formatsRegistered = true
}

try {
  registerFormats()
} catch {
  /* el editor sigue usable sin selectores extra */
}

const TOOLBAR_DEFAULT = [
  ['undo', 'redo'],
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
  [{ lineHeight: LINE_HEIGHTS }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['image'],
  ['clean'],
]

const TOOLBAR_DOCUMENT = [
  ['undo', 'redo'],
  [{ header: [false, 2, 3] }],
  [{ size: FONT_SIZES }],
  ['bold', 'italic', 'underline'],
  [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
  [{ lineHeight: LINE_HEIGHTS }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['image'],
  ['clean'],
]

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagen inválida.'))
    img.src = src
  })
}

async function fitImageDataUrl(src: string, mime: string): Promise<string> {
  const img = await loadHtmlImage(src)
  const scale = Math.min(1, MAX_IMAGE_EDGE / img.naturalWidth, MAX_IMAGE_EDGE / img.naturalHeight)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  if (scale >= 1 && (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg')) {
    return src
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img, 0, 0, w, h)
  const outType = mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp'
    ? 'image/jpeg'
    : 'image/png'
  return canvas.toDataURL(outType, 0.88)
}

async function normalizeImageFile(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type) && !file.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen.')
  }
  const raw = await readFileAsDataUrl(file)
  return fitImageDataUrl(raw, file.type || 'image/png')
}

function insertImage(quill: QuillEditor, dataUrl: string) {
  const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 }
  quill.insertEmbed(range.index, 'image', dataUrl, 'user')
  quill.setSelection(range.index + 1, 0, 'user')
}

function stripForcedImageSize(html: string): string {
  if (!/<img\b/i.test(html)) return html
  return html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\s(?:width|height)\s*=\s*(["']).*?\1/gi, '')
      .replace(/\s(?:width|height)\s*=\s*[^\s>]+/gi, '')
      .replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_s, q: string, style: string) => {
        const next = style
          .replace(/(?:^|;)\s*(?:width|height|max-width|max-height)\s*:[^;]*/gi, '')
          .replace(/^;+|;+$/g, '')
          .trim()
        return next ? ` style=${q}${next}${q}` : ''
      })
    return `<img${cleaned}>`
  })
}

function labelToolbar(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.ql-toolbar button, .ql-toolbar .ql-picker').forEach(el => {
    const key = [...el.classList].find(c => c.startsWith('ql-') && c !== 'ql-picker' && c !== 'ql-expanded')
    if (!key) return
    const name = key.slice(3)
    const value = el.getAttribute('value') || el.getAttribute('data-value') || ''
    let title = TOOLBAR_TITLES[name]
    if (name === 'align') {
      title = value === 'center' ? 'Centrar' : value === 'right' ? 'Derecha' : value === 'justify' ? 'Justificar' : 'Izquierda'
    } else if (name === 'list') {
      title = value === 'ordered' ? 'Lista numerada' : 'Viñetas'
    } else if (name === 'indent') {
      title = value === '+1' ? 'Aumentar sangría' : 'Reducir sangría'
    } else if (name === 'header') {
      title = 'Estilo de párrafo'
    }
    if (title && !el.getAttribute('title')) el.setAttribute('title', title)
  })
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = 'min-h-[140px]',
  variant = 'default',
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeightClass?: string
  variant?: 'default' | 'document'
}) {
  const quillRef = useRef<ReactQuill | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const getQuill = useCallback((): QuillEditor | null => {
    const inst = quillRef.current as { getEditor?: () => QuillEditor } | null
    return inst?.getEditor?.() ?? null
  }, [])

  const addImages = useCallback(async (files: File[]) => {
    const quill = getQuill()
    if (!quill) return
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        insertImage(quill, await normalizeImageFile(file))
      } catch {
        /* se omite un archivo inválido */
      }
    }
  }, [getQuill])

  const withTable = useCallback((fn: (mod: TableModule) => void) => {
    const quill = getQuill()
    if (!quill) return
    quill.focus()
    if (!quill.getSelection(true)) {
      const len = quill.getLength()
      quill.setSelection(Math.max(0, len - 1), 0, 'user')
    }
    const mod = quill.getModule('table')
    if (!mod) return
    fn(mod)
  }, [getQuill])

  const insertTable = useCallback((spec: string) => {
    const [rows, cols] = spec.split('x').map(n => Math.max(1, Number(n) || 0))
    withTable(mod => mod.insertTable(Math.min(8, rows), Math.min(8, cols)))
  }, [withTable])

  const modules = useMemo(() => {
    const base = {
      toolbar: {
        container: variant === 'document' ? TOOLBAR_DOCUMENT : TOOLBAR_DEFAULT,
        handlers: {
          undo() {
            getQuill()?.history?.undo()
          },
          redo() {
            getQuill()?.history?.redo()
          },
          image() {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/png,image/jpeg,image/webp,image/gif'
            input.multiple = true
            input.onchange = () => {
              void addImages(Array.from(input.files ?? []))
            }
            input.click()
          },
        },
      },
      clipboard: { matchVisual: false },
      history: { delay: 400, maxStack: 80 },
    }
    return variant === 'document' ? { ...base, table: true } : base
  }, [addImages, getQuill, variant])

  const formats = useMemo(() => (
    variant === 'document'
      ? ['header', 'bold', 'italic', 'underline', 'align', 'list', 'indent', 'image', 'size', 'lineHeight', 'table', 'table-row', 'table-body', 'table-container']
      : ['header', 'bold', 'italic', 'underline', 'align', 'list', 'indent', 'image', 'lineHeight']
  ), [variant])

  useEffect(() => {
    const root = wrapRef.current
    if (!root) return
    labelToolbar(root)

    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((f): f is File => !!f)
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      void addImages(files)
    }

    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      void addImages(files)
    }

    const onDragOver = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
        e.preventDefault()
      }
    }

    root.addEventListener('paste', onPaste, true)
    root.addEventListener('drop', onDrop)
    root.addEventListener('dragover', onDragOver)
    return () => {
      root.removeEventListener('paste', onPaste, true)
      root.removeEventListener('drop', onDrop)
      root.removeEventListener('dragover', onDragOver)
    }
  }, [addImages])

  return (
    <div
      ref={wrapRef}
      className={cn(
        'rich-text-editor mt-1 rounded-lg border border-slate-300 bg-white',
        variant === 'document' ? 'rich-text-editor--document' : minHeightClass,
      )}
    >
      {variant === 'document' && (
        <div className="rich-text-table-bar">
          <span>Tabla</span>
          <select
            defaultValue=""
            onChange={e => {
              const spec = e.target.value
              e.target.value = ''
              if (spec) insertTable(spec)
            }}
            title="Insertar tabla"
          >
            <option value="">Insertar…</option>
            {TABLE_SIZES.map(size => (
              <option key={size} value={size}>{size.replace('x', ' × ')}</option>
            ))}
          </select>
          <button type="button" onClick={() => withTable(m => m.insertRowBelow())}>+ Fila</button>
          <button type="button" onClick={() => withTable(m => m.insertColumnRight())}>+ Columna</button>
          <button type="button" onClick={() => withTable(m => m.deleteRow())}>Quitar fila</button>
          <button type="button" onClick={() => withTable(m => m.deleteColumn())}>Quitar columna</button>
          <button type="button" onClick={() => withTable(m => m.deleteTable())}>Quitar tabla</button>
        </div>
      )}
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={html => onChange(normalizeRichTextTables(stripForcedImageSize(html)))}
        modules={modules}
        formats={variant === 'document' ? undefined : formats}
        placeholder={placeholder}
      />
    </div>
  )
}
