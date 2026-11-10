import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, Search, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, FileSpreadsheet, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { fmtMoney, toDateInputValue, toDatetimeLocalValue, fromDatetimeLocalValue } from '../lib/format'
import { supabase } from '../lib/supabase'
import { supabaseFetchAll } from '../lib/supabaseFetchAll'
import { Modal, ConfirmDialog, DeleteBlockedDialog, Spinner, EmptyState, LoadErrorState } from './ui'
import { readSearchInt, readSearchString, usePatchSearchParams } from '../lib/urlState'
import { StudioPageShell, StudioTableCard } from './studio'
import { Label, TextInput, TextArea, SelectInput, MoneyInput, FkSelect, FileInput, JsonTextListInput, parseJsonTextList, type FkOption, type JsonTextItem } from './fields'
import RichTextEditor from './RichTextEditor'
import { isEmptyRichText, toRichTextValue } from '../lib/richText'
import { uploadStorageFile } from '../lib/storage'
import { exportRowsToExcel } from '../lib/exportTableExcel'
import { lookupTurucContribuyente } from '../lib/turuc'
import {
  deleteConfirmMessage,
  findDeleteVinculos,
  friendlyDeleteError,
  safeDeleteById,
  type DeleteVinculo,
} from '../lib/deleteGuard'

export interface FieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'richtext' | 'number' | 'money' | 'date' | 'datetime' | 'time' | 'select' | 'fk' | 'boolean' | 'file' | 'json_text_list'
  required?: boolean
  options?: { value: string; label: string }[]
  fk?: {
    table: string
    select: string
    label: (r: any) => string
    sub?: (r: any) => string
    orderBy?: string
    orderAscending?: boolean
    /** Tope de filas. Con `fetchAll` pagina hasta este máximo. */
    limit?: number
    fetchAll?: boolean
    filter?: (q: any) => any
    /** Recarga opciones cuando cambia este campo del formulario. */
    dependsOn?: string
    /** Filtro dinámico según valores actuales del formulario. */
    filterFromValues?: (q: any, values: Record<string, any>) => any
    /**
     * Tras cargar filas, transforma las opciones (p. ej. deshabilitar sin saldo).
     * `meta.recordId` es el id del registro en edición (si aplica).
     */
    enrichOptions?: (
      options: import('./fields').FkOption[],
      rows: any[],
      values: Record<string, any>,
      meta?: { recordId?: string },
    ) => import('./fields').FkOption[] | Promise<import('./fields').FkOption[]>
  }
  /** Bucket de Storage (solo type: file). */
  storageBucket?: string
  /** Prefijo de carpeta dentro del bucket (solo type: file). */
  storagePathPrefix?: string
  /** Al subir, guarda el nombre original del File en este campo de la fila. */
  storageFileNameField?: string
  /** Al subir, guarda MIME o extensión en este campo de la fila. */
  storageFileTypeField?: string
  accept?: string
  colSpan2?: boolean
  defaultValue?: any
  placeholder?: string
  /** Campo visible pero no editable (p. ej. numeración automática). */
  readOnly?: boolean
  /**
   * Busca RUC en TuRUC (turuc.com.py) y completa campos del formulario.
   * Solo aplica a type: text (típicamente el campo documento/ruc).
   */
  turucLookup?: {
    /** Campo donde guardar el RUC completo (ej. 80097255-4). Por defecto este mismo campo. */
    rucField?: string
    /** Campo de razón social a completar. Por defecto `razon_social`. */
    razonSocialField?: string
  }
  /**
   * Al cambiar el valor de este campo, fusiona el objeto devuelto en el formulario
   * (p. ej. calcular fecha_rendicion desde fecha_desembolso).
   * Puede ser async (p. ej. recalcular saldo de una STR).
   */
  derive?: (
    value: any,
    values: Record<string, any>,
    meta?: { isCreate: boolean },
  ) => Record<string, any> | Promise<Record<string, any>>
  /**
   * Con formExtraPlacement "bottom": los campos `end` van después del bloque extra
   * (p. ej. archivo + observaciones al final del formulario).
   */
  formSection?: 'main' | 'end'
  /** Si devuelve false, el campo no se muestra ni se exige. */
  visibleIf?: (values: Record<string, any>) => boolean
  /** Apariencia del editor: `document` para oficios (memo). */
  richTextVariant?: 'default' | 'document'
}

export interface ColDef {
  key: string
  label: string
  render?: (row: any, ctx?: { rows: any[]; allRows?: any[] }) => ReactNode
  /** Valor plano para Excel (si se omite, se usa la clave de la fila). */
  excelValue?: (row: any) => string | number | boolean | null | undefined
  align?: 'right' | 'center'
  /** Clave para ordenar (p. ej. campo anidado). Por defecto usa `key`. */
  sortKey?: string
  /** Comparador custom (p. ej. columnas calculadas). */
  sortFn?: (a: any, b: any, rows: any[]) => number
  /** Dirección al activar la columna por primera vez (default true = ascendente). */
  defaultAsc?: boolean
  /** false deshabilita orden por click en cabecera */
  sortable?: boolean
  /** Clases extra para th/td (ancho, truncate, etc.). */
  className?: string
}

export interface CrudConfig {
  table: string
  title: string
  singular: string
  /** Eyebrow Soft Studio (mayúsculas) encima del título. */
  eyebrow?: string
  subtitle?: string
  select?: string
  orderBy?: { column: string; ascending?: boolean }
  /** Límite máximo de filas al cargar (por defecto 2000; se pagina de a 1000). */
  limit?: number
  /** Modifica el query de listado (p. ej. .gte/.lte por fechas). */
  applyQuery?: (query: any) => any
  /** Clave para recargar desde servidor (p. ej. rango de fechas en applyQuery). */
  queryKey?: string
  /** Paginación en cliente: filas por página (si se omite, muestra todo). */
  pageSize?: number
  /** Tabla más compacta (padding y tipografía reducidos). */
  denseTable?: boolean
  columns: ColDef[]
  fields: FieldDef[]
  /** column injected on every insert with the session user id; null disables */
  userIdField?: string | null
  /** values forced on insert & used to filter the listing (e.g. { proyecto_id }) */
  fixed?: Record<string, any>
  /** filters applied only to the listing (supports embedded-resource paths like "str.proyecto_id") */
  filter?: Record<string, any>
  canDelete?: boolean
  /** Si es false, oculta el botón de alta. Default true. */
  canCreate?: boolean
  /** compact mode for embedding inside tabs */
  embedded?: boolean
  /** extra action rendered per row */
  rowActions?: (row: any, reload: () => void) => ReactNode
  onRowClick?: (row: any) => void
  /** id de fila expandida (accordion / detalle) */
  expandedRowId?: string | null
  /** Contenido bajo la fila al expandir */
  renderRowDetail?: (row: any, ctx: { rows: any[]; reload: () => void }) => ReactNode
  emptyHint?: string
  /** Columnas numéricas con total en pie de tabla (clave del campo en la fila). */
  sumColumns?: string[]
  /** Agregadores personalizados por columna (p. ej. adendas con signo, CDP sin anulados). */
  sumFns?: Partial<Record<string, (rows: any[]) => number>>
  /** Se invoca tras crear, editar o eliminar un registro. */
  onMutated?: () => void
  /** Tras guardar (create/update). En create, `id` es el registro insertado. */
  afterSave?: (ctx: {
    id: string
    values: Record<string, any>
    isCreate: boolean
    existing?: Record<string, any>
  }) => void | Promise<void>
  /**
   * Antes de insert/update: validar o enriquecer valores.
   * Puede devolver un objeto parcial/completo para fusionar al payload.
   * Lanzar Error para abortar el guardado.
   */
  beforeSave?: (ctx: {
    values: Record<string, any>
    isCreate: boolean
    existing?: Record<string, any>
  }) => Record<string, any> | void | Promise<Record<string, any> | void>
  /** Contenido extra en el formulario (p. ej. Comp. ant. calculado / resumen financiero). */
  formExtra?: (ctx: {
    rows: any[]
    initial?: Record<string, any>
    values?: Record<string, any>
    fixed?: Record<string, any>
    /** Si es true, desactiva el botón Guardar/Crear del formulario. */
    setSubmitBlocked?: (blocked: boolean) => void
    patchValues?: (partial: Record<string, any>) => void
  }) => ReactNode
  /** Coloca formExtra a la derecha (requiere modalWide). */
  formExtraPlacement?: 'bottom' | 'side'
  /** Modal de alta/edición más ancho. */
  modalWide?: boolean
  /** Valores iniciales al crear (p. ej. siguiente número CDP). */
  resolveCreateInitial?: () => Promise<Record<string, any>>
  /** Prefilla el alta con una copia de la fila (sin id ni adjuntos). */
  resolveCloneInitial?: (row: any) => Record<string, any> | Promise<Record<string, any>>
  /** Valores forzados solo al insertar (no se muestran en el formulario). */
  insertDefaults?: Record<string, any>
  /** Oculta el botón de descarga Excel del listado. */
  hideExcelExport?: boolean
  /** Acciones extra en la barra del listado (junto a Nuevo). */
  toolbarExtra?: ReactNode | ((ctx: CrudToolbarCtx) => ReactNode)
  /** Filtros extra debajo de la barra de búsqueda. */
  filtersExtra?: ReactNode | ((ctx: CrudToolbarCtx) => ReactNode)
  /** Filtro adicional en cliente (después de cargar, antes de la búsqueda). */
  clientFilter?: (row: any) => boolean
  /** Si está definido, reemplaza el filtro de texto por JSON de toda la fila. */
  searchFn?: (row: any, term: string) => boolean
  /** Placeholder del campo Buscar. */
  searchPlaceholder?: string
  /** Clave para resetear la página al cambiar filtros externos. */
  filterResetKey?: string
  /** Transforma filas tras cargarlas (p. ej. resolver etiquetas de FK). Puede ser async. */
  transformRows?: (rows: any[]) => any[] | Promise<any[]>
}

export type CrudToolbarCtx = {
  rows: any[]
  filteredRows: any[]
  reload: () => void
}

function getPath(row: any, key: string): any {
  return key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), row)
}

/** Evita el crash de React al pintar JSON/objetos anidados en celdas. */
function formatCellValue(value: unknown): ReactNode {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value.map((item, i) => (
      <span key={i}>{formatCellValue(item)}{i < value.length - 1 ? ', ' : ''}</span>
    ))
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const k of ['nombre_completo', 'nombre', 'razon_social', 'descripcion', 'label', 'text', 'codigo', 'email', 'correo']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v
    }
    try {
      return JSON.stringify(value)
    } catch {
      return '—'
    }
  }
  return String(value)
}

function compareSortValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  const da = Date.parse(sa)
  const db = Date.parse(sb)
  if (!Number.isNaN(da) && !Number.isNaN(db) && /^\d{4}-\d{2}/.test(sa)) return da - db
  return sa.localeCompare(sb, 'es', { numeric: true, sensitivity: 'base' })
}

function isColumnSortable(col: ColDef): boolean {
  if (col.sortable === false) return false
  if (col.sortFn) return true
  const key = col.sortKey ?? col.key
  if (key.startsWith('__')) return false
  if (key === 'archivo_url' || key === 'archivo_adjunto') return false
  return true
}

function sortByColumn(rows: any[], col: ColDef, asc: boolean): any[] {
  const dir = asc ? 1 : -1
  if (col.sortFn) return [...rows].sort((a, b) => col.sortFn!(a, b, rows) * dir)
  const key = col.sortKey ?? col.key
  return [...rows].sort((a, b) => compareSortValues(getPath(a, key), getPath(b, key)) * dir)
}

function initialSort(columns: ColDef[], orderBy?: { column: string; ascending?: boolean }): { key: string; asc: boolean } {
  const ob = orderBy ?? { column: 'created_at', ascending: false }
  const col = columns.find(c => c.key === ob.column || (c.sortKey ?? c.key) === ob.column)
  if (col && isColumnSortable(col)) return { key: col.key, asc: ob.ascending ?? false }
  const first = columns.find(isColumnSortable)
  return { key: first?.key ?? columns[0]?.key ?? '', asc: true }
}

function useFkOptions(
  fields: FieldDef[],
  values: Record<string, any>,
  meta?: { recordId?: string },
) {
  const [optionsMap, setOptionsMap] = useState<Record<string, FkOption[]>>({})
  const dependKeys = fields
    .filter(f => f.type === 'fk' && f.fk?.dependsOn)
    .map(f => `${f.name}:${String(values[f.fk!.dependsOn!] ?? '')}`)
    .join('|')
  const visibilityKey = fields
    .filter(f => f.visibleIf)
    .map(f => `${f.name}:${f.visibleIf!(values) ? 1 : 0}`)
    .join('|')
  const recordId = meta?.recordId ?? ''

  useEffect(() => {
    let alive = true
    const fkFields = fields.filter(f => f.type === 'fk' && f.fk)
    Promise.all(fkFields.map(async f => {
      if (f.visibleIf && !f.visibleIf(values)) return [f.name, [] as FkOption[]] as const
      if (f.fk!.dependsOn) {
        const parent = values[f.fk!.dependsOn]
        if (parent === '' || parent == null) return [f.name, [] as FkOption[]] as const
      }
      const orderCol = f.fk!.orderBy ?? 'created_at'
      const ascending = f.fk!.orderAscending ?? true
      const limit = f.fk!.limit ?? 1000
      const applyFilters = (q: any) => {
        if (f.fk!.filterFromValues) return f.fk!.filterFromValues(q, values)
        if (f.fk!.filter) return f.fk!.filter(q)
        return q
      }
      const fetchRows = async (order: string | null) => {
        if (f.fk!.fetchAll) {
          return supabaseFetchAll(
            () => {
              let q = supabase.from(f.fk!.table).select(f.fk!.select)
              if (order) q = q.order(order, { ascending })
              return applyFilters(q)
            },
            limit,
          )
        }
        let q = supabase.from(f.fk!.table).select(f.fk!.select)
        if (order) q = q.order(order, { ascending })
        q = applyFilters(q).limit(limit)
        return q
      }
      let { data, error } = await fetchRows(orderCol)
      if (error) {
        const retry = await fetchRows(null)
        if (retry.error) console.error(`[fk ${f.name}]`, retry.error.message)
        else console.warn(`[fk ${f.name}]`, error.message, '— reintento sin orden')
        data = retry.data
      }
      const rows: any[] = data ?? []
      let options: FkOption[] = rows.map((r: any) => ({
        value: String(r.id),
        label: f.fk!.label(r),
        sub: f.fk!.sub?.(r),
      }))
      if (f.fk!.enrichOptions) {
        options = await f.fk!.enrichOptions(options, rows, values, { recordId: recordId || undefined })
      }
      const current = String(values[f.name] ?? '').trim()
      if (current && !options.some(o => String(o.value) === current)) {
        options = [
          { value: current, label: f.fk!.label({ id: current, numero: values.rc_str_numero }) },
          ...options,
        ]
      }
      return [f.name, options] as const
    })).then(entries => { if (alive) setOptionsMap(Object.fromEntries(entries)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependKeys, visibilityKey, recordId])
  return optionsMap
}

function fileFieldValue(v: unknown): string | File | null {
  if (v instanceof File) return v
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['path', 'url', 'archivo', 'archivo_adjunto', 'archivo_url']) {
      const s = o[k]
      if (typeof s === 'string' && s.trim()) return s.trim()
    }
  }
  return null
}

export function RecordForm({ fields, initial, onSubmit, onCancel, submitLabel = 'Guardar', formExtra, formExtraPlacement = 'bottom', fixed }: {
  fields: FieldDef[]
  initial?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  formExtra?: ReactNode | ((
    values: Record<string, any>,
    helpers: {
      setSubmitBlocked: (blocked: boolean) => void
      patchValues: (partial: Record<string, any>) => void
    },
  ) => ReactNode)
  formExtraPlacement?: 'bottom' | 'side'
  /** Valores fijos del módulo (p. ej. proyecto_id embebido). */
  fixed?: Record<string, any>
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {}
    for (const f of fields) {
      // En edición no usar defaultValue: evita pisar null/undefined reales al abrir el modal.
      const hasInitial = !!initial && Object.prototype.hasOwnProperty.call(initial, f.name)
      const raw = hasInitial
        ? initial![f.name]
        : (f.defaultValue ?? (f.type === 'boolean' ? false : f.type === 'file' ? null : ''))
      if (f.type === 'file') v[f.name] = fileFieldValue(raw)
      else if (f.type === 'select' && (typeof raw === 'number' || typeof raw === 'boolean')) v[f.name] = String(raw)
      else if (f.type === 'fk') v[f.name] = raw == null || raw === '' ? '' : String(raw)
      else if (f.type === 'date') v[f.name] = raw ? toDateInputValue(String(raw)) : ''
      else if (f.type === 'datetime') v[f.name] = raw ? toDatetimeLocalValue(String(raw)) : ''
      else if (f.type === 'json_text_list') v[f.name] = parseJsonTextList(raw)
      else if (f.type === 'richtext') v[f.name] = toRichTextValue(raw == null ? '' : String(raw))
      else v[f.name] = raw == null ? '' : raw
    }
    return v
  })
  const [saving, setSaving] = useState(false)
  const [submitBlocked, setSubmitBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<string | null>(null)
  const [turucLoading, setTurucLoading] = useState<string | null>(null)
  const [turucHint, setTurucHint] = useState<string | null>(null)
  const effectiveValues = useMemo(() => ({ ...(fixed ?? {}), ...values }), [fixed, values])
  const optionsMap = useFkOptions(
    fields,
    effectiveValues,
    { recordId: initial?.id ? String(initial.id) : undefined },
  )

  useEffect(() => {
    setSubmitBlocked(false)
  }, [initial?.id])

  const set = (name: string, v: any) => {
    const field = fields.find(f => f.name === name)
    setValues(prev => {
      let next = { ...prev, [name]: v }
      for (const f of fields) {
        if (f.type === 'fk' && f.fk?.dependsOn === name) next[f.name] = ''
      }
      if (!field?.derive) return next
      const derived = field.derive(v, next, { isCreate: !initial?.id })
      if (derived && typeof (derived as Promise<Record<string, any>>).then === 'function') {
        // Attach here (not after setState): React may defer the updater, which
        // would drop a promise captured only in this closure.
        void (derived as Promise<Record<string, any>>)
          .then(patch => {
            if (!patch || typeof patch !== 'object') return
            setValues(p => ({ ...p, ...patch }))
          })
          .catch(() => { /* ignore derive errors */ })
        return next
      }
      return { ...next, ...(derived as Record<string, any>) }
    })
  }

  const runTurucLookup = async (f: FieldDef) => {
    if (!f.turucLookup) return
    const rucField = f.turucLookup.rucField ?? f.name
    const razonField = f.turucLookup.razonSocialField ?? 'razon_social'
    setTurucHint(null)
    setError(null)
    setTurucLoading(f.name)
    const result = await lookupTurucContribuyente(String(values[f.name] ?? ''))
    setTurucLoading(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    const { data } = result
    setValues(prev => ({
      ...prev,
      [rucField]: data.ruc || String(data.doc),
      [razonField]: data.razonSocial || prev[razonField] || '',
    }))
    const estado = (data.estado || '').trim()
    setTurucHint(
      estado && estado.toUpperCase() !== 'ACTIVO'
        ? `Encontrado · Estado: ${estado}`
        : `Encontrado · ${data.razonSocial}`,
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInvalidField(null)
    if (submitBlocked) {
      setError('No se puede guardar: el monto debe ser mayor a cero y el saldo de la resolución no puede ser negativo.')
      return
    }
    for (const f of fields) {
      if (f.visibleIf && !f.visibleIf(effectiveValues)) continue
      if (f.required && f.type !== 'file') {
        const val = values[f.name]
        if (f.type === 'json_text_list') {
          const items = (val as JsonTextItem[] | undefined) ?? []
          if (!items.some(i => i.text.trim())) {
            setInvalidField(f.name)
            setError(`El campo "${f.label}" es obligatorio.`)
            return
          }
        } else if (f.type === 'richtext') {
          if (isEmptyRichText(val)) {
            setInvalidField(f.name)
            setError(`El campo "${f.label}" es obligatorio.`)
            return
          }
        } else if (val === '' || val == null) {
          setInvalidField(f.name)
          setError(`El campo "${f.label}" es obligatorio.`)
          return
        }
      }
    }
    setSaving(true)
    const out: Record<string, any> = {}
    try {
      for (const f of fields) {
        if (f.visibleIf && !f.visibleIf(effectiveValues)) continue
        let v = values[f.name]
        if (f.type === 'file') {
          if (v instanceof File) {
            if (!f.storageBucket) throw new Error(`Campo "${f.label}": falta configurar storageBucket.`)
            const original = v
            const prefix = (initial?.id && f.storagePathPrefix === 'actas')
              ? `actas/${initial.id}`
              : (f.storagePathPrefix ?? 'uploads')
            v = await uploadStorageFile(f.storageBucket, prefix, original)
            if (f.storageFileNameField) {
              out[f.storageFileNameField] = original.name || 'archivo'
            }
            if (f.storageFileTypeField) {
              const mime = (original.type || '').trim()
              const ext = original.name.includes('.')
                ? original.name.split('.').pop()?.toLowerCase() ?? ''
                : ''
              out[f.storageFileTypeField] = mime || ext || 'application/octet-stream'
            }
          } else if (v === '' || v === undefined) {
            v = null
          } else if (typeof v === 'string') {
            v = v.trim() || null
          }
          out[f.name] = v
          continue
        }
        if (v === '') v = null
        if (f.type === 'datetime' && v) v = fromDatetimeLocalValue(String(v))
        if (f.type === 'date' && v) v = toDateInputValue(String(v)) || v
        if ((f.type === 'number' || f.type === 'money') && v != null) v = Number(v)
        if (f.type === 'select' && v != null && v !== '') {
          if (f.options?.length && f.options.every(o => o.value === 'true' || o.value === 'false')) v = v === 'true'
          else if (f.options?.every(o => !Number.isNaN(Number(o.value)))) v = Number(v)
        }
        if (f.type === 'json_text_list') {
          const items = (Array.isArray(v) ? v as JsonTextItem[] : parseJsonTextList(v))
            .map(item => ({
              id: item.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : String(Date.now())),
              text: (item.text ?? '').trim(),
              completed: Boolean(item.completed),
            }))
            .filter(item => item.text !== '')
          v = items
        }
        out[f.name] = v
      }
      await onSubmit(out)
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  const extra = typeof formExtra === 'function'
    ? formExtra(effectiveValues, {
      setSubmitBlocked,
      patchValues: partial => setValues(prev => ({ ...prev, ...partial })),
    })
    : formExtra
  const mainFields = fields.filter(f => f.formSection !== 'end' && (!f.visibleIf || f.visibleIf(effectiveValues)))
  const endFields = fields.filter(f => f.formSection === 'end' && (!f.visibleIf || f.visibleIf(effectiveValues)))

  const errorId = 'record-form-error'
  const renderField = (f: FieldDef) => {
    const fieldId = `field-${f.name}`
    const invalid = invalidField === f.name
    const describedBy = error && invalid ? errorId : undefined
    const a11y = {
      id: fieldId,
      required: Boolean(f.required),
      'aria-required': f.required || undefined,
      'aria-invalid': invalid || undefined,
      'aria-describedby': describedBy,
    }
    return (
    <div key={f.name} className={f.colSpan2 || f.type === 'textarea' || f.type === 'richtext' || f.type === 'json_text_list' ? 'sm:col-span-2' : ''}>
      <Label text={f.label} required={f.required} htmlFor={fieldId} />
      {f.type === 'text' && !f.turucLookup && (
        <TextInput
          {...a11y}
          value={values[f.name] ?? ''}
          placeholder={f.placeholder}
          readOnly={Boolean(f.readOnly)}
          onChange={e => { if (!f.readOnly) set(f.name, e.target.value) }}
        />
      )}
      {f.type === 'text' && f.turucLookup && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <TextInput
              {...a11y}
              value={values[f.name] ?? ''}
              placeholder={f.placeholder ?? 'Ej. 80097255'}
              onChange={e => { setTurucHint(null); set(f.name, e.target.value) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runTurucLookup(f)
                }
              }}
            />
            <button
              type="button"
              disabled={turucLoading === f.name}
              onClick={() => void runTurucLookup(f)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
              title="Buscar razón social en el padrón TuRUC"
              aria-label="Buscar RUC en TuRUC"
            >
              <Search className="h-4 w-4" />
              {turucLoading === f.name ? 'Buscando…' : 'Buscar RUC'}
            </button>
          </div>
          {turucHint && (
            <p className="text-xs text-emerald-800">{turucHint}</p>
          )}
        </div>
      )}
      {f.type === 'textarea' && <TextArea {...a11y} value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'richtext' && (
        <RichTextEditor
          value={values[f.name] ?? ''}
          onChange={html => set(f.name, html)}
          placeholder={f.placeholder}
          variant={f.richTextVariant ?? 'default'}
          minHeightClass="min-h-[220px] rich-text-editor--tall"
        />
      )}
      {f.type === 'json_text_list' && (
        <JsonTextListInput
          value={(values[f.name] as JsonTextItem[]) ?? []}
          onChange={items => set(f.name, items)}
          placeholder={f.placeholder ?? 'Nueva función…'}
        />
      )}
      {f.type === 'number' && <TextInput type="number" {...a11y} value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'money' && (
        <MoneyInput
          id={fieldId}
          required={f.required}
          describedBy={describedBy}
          invalid={invalid}
          value={String(values[f.name] ?? '')}
          onChange={v => set(f.name, v)}
        />
      )}
      {f.type === 'date' && <TextInput type="date" {...a11y} value={values[f.name] ?? ''} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'datetime' && <TextInput type="datetime-local" {...a11y} value={values[f.name] ?? ''} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'time' && <TextInput type="time" {...a11y} value={values[f.name] ?? ''} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'select' && <SelectInput {...a11y} value={values[f.name] ?? ''} options={f.options ?? []} onChange={e => set(f.name, e.target.value)} />}
      {f.type === 'fk' && (
        <FkSelect
          id={fieldId}
          labelledBy={undefined}
          required={f.required}
          describedBy={describedBy}
          invalid={invalid}
          value={values[f.name] ?? ''}
          onChange={v => set(f.name, v)}
          options={optionsMap[f.name] ?? []}
        />
      )}
      {f.type === 'file' && f.storageBucket && (
        <FileInput
          value={fileFieldValue(values[f.name])}
          onChange={v => set(f.name, v)}
          bucket={f.storageBucket}
          accept={f.accept ?? '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'}
        />
      )}
      {f.type === 'boolean' && (
        <label htmlFor={fieldId} className="flex h-[38px] cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            id={fieldId}
            type="checkbox"
            checked={!!values[f.name]}
            onChange={e => set(f.name, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Sí
        </label>
      )}
    </div>
    )
  }

  const fieldsGrid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {mainFields.map(renderField)}
      {extra && formExtraPlacement !== 'side' && <div className="sm:col-span-2">{extra}</div>}
      {endFields.map(renderField)}
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      {formExtraPlacement === 'side' && extra ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">{fieldsGrid}</div>
          <div className="lg:col-span-2 lg:sticky lg:top-0 lg:self-start">{extra}</div>
        </div>
      ) : fieldsGrid}
      {error && <p id={errorId} role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving || submitBlocked}
          aria-disabled={saving || submitBlocked}
          title={submitBlocked ? 'No se puede guardar: el monto debe ser mayor a cero y el saldo de la resolución no puede ser negativo' : undefined}
          className="gradient-primary rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
      {submitBlocked && (
        <p className="mt-2 text-right text-xs text-slate-600">
          Guardar está deshabilitado: el monto debe ser mayor a cero y el saldo de la resolución no puede ser negativo.
        </p>
      )}
    </form>
  )
}

export default function CrudModule(cfg: CrudConfig) {
  const syncUrl = !cfg.embedded
  const { searchParams, patch } = usePatchSearchParams()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState(() => syncUrl ? readSearchString(searchParams, 'q') : '')
  const [sort, setSort] = useState(() => {
    const base = initialSort(cfg.columns, cfg.orderBy)
    if (!syncUrl) return base
    const key = readSearchString(searchParams, 'sort', base.key)
    const dir = readSearchString(searchParams, 'dir', base.asc ? 'asc' : 'desc')
    return { key, asc: dir !== 'desc' }
  })
  const [editing, setEditing] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [createInitial, setCreateInitial] = useState<Record<string, any> | null | undefined>(undefined)
  const [cloning, setCloning] = useState(false)
  const cloneSourceRef = useRef<any>(null)
  const [deleting, setDeleting] = useState<any | null>(null)
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null)
  const [blockedDelete, setBlockedDelete] = useState<{ row: any; vinculos: DeleteVinculo[] } | null>(null)
  const [page, setPage] = useState(() => syncUrl ? readSearchInt(searchParams, 'page', 1) : 1)

  useEffect(() => {
    setSort(initialSort(cfg.columns, cfg.orderBy))
  }, [cfg.orderBy?.column, cfg.orderBy?.ascending])

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const ob = cfg.orderBy ?? { column: 'created_at', ascending: false }
      const maxRows = cfg.limit ?? 2000
      const build = () => {
        let query = supabase.from(cfg.table).select(cfg.select ?? '*', { count: 'exact' })
        if (cfg.fixed) for (const [k, v] of Object.entries(cfg.fixed)) query = query.eq(k, v)
        if (cfg.filter) for (const [k, v] of Object.entries(cfg.filter)) query = query.eq(k, v)
        if (cfg.applyQuery) query = cfg.applyQuery(query)
        query = query.order(ob.column, { ascending: ob.ascending ?? false, nullsFirst: false })
        // Desempate estable para no perder filas con la misma fecha
        if (ob.column !== 'id') query = query.order('id', { ascending: true })
        return query
      }
      const { data, error } = await supabaseFetchAll(build, maxRows)
      if (error) {
        console.error(`[${cfg.table}]`, error.message)
        setLoadError(error.message)
        setRows([])
        return
      }
      const raw = data ?? []
      setRows(cfg.transformRows ? await cfg.transformRows(raw) : raw)
    } catch (e: any) {
      console.error(`[${cfg.table}]`, e)
      setLoadError(e?.message ?? 'Error inesperado al cargar')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cfg.fixed ?? {}), JSON.stringify(cfg.filter ?? {}), cfg.queryKey])

  useEffect(() => {
    if (!creating) {
      setCreateInitial(undefined)
      cloneSourceRef.current = null
      setCloning(false)
      return
    }
    let alive = true
    setCreateInitial(null)
    const source = cloneSourceRef.current
    const run = async () => {
      if (source && cfg.resolveCloneInitial) return cfg.resolveCloneInitial(source)
      if (cfg.resolveCreateInitial) return cfg.resolveCreateInitial()
      return {}
    }
    run()
      .then(values => { if (alive) setCreateInitial(values ?? {}) })
      .catch(() => { if (alive) setCreateInitial({}) })
    return () => { alive = false }
  }, [creating, cfg.resolveCreateInitial, cfg.resolveCloneInitial])

  const filtered = useMemo(() => {
    let base = cfg.clientFilter ? rows.filter(cfg.clientFilter) : rows
    const t = q.trim().toLowerCase()
    if (!t) return base
    if (cfg.searchFn) return base.filter(r => cfg.searchFn!(r, t))
    return base.filter(r => JSON.stringify(r).toLowerCase().includes(t))
  }, [rows, q, cfg.clientFilter, cfg.searchFn])

  const sortedFiltered = useMemo(() => {
    const col = cfg.columns.find(c => c.key === sort.key)
    if (!col || !isColumnSortable(col)) return filtered
    return sortByColumn(filtered, col, sort.asc)
  }, [filtered, sort, cfg.columns])

  const pageSize = cfg.pageSize && cfg.pageSize > 0 ? cfg.pageSize : 25
  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedFiltered.length / pageSize)) : 1
  const safePage = Math.min(page, totalPages)
  const hasActiveSearch = q.trim().length > 0

  useEffect(() => { setPage(1) }, [q, pageSize, cfg.filterResetKey, JSON.stringify(cfg.fixed ?? {}), JSON.stringify(cfg.filter ?? {})])

  useEffect(() => {
    if (!syncUrl) return
    patch({
      q: q.trim() || null,
      page: safePage > 1 ? safePage : null,
      sort: sort.key || null,
      dir: sort.asc ? null : 'desc',
    })
  }, [syncUrl, q, safePage, sort.key, sort.asc, patch])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageRows = useMemo(() => {
    if (!pageSize) return sortedFiltered
    const start = (safePage - 1) * pageSize
    return sortedFiltered.slice(start, start + pageSize)
  }, [sortedFiltered, pageSize, safePage])

  const toolbarCtx: CrudToolbarCtx = {
    rows,
    filteredRows: sortedFiltered,
    reload: load,
  }

  const toggleSort = (col: ColDef) => {
    if (!isColumnSortable(col)) return
    setSort(prev => (
      prev.key === col.key
        ? { key: col.key, asc: !prev.asc }
        : { key: col.key, asc: col.defaultAsc ?? true }
    ))
  }

  const columnSums = useMemo(() => {
    if (!cfg.sumColumns?.length) return null
    const sums: Record<string, number> = {}
    for (const key of cfg.sumColumns) {
      sums[key] = cfg.sumFns?.[key]
        ? cfg.sumFns[key]!(filtered)
        : filtered.reduce((s, r) => s + (Number(getPath(r, key)) || 0), 0)
    }
    return sums
  }, [filtered, cfg.sumColumns, cfg.sumFns])

  const save = async (values: Record<string, any>, existing?: any) => {
    const patched = await cfg.beforeSave?.({
      values,
      isCreate: !existing,
      existing: existing ?? undefined,
    })
    const finalValues = { ...(patched ? { ...values, ...patched } : values) }
    for (const k of Object.keys(finalValues)) {
      if (finalValues[k] === undefined) delete finalValues[k]
    }

    if (existing) {
      const { error } = await supabase.from(cfg.table).update(finalValues).eq('id', existing.id)
      if (error && cfg.table === 'memos' && /memos_numero_uq|duplicate key value/i.test(error.message ?? '')) {
        throw new Error('Ese N° de memo ya existe. Elija otro (formato 001/2026).')
      }
      if (error && cfg.table === 'convenios' && /adenda_numero|fecha_adenda|adenda_archivo_firmado/i.test(error.message ?? '')) {
        throw new Error('Faltan las columnas de adenda en convenios. Ejecute la migración 046_convenios_adenda.sql en Supabase.')
      }
      if (error) throw error
      await cfg.afterSave?.({ id: String(existing.id), values: finalValues, isCreate: false, existing })
      setEditing(null)
    } else {
      const payload = { ...(cfg.insertDefaults ?? {}), ...finalValues, ...(cfg.fixed ?? {}) }
      const uidField = cfg.userIdField === undefined ? 'user_id' : cfg.userIdField
      if (uidField) {
        const { data } = await supabase.auth.getUser()
        if (data.user) payload[uidField] = data.user.id
      }
      let insertedId: string | null = null
      let { data: inserted, error } = await supabase.from(cfg.table).insert(payload).select('id').maybeSingle()
      // adendas_estado_check: reintentar con valores permitidos conocidos
      if (error && cfg.table === 'adendas' && /adendas_estado_check/i.test(error.message)) {
        const candidates = ['pendiente', 'aprobada', 'activo', 'Aprobada', 'Pendiente', 'borrador', 'vigente']
        for (const estado of candidates) {
          if (payload.estado === estado) continue
          const retry = await supabase.from(cfg.table).insert({ ...payload, estado }).select('id').maybeSingle()
          if (!retry.error) {
            error = null
            inserted = retry.data
            break
          }
          error = retry.error
          if (!/adendas_estado_check/i.test(retry.error.message)) break
        }
      }
      if (error && cfg.table === 'memos' && /memos_numero_uq|duplicate key value/i.test(error.message ?? '')) {
        throw new Error('Ese N° de memo ya existe. Elija otro (formato 001/2026).')
      }
      if (error && cfg.table === 'convenios' && /adenda_numero|fecha_adenda|adenda_archivo_firmado/i.test(error.message ?? '')) {
        throw new Error('Faltan las columnas de adenda en convenios. Ejecute la migración 046_convenios_adenda.sql en Supabase.')
      }
      if (error) throw error
      insertedId = inserted?.id ? String(inserted.id) : null
      if (insertedId) {
        await cfg.afterSave?.({ id: insertedId, values: finalValues, isCreate: true })
      }
      setCreating(false)
    }
    await load()
    cfg.onMutated?.()
  }

  const rowDeleteLabel = (row: any): string => {
    for (const key of ['descripcion', 'nombre', 'numero', 'numero_expediente', 'numero_formulario', 'razon_social', 'codigo', 'title', 'asunto']) {
      const v = row?.[key]
      if (v != null && String(v).trim()) return String(v).trim().slice(0, 120)
    }
    for (const c of cfg.columns) {
      if (c.key.includes('.')) continue
      const v = row?.[c.key]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120)
    }
    return ''
  }

  const tryDelete = async (row: any) => {
    const id = String(row?.id ?? '')
    if (!id) return
    setCheckingDeleteId(id)
    try {
      const vinculos = await findDeleteVinculos(cfg.table, id)
      if (vinculos.length > 0) {
        setBlockedDelete({ row, vinculos })
        return
      }
      setDeleting(row)
    } finally {
      setCheckingDeleteId(null)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById(cfg.table, String(deleting.id))
      setDeleting(null)
      await load()
      cfg.onMutated?.()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar el registro.')
      setDeleting(null)
    }
  }

  const dense = !!cfg.denseTable
  const cellPad = dense ? 'px-2 py-1.5' : 'px-4 py-2.5'
  const headPad = dense ? 'px-2 py-2' : 'px-4 py-2.5'
  const toolbarExtraNode = typeof cfg.toolbarExtra === 'function'
    ? cfg.toolbarExtra(toolbarCtx)
    : cfg.toolbarExtra
  const filtersExtraNode = typeof cfg.filtersExtra === 'function'
    ? cfg.filtersExtra(toolbarCtx)
    : cfg.filtersExtra

  const tableToolbar = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <label htmlFor={`crud-search-${cfg.table}`} className="sr-only">Buscar en {cfg.title}</label>
        <input
          id={`crud-search-${cfg.table}`}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={cfg.searchPlaceholder ?? `Buscar en ${cfg.title.toLowerCase()}…`}
          className="w-72 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-ink outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600" aria-live="polite">
          {loading
            ? 'Cargando…'
            : `${sortedFiltered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sortedFiltered.length)} de ${sortedFiltered.length}`}
        </span>
        <button type="button" onClick={load} title="Actualizar" aria-label="Actualizar listado" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
        {!cfg.hideExcelExport && (
          <button
            type="button"
            title={sortedFiltered.length === 0 ? 'No hay filas para exportar' : 'Descargar listado en Excel'}
            aria-label={sortedFiltered.length === 0 ? 'Excel deshabilitado: no hay filas para exportar' : 'Descargar listado en Excel'}
            disabled={sortedFiltered.length === 0}
            onClick={() => exportRowsToExcel(sortedFiltered, cfg.columns, {
              sheetName: cfg.singular,
              filename: cfg.title,
            })}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        )}
        {toolbarExtraNode}
        {cfg.canCreate !== false && (
          <button
            type="button"
            onClick={() => {
              cloneSourceRef.current = null
              setCloning(false)
              setCreating(true)
            }}
            className="gradient-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Nuevo {cfg.singular.toLowerCase()}
          </button>
        )}
      </div>
    </>
  )

  const tableFooter = pageSize > 0 && totalPages > 1 ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-600" aria-live="polite">
        Página <span className="font-semibold text-ink">{safePage}</span> de{' '}
        <span className="font-semibold text-ink">{totalPages}</span>
        <span className="sr-only">. Página actual {safePage}.</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
            acc.push(p)
            return acc
          }, [])
          .map((p, idx) =>
            p === '…' ? (
              <span key={`e-${idx}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-label={`Ir a la página ${p}`}
                aria-current={p === safePage ? 'page' : undefined}
                className={`min-w-[1.75rem] rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  p === safePage
                    ? 'gradient-primary'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ),
          )}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  ) : undefined

  const table = (
    <StudioTableCard
      toolbar={tableToolbar}
      filters={filtersExtraNode ?? undefined}
      footer={tableFooter}
    >
      {loading ? <Spinner /> : loadError ? (
        <LoadErrorState detail={loadError} onRetry={load} />
      ) : sortedFiltered.length === 0 ? (
        <EmptyState
          title={hasActiveSearch ? 'Sin coincidencias' : `Todavía no hay ${cfg.title.toLowerCase()}`}
          hint={
            hasActiveSearch
              ? 'Ningún registro coincide con la búsqueda o los filtros actuales.'
              : (cfg.emptyHint ?? `Cree el primer registro con el botón "${cfg.singular}".`)
          }
          action={hasActiveSearch ? (
            <button
              type="button"
              onClick={() => setQ('')}
              className="mt-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              Limpiar búsqueda
            </button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className={`data-table w-full min-w-[40rem] ${dense ? 'data-table--dense' : ''}`}>
            <thead>
              <tr className="border-b border-slate-100 bg-table-head text-left text-slate-600">
                {cfg.columns.map(c => {
                  const sortable = isColumnSortable(c)
                  const active = sort.key === c.key
                  const SortIcon = active ? (sort.asc ? ArrowUp : ArrowDown) : ArrowUpDown
                  const align = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                  return (
                    <th key={c.key} className={`${headPad} ${align} ${c.className ?? ''}`}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c)}
                          aria-label={`Ordenar por ${c.label}${active ? (sort.asc ? ', ascendente' : ', descendente') : ''}`}
                          className={`inline-flex w-full items-center gap-0.5 font-medium transition-colors hover:text-studio-violet ${active ? 'text-studio-violet' : ''} ${c.align === 'right' ? 'justify-end' : c.align === 'center' ? 'justify-center' : 'justify-start'}`}
                        >
                          <span className={dense ? 'leading-tight' : ''}>{c.label}</span>
                          <SortIcon className={`h-3 w-3 shrink-0 ${active ? 'text-studio-violet' : 'text-slate-400'}`} />
                        </button>
                      ) : (
                        <span className={dense ? 'leading-tight' : ''}>{c.label}</span>
                      )}
                    </th>
                  )
                })}
                <th className={`${headPad} ${cfg.rowActions || cfg.resolveCloneInitial ? 'min-w-[12rem] w-[12rem]' : 'w-20'} sticky right-0 z-[1] bg-table-head`}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => {
                const expanded = String(cfg.expandedRowId ?? '') === String(row.id)
                const colSpan = cfg.columns.length + 1
                return (
                <Fragment key={row.id}>
                <tr
                  onClick={cfg.onRowClick ? () => cfg.onRowClick!(row) : undefined}
                  className={`border-b border-slate-50 hover:bg-brand-50/40 ${cfg.onRowClick ? 'cursor-pointer' : ''} ${expanded ? 'bg-brand-50/60' : ''}`}>
                  {cfg.columns.map(c => (
                    <td key={c.key} className={`${cellPad} text-ink ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''} ${c.className ?? ''}`}>
                      {c.render ? c.render(row, { rows: filtered, allRows: rows }) : formatCellValue(getPath(row, c.key))}
                    </td>
                  ))}
                  <td className={`${cellPad} sticky right-0 z-[1] bg-white pl-3`}>
                    <div className="flex items-center justify-end gap-0.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {cfg.rowActions?.(row, load)}
                      {cfg.resolveCloneInitial && (
                        <button
                          type="button"
                          title="Duplicar / clonar"
                          aria-label={`Duplicar ${cfg.singular}`}
                          onClick={() => {
                            cloneSourceRef.current = row
                            setCloning(true)
                            setCreating(true)
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-studio-violet"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        title="Editar"
                        aria-label={`Editar ${cfg.singular}`}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-studio-violet"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {(cfg.canDelete ?? true) && (
                        <button
                          type="button"
                          onClick={() => void tryDelete(row)}
                          title="Eliminar"
                          aria-label={`Eliminar ${cfg.singular}`}
                          disabled={checkingDeleteId === String(row.id)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && cfg.renderRowDetail && (
                  <tr className="border-b border-slate-100 bg-slate-50/30">
                    <td colSpan={colSpan} className="px-4 py-4">
                      {cfg.renderRowDetail(row, { rows: filtered, reload: load })}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
              {(columnSums || cfg.embedded) && (
                <tr className="total-row border-t-2 border-slate-300 bg-slate-100 text-black">
                  {cfg.columns.map((c, i) => {
                    const isSum = columnSums != null && c.key in columnSums
                    const align = isSum || c.align === 'right' ? 'text-right tabular-nums'
                      : c.align === 'center' ? 'text-center' : ''
                    return (
                    <td key={c.key} className={`${cellPad} text-black ${align} ${c.className ?? ''}`}>
                      {isSum
                        ? <span className="block text-right tabular-nums text-black">{fmtMoney(columnSums[c.key])}</span>
                        : i === 0
                          ? <span className="text-black">Total{!columnSums ? ` · ${sortedFiltered.length} reg.` : ''}</span>
                          : ''}
                    </td>
                    )
                  })}
                  <td className={cellPad} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </StudioTableCard>
  )

  const body = (
    <>
      {loadError && (
        <div className="mb-3 rounded-[0.9rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar {cfg.title.toLowerCase()}: {loadError}
        </div>
      )}
      {table}
    </>
  )

  return (
    <div className={cfg.embedded ? '' : undefined}>
      {cfg.embedded ? body : (
        <StudioPageShell
          eyebrow={cfg.eyebrow ?? 'Gestión'}
          title={cfg.title}
          description={cfg.subtitle}
        >
          {body}
        </StudioPageShell>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={`${cloning ? 'Duplicar' : 'Nuevo'} · ${cfg.singular}`}
        wide={!!cfg.modalWide}
      >
        {creating && (
          createInitial === null
            ? <Spinner label="Preparando formulario…" />
            : (
              <RecordForm
                key={createInitial?._clonedFrom ? `clone-${createInitial._clonedFrom}` : 'create'}
                fields={cfg.fields}
                initial={createInitial}
                fixed={cfg.fixed}
                formExtraPlacement={cfg.formExtraPlacement}
                formExtra={(values, helpers) => cfg.formExtra?.({
                  rows: filtered,
                  initial: createInitial,
                  values,
                  fixed: cfg.fixed,
                  setSubmitBlocked: helpers.setSubmitBlocked,
                  patchValues: helpers.patchValues,
                })}
                onCancel={() => setCreating(false)}
                onSubmit={v => save(v)}
                submitLabel={cloning ? 'Crear copia' : 'Crear'}
              />
            )
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar · ${cfg.singular}`} wide={!!cfg.modalWide}>
        {editing && (
          <RecordForm
            key={editing.id}
            fields={cfg.fields}
            initial={editing}
            fixed={cfg.fixed}
            formExtraPlacement={cfg.formExtraPlacement}
            formExtra={(values, helpers) => cfg.formExtra?.({
              rows: filtered,
              initial: editing,
              values,
              fixed: cfg.fixed,
              setSubmitBlocked: helpers.setSubmitBlocked,
              patchValues: helpers.patchValues,
            })}
            onCancel={() => setEditing(null)}
            onSubmit={v => save(v, editing)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({
          singular: cfg.singular,
          label: deleting ? rowDeleteLabel(deleting) : null,
        })}
      />
      <DeleteBlockedDialog
        open={!!blockedDelete}
        onClose={() => setBlockedDelete(null)}
        vinculos={blockedDelete?.vinculos ?? []}
        description={
          blockedDelete ? (
            <>
              No se puede eliminar <b className="text-slate-700">{cfg.singular.toLowerCase()}</b>
              {rowDeleteLabel(blockedDelete.row) ? (
                <> <b className="text-slate-800">"{rowDeleteLabel(blockedDelete.row)}"</b></>
              ) : null}
              {' '}porque tiene registros vinculados:
            </>
          ) : undefined
        }
      />
    </div>
  )
}
