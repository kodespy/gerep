export type MemoCcDraft = {
  funcionarioIds: string[]
  otros: string[]
}

const empty = (): MemoCcDraft => ({ funcionarioIds: [], otros: [] })

let draft: MemoCcDraft = empty()

export function setMemoCcDraft(next: MemoCcDraft): void {
  draft = {
    funcionarioIds: [...new Set(next.funcionarioIds.map(String).filter(Boolean))],
    otros: next.otros.map(s => s.trim()).filter(Boolean),
  }
}

export function peekMemoCcDraft(): MemoCcDraft {
  return {
    funcionarioIds: [...draft.funcionarioIds],
    otros: [...draft.otros],
  }
}

export function resetMemoCcDraft(next?: MemoCcDraft): void {
  draft = next ? { funcionarioIds: [...next.funcionarioIds], otros: [...next.otros] } : empty()
}
