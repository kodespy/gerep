export type ConvenioAdendaDraft = {
  key: string
  numero: string
  fecha: string | null
  archivo: File | string | null
}

let draftItems: ConvenioAdendaDraft[] = []

export function newConvenioAdendaKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function setConvenioAdendasDraft(items: ConvenioAdendaDraft[]) {
  draftItems = items
    .map(i => ({
      key: String(i.key || '').trim() || newConvenioAdendaKey(),
      numero: String(i.numero || '').trim(),
      fecha: i.fecha ? String(i.fecha).slice(0, 10) : null,
      archivo: i.archivo ?? null,
    }))
    .filter(i => i.numero)
}

export function getConvenioAdendasDraft(): ConvenioAdendaDraft[] {
  return draftItems.map(i => ({ ...i }))
}

export function takeConvenioAdendasDraft(): ConvenioAdendaDraft[] {
  const items = getConvenioAdendasDraft()
  draftItems = []
  return items
}

export function clearConvenioAdendasDraft() {
  draftItems = []
}
