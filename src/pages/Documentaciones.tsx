import { useMemo, useState } from 'react'
import { BookOpen, Check, FileDown, Loader2 } from 'lucide-react'
import {
  DOCUMENTACION_MODULOS,
  docModulosByKeys,
  docModulosPorSeccion,
} from '../lib/documentacionModulos'
import { exportDocumentacionPdf } from '../lib/documentacionPdf'
import { Badge, Card, PageHeader } from '../components/ui'

export default function Documentaciones() {
  const allKeys = useMemo(() => DOCUMENTACION_MODULOS.map(m => m.key), [])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allKeys))
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => docModulosPorSeccion(), [])
  const selectedCount = selected.size

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(allKeys))
  const clearAll = () => setSelected(new Set())

  const generate = async () => {
    setError(null)
    const mods = docModulosByKeys([...selected])
    if (!mods.length) {
      setError('Seleccione al menos un módulo.')
      return
    }
    setExporting(true)
    try {
      await exportDocumentacionPdf(mods)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el documento.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentaciones"
        subtitle="Guías paso a paso de la funcionalidad de cada módulo. Seleccione y genere un PDF."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-300"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-300"
            >
              Ninguno
            </button>
            <button
              type="button"
              disabled={exporting || selectedCount === 0}
              onClick={() => void generate()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generar documento
            </button>
          </div>
        )}
      />

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <BookOpen className="h-5 w-5 text-brand-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            {selectedCount} de {allKeys.length} módulos seleccionados
          </p>
          <p className="text-xs text-slate-500">
            El PDF incluye resumen, ruta y pasos numerados por cada módulo marcado.
          </p>
        </div>
        <Badge color="brand">{DOCUMENTACION_MODULOS.length} guías</Badge>
      </Card>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="space-y-4">
        {groups.map(g => (
          <Card key={g.section} className="overflow-hidden p-0">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{g.section}</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {g.items.map(m => {
                const on = selected.has(m.key)
                return (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => toggle(m.key)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                        on ? 'bg-brand-50/40' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          on
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{m.label}</span>
                          <span className="text-[11px] font-medium text-slate-400">{m.ruta}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {m.pasos.length} pasos
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{m.resumen}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}
