import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  type MemoPersona,
  emptyMemoPersona,
  normalizeMemoPersona,
  parseCcPersonas,
  resetMemoPersonasDraft,
  setMemoPersonasDraft,
} from '../lib/memoPersonas'

type FuncionarioLite = {
  id: string
  nombre_completo: string | null
  cargo: string | null
}

function fromFuncionario(f: FuncionarioLite): MemoPersona {
  return {
    nombre: (f.nombre_completo ?? '').trim(),
    cargo: (f.cargo ?? '').trim(),
    funcionarioId: f.id,
  }
}

function PersonaSlot({
  label,
  required,
  value,
  onChange,
  funcionarios,
  placeholderNombre = 'Nombre y apellido',
}: {
  label: string
  required?: boolean
  value: MemoPersona
  onChange: (next: MemoPersona) => void
  funcionarios: FuncionarioLite[]
  placeholderNombre?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const suggestions = useMemo(() => {
    const term = value.nombre.trim().toLowerCase()
    if (term.length < 2) return []
    return funcionarios
      .filter(f => {
        const nombre = (f.nombre_completo ?? '').trim().toLowerCase()
        const cargo = (f.cargo ?? '').trim().toLowerCase()
        if (nombre === term) return false
        return nombre.includes(term) || cargo.includes(term)
      })
      .slice(0, 8)
  }, [value.nombre, funcionarios])

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}{required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </p>
      <div className="relative" ref={ref}>
        <input
          value={value.nombre}
          onChange={e => {
            const nombre = e.target.value
            const stillMatch = funcionarios.some(
              f => f.id === value.funcionarioId && (f.nombre_completo ?? '').trim() === nombre.trim(),
            )
            onChange({
              ...value,
              nombre,
              funcionarioId: stillMatch ? value.funcionarioId : null,
            })
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholderNombre}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {suggestions.map(f => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(fromFuncionario(f))
                    setOpen(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-violet-50"
                >
                  <span className="block font-medium text-slate-800">{(f.nombre_completo ?? '').trim() || 'Sin nombre'}</span>
                  {(f.cargo ?? '').trim() ? (
                    <span className="block text-xs text-slate-500">{(f.cargo ?? '').trim()}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        value={value.cargo}
        onChange={e => onChange({ ...value, cargo: e.target.value })}
        placeholder="Cargo"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
      />
    </div>
  )
}

export default function MemoPersonasFields({
  initial,
}: {
  initial?: Record<string, any> | null
}) {
  const [funcionarios, setFuncionarios] = useState<FuncionarioLite[]>([])
  const [de, setDe] = useState<MemoPersona>(() => normalizeMemoPersona({
    nombre: initial?.de_nombre || initial?.de?.nombre_completo,
    cargo: initial?.de_cargo || initial?.de?.cargo,
    funcionarioId: initial?.de_funcionario_id,
  }))
  const [para, setPara] = useState<MemoPersona>(() => normalizeMemoPersona({
    nombre: initial?.para_nombre || initial?.para?.nombre_completo,
    cargo: initial?.para_cargo || initial?.para?.cargo,
    funcionarioId: initial?.para_funcionario_id,
  }))
  const [cc, setCc] = useState<MemoPersona[]>(() => {
    const parsed = parseCcPersonas(initial?.cc_personas, initial?.cc_otros)
    return parsed.length ? parsed : []
  })

  useEffect(() => {
    let alive = true
    supabase
      .from('funcionarios')
      .select('id, nombre_completo, cargo')
      .order('nombre_completo')
      .limit(2000)
      .then(({ data }) => {
        if (!alive) return
        setFuncionarios((data ?? []).map(row => ({
          id: String(row.id),
          nombre_completo: row.nombre_completo ?? null,
          cargo: row.cargo ?? null,
        })))
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!funcionarios.length) return
    setCc(prev => {
      if (prev.length) return prev
      const parsed = parseCcPersonas(initial?.cc_personas, initial?.cc_otros)
      if (parsed.length) return parsed
      const ids = (initial?.cc_funcionario_ids ?? []).map((id: string) => String(id))
      return ids
        .map((id: string) => funcionarios.find(f => f.id === id))
        .filter(Boolean)
        .map(f => fromFuncionario(f as FuncionarioLite))
    })
    setDe(prev => {
      if (prev.nombre) return prev
      const f = funcionarios.find(x => x.id === String(initial?.de_funcionario_id ?? ''))
      return f ? fromFuncionario(f) : prev
    })
    setPara(prev => {
      if (prev.nombre) return prev
      const f = funcionarios.find(x => x.id === String(initial?.para_funcionario_id ?? ''))
      return f ? fromFuncionario(f) : prev
    })
  }, [funcionarios])

  useEffect(() => {
    resetMemoPersonasDraft({ de, para, cc })
    setMemoPersonasDraft({ de, para, cc })
  }, [de, para, cc])

  const addCc = () => setCc(prev => [...prev, emptyMemoPersona()])
  const updateCc = (idx: number, next: MemoPersona) => {
    setCc(prev => prev.map((p, i) => (i === idx ? next : p)))
  }
  const removeCc = (idx: number) => setCc(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className="sm:col-span-2 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PersonaSlot label="De" required value={de} onChange={setDe} funcionarios={funcionarios} />
        <PersonaSlot label="Para" required value={para} onChange={setPara} funcionarios={funcionarios} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">CC · Con copia</p>
            <p className="text-xs text-slate-500">Nombre y cargo. Puede escribirlos o elegir del catálogo.</p>
          </div>
          <button
            type="button"
            onClick={addCc}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>

        {cc.length === 0 && (
          <p className="text-xs text-slate-400">Sin copias. Use Agregar para incluir personas.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cc.map((p, idx) => (
            <div key={`cc-${idx}`} className="relative rounded-lg border border-slate-100 bg-white p-2.5">
              <button
                type="button"
                title="Quitar"
                onClick={() => removeCc(idx)}
                className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <PersonaSlot
                label={`CC ${idx + 1}`}
                value={p}
                onChange={next => updateCc(idx, next)}
                funcionarios={funcionarios}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
