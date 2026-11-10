import { NavLink, Outlet, Navigate, useLocation } from 'react-router'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner } from '../components/ui'
import {
  LayoutDashboard, Target, Network, Wallet, FolderKanban, FileCheck2, ScrollText,
  Handshake, Banknote, Undo2, ClipboardCheck, Mailbox, StickyNote, Building2, Store, PiggyBank,
  Tags, Users, MapPinned, Clock, UserCog, ListChecks, ClipboardList,
  BarChart3, Sparkles, PanelLeftClose, Menu, X, ChevronRight, ChevronDown,
} from 'lucide-react'
import UserMenu from '../components/UserMenu'
import GlobalSearch from '../components/GlobalSearch'
import NotificationsMenu from '../components/NotificationsMenu'
import OnlineUsersMenu from '../components/OnlineUsersMenu'
import ConnectionStatusButton from '../components/ConnectionStatusButton'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { canAccessRrhh, canAccessSistema } from '../lib/roles'
import { moduloKeyFromPath } from '../lib/appModulos'
import { cn } from '../lib/utils'

interface NavItem { to: string; label: string; icon: React.ReactNode }
interface NavGroup { title: string; items: NavItem[] }

const APP_VERSION = '1.0.0'
const iconCls = 'h-[1.05rem] w-[1.05rem] shrink-0'

const NAV_BASE: NavGroup[] = [
  {
    title: 'General',
    items: [
      { to: '/', label: 'Panel de control', icon: <LayoutDashboard className={iconCls} /> },
      { to: '/expedientes', label: 'Expedientes', icon: <Mailbox className={iconCls} /> },
      { to: '/memos', label: 'Memos', icon: <StickyNote className={iconCls} /> },
    ],
  },
  {
    title: 'Planificación',
    items: [
      { to: '/planificacion/actividades', label: 'Actividades', icon: <Target className={iconCls} /> },
      { to: '/planificacion/programas', label: 'Estructura programática', icon: <Network className={iconCls} /> },
      { to: '/planificacion/planes-administrativos', label: 'Planes administrativos', icon: <Wallet className={iconCls} /> },
    ],
  },
  {
    title: 'Ejecución',
    items: [
      { to: '/proyectos', label: 'Proyectos', icon: <FolderKanban className={iconCls} /> },
      { to: '/cdp', label: 'CDP', icon: <ScrollText className={iconCls} /> },
      { to: '/actas', label: 'Actas', icon: <FileCheck2 className={iconCls} /> },
      { to: '/resoluciones', label: 'Resoluciones', icon: <ScrollText className={iconCls} /> },
      { to: '/convenios', label: 'Convenios', icon: <Handshake className={iconCls} /> },
    ],
  },
  {
    title: 'Pagos',
    items: [
      { to: '/pagos/str', label: 'STR · Solicitudes', icon: <Banknote className={iconCls} /> },
      { to: '/pagos/devoluciones', label: 'Devoluciones', icon: <Undo2 className={iconCls} /> },
    ],
  },
  {
    title: 'Rendición',
    items: [{ to: '/rendiciones', label: 'Rendiciones de cuentas', icon: <ClipboardCheck className={iconCls} /> }],
  },
  {
    title: 'Informes',
    items: [
      { to: '/informes/asistente', label: 'Asistente de informes', icon: <Sparkles className={iconCls} /> },
      { to: '/informes/admin-financieros', label: 'Informes admin. y financieros', icon: <BarChart3 className={iconCls} /> },
    ],
  },
  {
    title: 'Catálogos',
    items: [
      { to: '/catalogos/entidades', label: 'Entidades', icon: <Building2 className={iconCls} /> },
      { to: '/catalogos/proveedores', label: 'Proveedores', icon: <Store className={iconCls} /> },
      { to: '/catalogos/fuentes', label: 'Fuentes de financiamiento', icon: <PiggyBank className={iconCls} /> },
      { to: '/catalogos/objetos-gasto', label: 'Objetos de gasto', icon: <Tags className={iconCls} /> },
    ],
  },
]

const NAV_RRHH: NavGroup = {
  title: 'Equipo',
  items: [
    { to: '/catalogos/areas', label: 'Áreas', icon: <MapPinned className={iconCls} /> },
    { to: '/catalogos/funcionarios', label: 'Funcionarios', icon: <Users className={iconCls} /> },
    { to: '/marcaciones', label: 'Reporte de marcaciones', icon: <Clock className={iconCls} /> },
  ],
}

function ModuleRouteGate() {
  const { canAccessPath, modulos, hasFullAccess } = useAuth()
  const location = useLocation()
  if (!hasFullAccess && modulos === null) {
    return <div className="text-sm text-muted-foreground">Cargando permisos…</div>
  }
  if (!canAccessPath(location.pathname)) {
    return <Navigate to="/" replace />
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner label="Cargando…" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}

function ActionsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Acciones
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-studio dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Preferencias
          </p>
          <div className="flex items-center justify-between rounded-xl px-2 py-1.5">
            <span className="text-sm text-slate-600 dark:text-slate-300">Tema</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between rounded-xl px-2 py-1.5">
            <span className="text-sm text-slate-600 dark:text-slate-300">Conexión</span>
            <ConnectionStatusButton />
          </div>
        </div>
      )}
    </div>
  )
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, canAccessModulo, hasFullAccess } = useAuth()
  const location = useLocation()
  const appVersion = APP_VERSION

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const nav = useMemo(() => {
    let groups = [...NAV_BASE]
    if (canAccessRrhh(profile?.role)) {
      groups = [...groups, NAV_RRHH]
    }
    if (canAccessSistema(profile?.role)) {
      groups = [
        ...groups,
        {
          title: 'Sistema',
          items: [
            { to: '/usuarios', label: 'Usuarios', icon: <UserCog className={iconCls} /> },
            { to: '/auditoria', label: 'Auditoría', icon: <ScrollText className={iconCls} /> },
            {
              to: '/sistema/control-documental-proyectos',
              label: 'Plantillas documentales de proyectos',
              icon: <ListChecks className={iconCls} />,
            },
            {
              to: '/sistema/control-documental-str',
              label: 'Plantillas documentales de STR',
              icon: <ClipboardList className={iconCls} />,
            },
            {
              to: '/sistema/control-rendiciones-cuentas',
              label: 'Plantillas de rendición de cuentas',
              icon: <ClipboardList className={iconCls} />,
            },
          ],
        },
      ]
    }

    if (!hasFullAccess) {
      groups = groups
        .map(group => ({
          ...group,
          items: group.items.filter(item => {
            const key = moduloKeyFromPath(item.to)
            if (!key) return true
            return canAccessModulo(key)
          }),
        }))
        .filter(group => group.items.length > 0)
    }

    return groups
  }, [profile?.role, canAccessModulo, hasFullAccess])

  const current = useMemo(() => {
    for (const group of nav) {
      const hit = group.items.find(item =>
        item.to === '/'
          ? location.pathname === '/'
          : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
      )
      if (hit) return { group: group.title, label: hit.label }
    }
    return { group: 'GEREP', label: 'GEREP' }
  }, [nav, location.pathname])

  const sidebarCollapsed = collapsed && !mobileOpen

  return (
    <div className="flex h-full bg-background">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="app-sidebar"
        aria-label="Navegación principal"
        className={cn(
          'flex shrink-0 flex-col bg-sidebar transition-all duration-200',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-[16.5rem] max-lg:shadow-2xl',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          sidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-[16.5rem]',
        )}
      >
        <div className={cn('relative flex min-h-16 items-center py-2', sidebarCollapsed ? 'justify-center px-2' : 'px-4')}>
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expandir menú"
              aria-expanded={false}
              aria-controls="app-sidebar-nav"
              className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100 p-1.5 dark:bg-slate-800"
            >
              <img src="/app-icon.png?v=6" alt="GEREP" className="h-full w-full object-contain" />
            </button>
          ) : (
            <div className="relative flex w-full min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 p-1.5 dark:bg-slate-800">
                <img src="/app-icon.png?v=6" alt="" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold tracking-tight text-ink">GEREP</p>
                <p className="text-[11px] leading-snug text-slate-400">Gestión de Recursos Públicos</p>
              </div>
              <button
                type="button"
                onClick={() => { setCollapsed(true); setMobileOpen(false) }}
                title="Contraer menú"
                aria-expanded
                aria-controls="app-sidebar-nav"
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:inline-flex dark:hover:bg-slate-800"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 lg:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <nav id="app-sidebar-nav" className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {nav.map(group => (
            <div key={group.title} className="mb-4">
              {!sidebarCollapsed && (
                <p className="mb-1.5 px-2.5 text-[11px] font-medium text-slate-400">
                  {group.title}
                </p>
              )}
              {sidebarCollapsed && <div className="mx-auto mb-1.5 h-px w-6 bg-slate-200/80 dark:bg-slate-700" />}
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center rounded-xl text-[13.5px] transition-colors duration-150',
                        sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2.5 py-2',
                        isActive
                          ? 'bg-[#eef2ff] font-semibold text-[#3b6cff] dark:bg-blue-950/50 dark:text-blue-200'
                          : 'font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cn('transition-colors', isActive ? 'text-[#3b6cff]' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden>
                          {item.icon}
                        </span>
                        {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 px-3 pb-4">
          {sidebarCollapsed ? (
            <div className="flex justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-800">
                <MapPinned className="h-4 w-4" />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900">
                <MapPinned className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold leading-tight text-ink">
                  Secretaría Nacional de Deportes
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  Unidad ejecutora · v{appVersion}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 shrink-0 items-center gap-2 bg-header px-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
            aria-label={mobileOpen ? 'Cerrar menú de módulos' : 'Abrir menú de módulos'}
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <nav aria-label="Miga de pan" className="hidden min-w-0 items-center text-sm text-slate-400 lg:flex">
            <span className="text-slate-500">Inicio</span>
            {current.group !== 'GEREP' && current.label !== current.group && (
              <>
                <ChevronRight className="mx-1 h-3.5 w-3.5" />
                <span>{current.group}</span>
              </>
            )}
            <ChevronRight className="mx-1 h-3.5 w-3.5" />
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{current.label}</span>
          </nav>
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{current.label}</p>
            <p className="truncate text-[11px] text-slate-400">GEREP</p>
          </div>
          <div className="mx-auto min-w-0 flex-1 lg:max-w-md">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ActionsMenu />
            <OnlineUsersMenu />
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-background px-3 pb-2 pt-4 sm:px-6 sm:pt-5">
          <ModuleRouteGate />
        </main>
        <footer className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              <img src="/app-icon.png?v=6" alt="" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">GEREP</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Desarrollado para <span className="font-semibold text-slate-600 dark:text-slate-300">UEP - SND</span>
          </p>
        </footer>
      </div>
    </div>
  )
}
