import { useRef, useState } from 'react'
import { FolderUp, Loader2, Upload } from 'lucide-react'
import { Modal } from './ui'
import { useAuth } from '../context/AuthContext'
import { isDesarrollador } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { parseMemoDocxFile, fileLooksLikeDocx, type ParsedMemoDocx } from '../lib/memoDocx'
import { normalizeMemoNumero } from '../lib/memoNumero'
import { supabaseFetchAll } from '../lib/supabaseFetchAll'

type PreviewRow = {
  id: string
  fileName: string
  parsed: ParsedMemoDocx | null
  error: string | null
  duplicate: boolean
  selected: boolean
}

function issuesOf(p: ParsedMemoDocx | null, duplicate: boolean): string[] {
  if (!p) return []
  const issues: string[] = []
  if (duplicate) issues.push('N° ya existe')
  if (!p.numero) issues.push('Sin N°')
  if (!p.fecha) issues.push('Sin fecha')
  if (!p.deNombre) issues.push('Sin De')
  if (!p.paraNombre) issues.push('Sin Para')
  if (!p.asunto) issues.push('Sin asunto')
  if (!p.cuerpoTexto) issues.push('Sin cuerpo')
  return issues
}

function canImport(row: PreviewRow): boolean {
  if (!row.parsed || row.error || !row.selected) return false
  const p = row.parsed
  return Boolean(p.numero && p.fecha && p.deNombre && p.paraNombre && p.asunto)
}

export default function MemoCargaMasiva({ onImported }: { onImported: () => void }) {
  const { profile } = useAuth()
  const folderRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  if (!isDesarrollador(profile?.role)) return null

  const ready = rows.filter(canImport)
  const skipped = rows.filter(r => r.error || (r.parsed && !canImport({ ...r, selected: true })))

  const close = () => {
    if (importing) return
    setOpen(false)
    setRows([])
    setMessage(null)
  }

  const loadFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter(f => f.size > 0 && !f.name.startsWith('.'))
    if (!incoming.length) {
      setMessage('No se encontraron archivos en la selección.')
      setOpen(true)
      return
    }
    setLoading(true)
    setMessage(null)
    setOpen(true)
    try {
      const docx: File[] = []
      for (const file of incoming) {
        if (await fileLooksLikeDocx(file)) docx.push(file)
      }
      if (!docx.length) {
        setRows([])
        setMessage('No hay Word .docx en la carpeta (el .doc antiguo no se importa).')
        return
      }

      const { data: existing, error } = await supabaseFetchAll<{ numero: string | null }>(
        () => supabase.from('memos').select('numero'),
        8000,
      )
      if (error) throw new Error(error.message)
      const taken = new Set(
        (existing ?? []).map(r => normalizeMemoNumero(r.numero)).filter(Boolean) as string[],
      )

      const seen = new Set<string>()
      const next: PreviewRow[] = []
      for (const file of docx) {
        const id = `${file.webkitRelativePath || file.name}:${file.size}`
        try {
          const parsed = await parseMemoDocxFile(file)
          const num = parsed.numero
          const duplicate = Boolean(num && (taken.has(num) || seen.has(num)))
          if (num) seen.add(num)
          next.push({
            id,
            fileName: file.name,
            parsed,
            error: null,
            duplicate,
            selected: !duplicate && Boolean(num && parsed.fecha && parsed.deNombre && parsed.paraNombre && parsed.asunto),
          })
        } catch (e: any) {
          next.push({
            id,
            fileName: file.name,
            parsed: null,
            error: e?.message || 'No se pudo leer el archivo.',
            duplicate: false,
            selected: false,
          })
        }
      }
      next.sort((a, b) => String(a.parsed?.numero || a.fileName).localeCompare(String(b.parsed?.numero || b.fileName), 'es'))
      setRows(next)
    } catch (e: any) {
      setRows([])
      setMessage(e?.message || 'No se pudieron leer los archivos.')
    } finally {
      setLoading(false)
      if (folderRef.current) folderRef.current.value = ''
      if (filesRef.current) filesRef.current.value = ''
    }
  }

  const importSelected = async () => {
    if (!isDesarrollador(profile?.role)) return
    const toSave = rows.filter(canImport)
    if (!toSave.length) return
    setImporting(true)
    setMessage(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null
      const payloads = toSave.map(row => {
        const p = row.parsed!
        const cc = p.cc.filter(c => c.nombre)
        return {
          numero: p.numero,
          fecha: p.fecha,
          de_nombre: p.deNombre,
          de_cargo: p.deCargo || null,
          para_nombre: p.paraNombre,
          para_cargo: p.paraCargo || null,
          cc_personas: cc.map(c => ({ nombre: c.nombre, cargo: c.cargo, funcionarioId: null })),
          cc_funcionario_ids: [],
          cc_otros: cc.filter(c => c.nombre).map(c => [c.nombre, c.cargo].filter(Boolean).join(', ')),
          asunto: p.asunto,
          cuerpo: p.cuerpoHtml || `<p class="ql-align-justify">${p.cuerpoTexto}</p>`,
          ...(uid ? { created_by: uid } : {}),
        }
      })

      let inserted = 0
      const errors: string[] = []
      for (let i = 0; i < payloads.length; i += 20) {
        const chunk = payloads.slice(i, i + 20)
        const { data, error } = await supabase.from('memos').insert(chunk).select('id,numero')
        if (error) {
          errors.push(error.message)
          continue
        }
        inserted += data?.length ?? chunk.length
      }
      if (errors.length && !inserted) throw new Error(errors[0])
      setMessage(
        errors.length
          ? `Se importaron ${inserted} memo(s). Algunos fallaron: ${errors[0]}`
          : `Se importaron ${inserted} memorándum(s).`,
      )
      onImported()
      if (!errors.length) {
        setRows([])
        setOpen(false)
        setMessage(null)
      }
    } catch (e: any) {
      setMessage(e?.message || 'No se pudieron insertar los memos.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        multiple
        // @ts-expect-error webkitdirectory no está en el tipado estándar
        webkitdirectory=""
        directory=""
        onChange={e => {
          if (e.target.files?.length) void loadFiles(e.target.files)
        }}
      />
      <input
        ref={filesRef}
        type="file"
        className="hidden"
        multiple
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={e => {
          if (e.target.files?.length) void loadFiles(e.target.files)
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Importar memorándums Word desde una carpeta"
          onClick={() => folderRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          <FolderUp className="h-4 w-4" /> Carga masiva
        </button>
      </div>

      <Modal open={open} onClose={close} title="Carga masiva de memorándums" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Se leen archivos Word (.docx), incluso sin extensión. Extrae N°, fecha, De, Para, asunto y cuerpo.
            Los N° que ya existen no se vuelven a cargar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FolderUp className="h-4 w-4" /> Elegir carpeta
            </button>
            <button
              type="button"
              onClick={() => filesRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> Elegir archivos
            </button>
          </div>

          {loading && (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo Word…
            </p>
          )}
          {message && <p className="text-sm text-amber-800">{message}</p>}

          {rows.length > 0 && (
            <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2"> </th>
                    <th className="px-2 py-2">N°</th>
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Asunto</th>
                    <th className="px-2 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const issues = row.error ? [row.error] : issuesOf(row.parsed, row.duplicate)
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            disabled={!row.parsed || Boolean(row.error) || !row.parsed.numero || !row.parsed.fecha || !row.parsed.deNombre || !row.parsed.paraNombre || !row.parsed.asunto}
                            checked={row.selected}
                            onChange={e => {
                              const on = e.target.checked
                              setRows(prev => prev.map(r => (r.id === row.id ? { ...r, selected: on } : r)))
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 font-medium">{row.parsed?.numero || '—'}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{row.parsed?.fecha || '—'}</td>
                        <td className="max-w-[18rem] px-2 py-2">
                          <span className="line-clamp-2" title={row.fileName}>
                            {row.parsed?.asunto || row.fileName}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {issues.length ? (
                            <span className="text-amber-700">{issues.join(' · ')}</span>
                          ) : (
                            <span className="text-emerald-700">Listo</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {ready.length} para importar
              {skipped.length ? ` · ${skipped.length} con aviso` : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={!ready.length || importing}
                onClick={() => void importSelected()}
                className="gradient-primary inline-flex items-center gap-1.5 rounded-[0.9rem] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Importar {ready.length || ''}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
