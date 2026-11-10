export type MemoPersona = {
  nombre: string
  cargo: string
  funcionarioId?: string | null
}

export type MemoPersonasDraft = {
  de: MemoPersona
  para: MemoPersona
  cc: MemoPersona[]
}

const emptyPersona = (): MemoPersona => ({ nombre: '', cargo: '', funcionarioId: null })

const emptyDraft = (): MemoPersonasDraft => ({
  de: emptyPersona(),
  para: emptyPersona(),
  cc: [],
})

let draft: MemoPersonasDraft = emptyDraft()

export function emptyMemoPersona(): MemoPersona {
  return emptyPersona()
}

export function normalizeMemoPersona(p: Partial<MemoPersona> | null | undefined): MemoPersona {
  return {
    nombre: String(p?.nombre ?? '').trim(),
    cargo: String(p?.cargo ?? '').trim(),
    funcionarioId: p?.funcionarioId ? String(p.funcionarioId) : null,
  }
}

export function parseCcPersonas(
  raw: unknown,
  fallbackOtros: unknown = [],
): MemoPersona[] {
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(item => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const o = item as Record<string, unknown>
          return normalizeMemoPersona({
            nombre: String(o.nombre ?? o.nombre_completo ?? ''),
            cargo: String(o.cargo ?? ''),
            funcionarioId: o.funcionarioId != null ? String(o.funcionarioId) : null,
          })
        }
        return normalizeMemoPersona({ nombre: String(item ?? '') })
      })
      .filter(p => p.nombre)
  }
  const otros = Array.isArray(fallbackOtros) ? fallbackOtros : []
  return otros
    .map(s => normalizeMemoPersona({ nombre: String(s ?? '') }))
    .filter(p => p.nombre)
}

export function personaLineas(p: Partial<MemoPersona> | null | undefined): string[] {
  const nombre = String(p?.nombre ?? '').trim()
  const cargo = String(p?.cargo ?? '').trim()
  if (!nombre && !cargo) return ['---']
  if (nombre && cargo) return [nombre, cargo]
  return [nombre || cargo]
}

export function personaLabel(p: Partial<MemoPersona> | null | undefined): string {
  const nombre = String(p?.nombre ?? '').trim()
  const cargo = String(p?.cargo ?? '').trim()
  if (nombre && cargo) return `${nombre} · ${cargo}`
  return nombre || cargo || '—'
}

export function setMemoPersonasDraft(next: MemoPersonasDraft): void {
  draft = {
    de: normalizeMemoPersona(next.de),
    para: normalizeMemoPersona(next.para),
    cc: (next.cc ?? []).map(normalizeMemoPersona).filter(p => p.nombre || p.cargo),
  }
}

export function peekMemoPersonasDraft(): MemoPersonasDraft {
  return {
    de: { ...draft.de },
    para: { ...draft.para },
    cc: draft.cc.map(p => ({ ...p })),
  }
}

export function resetMemoPersonasDraft(next?: MemoPersonasDraft): void {
  draft = next
    ? {
        de: normalizeMemoPersona(next.de),
        para: normalizeMemoPersona(next.para),
        cc: (next.cc ?? []).map(normalizeMemoPersona),
      }
    : emptyDraft()
}
