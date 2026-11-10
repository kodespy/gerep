import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, Search, Upload, X, FileText } from 'lucide-react'
import { Label as FbLabel, Select as FbSelect, Textarea as FbTextarea, TextInput as FbTextInput } from 'flowbite-react'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { storageFileLabel } from '../lib/storage'

const controlClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-primary-500 dark:disabled:bg-gray-700'

export function Label({ text, required, htmlFor }: { text: string; required?: boolean; htmlFor?: string }) {
  return (
    <FbLabel
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
    >
      {text}
      {required && (
        <>
          <span className="ml-0.5 text-red-600" aria-hidden>*</span>
          <span className="sr-only"> (obligatorio)</span>
        </>
      )}
    </FbLabel>
  )
}

export function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <FbTextInput sizing="md" {...props} className={className} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <FbTextarea rows={3} {...props} />
}

export function SelectInput({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <FbSelect {...props}>
      <option value="">— Seleccionar —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </FbSelect>
  )
}

/** Money input: shows thousands separators while typing, stores plain number string. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  id,
  required,
  describedBy,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  required?: boolean
  describedBy?: string
  invalid?: boolean
}) {
  const display = value === '' ? '' : new Intl.NumberFormat('es-PY').format(Number(value))
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm font-medium text-gray-500">₲</span>
      <FbTextInput
        id={id}
        aria-required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="pl-8 text-right font-medium tabular-nums"
        sizing="md"
        inputMode="numeric"
        placeholder={placeholder ?? '0'}
        value={display}
        onChange={e => {
          const raw = e.target.value.replace(/[^\d-]/g, '')
          onChange(raw)
        }}
      />
    </div>
  )
}

export interface FkOption { value: string; label: string; sub?: string; disabled?: boolean }

/** Searchable dropdown for foreign keys (loads options provided by parent). */
export function FkSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  id,
  labelledBy,
  required,
  describedBy,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  options: FkOption[]
  placeholder?: string
  id?: string
  labelledBy?: string
  required?: boolean
  describedBy?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = options.find(o => String(o.value) === String(value ?? ''))
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options.slice(0, 400)
    return options.filter(o => (o.label + ' ' + (o.sub ?? '')).toLowerCase().includes(t)).slice(0, 400)
  }, [q, options])

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        onClick={() => setOpen(v => !v)}
        className={controlClass + ' flex items-center justify-between text-left'}
      >
        <span className={selected ? (selected.disabled ? 'text-gray-400' : '') : 'text-gray-400'}>
          {selected ? selected.label : '— Seleccionar —'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {value && (
              <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-400 hover:bg-slate-50">
                — Quitar selección —
              </button>
            )}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                disabled={!!o.disabled}
                onClick={() => {
                  if (o.disabled) return
                  onChange(o.value)
                  setOpen(false)
                  setQ('')
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  o.disabled
                    ? 'cursor-not-allowed text-slate-300'
                    : o.value === value
                      ? 'bg-brand-50 font-medium text-brand-700 hover:bg-brand-50'
                      : 'text-slate-700 hover:bg-brand-50'
                }`}
              >
                {o.label}
                {o.sub && <span className={`block text-xs ${o.disabled ? 'text-slate-300' : 'text-slate-400'}`}>{o.sub}</span>}
                {o.disabled && <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-300">Sin saldo</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Selector de archivo con vista del adjunto actual (ruta en storage). */
export function FileInput({ value, onChange, accept, bucket }: {
  value: string | File | null
  onChange: (v: string | File | null) => void
  accept?: string
  bucket: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingFile = value instanceof File ? value : null
  const existingPath = typeof value === 'string' && value.trim() ? value.trim() : null

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    onChange(file ?? (existingPath || null))
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      {pendingFile && (
        <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2 text-sm">
          <span className="truncate font-medium text-brand-800">{pendingFile.name}</span>
          <button type="button" onClick={() => onChange(existingPath)} className="ml-2 text-slate-400 hover:text-rose-500" title="Quitar selección">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {existingPath && !pendingFile && bucket && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-700">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            {storageFileLabel(existingPath, bucket)}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <ArchivoAdjuntoLink path={existingPath} bucket={bucket} />
            <button type="button" onClick={() => onChange(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Quitar adjunto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600 hover:border-brand-400 hover:bg-brand-50/30">
        <Upload className="h-4 w-4" />
        {existingPath || pendingFile ? 'Reemplazar archivo' : 'Seleccionar archivo'}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handlePick} />
    </div>
  )
}

export type JsonTextItem = { id: string; text: string; completed: boolean }

function newItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* insecure context */ }
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Normaliza jsonb/string/array al formato [{ id, text, completed }]. */
export function parseJsonTextList(raw: unknown): JsonTextItem[] {
  let value = raw
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    try { value = JSON.parse(s) } catch { return [{ id: newItemId(), text: s, completed: false }] }
  }
  if (!Array.isArray(value)) {
    if (value && typeof value === 'object' && 'text' in (value as object)) {
      const o = value as Record<string, unknown>
      return [{
        id: String(o.id ?? newItemId()),
        text: String(o.text ?? ''),
        completed: Boolean(o.completed),
      }]
    }
    return []
  }
  return value.map((item, i) => {
    if (typeof item === 'string') return { id: `legacy-${i}`, text: item, completed: false }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      return {
        id: String(o.id ?? `item-${i}`),
        text: String(o.text ?? o.nombre ?? o.label ?? ''),
        completed: Boolean(o.completed),
      }
    }
    return { id: `item-${i}`, text: String(item ?? ''), completed: false }
  })
}

export function jsonTextListTexts(raw: unknown): string[] {
  return parseJsonTextList(raw).map(i => i.text.trim()).filter(Boolean)
}

/** Editor de lista de ítems JSON con campo `text` (y completed). */
export function JsonTextListInput({ value, onChange, placeholder = 'Nueva función…' }: {
  value: JsonTextItem[]
  onChange: (items: JsonTextItem[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    onChange([...value, { id: newItemId(), text, completed: false }])
    setDraft('')
  }

  const updateText = (id: string, text: string) => {
    onChange(value.map(item => item.id === id ? { ...item, text } : item))
  }

  const remove = (id: string) => {
    onChange(value.filter(item => item.id !== id))
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      {value.length === 0 && (
        <p className="text-xs text-slate-400">Sin funciones. Agregue ítems a la lista.</p>
      )}
      <ul className="space-y-1.5">
        {value.map((item, idx) => (
          <li key={item.id} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{idx + 1}.</span>
            <input
              className={controlClass}
              value={item.text}
              onChange={e => updateText(item.id, e.target.value)}
              placeholder="Texto de la función"
            />
            <button
              type="button"
              title="Quitar"
              onClick={() => remove(item.id)}
              className="mt-1 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <input
          className={controlClass}
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          Agregar
        </button>
      </div>
    </div>
  )
}
