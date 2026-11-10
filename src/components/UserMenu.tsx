import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BookOpen, LogOut, ScrollText, SquareUser } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { resolveAvatarUrl } from '../lib/avatar'

function AvatarCircle({
  url,
  initial,
  sizeClass,
}: {
  url: string | null
  initial: string
  sizeClass: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [url])

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-full bg-[#111827] font-bold text-white ${sizeClass}`}>
      {url && !broken ? (
        <img key={url} src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </div>
  )
}

export default function UserMenu({ showIdentity = false }: { showIdentity?: boolean }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const name = profile?.name ?? 'Usuario'
  const email = profile?.email ?? ''
  const roleRaw = (profile?.role ?? 'usuario').trim()
  const role = roleRaw ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : 'Usuario'
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url, profile?.updated_at ?? profile?.avatar_url)
  const initial = (name || email || 'U').slice(0, 1).toUpperCase()

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
        className={showIdentity
          ? 'flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800'
          : 'rounded-full ring-offset-2 transition hover:ring-2 hover:ring-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'}
        aria-label="Menú de usuario"
        aria-expanded={open}
      >
        <AvatarCircle url={avatarUrl} initial={initial} sizeClass="h-9 w-9 text-sm" />
        {showIdentity && (
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[9.5rem] truncate text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100">{name}</span>
            <span className="block max-w-[9.5rem] truncate text-[11px] leading-tight text-slate-400">{role}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{email || '—'}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{role}</p>
          </div>

          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SquareUser className="h-4 w-4 text-slate-500" />
            Perfil y Ajustes
          </Link>

          <Link
            to="/perfil?tab=actividades"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ScrollText className="h-4 w-4 text-slate-500" />
            Mis actividades
          </Link>

          <Link
            to="/documentaciones"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <BookOpen className="h-4 w-4 text-slate-500" />
            Documentaciones
          </Link>

          <div className="border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={async () => {
                setOpen(false)
                await signOut()
                navigate('/login')
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
