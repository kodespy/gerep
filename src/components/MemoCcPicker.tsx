import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { resetMemoCcDraft, setMemoCcDraft } from '../lib/memoCcDraft'

type FuncionarioLite = {
  id: string
  nombre_completo: string | null
  cargo: string | null
  area?: { nombre: string | null } | { nombre: string | null }[] | null
}

function labelOf(f: FuncionarioLite): string {
  const nombre = (f.nombre_completo ?? '').trim() || 'Sin nombre'
  const cargo = (f.cargo ?? '').trim()
  const areaRaw = Array.isArray(f.area) ? f.area[0] : f.area
  const area = (areaRaw?.nombre ?? '').trim()
  return [nombre, cargo, area].filter(Boolean).join(' · ')
}

export default function MemoCcPicker({
  initialIds = [],
  initialOtros = [],
}: {
  initialIds?: string[]
  initialOtros?: string[]
}) {
  const [funcionarios, setFuncionarios] = useState<FuncionarioLite[]>([])
  const [ids, setIds] = useState<string[]>(() => initialIds.map(String).filter(Boolean))
  const [otros, setOtros] = useState<string[]>(() => initialOtros.map(s => String(s).trim()).filter(Boolean))
  const [q, setQ] = useState('')
  const [extra, setExtra] = useState('')

  useEffect(() => {
    let alive = true
    supabase
      .from('funcionarios')
      .select('id, nombre_completo, cargo, area:areas(nombre)')
      .order('nombre_completo')
      .limit(2000)
      .then(({ data }) => {
        if (!alive) return
        setFuncionarios((data ?? []).map(row => ({
          id: String(row.id),
          nombre_completo: row.nombre_completo ?? null,
          cargo: row.cargo ?? null,
          area: row.area ?? null,
        })))
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    resetMemoCcDraft({ funcionarioIds: ids, otros })
    setMemoCcDraft({ funcionarioIds: ids, otros })
  }, [ids, otros])

  const selected = useMemo(
    () => ids.map(id => funcionarios.find(f => f.id === id)).filter(Boolean) as FuncionarioLite[],
    [ids, funcionarios],
  )

  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    return funcionarios
      .filter(f => !ids.includes(f.id) && labelOf(f).toLowerCase().includes(term))
      .slice(0, 8)
  }, [q, funcionarios, ids])

  const addOtro = () => {
    const t = extra.trim()
    if (!t || otros.includes(t)) return
    setOtros(prev => [...prev, t])
    setExtra('')
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">CC · Con copia</p>
      <p className="text-xs text-slate-500">Puede incluir varias personas del catálogo de funcionarios y nombres adicionales.</p>

      {(selected.length > 0 || otros.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(f => (
            <span
              key={f.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800"
            >
              <span className="truncate">{labelOf(f)}</span>
              <button
                type="button"
                title="Quitar"
                onClick={() => setIds(prev => prev.filter(id => id !== f.id))}
                className="rounded-full p-0.5 hover:bg-violet-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {otros.map(name => (
            <span
              key={name}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                title="Quitar"
                onClick={() => setOtros(prev => prev.filter(n => n !== name))}
                className="rounded-full p-0.5 hover:bg-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar funcionario para agregar a CC…"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {suggestions.map(f => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIds(prev => [...prev, f.id])
                    setQ('')
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-violet-50"
                >
                  {labelOf(f)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={extra}
          onChange={e => setExtra(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addOtro()
            }
          }}
          placeholder="Otra persona (nombre y cargo, si no está en el catálogo)"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <button
          type="button"
          onClick={addOtro}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
    </div>
  )
}
