import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, Pencil, Trash2, Network } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card, Modal, ConfirmDialog, DeleteBlockedDialog, Spinner, PageHeader, Badge, EmptyState } from '../../components/ui'
import { RecordForm, type FieldDef } from '../../components/CrudModule'
import { fmtMoney, fmtMoneyCompact } from '../../lib/format'
import {
  deleteConfirmMessage,
  findDeleteVinculos,
  friendlyDeleteError,
  safeDeleteById,
  type DeleteVinculo,
} from '../../lib/deleteGuard'

/** Definición de los 6 niveles de la estructura programática (SNIP). */
interface LevelDef {
  key: string
  table: string
  label: string
  childKey?: string          // clave del siguiente nivel
  parentColumn?: string      // FK hacia el nivel superior
  fields: FieldDef[]
  title: (r: any) => string
  subtitle?: (r: any) => string
  color: string
}

const LEVELS: Record<string, LevelDef> = {
  programa: {
    key: 'programa', table: 'programas', label: 'Programa', childKey: 'componente',
    fields: [
      { name: 'codigo', label: 'Código', type: 'text', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    title: r => r.codigo, subtitle: r => r.descripcion ?? '', color: 'bg-brand-600',
  },
  componente: {
    key: 'componente', table: 'componentes_programa', label: 'Componente', childKey: 'subcomponente', parentColumn: 'programa_id',
    fields: [
      { name: 'codigo', label: 'Código', type: 'text', required: true },
      { name: 'actividad_id', label: 'Actividad presupuestaria', type: 'fk', fk: { table: 'actividades', select: 'id,codigo,descripcion', label: r => r.codigo, sub: r => r.descripcion ?? '', orderBy: 'codigo' } },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    title: r => r.codigo, subtitle: r => r.descripcion ?? '', color: 'bg-sky-600',
  },
  subcomponente: {
    key: 'subcomponente', table: 'subcomponentes_programa', label: 'Subcomponente', childKey: 'item', parentColumn: 'componente_snip_id',
    fields: [
      { name: 'codigo', label: 'Código', type: 'text', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    title: r => r.codigo, subtitle: r => r.descripcion ?? '', color: 'bg-violet-600',
  },
  item: {
    key: 'item', table: 'items_programa', label: 'Ítem', childKey: 'subitem', parentColumn: 'subcomponente_snip_id',
    fields: [
      { name: 'codigo', label: 'Código', type: 'text', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    title: r => r.codigo, subtitle: r => r.descripcion ?? '', color: 'bg-amber-600',
  },
  subitem: {
    key: 'subitem', table: 'subitems_programa', label: 'Subítem', childKey: 'presupuesto', parentColumn: 'item_snip_id',
    fields: [
      { name: 'og', label: 'Objeto de gasto (OG)', type: 'text', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
    title: r => `OG ${r.og}`, subtitle: r => r.descripcion ?? '', color: 'bg-rose-600',
  },
  presupuesto: {
    key: 'presupuesto', table: 'presupuestos_programa', label: 'Presupuesto anual', parentColumn: 'subitem_snip_id',
    fields: [
      { name: 'año_fiscal', label: 'Año fiscal', type: 'number', required: true, defaultValue: new Date().getFullYear() },
      { name: 'monto', label: 'Monto', type: 'money', required: true },
    ],
    title: r => String(r['año_fiscal']), color: 'bg-emerald-600',
  },
}

type Data = Record<string, any[]>

export default function ProgramasExplorer() {
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<{ level: LevelDef; parentId?: string; row?: any } | null>(null)
  const [deleting, setDeleting] = useState<{ level: LevelDef; row: any } | null>(null)
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null)
  const [blockedDelete, setBlockedDelete] = useState<{ level: LevelDef; row: any; vinculos: DeleteVinculo[] } | null>(null)

  const load = async () => {
    setLoading(true)
    const entries = await Promise.all(Object.values(LEVELS).map(async l => {
      const { data } = await supabase.from(l.table).select('*').limit(2000)
      return [l.key, data ?? []] as const
    }))
    setData(Object.fromEntries(entries))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /** hijos por nivel+padre */
  const childrenOf = (levelKey: string, parentId: string | null): any[] => {
    const level = LEVELS[levelKey]
    const rows = data[levelKey] ?? []
    if (!level.parentColumn) return rows
    return rows.filter(r => r[level.parentColumn!] === parentId)
  }

  /** monto consolidado: suma de presupuestos bajo el nodo */
  const totals = useMemo(() => {
    const map = new Map<string, number>()
    const sum = (levelKey: string, id: string): number => {
      const cacheKey = levelKey + id
      if (map.has(cacheKey)) return map.get(cacheKey)!
      const level = LEVELS[levelKey]
      let total = 0
      if (levelKey === 'presupuesto') {
        const row = (data['presupuesto'] ?? []).find(r => r.id === id)
        total = Number(row?.monto) || 0
      } else if (level.childKey) {
        for (const child of childrenOf(level.childKey, id)) total += sum(level.childKey, child.id)
      }
      map.set(cacheKey, total)
      return total
    }
    return { sum }
  }, [data])

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const save = async (level: LevelDef, values: Record<string, any>, row?: any, parentId?: string) => {
    if (row) {
      const { error } = await supabase.from(level.table).update(values).eq('id', row.id)
      if (error) throw error
    } else {
      const payload: Record<string, any> = { ...values }
      if (level.parentColumn && parentId) payload[level.parentColumn] = parentId
      const { data: u } = await supabase.auth.getUser()
      if (u.user) payload.user_id = u.user.id
      const { error } = await supabase.from(level.table).insert(payload)
      if (error) throw error
    }
    setModal(null)
    await load()
  }

  const tryDelete = async (level: LevelDef, row: any) => {
    const id = String(row.id)
    setCheckingDeleteId(id)
    try {
      const vinculos = await findDeleteVinculos(level.table, id)
      if (vinculos.length > 0) setBlockedDelete({ level, row, vinculos })
      else setDeleting({ level, row })
    } finally {
      setCheckingDeleteId(null)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await safeDeleteById(deleting.level.table, String(deleting.row.id))
      setDeleting(null)
      await load()
    } catch (err: any) {
      alert(friendlyDeleteError(err) || err?.message || 'No se pudo eliminar el registro.')
      setDeleting(null)
    }
  }

  const renderNode = (levelKey: string, row: any, depth: number) => {
    const level = LEVELS[levelKey]
    const isLeaf = !level.childKey
    const kids = level.childKey ? childrenOf(level.childKey, row.id) : []
    const open = expanded.has(row.id)
    const total = totals.sum(levelKey, row.id)

    if (levelKey === 'presupuesto') {
      return (
        <div key={row.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50" style={{ marginLeft: depth * 22 }}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${level.color}`} />
          <Badge color="green">{row['año_fiscal']}</Badge>
          <span className="text-sm font-semibold tabular-nums text-slate-700">{fmtMoney(row.monto)}</span>
          <span className="ml-auto hidden items-center gap-1 group-hover:flex">
            <button onClick={() => setModal({ level, row })} className="rounded p-1 text-slate-400 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => void tryDelete(level, row)} disabled={checkingDeleteId === String(row.id)} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      )
    }

    return (
      <div key={row.id}>
        <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50" style={{ marginLeft: depth * 22 }}>
          <button onClick={() => toggle(row.id)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200">
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          <span className={`flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold uppercase text-white ${level.color}`}>
            {level.label}
          </span>
          <span className="truncate text-sm font-semibold text-slate-700">{level.title(row)}</span>
          {level.subtitle && <span className="truncate text-sm text-slate-400">{level.subtitle(row)}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {total > 0 && <span className="text-xs font-semibold tabular-nums text-emerald-700">{fmtMoneyCompact(total)}</span>}
            <span className="text-[11px] text-slate-300">{kids.length}</span>
            <span className="hidden items-center gap-1 group-hover:flex">
              {level.childKey && (
                <button title={`Agregar ${LEVELS[level.childKey].label.toLowerCase()}`}
                  onClick={() => { setModal({ level: LEVELS[level.childKey!], parentId: row.id }); setExpanded(p => new Set(p).add(row.id)) }}
                  className="rounded p-1 text-slate-400 hover:text-emerald-600"><Plus className="h-3.5 w-3.5" /></button>
              )}
              <button onClick={() => setModal({ level, row })} className="rounded p-1 text-slate-400 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => void tryDelete(level, row)} disabled={checkingDeleteId === String(row.id)} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          </span>
        </div>
        {open && !isLeaf && (
          <div className="border-l border-slate-100" style={{ marginLeft: depth * 22 + 11 }}>
            {kids.length === 0
              ? <p className="py-1 pl-6 text-xs italic text-slate-300">Sin {LEVELS[level.childKey!].label.toLowerCase()}s — use el botón + para agregar</p>
              : kids.map(k => renderNode(level.childKey!, k, 1))}
          </div>
        )}
      </div>
    )
  }

  const programas = data['programa'] ?? []

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Planificación"
        title="Estructura programática"
        subtitle="Árbol completo: Programa → Componente → Subcomponente → Ítem → Subítem → Presupuesto anual"
        actions={
          <button onClick={() => setModal({ level: LEVELS.programa })}
            className="gradient-primary flex items-center gap-1.5 rounded-[0.9rem] px-3.5 py-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Programa
          </button>
        }
      />
      <Card className="p-3">
        {loading ? <Spinner /> : programas.length === 0 ? (
          <EmptyState title="Sin programas" hint='Comience creando un programa con el botón "Programa".' />
        ) : (
          <div>{programas.map(p => renderNode('programa', p, 0))}</div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal ? `${modal.row ? 'Editar' : 'Nuevo'} · ${modal.level.label}` : ''}>
        {modal && (
          <RecordForm fields={modal.level.fields} initial={modal.row}
            onCancel={() => setModal(null)}
            onSubmit={v => save(modal.level, v, modal.row, modal.parentId)}
            submitLabel={modal.row ? 'Guardar' : 'Crear'} />
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} onCancel={() => setDeleting(null)} onConfirm={() => void doDelete()}
        message={deleteConfirmMessage({
          singular: deleting?.level.label,
          label: deleting ? deleting.level.title(deleting.row) : null,
        })} />
      <DeleteBlockedDialog
        open={!!blockedDelete}
        onClose={() => setBlockedDelete(null)}
        vinculos={blockedDelete?.vinculos ?? []}
        description={
          blockedDelete ? (
            <>
              No se puede eliminar {blockedDelete.level.label.toLowerCase()}{' '}
              <b className="text-slate-800">"{blockedDelete.level.title(blockedDelete.row)}"</b> porque tiene
              registros vinculados:
            </>
          ) : undefined
        }
      />
    </div>
  )
}
