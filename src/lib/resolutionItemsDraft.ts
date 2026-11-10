/** Borrador de ítems al crear una resolución (antes de tener resolution_id). */
export type ResolutionItemDraft = {
  key: string
  og_id: string
  monto: number
}

let draftItems: ResolutionItemDraft[] = []

export function newResolutionItemKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function setResolutionItemsDraft(items: ResolutionItemDraft[]) {
  draftItems = items
    .map(i => ({
      key: String(i.key || '').trim() || newResolutionItemKey(),
      og_id: String(i.og_id || '').trim(),
      monto: Number(i.monto) || 0,
    }))
    .filter(i => i.og_id)
}

export function getResolutionItemsDraft(): ResolutionItemDraft[] {
  return draftItems.map(i => ({ ...i }))
}

export function takeResolutionItemsDraft(): ResolutionItemDraft[] {
  const items = getResolutionItemsDraft()
  draftItems = []
  return items
}

export function clearResolutionItemsDraft() {
  draftItems = []
}
