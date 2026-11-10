/** Borrador de proyectos al crear una resolución (antes de tener resolution_id). */
export type ResolutionProyectoDraft = {
  key: string
  proyecto_id: string
}

let draftItems: ResolutionProyectoDraft[] = []

export function newResolutionProyectoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function setResolutionProyectosDraft(items: ResolutionProyectoDraft[]) {
  const seen = new Set<string>()
  draftItems = []
  for (const item of items) {
    const pid = String(item.proyecto_id || '').trim()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    draftItems.push({
      key: String(item.key || '').trim() || newResolutionProyectoKey(),
      proyecto_id: pid,
    })
  }
}

export function getResolutionProyectosDraft(): ResolutionProyectoDraft[] {
  return draftItems.map(i => ({ ...i }))
}

export function takeResolutionProyectosDraft(): ResolutionProyectoDraft[] {
  const items = getResolutionProyectosDraft()
  draftItems = []
  return items
}

export function clearResolutionProyectosDraft() {
  draftItems = []
}
