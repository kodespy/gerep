/** Tamaño de página PostgREST (límite por request). */
const PAGE = 1000

type PageResult = {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

type RangeQuery = {
  range: (from: number, to: number) => PromiseLike<PageResult>
}

/**
 * Ejecuta un query Supabase en páginas `.range()` hasta agotar filas o `maxRows`.
 * Si el `select` se armó con `{ count: 'exact' }`, sigue hasta cubrir el total.
 * Avanza el offset por filas recibidas (no por PAGE fijo) por si el embed pesado
 * devuelve menos filas de las pedidas sin haber terminado.
 * `build` debe devolver un query fresco en cada llamada (sin `.limit`/`.range` previos).
 */
export async function supabaseFetchAll<T = any>(
  build: () => RangeQuery,
  maxRows = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  let from = 0
  let total: number | null = null

  while (from < maxRows) {
    const to = Math.min(from + PAGE - 1, maxRows - 1)
    const { data, error, count } = await build().range(from, to)
    if (error) return { data: all, error }
    if (typeof count === 'number' && total == null) total = count
    const chunk = (data as T[]) ?? []
    if (chunk.length === 0) break
    all.push(...chunk)
    if (total != null && all.length >= Math.min(total, maxRows)) break
    from += chunk.length
    // Sin count: si no llenó la página, no hay más
    if (total == null && chunk.length < PAGE) break
  }

  return { data: all, error: null }
}
