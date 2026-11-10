import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Search, LayoutDashboard, Target, Network, Wallet, FolderKanban, FileCheck2, ScrollText,
  Handshake, Banknote, Undo2, ClipboardCheck, Mailbox, StickyNote, Building2, Store, PiggyBank, Tags,
  UserRound, Loader2, Users, MapPinned, Clock, UserCog, ListChecks, ClipboardList, BookOpen,
  BarChart3, Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { canAccessRrhh, canAccessSistema } from '../lib/roles'

type SearchHit = {
  id: string
  label: string
  sub?: string
  to: string
  group: string
  icon: React.ReactNode
}

const NAV_GROUP = 'Módulos'

const NAV_HITS: SearchHit[] = [
  { id: 'nav-/', label: 'Panel de control', to: '/', group: NAV_GROUP, icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'nav-actividades', label: 'Actividades', to: '/planificacion/actividades', group: NAV_GROUP, icon: <Target className="h-4 w-4" /> },
  { id: 'nav-programas', label: 'Estructura programática', to: '/planificacion/programas', group: NAV_GROUP, icon: <Network className="h-4 w-4" /> },
  { id: 'nav-planes-admin', label: 'Planes administrativos', to: '/planificacion/planes-administrativos', group: NAV_GROUP, icon: <Wallet className="h-4 w-4" /> },
  { id: 'nav-proyectos', label: 'Proyectos', to: '/proyectos', group: NAV_GROUP, icon: <FolderKanban className="h-4 w-4" /> },
  { id: 'nav-cdp', label: 'CDP', to: '/cdp', group: NAV_GROUP, icon: <ScrollText className="h-4 w-4" /> },
  { id: 'nav-actas', label: 'Actas', to: '/actas', group: NAV_GROUP, icon: <FileCheck2 className="h-4 w-4" /> },
  { id: 'nav-resoluciones', label: 'Resoluciones', to: '/resoluciones', group: NAV_GROUP, icon: <ScrollText className="h-4 w-4" /> },
  { id: 'nav-convenios', label: 'Convenios', to: '/convenios', group: NAV_GROUP, icon: <Handshake className="h-4 w-4" /> },
  { id: 'nav-str', label: 'STR · Solicitudes', to: '/pagos/str', group: NAV_GROUP, icon: <Banknote className="h-4 w-4" /> },
  { id: 'nav-devoluciones', label: 'Devoluciones', to: '/pagos/devoluciones', group: NAV_GROUP, icon: <Undo2 className="h-4 w-4" /> },
  { id: 'nav-rendiciones', label: 'Rendiciones de cuentas', to: '/rendiciones', group: NAV_GROUP, icon: <ClipboardCheck className="h-4 w-4" /> },
  {
    id: 'nav-informes-admin',
    label: 'Informes administrativos y financieros',
    to: '/informes/admin-financieros',
    group: NAV_GROUP,
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: 'nav-asistente-informes',
    label: 'Asistente de informes',
    to: '/informes/asistente',
    group: NAV_GROUP,
    icon: <Sparkles className="h-4 w-4" />,
  },
  { id: 'nav-expedientes', label: 'Expedientes', to: '/expedientes', group: NAV_GROUP, icon: <Mailbox className="h-4 w-4" /> },
  { id: 'nav-memos', label: 'Memos', to: '/memos', group: NAV_GROUP, icon: <StickyNote className="h-4 w-4" /> },
  { id: 'nav-entidades', label: 'Entidades', to: '/catalogos/entidades', group: NAV_GROUP, icon: <Building2 className="h-4 w-4" /> },
  { id: 'nav-proveedores', label: 'Proveedores', to: '/catalogos/proveedores', group: NAV_GROUP, icon: <Store className="h-4 w-4" /> },
  { id: 'nav-fuentes', label: 'Fuentes de financiamiento', to: '/catalogos/fuentes', group: NAV_GROUP, icon: <PiggyBank className="h-4 w-4" /> },
  { id: 'nav-objetos', label: 'Objetos de gasto', to: '/catalogos/objetos-gasto', group: NAV_GROUP, icon: <Tags className="h-4 w-4" /> },
  { id: 'nav-areas', label: 'Áreas', to: '/catalogos/areas', group: NAV_GROUP, icon: <MapPinned className="h-4 w-4" /> },
  { id: 'nav-funcionarios', label: 'Funcionarios', to: '/catalogos/funcionarios', group: NAV_GROUP, icon: <Users className="h-4 w-4" /> },
  { id: 'nav-marcaciones', label: 'Reporte de marcaciones', to: '/marcaciones', group: NAV_GROUP, icon: <Clock className="h-4 w-4" /> },
  { id: 'nav-usuarios', label: 'Usuarios', to: '/usuarios', group: NAV_GROUP, icon: <UserCog className="h-4 w-4" /> },
  { id: 'nav-auditoria', label: 'Auditoría', to: '/auditoria', group: NAV_GROUP, icon: <ScrollText className="h-4 w-4" /> },
  {
    id: 'nav-control-documental',
    label: 'Plantillas de control documental de proyectos',
    to: '/sistema/control-documental-proyectos',
    group: NAV_GROUP,
    icon: <ListChecks className="h-4 w-4" />,
  },
  {
    id: 'nav-control-documental-str',
    label: 'Plantillas de control documental de STR',
    to: '/sistema/control-documental-str',
    group: NAV_GROUP,
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    id: 'nav-control-rendiciones',
    label: 'Plantillas de control de rendiciones de cuentas',
    to: '/sistema/control-rendiciones-cuentas',
    group: NAV_GROUP,
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  { id: 'nav-perfil', label: 'Perfil y ajustes', to: '/perfil', group: NAV_GROUP, icon: <UserRound className="h-4 w-4" /> },
  {
    id: 'nav-documentaciones',
    label: 'Documentaciones',
    to: '/documentaciones',
    group: NAV_GROUP,
    icon: <BookOpen className="h-4 w-4" />,
  },
]

function matchText(hay: string, q: string) {
  return hay.toLowerCase().includes(q)
}

async function searchRecords(q: string): Promise<SearchHit[]> {
  const safe = q.replace(/[%_,.()]/g, ' ').trim()
  if (!safe) return []
  const like = `%${safe}%`
  const or = (cols: string[]) => cols.map(c => `${c}.ilike."${like}"`).join(',')

  const [proy, exp, memos, prov, cdp, actas, strs] = await Promise.all([
    supabase.from('proyectos').select('id, descripcion').ilike('descripcion', like).limit(6),
    supabase.from('expedientes').select('id, numero_expediente, asunto').or(or(['numero_expediente', 'asunto'])).limit(6),
    supabase.from('memos').select('id, numero, asunto').or(or(['numero', 'asunto', 'cuerpo'])).limit(5),
    supabase.from('proveedores').select('id, razon_social, documento').or(or(['razon_social', 'documento'])).limit(5),
    supabase.from('budget_commitments').select('id, cdp_numero, descripcion').or(or(['cdp_numero', 'descripcion'])).limit(5),
    supabase.from('actas').select('id, numero, proyecto:proyectos(descripcion)').ilike('numero', like).limit(5),
    supabase.from('strs').select('id, numero, proyecto:proyectos(descripcion)').ilike('numero', like).limit(5),
  ])

  const hits: SearchHit[] = []

  for (const r of proy.data ?? []) {
    hits.push({
      id: `proy-${r.id}`,
      label: r.descripcion || 'Proyecto',
      sub: 'Proyecto',
      to: `/proyectos/${r.id}`,
      group: 'Registros',
      icon: <FolderKanban className="h-4 w-4" />,
    })
  }
  for (const r of exp.data ?? []) {
    hits.push({
      id: `exp-${r.id}`,
      label: r.numero_expediente || 'Expediente',
      sub: r.asunto || 'Expediente',
      to: `/expedientes/${r.id}`,
      group: 'Registros',
      icon: <Mailbox className="h-4 w-4" />,
    })
  }
  for (const r of memos.data ?? []) {
    hits.push({
      id: `memo-${r.id}`,
      label: `Memo ${r.numero ?? ''}`.trim(),
      sub: r.asunto || 'Memorándum',
      to: '/memos',
      group: 'Registros',
      icon: <StickyNote className="h-4 w-4" />,
    })
  }
  for (const r of prov.data ?? []) {
    hits.push({
      id: `prov-${r.id}`,
      label: r.razon_social || 'Proveedor',
      sub: r.documento ? `RUC ${r.documento}` : 'Proveedor',
      to: '/catalogos/proveedores',
      group: 'Registros',
      icon: <Store className="h-4 w-4" />,
    })
  }
  for (const r of cdp.data ?? []) {
    hits.push({
      id: `cdp-${r.id}`,
      label: r.cdp_numero || 'CDP',
      sub: r.descripcion || 'CDP',
      to: '/cdp',
      group: 'Registros',
      icon: <ScrollText className="h-4 w-4" />,
    })
  }
  for (const r of actas.data ?? []) {
    hits.push({
      id: `acta-${r.id}`,
      label: `Acta ${r.numero ?? ''}`.trim(),
      sub: (r as any).proyecto?.descripcion || 'Acta',
      to: '/actas',
      group: 'Registros',
      icon: <FileCheck2 className="h-4 w-4" />,
    })
  }
  for (const r of strs.data ?? []) {
    hits.push({
      id: `str-${r.id}`,
      label: `STR ${r.numero ?? ''}`.trim(),
      sub: (r as any).proyecto?.descripcion || 'STR',
      to: '/pagos/str',
      group: 'Registros',
      icon: <Banknote className="h-4 w-4" />,
    })
  }

  return hits
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recordHits, setRecordHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)

  const allowedNav = useMemo(() => {
    const rrhh = canAccessRrhh(profile?.role)
    const sistema = canAccessSistema(profile?.role)
    return NAV_HITS.filter(h => {
      if (h.to === '/catalogos/areas' || h.to === '/catalogos/funcionarios' || h.to === '/marcaciones') {
        return rrhh
      }
      if (h.to === '/usuarios' || h.to === '/auditoria' || h.to.startsWith('/sistema/')) return sistema
      return true
    })
  }, [profile?.role])

  const navHits = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return allowedNav.slice(0, 8)
    return allowedNav.filter(h => matchText(h.label, term) || matchText(h.group, term)).slice(0, 8)
  }, [q, allowedNav])

  const results = useMemo(() => [...navHits, ...recordHits], [navHits, recordHits])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRecordHits([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      searchRecords(term)
        .then(hits => { if (!cancelled) setRecordHits(hits) })
        .catch(() => { if (!cancelled) setRecordHits([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  useEffect(() => {
    setActive(0)
  }, [results.length, q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const go = useCallback((hit: SearchHit) => {
    setOpen(false)
    setQ('')
    navigate(hit.to)
  }, [navigate])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) go(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>()
    for (const hit of results) {
      const list = map.get(hit.group) ?? []
      list.push(hit)
      map.set(hit.group, list)
    }
    return [...map.entries()]
  }, [results])

  let flatIndex = -1

  return (
    <div ref={rootRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <label htmlFor="global-search" className="sr-only">Ir a módulos, proyectos o expedientes</label>
        <input
          id="global-search"
          ref={inputRef}
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Ir a…"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className="w-full rounded-full border border-slate-200/90 bg-slate-50 py-2 pr-16 pl-10 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-brand-500 dark:focus:bg-slate-800"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500">
          Ctrl K
        </kbd>
      </div>

      {open && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-full z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando registros…
            </div>
          )}

          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">
              {q.trim() ? 'Sin coincidencias para esta búsqueda' : 'Escriba para buscar módulos o registros'}
            </p>
          ) : (
            grouped.map(([group, hits]) => (
              <div key={group} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {group}
                </p>
                {hits.map(hit => {
                  flatIndex += 1
                  const idx = flatIndex
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(hit)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition ${
                        idx === active
                          ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`mt-0.5 ${idx === active ? 'text-brand-600' : 'text-slate-400'}`}>
                        {hit.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{hit.label}</span>
                        {hit.sub && <span className="block truncate text-xs text-slate-400">{hit.sub}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
