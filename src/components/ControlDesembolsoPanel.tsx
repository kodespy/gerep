import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Banknote, Copy, FileDown, Loader2, Pencil, Plus, Trash2, Upload, Wallet,
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
import { exportControlDesembolsoPdf } from '../lib/controlDesembolsoPdf'
import RichTextEditor from './RichTextEditor'
import { isEmptyRichText, toRichTextValue } from '../lib/richText'
import {
  controlDesembolsoStats,
  emptyControlDesembolsoDraft,
  formatObjetosGasto,
  parseObjetosGasto,
  suggestNumeroControlDesembolso,
  type ControlDesembolsoDraft,
  type EstadoVerif,
  type ItemVerif,
  type ObjetoGastoRef,
} from '../lib/controlDesembolsoTypes'
import { fcNumeroExists, fetchNextFcNumero, isFcNumero } from '../lib/fcNumero'
import { ESTADO_OPTIONS } from '../lib/informeTecnicoTypes'
import {
  normalizeStoragePath,
  STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS,
  uploadStorageFile,
} from '../lib/storage'
import { deleteConfirmMessage } from '../lib/deleteGuard'

type DbRow = {
  id: string
  proyecto_id: string
  numero: string
  entidad_proponente: string | null
  monto_total: number | null
  monto_desembolsado: number | null
  monto_solicitado: number | null
  objeto_gasto: string | null
  marco_normativo: string | null
  fecha_verificacion: string | null
  elaborador_por: string | null
  verificacion_documental: ItemVerif[] | null
  observaciones: string | null
  archivo_firmado: string | null
  created_at?: string | null
}

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function rowToDraft(r: DbRow): ControlDesembolsoDraft {
  const base = emptyControlDesembolsoDraft()
  return {
    ...base,
    id: r.id,
    numero: r.numero ?? '',
    entidad_proponente: r.entidad_proponente ?? '',
    monto_total: r.monto_total != null ? String(r.monto_total) : '',
    monto_desembolsado: r.monto_desembolsado != null ? String(r.monto_desembolsado) : '',
    monto_solicitado: r.monto_solicitado != null ? String(r.monto_solicitado) : '',
    objetos_gasto: parseObjetosGasto(r.objeto_gasto),
    marco_normativo: r.marco_normativo ?? base.marco_normativo,
    fecha_verificacion: toDateInputValue(r.fecha_verificacion) || '',
    elaborador_por: r.elaborador_por ?? '',
    verificacion_documental: Array.isArray(r.verificacion_documental) && r.verificacion_documental.length
      ? r.verificacion_documental
      : base.verificacion_documental,
    observaciones: toRichTextValue(r.observaciones),
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
      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
    >
      <option value="">Sin marcar</option>
      {ESTADO_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke="#0d9488" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
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

export default function ControlDesembolsoPanel({
  proyectoId,
  proyectoDescripcion,
  open,
  onClose,
}: {
  proyectoId: string
  proyectoDescripcion?: string | null
  open: boolean
  onClose: () => void
}) {
  const { profile, session } = useAuth()
  const [rows, setRows] = useState<DbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<ControlDesembolsoDraft>(() => emptyControlDesembolsoDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string | null>(null)

  const [ogOptions, setOgOptions] = useState<FkOption[]>([])
  const [ogCatalog, setOgCatalog] = useState<ObjetoGastoRef[]>([])
  const [ogPick, setOgPick] = useState('')

  const set = <K extends keyof ControlDesembolsoDraft>(key: K, value: ControlDesembolsoDraft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const stats = useMemo(() => controlDesembolsoStats(draft), [draft])

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('proyecto_control_desembolsos')
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

  useEffect(() => {
    if (!open) return
    void load()
    void loadOgCatalog()
  }, [open, proyectoId])

  const resolvePrefill = async () => {
    let entidad = ''
    let montoTotal = ''
    let montoDesembolsado = ''
    try {
      const [{ data: proy }, { data: strs }, { data: planes }, { data: adendas }] = await Promise.all([
        supabase
          .from('proyectos')
          .select(`
            monto,
            expediente_id,
            expediente:expedientes!expediente_id(
              id, entidad_id,
              entidad:entidades!entidad_id(razon_social)
            )
          `)
          .eq('id', proyectoId)
          .maybeSingle(),
        supabase.from('strs').select('monto').eq('proyecto_id', proyectoId),
        supabase.from('planes_financieros').select('monto').eq('proyecto_id', proyectoId),
        supabase
          .from('adendas')
          .select('monto_ajuste, tipo_ajuste, estado, plan:planes_financieros!inner(proyecto_id)')
          .eq('plan.proyecto_id', proyectoId),
      ])
      const p = proy as any
      const exp = Array.isArray(p?.expediente) ? p.expediente[0] : p?.expediente
      const entEmbed = Array.isArray(exp?.entidad) ? exp.entidad[0] : exp?.entidad
      entidad = (entEmbed?.razon_social ?? '').trim()
      if (!entidad && (p?.expediente_id || exp?.id)) {
        const expId = String(p?.expediente_id || exp?.id)
        const { data: expRow } = await supabase
          .from('expedientes')
          .select('entidad_id, entidad:entidades!entidad_id(razon_social)')
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
      // Fallback: entidad_id directo en el expediente embebido
      if (!entidad && exp?.entidad_id) {
        const { data: entRow } = await supabase
          .from('entidades')
          .select('razon_social')
          .eq('id', exp.entidad_id)
          .maybeSingle()
        entidad = (entRow?.razon_social ?? '').trim()
      }

      // Monto total = plan financiero + adendas vigentes (disminuciones restan)
      const planMonto = (planes ?? []).reduce((s, r: any) => s + (Number(r.monto) || 0), 0)
      const adendaMonto = (adendas ?? []).reduce((s, a: any) => {
        const estado = (a.estado ?? '').toLowerCase()
        if (estado.includes('rechaz') || estado.includes('anulad')) return s
        const sign = (a.tipo_ajuste ?? '').toLowerCase().includes('dis') ? -1 : 1
        return s + sign * (Number(a.monto_ajuste) || 0)
      }, 0)
      const vigente = planMonto + adendaMonto
      const total = vigente || (Number(p?.monto) || 0) + adendaMonto
      montoTotal = total ? String(total) : (p?.monto != null ? String(p.monto) : '')

      const sumStr = (strs ?? []).reduce((s, r: any) => s + (Number(r.monto) || 0), 0)
      montoDesembolsado = sumStr ? String(sumStr) : '0'
    } catch { /* ignore */ }

    let ogs: ObjetoGastoRef[] = []
    const fromCat = ogCatalog.find(o => String(o.codigo).trim() === '839')
    if (fromCat) {
      ogs = [fromCat]
    } else {
      const { data } = await supabase
        .from('objetos_de_gastos')
        .select('id, codigo, descripcion')
        .eq('codigo', '839')
        .maybeSingle()
      if (data) {
        ogs = [{
          id: String(data.id),
          codigo: String(data.codigo ?? '839'),
          descripcion: String(data.descripcion ?? ''),
        }]
      }
    }

    return { entidad, montoTotal, montoDesembolsado, ogs }
  }

  const openCreate = async () => {
    const [pre, numero] = await Promise.all([
      resolvePrefill(),
      fetchNextFcNumero().catch(() =>
        suggestNumeroControlDesembolso(rows.map(r => r.numero)),
      ),
    ])
    const who = (profile?.name ?? '').trim() || (session?.user?.email ?? '')
    setDraft(emptyControlDesembolsoDraft({
      numero,
      entidad_proponente: pre.entidad,
      monto_total: pre.montoTotal,
      monto_desembolsado: pre.montoDesembolsado,
      objetos_gasto: pre.ogs,
      fecha_verificacion: nowDateInputValue(),
      elaborador_por: who,
    }))
    setOgPick('')
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = async (r: DbRow) => {
    const pre = await resolvePrefill()
    const draftRow = rowToDraft(r)
    setDraft({
      ...draftRow,
      // Siempre refrescar entidad y monto total (plan + adendas) del proyecto
      entidad_proponente: pre.entidad || draftRow.entidad_proponente,
      monto_total: pre.montoTotal || draftRow.monto_total,
      monto_desembolsado: pre.montoDesembolsado || draftRow.monto_desembolsado,
    })
    setOgPick('')
    setFormError(null)
    setFormOpen(true)
  }

  const openDuplicate = async (r: DbRow) => {
    const [pre, numero] = await Promise.all([
      resolvePrefill(),
      fetchNextFcNumero().catch(() =>
        suggestNumeroControlDesembolso(rows.map(x => x.numero)),
      ),
    ])
    const src = rowToDraft(r)
    const who = (profile?.name ?? '').trim() || (session?.user?.email ?? '')
    setDraft({
      ...src,
      id: undefined,
      numero,
      entidad_proponente: pre.entidad || src.entidad_proponente,
      monto_total: pre.montoTotal || src.monto_total,
      monto_desembolsado: pre.montoDesembolsado || src.monto_desembolsado,
      fecha_verificacion: nowDateInputValue(),
      elaborador_por: who || src.elaborador_por,
      verificacion_documental: src.verificacion_documental.map(i => ({
        ...i,
        id: nid('it'),
      })),
      archivo_firmado: null,
    })
    setOgPick('')
    setFormError(null)
    setFormOpen(true)
  }

  const addObjetoGasto = (id: string) => {
    if (!id) return
    const og = ogCatalog.find(o => o.id === id)
    if (!og) return
    setDraft(prev => {
      if (prev.objetos_gasto.some(x => x.id === og.id)) return prev
      return { ...prev, objetos_gasto: [...prev.objetos_gasto, og] }
    })
    setOgPick('')
  }

  const patchItem = (id: string, p: Partial<ItemVerif>) => {
    setDraft(prev => ({
      ...prev,
      verificacion_documental: prev.verificacion_documental.map(i =>
        i.id === id ? { ...i, ...p } : i,
      ),
    }))
  }

  const save = async () => {
    setFormError(null)
    const num = draft.numero.trim().toUpperCase()
    if (!num) {
      setFormError('Indique el N° del control.')
      return
    }
    if (!isFcNumero(num)) {
      setFormError('El N° debe tener el formato FC-YYYY-#### (ej. FC-2026-0001).')
      return
    }
    try {
      const exists = await fcNumeroExists(num, { excludeDesembolsoId: draft.id })
      if (exists) {
        setFormError(`El N° ${num} ya está en uso. Use el siguiente de la secuencia FC.`)
        return
      }
    } catch (e: any) {
      setFormError(e?.message ?? 'No se pudo validar el N°.')
      return
    }
    setSaving(true)
    const payload = {
      proyecto_id: proyectoId,
      numero: num,
      entidad_proponente: draft.entidad_proponente.trim() || null,
      monto_total: draft.monto_total ? Number(draft.monto_total) : null,
      monto_desembolsado: draft.monto_desembolsado ? Number(draft.monto_desembolsado) : null,
      monto_solicitado: draft.monto_solicitado ? Number(draft.monto_solicitado) : null,
      objeto_gasto: JSON.stringify(draft.objetos_gasto),
      marco_normativo: draft.marco_normativo.trim() || null,
      fecha_verificacion: draft.fecha_verificacion || null,
      elaborador_por: draft.elaborador_por.trim() || null,
      verificacion_documental: draft.verificacion_documental,
      observaciones: isEmptyRichText(draft.observaciones) ? null : draft.observaciones,
      updated_at: new Date().toISOString(),
      user_id: session?.user?.id ?? null,
    }
    const res = draft.id
      ? await supabase.from('proyecto_control_desembolsos').update(payload).eq('id', draft.id).select('*').maybeSingle()
      : await supabase.from('proyecto_control_desembolsos').insert(payload).select('*').maybeSingle()

    setSaving(false)
    if (res.error) {
      setFormError(res.error.message)
      return
    }
    if (res.data) setDraft(rowToDraft(res.data as DbRow))
    await load()
    setFormOpen(false)
  }

  const generarPdf = async (r: DbRow) => {
    setPdfLoading(r.id)
    try {
      await exportControlDesembolsoPdf(proyectoId, rowToDraft(r))
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setPdfLoading(null)
    }
  }

  const onUploadFirmado = async (file: File, id: string) => {
    setUploadingId(id)
    try {
      const path = await uploadStorageFile(
        STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS,
        `proyectos/${proyectoId}/${id}`,
        file,
      )
      const { error: err } = await supabase
        .from('proyecto_control_desembolsos')
        .update({ archivo_firmado: path, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo adjuntar el archivo.')
    } finally {
      setUploadingId(null)
      uploadTargetId.current = null
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeFirmado = async (r: DbRow) => {
    if (!confirm('¿Eliminar el archivo firmado? Podrá regenerar el PDF.')) return
    const objectPath = r.archivo_firmado
      ? normalizeStoragePath(r.archivo_firmado, STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS)
      : ''
    await supabase
      .from('proyecto_control_desembolsos')
      .update({ archivo_firmado: null, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (objectPath) {
      await supabase.storage.from(STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS).remove([objectPath]).catch(() => undefined)
    }
    await load()
  }

  const doDelete = async () => {
    if (!deleteId) return
    await supabase.from('proyecto_control_desembolsos').delete().eq('id', deleteId)
    setDeleteId(null)
    await load()
  }

  return (
    <>
      <Modal
        open={open && !formOpen}
        onClose={onClose}
        wide
        title={
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-teal-600" />
            Control de Desembolso
          </span>
        }
      >
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-4">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-teal-200/40 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                  Aprobación de desembolso
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Formato de verificación documental previo al desembolso.
                  {proyectoDescripcion ? (
                    <> Proyecto: <span className="font-medium text-slate-800">{proyectoDescripcion}</span></>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openCreate()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-sm font-bold text-white shadow-lg shadow-teal-600/25 hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" /> Nuevo control
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
              {/schema cache|does not exist|PGRST/i.test(error) && (
                <span className="mt-1 block text-xs">
                  Ejecute la migración{' '}
                  <code className="rounded bg-rose-100 px-1">022_proyecto_control_desembolsos.sql</code>
                  {' '}en Supabase.
                </span>
              )}
            </p>
          )}

          {loading ? (
            <Spinner label="Cargando controles de desembolso…" />
          ) : !rows.length ? (
            <Card className="p-6">
              <EmptyState
                title="Sin controles de desembolso"
                hint="Cree el primero con “Nuevo control”. Se prellenan montos del proyecto y STR."
              />
            </Card>
          ) : (
            <div className="max-h-[min(60vh,520px)] space-y-2 overflow-y-auto pr-1">
              {rows.map(r => {
                const d = rowToDraft(r)
                const st = controlDesembolsoStats(d)
                const firmado = !!(r.archivo_firmado ?? '').trim()
                return (
                  <Card key={r.id} className="p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <ProgressRing pct={st.pct} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge color="green">{r.numero}</Badge>
                            {firmado && <Badge color="green">Firmado</Badge>}
                            <span className="text-xs text-slate-500">{fmtDate(r.fecha_verificacion)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {r.elaborador_por || 'Sin elaborador'} · {r.entidad_proponente || 'Sin entidad'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Solicitado: {r.monto_solicitado != null ? fmtMoney(Number(r.monto_solicitado)) : '—'}
                            {' · '}
                            Desembolsado: {r.monto_desembolsado != null ? fmtMoney(Number(r.monto_desembolsado)) : '—'}
                            {' · '}
                            {st.cumple} cumplen · {st.noCumple} no cumplen · {st.noAplica} N/A
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          title={firmado ? 'Firmado: no se regenera el PDF' : 'Generar PDF'}
                          disabled={firmado || pdfLoading === r.id}
                          onClick={() => void generarPdf(r)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40"
                        >
                          {pdfLoading === r.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <FileDown className="h-4 w-4" />}
                        </button>
                        {firmado ? (
                          <>
                            <ArchivoAdjuntoLink
                              path={r.archivo_firmado}
                              bucket={STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS}
                            />
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
                            title="Adjuntar firmado"
                            disabled={uploadingId === r.id}
                            onClick={() => {
                              uploadTargetId.current = r.id
                              fileRef.current?.click()
                            }}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50"
                          >
                            {uploadingId === r.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Upload className="h-4 w-4" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-700"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          title="Duplicar control"
                          onClick={() => void openDuplicate(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-700"
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicar
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
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => { if (!saving) setFormOpen(false) }}
        wide
        title={
          <span className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-teal-600" />
            {draft.id ? 'Editar Control de Desembolso' : 'Nuevo Control de Desembolso'}
          </span>
        }
      >
        <div className="-mx-5 -mb-4 flex max-h-[min(88vh,820px)] flex-col">
          <div className="shrink-0 border-b border-slate-100 px-5 pb-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Verificación documental · avance <b className="text-teal-700">{stats.pct}%</b>
              </p>
              <ProgressRing pct={stats.pct} />
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {formError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}

            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-teal-700">
                1. Datos generales del proyecto
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">
                  N° de control
                  <input
                    value={draft.numero}
                    onChange={e => set('numero', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    placeholder="FC-2026-0001"
                  />
                  <span className="mt-1 block font-normal normal-case text-slate-400">
                    Formato FC-YYYY-#### (serie secuencial compartida)
                  </span>
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">
                  Entidad remitente (expediente)
                  <input
                    value={draft.entidad_proponente}
                    onChange={e => set('entidad_proponente', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    placeholder="Se completa desde el expediente del proyecto"
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Monto total del proyecto
                  <span className="ml-1 font-normal normal-case text-slate-400">(plan + adendas)</span>
                  <input
                    type="number"
                    value={draft.monto_total}
                    onChange={e => set('monto_total', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Monto desembolsado a la fecha
                  <input
                    type="number"
                    value={draft.monto_desembolsado}
                    onChange={e => set('monto_desembolsado', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Monto solicitado actualmente
                  <input
                    type="number"
                    value={draft.monto_solicitado}
                    onChange={e => set('monto_solicitado', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Fecha de verificación
                  <input
                    type="date"
                    value={draft.fecha_verificacion}
                    onChange={e => set('fecha_verificacion', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">
                  Marco normativo
                  <input
                    value={draft.marco_normativo}
                    onChange={e => set('marco_normativo', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Objeto del gasto</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {draft.objetos_gasto.map(og => (
                      <span
                        key={og.id}
                        className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800"
                      >
                        {og.codigo}{og.descripcion ? ` — ${og.descripcion}` : ''}
                        <button
                          type="button"
                          onClick={() => set('objetos_gasto', draft.objetos_gasto.filter(x => x.id !== og.id))}
                          className="ml-0.5 text-teal-500 hover:text-rose-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2">
                    <FkSelect
                      value={ogPick}
                      onChange={v => { setOgPick(v); addObjetoGasto(v) }}
                      options={ogOptions}
                      placeholder="Agregar objeto de gasto…"
                    />
                  </div>
                  {draft.objetos_gasto.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">{formatObjetosGasto(draft.objetos_gasto)}</p>
                  )}
                </div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">
                  Elaborado por
                  <input
                    value={draft.elaborador_por}
                    onChange={e => set('elaborador_por', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-teal-700">
                  2. Verificación documental
                </h4>
                <button
                  type="button"
                  onClick={() => set('verificacion_documental', [
                    ...draft.verificacion_documental,
                    {
                      id: nid('it'),
                      aspecto: '',
                      estado: '' as EstadoVerif,
                      observaciones: '',
                    },
                  ])}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar ítem
                </button>
              </div>
              <div className="space-y-2">
                {draft.verificacion_documental.map((it, idx) => (
                  <div key={it.id} className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">#{idx + 1}</span>
                      <button
                        type="button"
                        disabled={draft.verificacion_documental.length <= 1}
                        onClick={() => set(
                          'verificacion_documental',
                          draft.verificacion_documental.filter(x => x.id !== it.id),
                        )}
                        className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.4fr_0.9fr_1.2fr]">
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Documento verificado
                        <input
                          value={it.aspecto}
                          onChange={e => patchItem(it.id, { aspecto: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-teal-500"
                        />
                        {it.detalle ? (
                          <span className="mt-1 block text-[11px] font-normal normal-case leading-snug text-slate-400">
                            {it.detalle}
                          </span>
                        ) : null}
                      </label>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Estado
                        <div className="mt-1">
                          <EstadoSelect
                            value={it.estado}
                            onChange={v => patchItem(it.id, { estado: v })}
                          />
                        </div>
                      </label>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Observaciones técnicas
                        <textarea
                          value={it.observaciones}
                          onChange={e => patchItem(it.id, { observaciones: e.target.value })}
                          rows={2}
                          className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-teal-500"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-teal-700">
                3. Observaciones
              </h4>
              <RichTextEditor
                value={draft.observaciones}
                onChange={html => set('observaciones', html)}
                placeholder="Observaciones generales del control de desembolso…"
              />
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar control
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({
          singular: 'control de desembolso',
          label: rows.find(r => r.id === deleteId)?.numero,
        })}
      />
    </>
  )
}
