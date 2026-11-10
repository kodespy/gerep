import { useCallback, useEffect, useMemo, useState } from 'react'
import CrudModule from '../../components/CrudModule'
import { Badge, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'

type OgLite = { id: string; codigo: string | null; descripcion: string | null }

function formatOgPrincipal(parent: OgLite | null | undefined): string {
  if (!parent) return '—'
  const codigo = (parent.codigo ?? '').toString().trim()
  const desc = (parent.descripcion ?? '').toString().trim()
  if (codigo && desc) return `${codigo} - ${desc}`
  return codigo || desc || '—'
}

function buildParentMap(rows: any[]): Record<string, OgLite> {
  const map: Record<string, OgLite> = {}
  for (const r of rows) {
    const lite = { id: String(r.id), codigo: r.codigo ?? null, descripcion: r.descripcion ?? null }
    map[String(r.id)] = lite
    const codigo = r.codigo != null ? String(r.codigo).trim() : ''
    if (codigo) map[`codigo:${codigo}`] = lite
  }
  return map
}

function resolveFromMap(map: Record<string, OgLite>, row: any): OgLite | null {
  const raw = row?.og_principal_id
  if (raw == null || String(raw).trim() === '') return null
  const key = String(raw).trim()
  return map[key] ?? map[`codigo:${key}`] ?? null
}

export function ObjetosGasto() {
  const [parentByKey, setParentByKey] = useState<Record<string, OgLite>>({})
  const [ready, setReady] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const loadParents = useCallback(async () => {
    const { data, error } = await supabase
      .from('objetos_de_gastos')
      .select('id,codigo,descripcion,og_principal_id')
      .limit(5000)

    if (error) {
      console.error('[objetos_de_gastos]', error.message)
      setParentByKey({})
      setReady(true)
      return
    }

    const rows = data ?? []
    const map = buildParentMap(rows)

    const refs = [...new Set(
      rows
        .map(r => r.og_principal_id)
        .filter((v: unknown): v is string | number => v != null && String(v).trim() !== '')
        .map(v => String(v).trim()),
    )]

    const missing = refs.filter(ref => !map[ref] && !map[`codigo:${ref}`])
    if (missing.length) {
      const [{ data: byId }, { data: byCodigo }] = await Promise.all([
        supabase.from('objetos_de_gastos').select('id,codigo,descripcion').in('id', missing),
        supabase.from('objetos_de_gastos').select('id,codigo,descripcion').in('codigo', missing),
      ])
      Object.assign(map, buildParentMap([...(byId ?? []), ...(byCodigo ?? [])]))
    }

    setParentByKey(map)
    setReady(true)
  }, [])

  useEffect(() => {
    setReady(false)
    void loadParents()
  }, [reloadKey, loadParents])

  const config = useMemo(() => ({
    table: 'objetos_de_gastos',
    title: 'Objetos de gasto',
    singular: 'Objeto de gasto',
    subtitle: 'Clasificador presupuestario de gastos (OG)',
    orderBy: { column: 'codigo', ascending: true as const },
    onMutated: () => setReloadKey(k => k + 1),
    transformRows: (rows: any[]) => {
      const local = { ...parentByKey, ...buildParentMap(rows) }
      return rows.map(r => ({
        ...r,
        __og_principal_label: formatOgPrincipal(resolveFromMap(local, r)),
      }))
    },
    columns: [
      { key: 'codigo', label: 'Código', render: (r: any) => <Badge color="brand">{r.codigo}</Badge> },
      { key: 'descripcion', label: 'Descripción' },
      {
        key: '__og_principal_label',
        label: 'OG principal',
        sortKey: '__og_principal_label',
        render: (r: any) => r.__og_principal_label || '—',
      },
    ],
    fields: [
      { name: 'codigo', label: 'Código', type: 'text' as const, required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' as const },
      {
        name: 'og_principal_id',
        label: 'OG principal (padre)',
        type: 'fk' as const,
        fk: {
          table: 'objetos_de_gastos',
          select: 'id,codigo,descripcion',
          label: (r: any) => (r.descripcion ? `${r.codigo} - ${r.descripcion}` : String(r.codigo ?? '')),
          orderBy: 'codigo',
        },
      },
    ],
  }), [parentByKey])

  if (!ready) return <Spinner label="Cargando objetos de gasto…" />

  return <CrudModule key={reloadKey} {...config} />
}
