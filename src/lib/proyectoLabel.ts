/** Etiqueta de proyecto: nombre - componente (código y descripción). */
export function proyectoConComponenteLabel(p: any): string {
  if (!p) return '—'
  const nested = Array.isArray(p) ? p[0] : p
  const proy = String(nested?.descripcion ?? '').trim() || 'Sin descripción'
  const raw = nested?.componente
  const comp = Array.isArray(raw) ? raw[0] : raw
  const codigo = String(comp?.codigo ?? '').trim()
  const desc = String(comp?.descripcion ?? '').trim()
  const compName = codigo && desc ? `${codigo} ${desc}` : (desc || codigo)
  return compName ? `${proy} - ${compName}` : proy
}
