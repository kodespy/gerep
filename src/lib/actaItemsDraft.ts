/** Borrador de ítems al crear un acta (antes de tener acta_id). */
export type ActaItemDraft = {
  plan_financiero_id: string
  monto_ejecutado: number
  /** Si está informado, el ítem corresponde a esa adenda (no al plan original). */
  adenda_id?: string | null
}

let draftItems: ActaItemDraft[] = []

function draftKey(item: ActaItemDraft): string {
  const a = String(item.adenda_id ?? '').trim()
  if (a) return `adenda:${a}`
  return `plan:${String(item.plan_financiero_id ?? '').trim()}`
}

export function setActaItemsDraft(items: ActaItemDraft[]) {
  const seen = new Set<string>()
  draftItems = []
  for (const item of items) {
    const planId = String(item.plan_financiero_id || '').trim()
    if (!planId) continue
    const key = draftKey({ ...item, plan_financiero_id: planId })
    if (seen.has(key)) continue
    seen.add(key)
    const adendaId = String(item.adenda_id ?? '').trim() || null
    draftItems.push({
      plan_financiero_id: planId,
      monto_ejecutado: Number(item.monto_ejecutado) || 0,
      adenda_id: adendaId,
    })
  }
}

export function getActaItemsDraft(): ActaItemDraft[] {
  return draftItems.map(i => ({ ...i }))
}

export function takeActaItemsDraft(): ActaItemDraft[] {
  const items = getActaItemsDraft()
  draftItems = []
  return items
}

export function clearActaItemsDraft() {
  draftItems = []
}
