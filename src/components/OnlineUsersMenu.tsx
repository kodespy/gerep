import { useCallback, useEffect, useRef, useState } from 'react'
import { UserCircle2, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  ensureOnlinePresence,
  getOnlineUsersChannel,
  readOnlineUsers,
  subscribeOnlineUsers,
  trackPayloadFromProfile,
  type OnlineUser,
} from '../lib/onlineUsers'
import { cn } from '../lib/utils'

function roleLabel(role: string | null | undefined) {
  if (!role) return 'Usuario'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export default function OnlineUsersMenu() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [activeUsers, setActiveUsers] = useState<OnlineUser[]>([])
  const [avatarBroken, setAvatarBroken] = useState<Record<string, boolean>>({})
  const ref = useRef<HTMLDivElement>(null)

  const syncPresence = useCallback(() => {
    setActiveUsers(readOnlineUsers(profile))
  }, [profile])

  // Conectar presencia una sola vez por sesión de usuario
  useEffect(() => {
    if (!profile?.id) return
    const cleanupPresence = ensureOnlinePresence(profile)
    const unsubscribe = subscribeOnlineUsers(syncPresence)
    syncPresence()
    const intervalId = window.setInterval(syncPresence, 3000)
    return () => {
      window.clearInterval(intervalId)
      unsubscribe()
      cleanupPresence()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de usuario
  }, [profile?.id])

  // Actualizar payload si cambian nombre/avatar (sin recrear el canal)
  useEffect(() => {
    if (!profile?.id) return
    const channel = getOnlineUsersChannel()
    if (channel?.state === 'joined') {
      void channel.track(trackPayloadFromProfile(profile)).then(() => syncPresence())
    }
  }, [
    profile,
    profile?.name,
    profile?.email,
    profile?.role,
    profile?.avatar_url,
    profile?.updated_at,
    syncPresence,
  ])

  useEffect(() => {
    if (!open) return
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
  }, [open])

  if (!profile?.id) return null

  const othersCount = activeUsers.filter(u => !u.isSelf).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Usuarios en línea"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(v => !v)
          syncPresence()
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
      >
        <Users className="h-[1.15rem] w-[1.15rem]" />
        {activeUsers.length > 0 && (
          <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-0.5 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {activeUsers.length > 99 ? '99+' : activeUsers.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-[200] flex max-h-[min(70vh,24rem)] w-72 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Usuarios en línea</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {othersCount === 0
                  ? 'Solo vos conectado'
                  : `${othersCount} más en la sesión`}
              </p>
            </div>
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
              {activeUsers.length}
            </span>
          </div>

          <ul className="flex-1 overflow-y-auto p-1.5">
            {activeUsers.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-slate-400">
                Nadie en línea por ahora
              </li>
            ) : (
              activeUsers.map(user => {
                const broken = avatarBroken[user.id]
                const showImg = !!user.avatar_url && !broken
                return (
                  <li key={user.id}>
                    <div
                      role="menuitem"
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                        user.isSelf ? 'bg-teal-50/80 dark:bg-teal-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                      )}
                    >
                      <div className="relative shrink-0">
                        {showImg ? (
                          <img
                            className="h-8 w-8 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
                            alt=""
                            src={user.avatar_url!}
                            onError={() => setAvatarBroken(prev => ({ ...prev, [user.id]: true }))}
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 ring-2 ring-white dark:bg-slate-800 dark:ring-slate-900">
                            <UserCircle2 className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <span className="absolute right-0 bottom-0 block h-2 w-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-slate-900" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {user.name || user.email || 'Usuario'}
                          </p>
                          {user.isSelf && (
                            <span className="shrink-0 rounded-md bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                              Tú
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-slate-500 capitalize dark:text-slate-400">
                          {roleLabel(user.role)}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
