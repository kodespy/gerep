/** Normaliza texto de documento/ítem para emparejar con el catálogo. */
export function normStrControlDoc(s: string | null | undefined): string {
  let t = (s ?? '').replace(/\s+/g, ' ').trim()
  const opens = (t.match(/\(/g) || []).length
  const closes = (t.match(/\)/g) || []).length
  // Datos históricos a veces traen ")" final suelto (ej. "Proyecto Original)")
  if (closes > opens && t.endsWith(')')) t = t.slice(0, -1).trim()
  return t.toLowerCase()
}

type WithDocumento = {
  documento?: string | null
  created_at?: string | null
}

type PredefOrden = {
  orden: number | null
  descripcion: string | null
}

/** Ordena filas de control según `orden` de str_control_items_predefinidos. */
export function sortStrControlByPredefOrden<T extends WithDocumento>(
  items: T[],
  predefs: PredefOrden[],
): T[] {
  const orderMap = new Map<string, number>()
  for (const p of predefs) {
    const key = normStrControlDoc(p.descripcion)
    if (!key) continue
    const orden = Number(p.orden)
    if (!Number.isFinite(orden)) continue
    if (!orderMap.has(key) || orden < (orderMap.get(key) as number)) {
      orderMap.set(key, orden)
    }
  }

  return [...items].sort((a, b) => {
    const oa = orderMap.get(normStrControlDoc(a.documento))
    const ob = orderMap.get(normStrControlDoc(b.documento))
    const aKnown = oa != null
    const bKnown = ob != null
    if (aKnown && bKnown && oa !== ob) return oa - ob
    if (aKnown && !bKnown) return -1
    if (!aKnown && bKnown) return 1
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}
