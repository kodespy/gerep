import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Bell, Mail, MailOpen } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/format'

type Notificacion = {
  id: string
  titulo: string | null
  descripcion: string | null
  leida: boolean | null
  fecha_creacion: string | null
  expediente_id?: string | null
}

export default function NotificationsMenu() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = items.filter(n => !n.leida).length
  const hasRead = items.some(n => !!n.leida)

  const load = useCallback(async () => {
    if (!userId) {
      setItems([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id,titulo,descripcion,leida,fecha_creacion,expediente_id')
      .eq('usuario_id', userId)
      .order('fecha_creacion', { ascending: false })
      .limit(25)
    if (error) console.error('[notificaciones]', error.message)
    setItems((data as Notificacion[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

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

  const setLeida = async (n: Notificacion, leida: boolean) => {
    if (!!n.leida === leida) return
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida } : x))
    const { error } = await supabase.from('notificaciones').update({ leida }).eq('id', n.id)
    if (error) {
      console.error('[notificaciones]', error.message)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: n.leida } : x))
    }
  }

  const openNotificacion = (n: Notificacion) => {
    if (!n.leida) void setLeida(n, true)
    setOpen(false)
  }

  const markAll = async (leida: boolean) => {
    if (!userId) return
    const targets = items.filter(n => !!n.leida !== leida)
    if (targets.length === 0) return
    setItems(prev => prev.map(x => ({ ...x, leida })))
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida })
      .eq('usuario_id', userId)
      .eq('leida', !leida)
    if (error) {
      console.error('[notificaciones]', error.message)
      void load()
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Notificaciones"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => {
          setOpen(v => !v)
          if (!open) void load()
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notificaciones</p>
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAll(true)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Todas leídas
                  </button>
                )}
                {hasRead && (
                  <button
                    type="button"
                    onClick={() => void markAll(false)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Todas no leídas
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No hay notificaciones</p>
            ) : (
              <ul>
                {items.map(n => {
                  const isRead = !!n.leida
                  const expedienteId = String(n.expediente_id ?? '').trim()
                  const href = expedienteId ? `/expedientes/${expedienteId}` : null
                  const body = (
                    <div className="flex items-start gap-2">
                      {!isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {n.titulo || 'Notificación'}
                        </p>
                        {n.descripcion && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                            {n.descripcion}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {fmtDate(n.fecha_creacion)}
                          {href ? ' · Ver expediente' : ''}
                        </p>
                      </div>
                    </div>
                  )
                  return (
                    <li
                      key={n.id}
                      className={`flex items-start gap-1 border-b border-slate-50 px-2 py-2 dark:border-slate-800 ${isRead ? 'opacity-70' : ''}`}
                    >
                      {href ? (
                        <Link
                          to={href}
                          onClick={() => openNotificacion(n)}
                          className="min-w-0 flex-1 rounded-lg px-2 py-1 no-underline hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="min-w-0 flex-1 px-2 py-1">{body}</div>
                      )}
                      <button
                        type="button"
                        title={isRead ? 'Marcar como no leída' : 'Marcar como leída'}
                        aria-label={isRead ? 'Marcar como no leída' : 'Marcar como leída'}
                        onClick={() => void setLeida(n, !isRead)}
                        className="mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
                      >
                        {isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/perfil"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-slate-800"
            >
              Preferencias de notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
