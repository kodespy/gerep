import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronLeft, ChevronRight, ClipboardCheck, FileDown, FileText,
  Loader2, Pencil, Plus, Sparkles, Trash2, Upload, Wallet, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  fmtDate, fmtMoney, nowDateInputValue, toDateInputValue,
} from '../lib/format'
import {
  Badge, Card, ConfirmDialog, EmptyState, Modal, Spinner,
} from './ui'
import { FkSelect, type FkOption } from './fields'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { exportInformeTecnicoPdf } from '../lib/informeTecnicoPdf'
import ControlDesembolsoPanel from './ControlDesembolsoPanel'
import RichTextEditor from './RichTextEditor'
import { isEmptyRichText, toRichTextValue } from '../lib/richText'
import {
  calcOfertaTotales,
  completionStats,
  defaultInfraAdjudicado,
  syncInfraAdjudicado,
  defaultInfraLlamado,
  detectEsInfraestructura,
  emptyInformeDraft,
  ESTADO_OPTIONS,
  filasConcepto,
  parseObjetosGasto,
  stepsForDraft,
  suggestNumeroInforme,
  type EstadoVerif,
  type InformeTecnicoDraft,
  type ItemVerif,
  type ObjetoGastoRef,
  type OfertaCol,
  type OfertaFila,
  type StepId,
} from '../lib/informeTecnicoTypes'
import { fcNumeroExists, fetchNextFcNumero, isFcNumero } from '../lib/fcNumero'
import {
  normalizeStoragePath,
  STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS,
  uploadStorageFile,
} from '../lib/storage'
import { deleteConfirmMessage } from '../lib/deleteGuard'

type DbRow = {
  id: string
  proyecto_id: string
  numero: string
  entidad_proponente: string | null
  monto_solicitado: number | null
  objeto_gasto: string | null
  marco_normativo: string | null
  fecha_verificacion: string | null
  verificado_por: string | null
  datos_generales?: Record<string, any> | null
  verificacion_documental: ItemVerif[] | null
  verificacion_financiera: InformeTecnicoDraft['verificacion_financiera'] | null
  verificacion_tiempo: ItemVerif[] | null
  otros_aspectos: ItemVerif[] | null
  conclusion: string | null
  recomendacion: string | null
  resultado_verificacion: string | null
  archivo_firmado: string | null
  created_at?: string | null
  updated_at?: string | null
}

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function rowToDraft(r: DbRow): InformeTecnicoDraft {
  const base = emptyInformeDraft()
  const dg = (r.datos_generales && typeof r.datos_generales === 'object') ? r.datos_generales : {}
  const infraLlamado = Array.isArray(dg.verificacion_infra_llamado) && dg.verificacion_infra_llamado.length
    ? dg.verificacion_infra_llamado
    : base.verificacion_infra_llamado
  const infraAdj = syncInfraAdjudicado(
    Array.isArray(dg.verificacion_infra_adjudicado) ? dg.verificacion_infra_adjudicado : null,
  )
  return {
    ...base,
    id: r.id,
    numero: r.numero ?? '',
    entidad_proponente: r.entidad_proponente ?? '',
    monto_solicitado: r.monto_solicitado != null ? String(r.monto_solicitado) : '',
    objetos_gasto: parseObjetosGasto(r.objeto_gasto),
    marco_normativo: r.marco_normativo ?? base.marco_normativo,
    fecha_verificacion: toDateInputValue(r.fecha_verificacion) || '',
    verificado_por: r.verificado_por ?? '',
    es_infraestructura: Boolean(dg.es_infraestructura),
    verificacion_documental: Array.isArray(r.verificacion_documental) && r.verificacion_documental.length
      ? r.verificacion_documental
      : base.verificacion_documental,
    verificacion_infra_llamado: infraLlamado,
    verificacion_infra_adjudicado: infraAdj,
    verificacion_financiera: r.verificacion_financiera?.oferentes
      ? r.verificacion_financiera
      : base.verificacion_financiera,
    verificacion_tiempo: Array.isArray(r.verificacion_tiempo) && r.verificacion_tiempo.length
      ? r.verificacion_tiempo
      : base.verificacion_tiempo,
    otros_aspectos: Array.isArray(r.otros_aspectos) && r.otros_aspectos.length
      ? r.otros_aspectos
      : base.otros_aspectos,
    conclusion: toRichTextValue(r.conclusion),
    recomendacion: toRichTextValue(r.recomendacion),
    resultado_verificacion: r.resultado_verificacion ?? '',
    archivo_firmado: r.archivo_firmado,
  }
}

function EstadoSelect({
  value,
  onChange,
}: {
  value: EstadoVerif
  onChange: (v: EstadoVerif) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as EstadoVerif)}
      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
    >
      <option value="">Sin marcar</option>
      {ESTADO_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ItemsEditor({
  items,
  onChange,
  aspectoLabel = 'Aspecto / Documento',
  showReferencia = false,
}: {
  items: ItemVerif[]
  onChange: (items: ItemVerif[]) => void
  aspectoLabel?: string
  showReferencia?: boolean
}) {
  const patch = (id: string, p: Partial<ItemVerif>) => {
    onChange(items.map(i => (i.id === id ? { ...i, ...p } : i)))
  }
  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className={`rounded-xl border bg-white p-3 shadow-sm ${showReferencia ? 'border-amber-200/80' : 'border-slate-200'}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">#{idx + 1}</span>
            <button
              type="button"
              disabled={items.length <= 1}
              onClick={() => onChange(items.filter(x => x.id !== it.id))}
              className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.4fr_0.9fr_1.2fr]">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {aspectoLabel}
              <input
                value={it.aspecto}
                onChange={e => patch(it.id, { aspecto: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
              {showReferencia && (it.detalle || it.referencia) ? (
                <span className="mt-1 block text-[11px] font-normal normal-case leading-snug text-slate-400">
                  {it.detalle}
                  {it.referencia ? <span className="ml-1 font-semibold text-amber-700/80">· {it.referencia}</span> : null}
                </span>
              ) : null}
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Estado
              <div className="mt-1">
                <EstadoSelect value={it.estado} onChange={v => patch(it.id, { estado: v })} />
              </div>
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Observaciones
              <textarea
                value={it.observaciones}
                onChange={e => patch(it.id, { observaciones: e.target.value })}
                rows={2}
                className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { id: nid('it'), aspecto: '', estado: '', observaciones: '' }])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar ítem
      </button>
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={pct >= 100 ? '#059669' : '#6d28d9'}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
      <text
        x="36" y="36"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-slate-800 text-[11px] font-bold"
        style={{ transformOrigin: '36px 36px', transform: 'rotate(90deg)' }}
      >
        {pct}%
      </text>
    </svg>
  )
}

export default function InformeTecnicoPanel({
  proyectoId,
  proyectoDescripcion,
}: {
  proyectoId: string
  proyectoDescripcion?: string | null
}) {
  const { profile, session } = useAuth()
  const [rows, setRows] = useState<DbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<InformeTecnicoDraft>(() => emptyInformeDraft())
  const [step, setStep] = useState<StepId>('datos')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string | null>(null)
  const [desembolsoOpen, setDesembolsoOpen] = useState(false)

  const [ogOptions, setOgOptions] = useState<FkOption[]>([])
  const [ogCatalog, setOgCatalog] = useState<ObjetoGastoRef[]>([])
  const [ogPick, setOgPick] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('proyecto_informes_tecnicos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows((data as DbRow[]) ?? [])
    }
    setLoading(false)
  }

  const loadOgCatalog = async () => {
    const { data } = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion')
      .order('codigo')
    const list: ObjetoGastoRef[] = (data ?? []).map((o: any) => ({
      id: String(o.id),
      codigo: String(o.codigo ?? ''),
      descripcion: String(o.descripcion ?? ''),
    }))
    setOgCatalog(list)
    setOgOptions(list.map(o => ({
      value: o.id,
      label: o.codigo || o.id,
      sub: o.descripcion || undefined,
    })))
  }

  /** OG predeterminado (código 839). */
  const loadDefaultOgs = async (): Promise<ObjetoGastoRef[]> => {
    const fromCatalog = ogCatalog.find(o => String(o.codigo).trim() === '839')
    if (fromCatalog) return [fromCatalog]

    const { data } = await supabase
      .from('objetos_de_gastos')
      .select('id, codigo, descripcion')
      .eq('codigo', '839')
      .maybeSingle()
    if (!data) return []
    return [{
      id: String(data.id),
      codigo: String(data.codigo ?? '839'),
      descripcion: String(data.descripcion ?? ''),
    }]
  }

  useEffect(() => {
    void load()
    void loadOgCatalog()
  }, [proyectoId])

  /** Entidad remitente del expediente vinculado al proyecto. */
  const resolveEntidadProponente = async (): Promise<{
    entidad: string
    monto: string
  }> => {
    let entidad = ''
    let monto = ''
    try {
      const { data: proy } = await supabase
        .from('proyectos')
        .select(`
          monto,
          expediente_id,
          expediente:expedientes!expediente_id(
            id,
            entidad_id,
            entidad:entidades!entidad_id(razon_social)
          )
        `)
        .eq('id', proyectoId)
        .maybeSingle()
      const p = proy as any
      const exp = Array.isArray(p?.expediente) ? p.expediente[0] : p?.expediente
      const entEmbed = Array.isArray(exp?.entidad) ? exp.entidad[0] : exp?.entidad
      entidad = (entEmbed?.razon_social ?? '').trim()

      if (!entidad && (p?.expediente_id || exp?.id)) {
        const expId = String(p?.expediente_id || exp?.id)
        const { data: expRow } = await supabase
          .from('expedientes')
          .select('id, entidad_id, entidad:entidades!entidad_id(razon_social)')
          .eq('id', expId)
          .maybeSingle()
        const ent = Array.isArray(expRow?.entidad) ? expRow?.entidad[0] : expRow?.entidad
        entidad = (ent?.razon_social ?? '').trim()
        if (!entidad && expRow?.entidad_id) {
          const { data: entRow } = await supabase
            .from('entidades')
            .select('razon_social')
            .eq('id', expRow.entidad_id)
            .maybeSingle()
          entidad = (entRow?.razon_social ?? '').trim()
        }
      }

      monto = p?.monto != null ? String(p.monto) : ''
    } catch { /* ignore */ }
    return { entidad, monto }
  }

  const openCreate = async () => {
    const existing = rows.map(r => r.numero)
    const [{ entidad, monto }, ogs] = await Promise.all([
      resolveEntidadProponente(),
      loadDefaultOgs(),
    ])

    let esInfra = false
    try {
      const { data: proy } = await supabase
        .from('proyectos')
        .select(`
          descripcion,
          componente:componentes_programa(
            codigo, descripcion,
            actividad:actividades(codigo, descripcion),
            programa:programas(codigo, descripcion)
          )
        `)
        .eq('id', proyectoId)
        .maybeSingle()
      const p = proy as any
      const comp = Array.isArray(p?.componente) ? p.componente[0] : p?.componente
      const act = Array.isArray(comp?.actividad) ? comp.actividad[0] : comp?.actividad
      const prog = Array.isArray(comp?.programa) ? comp.programa[0] : comp?.programa
      esInfra = detectEsInfraestructura(
        p?.descripcion,
        comp?.descripcion,
        comp?.codigo,
        act?.descripcion,
        act?.codigo,
        prog?.descripcion,
        prog?.codigo,
      )
    } catch { /* ignore */ }

    setDraft(emptyInformeDraft({
      numero: await fetchNextFcNumero().catch(() => suggestNumeroInforme(existing)),
      entidad_proponente: entidad,
      objetos_gasto: ogs,
      monto_solicitado: monto,
      fecha_verificacion: nowDateInputValue(),
      verificado_por: '',
      es_infraestructura: esInfra,
      verificacion_infra_llamado: defaultInfraLlamado(),
      verificacion_infra_adjudicado: defaultInfraAdjudicado(),
    }))
    setOgPick('')
    setStep('datos')
    setFormError(null)
    setOpen(true)
  }

  const openEdit = async (r: DbRow) => {
    const { entidad } = await resolveEntidadProponente()
    const draftRow = rowToDraft(r)
    setDraft({
      ...draftRow,
      // Entidad remitente del expediente del proyecto
      entidad_proponente: entidad || r.entidad_proponente || '',
      verificado_por: draftRow.verificado_por || '',
    })
    setOgPick('')
    setStep('datos')
    setFormError(null)
    setOpen(true)
  }

  const addObjetoGasto = (id: string) => {
    if (!id) return
    const og = ogCatalog.find(o => o.id === id)
    if (!og) return
    setDraft(prev => {
      if (prev.objetos_gasto.some(x => x.id === id)) return prev
      return { ...prev, objetos_gasto: [...prev.objetos_gasto, og] }
    })
    setOgPick('')
  }

  const removeObjetoGasto = (id: string) => {
    setDraft(prev => ({
      ...prev,
      objetos_gasto: prev.objetos_gasto.filter(o => o.id !== id),
    }))
  }

  const set = <K extends keyof InformeTecnicoDraft>(key: K, value: InformeTecnicoDraft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const stats = useMemo(() => completionStats(draft), [draft])
  const steps = useMemo(() => stepsForDraft(draft.es_infraestructura), [draft.es_infraestructura])
  const stepIdx = Math.max(0, steps.findIndex(s => s.id === step))

  useEffect(() => {
    if (!steps.some(s => s.id === step)) setStep('datos')
  }, [steps, step])

  const validate = (): string | null => {
    if (!draft.numero.trim()) return 'Ingrese el N° del informe.'
    if (!isFcNumero(draft.numero)) return 'El N° debe tener el formato FC-YYYY-#### (ej. FC-2026-0001).'
    if (!draft.fecha_verificacion) return 'Ingrese la fecha de verificación.'
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) {
      setFormError(err)
      setStep('datos')
      return
    }
    const num = draft.numero.trim().toUpperCase()
    try {
      const exists = await fcNumeroExists(num, { excludeInformeId: draft.id })
      if (exists) {
        setFormError(`El N° ${num} ya está en uso. Use el siguiente de la secuencia FC.`)
        setStep('datos')
        return
      }
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo validar el N°.')
      setStep('datos')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload: Record<string, any> = {
        proyecto_id: proyectoId,
        numero: num,
        entidad_proponente: draft.entidad_proponente.trim() || null,
        monto_solicitado: draft.monto_solicitado ? Number(draft.monto_solicitado) : null,
        objeto_gasto: draft.objetos_gasto.length
          ? JSON.stringify(draft.objetos_gasto)
          : null,
        marco_normativo: draft.marco_normativo.trim() || null,
        fecha_verificacion: draft.fecha_verificacion || null,
        verificado_por: draft.verificado_por.trim() || null,
        datos_generales: {
          es_infraestructura: draft.es_infraestructura,
          verificacion_infra_llamado: draft.verificacion_infra_llamado,
          verificacion_infra_adjudicado: draft.verificacion_infra_adjudicado,
        },
        verificacion_documental: draft.verificacion_documental,
        verificacion_financiera: {
          ...draft.verificacion_financiera,
          filas: filasConcepto(draft.verificacion_financiera),
        },
        verificacion_tiempo: draft.verificacion_tiempo,
        otros_aspectos: draft.otros_aspectos,
        conclusion: isEmptyRichText(draft.conclusion) ? null : draft.conclusion,
        recomendacion: isEmptyRichText(draft.recomendacion) ? null : draft.recomendacion,
        resultado_verificacion: draft.resultado_verificacion.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (session?.user?.id) payload.user_id = session.user.id

      if (draft.id) {
        const { error: updErr } = await supabase
          .from('proyecto_informes_tecnicos')
          .update(payload)
          .eq('id', draft.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('proyecto_informes_tecnicos')
          .insert(payload)
        if (insErr) throw insErr
      }
      setOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo guardar el informe.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    const { error: err } = await supabase.from('proyecto_informes_tecnicos').delete().eq('id', deleteId)
    if (err) alert(err.message)
    setDeleteId(null)
    await load()
  }

  const generarPdf = async (r: DbRow) => {
    if (r.archivo_firmado) return
    setPdfLoading(r.id)
    try {
      await exportInformeTecnicoPdf(proyectoId, rowToDraft(r))
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setPdfLoading(null)
    }
  }

  const onUploadFirmado = async (file: File | undefined, informeId: string) => {
    if (!file) return
    setUploadingId(informeId)
    try {
      const path = await uploadStorageFile(
        STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS,
        `proyectos/${proyectoId}/${informeId}`,
        file,
      )
      const { error: err } = await supabase
        .from('proyecto_informes_tecnicos')
        .update({ archivo_firmado: path, updated_at: new Date().toISOString() })
        .eq('id', informeId)
      if (err) throw err
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo subir el informe firmado.')
    } finally {
      setUploadingId(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeFirmado = async (r: DbRow) => {
    const path = (r.archivo_firmado ?? '').trim()
    if (!path) return
    if (!confirm('¿Eliminar el archivo firmado? Podrá regenerar el PDF.')) return
    const { error: err } = await supabase
      .from('proyecto_informes_tecnicos')
      .update({ archivo_firmado: null, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (err) {
      alert(err.message)
      return
    }
    const objectPath = normalizeStoragePath(path, STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS)
    if (objectPath) {
      await supabase.storage.from(STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS).remove([objectPath]).catch(() => undefined)
    }
    await load()
  }

  const fin = draft.verificacion_financiera
  const finFilas = filasConcepto(fin)
  const finTotales = calcOfertaTotales(fin)
  const patchFin = (p: Partial<typeof fin>) => set('verificacion_financiera', { ...fin, ...p })

  const addOferente = () => {
    const col: OfertaCol = { id: nid('of'), nombre: `Oferente ${fin.oferentes.length + 1}` }
    patchFin({
      oferentes: [...fin.oferentes, col],
      filas: filasConcepto(fin).map(f => ({ ...f, montos: { ...f.montos, [col.id]: '' } })),
    })
  }

  const addFila = () => {
    const montos: Record<string, string> = {}
    for (const o of fin.oferentes) montos[o.id] = ''
    const fila: OfertaFila = { id: nid('fl'), concepto: '', montos }
    patchFin({ filas: [...filasConcepto(fin), fila] })
  }

  if (loading) return <Spinner label="Cargando informes técnicos…" />

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-200/30 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">
              <Sparkles className="h-3.5 w-3.5" /> Gestión Operacional · UEP
            </p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
              Informe Técnico de Verificación
            </h3>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Elabore el dictamen documental, financiero y de plazos conforme a la Resolución SND N.º 227/2026.
              {proyectoDescripcion ? (
                <> Proyecto: <span className="font-medium text-slate-700">{proyectoDescripcion}</span></>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDesembolsoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-4 py-2.5 text-sm font-bold text-teal-700 shadow-sm hover:bg-teal-50"
            >
              <Wallet className="h-4 w-4" /> Control de Desembolso
            </button>
            <button
              type="button"
              onClick={() => void openCreate()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Proyecto nuevo
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
          {/schema cache|does not exist|PGRST/i.test(error) && (
            <span className="mt-1 block text-xs">
              Ejecute la migración <code className="rounded bg-rose-100 px-1">018_proyecto_informes_tecnicos.sql</code> en Supabase.
            </span>
          )}
        </p>
      )}

      {!rows.length ? (
        <Card className="p-8">
          <EmptyState
            title="Sin informes técnicos"
            hint="Cree el primero con “Proyecto nuevo”. Se prellenan datos del proyecto y la plantilla de verificación."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const d = rowToDraft(r)
            const st = completionStats(d)
            const firmado = !!(r.archivo_firmado ?? '').trim()
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <ProgressRing pct={st.pct} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="brand">{r.numero}</Badge>
                        {firmado && <Badge color="green">Firmado</Badge>}
                        <span className="text-sm text-slate-500">
                          {fmtDate(r.fecha_verificacion)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {r.verificado_por || 'Sin verificador'} · {r.entidad_proponente || 'Sin entidad'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Monto: {r.monto_solicitado != null ? fmtMoney(Number(r.monto_solicitado)) : '—'}
                        {' · '}
                        {st.cumple} cumplen · {st.noCumple} no cumplen · {st.atencion} requieren autorización · {st.noAplica} no aplica
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      title={firmado ? 'Informe firmado: no se regenera el PDF' : 'Generar PDF'}
                      disabled={firmado || pdfLoading === r.id}
                      onClick={() => void generarPdf(r)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40"
                    >
                      {pdfLoading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    </button>
                    {firmado ? (
                      <>
                        <ArchivoAdjuntoLink path={r.archivo_firmado} bucket={STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS} />
                        <button
                          type="button"
                          title="Eliminar firmado"
                          onClick={() => void removeFirmado(r)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        title="Adjuntar informe firmado"
                        disabled={uploadingId === r.id}
                        onClick={() => {
                          uploadTargetId.current = r.id
                          fileRef.current?.click()
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50"
                      >
                        {uploadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void openEdit(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(r.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => {
          const id = uploadTargetId.current
          const file = e.target.files?.[0]
          if (id && file) void onUploadFirmado(file, id)
        }}
      />

      <Modal
        open={open}
        onClose={() => { if (!saving) setOpen(false) }}
        wide
        title={
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-600" />
            {draft.id ? 'Editar Informe Técnico' : 'Nuevo Informe Técnico'}
          </span>
        }
      >
        <div className="-mx-5 -mb-4 flex max-h-[min(88vh,820px)] flex-col">
          {/* Stepper */}
          <div className="shrink-0 border-b border-slate-100 px-5 pb-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Dictamen de Gestión Operacional · avance de verificación <b className="text-brand-700">{stats.pct}%</b>
              </p>
              <ProgressRing pct={stats.pct} />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {steps.map((s, i) => {
                const active = s.id === step
                const done = i < stepIdx
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className={`min-w-[7.5rem] flex-1 rounded-xl border px-2.5 py-2 text-left transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : done
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-slate-200 bg-white hover:border-brand-200'
                    }`}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-brand-700' : 'text-slate-400'}`}>
                      Paso {i + 1}
                    </p>
                    <p className={`text-xs font-semibold ${active ? 'text-brand-900' : 'text-slate-700'}`}>{s.label}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {step === 'datos' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                  Proyecto
                  <input
                    readOnly
                    value={proyectoDescripcion || '—'}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  N° de Informe <span className="text-rose-500">*</span>
                  <input
                    value={draft.numero}
                    onChange={e => set('numero', e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    placeholder="FC-2026-0001"
                  />
                  <span className="mt-1 block font-normal text-slate-400">
                    Formato FC-YYYY-#### (serie secuencial compartida)
                  </span>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Fecha de verificación <span className="text-rose-500">*</span>
                  <input
                    type="date"
                    value={draft.fecha_verificacion}
                    onChange={e => set('fecha_verificacion', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                  Entidad Proponente
                  <span className="ml-1 font-normal text-slate-400">(expediente · entidad remitente)</span>
                  <input
                    value={draft.entidad_proponente}
                    disabled
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    placeholder="Sin entidad remitente en el expediente"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Monto solicitado
                  <input
                    type="number"
                    value={draft.monto_solicitado}
                    onChange={e => set('monto_solicitado', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Verificado por
                  <input
                    value={draft.verificado_por}
                    onChange={e => set('verificado_por', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    placeholder="Opcional"
                  />
                </label>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Objetos de Gasto
                    <span className="ml-1 font-normal text-slate-400">(catálogo · puede agregar varios)</span>
                  </p>
                  <div className="mt-1 space-y-2">
                    <FkSelect
                      value={ogPick}
                      onChange={addObjetoGasto}
                      options={ogOptions.filter(o => !draft.objetos_gasto.some(x => x.id === o.value))}
                      placeholder="Buscar código o descripción…"
                    />
                    {draft.objetos_gasto.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-400">
                        Sin objetos de gasto. Seleccione uno o más del catálogo.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {draft.objetos_gasto.map(og => (
                          <li
                            key={og.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/60 px-2.5 py-1.5 text-sm text-brand-900"
                          >
                            <span className="font-semibold tabular-nums">{og.codigo}</span>
                            {og.descripcion ? (
                              <span className="truncate text-brand-800/80">{og.descripcion}</span>
                            ) : null}
                            <button
                              type="button"
                              title="Quitar"
                              onClick={() => removeObjetoGasto(og.id)}
                              className="ml-0.5 rounded p-0.5 text-brand-600/70 hover:bg-brand-100 hover:text-rose-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                  Marco normativo
                  <input
                    value={draft.marco_normativo}
                    onChange={e => set('marco_normativo', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </label>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(prev => {
                        const next = !prev.es_infraestructura
                        return {
                          ...prev,
                          es_infraestructura: next,
                          verificacion_infra_llamado: prev.verificacion_infra_llamado.length
                            ? prev.verificacion_infra_llamado
                            : defaultInfraLlamado(),
                          verificacion_infra_adjudicado: syncInfraAdjudicado(
                            next ? prev.verificacion_infra_adjudicado : [],
                          ),
                        }
                      })
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      draft.es_infraestructura
                        ? 'border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50/80 to-teal-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-amber-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold ${
                        draft.es_infraestructura
                          ? 'border-amber-600 bg-amber-600 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        Proyecto de infraestructura
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Anexo XIX
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        Activa dos hojas adicionales: verificación del proceso de llamado y documentación del adjudicado
                        (Arts. 8°/11°, Res. SND 227/2026).
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            )}

            {step === 'documental' && (
              <div>
                <p className="mb-3 text-sm text-slate-500">
                  Artículo 7° de la Resolución SND N.º 227/2026 — marque el estado de cada documento.
                </p>
                <ItemsEditor
                  items={draft.verificacion_documental}
                  onChange={v => set('verificacion_documental', v)}
                  aspectoLabel="Documento verificado"
                />
              </div>
            )}

            {step === 'infra_llamado' && (
              <div>
                <div className="mb-4 overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-teal-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800/80">
                    Anexo XIX · Sección A · Infraestructura
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    Verificación documental del proceso de llamado
                  </h3>
                  <p className="mt-1 text-sm leading-snug text-slate-600">
                    Arts. 8° y 11°, Resolución SND N.º 227/2026 — pliego, publicación, comparativo,
                    evaluación, borrador de contrato y requisitos del presupuesto.
                  </p>
                </div>
                <ItemsEditor
                  items={draft.verificacion_infra_llamado}
                  onChange={v => set('verificacion_infra_llamado', v)}
                  aspectoLabel="Requisito / Documento"
                  showReferencia
                />
              </div>
            )}

            {step === 'infra_adjudicado' && (
              <div>
                <div className="mb-4 overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-amber-50/50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-800/80">
                    Anexo XIX · Sección B · Infraestructura
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    Verificación documental del adjudicado
                  </h3>
                  <p className="mt-1 text-sm leading-snug text-slate-600">
                    CCT, IPS, anotaciones personales, quiebras, constitución societaria y representación
                    legal del proveedor seleccionado.
                  </p>
                </div>
                <ItemsEditor
                  items={draft.verificacion_infra_adjudicado}
                  onChange={v => set('verificacion_infra_adjudicado', v)}
                  aspectoLabel="Requisito / Documento"
                  showReferencia
                />
              </div>
            )}

            {step === 'financiera' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">Artículo 8°, inciso b — cuadro comparativo de ofertas.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={addOferente} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-300">
                      + Oferente
                    </button>
                    <button type="button" onClick={addFila} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-300">
                      + Fila
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Concepto</th>
                        {fin.oferentes.map(o => (
                          <th key={o.id} className="min-w-[140px] px-2 py-2">
                            <input
                              value={o.nombre}
                              onChange={e => patchFin({
                                oferentes: fin.oferentes.map(x => x.id === o.id ? { ...x, nombre: e.target.value } : x),
                              })}
                              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold normal-case text-slate-700"
                            />
                          </th>
                        ))}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {finFilas.map(f => (
                        <tr key={f.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">
                            <input
                              value={f.concepto}
                              onChange={e => patchFin({
                                filas: finFilas.map(x => x.id === f.id ? { ...x, concepto: e.target.value } : x),
                              })}
                              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                            />
                          </td>
                          {fin.oferentes.map(o => (
                            <td key={o.id} className="px-2 py-1.5">
                              <input
                                type="number"
                                value={f.montos[o.id] ?? ''}
                                onChange={e => patchFin({
                                  filas: finFilas.map(x => x.id === f.id
                                    ? { ...x, montos: { ...x.montos, [o.id]: e.target.value } }
                                    : x),
                                })}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums"
                                placeholder="0"
                              />
                            </td>
                          ))}
                          <td className="px-1">
                            <button
                              type="button"
                              onClick={() => patchFin({ filas: finFilas.filter(x => x.id !== f.id) })}
                              className="rounded p-1 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                          Total
                        </td>
                        {fin.oferentes.map(o => (
                          <td key={o.id} className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800">
                            {fmtMoney(finTotales[o.id] ?? 0)}
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <label className="block text-xs font-semibold text-slate-600">
                  Notas financieras
                  <textarea
                    value={fin.notas}
                    onChange={e => patchFin({ notas: e.target.value })}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    placeholder="RUC, certificados tributarios, vigencia de ofertas…"
                  />
                </label>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Análisis técnico</p>
                  <ItemsEditor
                    items={fin.analisis}
                    onChange={analisis => patchFin({ analisis })}
                  />
                </div>
              </div>
            )}

            {step === 'tiempo' && (
              <div>
                <p className="mb-3 text-sm text-slate-500">Plazos de presentación y eventuales excepciones (Art. 28°).</p>
                <ItemsEditor items={draft.verificacion_tiempo} onChange={v => set('verificacion_tiempo', v)} />
              </div>
            )}

            {step === 'otros' && (
              <div>
                <p className="mb-3 text-sm text-slate-500">Visibilidad institucional, rendición y vigencia de ofertas.</p>
                <ItemsEditor items={draft.otros_aspectos} onChange={v => set('otros_aspectos', v)} />
              </div>
            )}

            {step === 'cierre' && (
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-slate-600">
                  Resultado de la verificación
                  <input
                    value={draft.resultado_verificacion}
                    onChange={e => set('resultado_verificacion', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    placeholder="Ej. Cumple con observaciones / Requiere excepción Art. 28°"
                  />
                </label>
                <div className="block text-xs font-semibold text-slate-600">
                  6. Conclusión técnica
                  <RichTextEditor
                    value={draft.conclusion}
                    onChange={html => set('conclusion', html)}
                    placeholder="Síntesis del análisis documental, financiero y de plazos…"
                  />
                </div>
                <div className="block text-xs font-semibold text-slate-600">
                  7. Recomendación técnica
                  <RichTextEditor
                    value={draft.recomendacion}
                    onChange={html => set('recomendacion', html)}
                    placeholder="Se recomienda elevar el expediente al Comité de Evaluación…"
                  />
                </div>
                <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-sm text-slate-600">
                  <FileText className="mb-1 h-4 w-4 text-brand-600" />
                  Al guardar podrá generar el PDF institucional y adjuntar la versión firmada.
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
            {formError && (
              <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => setStep(steps[Math.max(0, stepIdx - 1)].id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                {stepIdx < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(steps[stepIdx + 1].id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Guardar informe
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        message={deleteConfirmMessage({
          singular: 'informe técnico',
          label: rows.find(r => r.id === deleteId)?.numero,
        })}
      />

      <ControlDesembolsoPanel
        open={desembolsoOpen}
        onClose={() => setDesembolsoOpen(false)}
        proyectoId={proyectoId}
        proyectoDescripcion={proyectoDescripcion}
      />
    </div>
  )
}
