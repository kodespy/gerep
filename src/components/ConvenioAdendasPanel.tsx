import { useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/format'
import { FileInput } from './fields'
import ArchivoAdjuntoLink from './ArchivoAdjuntoLink'
import { STORAGE_BUCKET_CONVENIOS_ADJUNTOS, uploadStorageFile } from '../lib/storage'
import {
  getConvenioAdendasDraft,
  newConvenioAdendaKey,
  setConvenioAdendasDraft,
  type ConvenioAdendaDraft,
} from '../lib/convenioAdendasDraft'

type AdendaRow = {
  id: string
  numero: string
  fecha: string | null
  archivo_firmado: string | null
}

function asRows(data: any[] | null): AdendaRow[] {
  return (data ?? []).map(r => ({
    id: String(r.id),
    numero: String(r.numero ?? '').trim(),
    fecha: r.fecha ? String(r.fecha).slice(0, 10) : null,
    archivo_firmado: r.archivo_firmado ? String(r.archivo_firmado) : null,
  }))
}

export default function ConvenioAdendasPanel({
  convenioId,
}: {
  convenioId?: string | null
}) {
  const [items, setItems] = useState<AdendaRow[]>([])
  const [draft, setDraft] = useState<ConvenioAdendaDraft[]>(() =>
    (!convenioId ? getConvenioAdendasDraft() : []),
  )
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [pickNumero, setPickNumero] = useState('')
  const [pickFecha, setPickFecha] = useState('')
  const [pickArchivo, setPickArchivo] = useState<string | File | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingPersisted, setEditingPersisted] = useState(false)
  const loadReq = useRef(0)

  useEffect(() => {
    setConvenioAdendasDraft(draft)
  }, [draft])

  const loadItems = async (): Promise<AdendaRow[]> => {
    if (!convenioId) return []
    const { data, error: err } = await supabase
      .from('convenio_adendas')
      .select('id, numero, fecha, archivo_firmado')
      .eq('convenio_id', convenioId)
      .order('fecha', { ascending: true })
      .order('numero', { ascending: true })
    if (err) throw err
    return asRows(data)
  }

  useEffect(() => {
    if (!convenioId) return
    const req = ++loadReq.current
    setLoading(true)
    setError(null)
    void loadItems()
      .then(rows => {
        if (req !== loadReq.current) return
        setItems(rows)
      })
      .catch(err => {
        if (req !== loadReq.current) return
        setError(err?.message ?? 'No se pudieron cargar las adendas.')
      })
      .finally(() => {
        if (req !== loadReq.current) return
        setLoading(false)
      })
  }, [convenioId])

  const resetForm = () => {
    setOpenForm(false)
    setEditingKey(null)
    setEditingPersisted(false)
    setPickNumero('')
    setPickFecha('')
    setPickArchivo(null)
  }

  const startAdd = () => {
    setEditingKey(null)
    setEditingPersisted(false)
    setPickNumero('')
    setPickFecha('')
    setPickArchivo(null)
    setOpenForm(true)
    setError(null)
  }

  const startEdit = (row: { key: string; numero: string; fecha: string | null; archivo: File | string | null; persisted: boolean }) => {
    setEditingKey(row.key)
    setEditingPersisted(row.persisted)
    setPickNumero(row.numero)
    setPickFecha(row.fecha ?? '')
    setPickArchivo(row.archivo)
    setOpenForm(true)
    setError(null)
  }

  const persistPath = async (convenioKey: string, archivo: File | string | null): Promise<string | null> => {
    if (archivo instanceof File) {
      return uploadStorageFile(STORAGE_BUCKET_CONVENIOS_ADJUNTOS, `convenios/adendas/${convenioKey}`, archivo)
    }
    const path = typeof archivo === 'string' ? archivo.trim() : ''
    return path || null
  }

  const saveItem = async () => {
    const numero = pickNumero.trim()
    if (!numero) {
      setError('Indique el número de la adenda.')
      return
    }
    const fecha = pickFecha.trim() ? pickFecha.trim().slice(0, 10) : null
    setBusy(true)
    setError(null)
    try {
      if (!convenioId) {
        setDraft(prev => {
          if (editingKey) {
            return prev.map(d =>
              d.key === editingKey ? { ...d, numero, fecha, archivo: pickArchivo } : d,
            )
          }
          return [...prev, { key: newConvenioAdendaKey(), numero, fecha, archivo: pickArchivo }]
        })
      } else if (editingKey && editingPersisted) {
        const path = await persistPath(convenioId, pickArchivo)
        const { error: err } = await supabase
          .from('convenio_adendas')
          .update({ numero, fecha, archivo_firmado: path })
          .eq('id', editingKey)
        if (err) throw err
        setItems(await loadItems())
      } else {
        const path = await persistPath(convenioId, pickArchivo)
        const { data: session } = await supabase.auth.getUser()
        const row: Record<string, any> = {
          convenio_id: convenioId,
          numero,
          fecha,
          archivo_firmado: path,
        }
        if (session.user) row.created_by = session.user.id
        const { error: err } = await supabase.from('convenio_adendas').insert(row)
        if (err) throw err
        setItems(await loadItems())
      }
      resetForm()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la adenda.')
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (key: string, persisted: boolean) => {
    if (!confirm(persisted
      ? '¿Desea eliminar esta adenda? Esta acción no se puede deshacer.'
      : '¿Desea quitar esta adenda del borrador?')) return
    setBusy(true)
    setError(null)
    try {
      if (!persisted || !convenioId) {
        setDraft(prev => prev.filter(d => d.key !== key))
      } else {
        const { error: err } = await supabase.from('convenio_adendas').delete().eq('id', key)
        if (err) throw err
        setItems(await loadItems())
      }
      if (editingKey === key) resetForm()
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo quitar la adenda.')
    } finally {
      setBusy(false)
    }
  }

  const listed = convenioId
    ? items.map(i => ({
        key: i.id,
        numero: i.numero,
        fecha: i.fecha,
        archivo: i.archivo_firmado,
        persisted: true,
      }))
    : draft.map(d => ({
        key: d.key,
        numero: d.numero,
        fecha: d.fecha,
        archivo: d.archivo,
        persisted: false,
      }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Adendas</h4>
          <p className="text-[11px] text-slate-400">
            El convenio puede no tener adenda, o tener una o varias. Cada una admite un PDF firmado.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => (openForm && !editingKey ? resetForm() : startAdd())}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {openForm && !editingKey ? 'Cerrar' : 'Agregar adenda'}
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {openForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-950/20">
          <div className="text-xs font-semibold text-brand-800 dark:text-brand-200">
            {editingKey ? 'Modificar adenda' : 'Nueva adenda'}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">N° de adenda</label>
              <input
                type="text"
                value={pickNumero}
                onChange={e => setPickNumero(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400"
                placeholder="Ej. 1 / I"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Fecha</label>
              <input
                type="date"
                value={pickFecha}
                onChange={e => setPickFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">PDF firmado</label>
            <FileInput
              value={pickArchivo}
              onChange={setPickArchivo}
              accept=".pdf"
              bucket={STORAGE_BUCKET_CONVENIOS_ADJUNTOS}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pickNumero.trim() || busy}
              onClick={() => void saveItem()}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'Guardando…' : editingKey ? 'Guardar cambios' : 'Agregar adenda'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetForm}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!listed.length && !loading ? (
        <p className="text-sm text-slate-400">Sin adendas.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {listed.map(row => (
            <li key={row.key} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{row.numero}</span>
                {row.fecha ? (
                  <span className="ml-2 text-xs text-slate-500">{fmtDate(row.fecha)}</span>
                ) : null}
              </span>
              {typeof row.archivo === 'string' && row.archivo ? (
                <ArchivoAdjuntoLink
                  path={row.archivo}
                  bucket={STORAGE_BUCKET_CONVENIOS_ADJUNTOS}
                  badgeCount={1}
                />
              ) : row.archivo instanceof File ? (
                <span className="truncate text-[11px] text-brand-700">{row.archivo.name}</span>
              ) : (
                <span className="text-[11px] text-slate-400">Sin PDF</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => startEdit(row)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeItem(row.key, row.persisted)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
