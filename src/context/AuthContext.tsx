import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { canAccessRrhh, canAccessSistema, canManageUsuarios, isRrhhModulo, isSistemaModulo, normalizeRole } from '../lib/roles'
import { loadUsuarioModulos, type UsuarioModulo } from '../lib/usuarioModulos'
import { moduloKeyFromPath } from '../lib/appModulos'

export interface UserProfile {
  id: string
  name: string | null
  role: string | null
  email: string | null
  avatar_url: string | null
  phone: string | null
  address: string | null
  updated_at: string | null
}

interface AuthCtx {
  session: Session | null
  loading: boolean
  profile: UserProfile | null
  /** Módulos asignados; null = aún no cargados. */
  modulos: UsuarioModulo[] | null
  /** true si el usuario global es admin/dev (acceso total al menú). */
  hasFullAccess: boolean
  /** true si puede ver un path según módulos (admins siempre true). */
  canAccessPath: (pathname: string) => boolean
  canAccessModulo: (moduloKey: string) => boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  profile: null,
  modulos: null,
  hasFullAccess: false,
  canAccessPath: () => true,
  canAccessModulo: () => true,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [modulos, setModulos] = useState<UsuarioModulo[] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null)
      setModulos(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id,name,role,email,avatar_url,phone,address,updated_at')
      .eq('id', session.user.id)
      .maybeSingle()
    setProfile(
      data ?? {
        id: session.user.id,
        name: session.user.email ?? null,
        role: null,
        email: session.user.email ?? null,
        avatar_url: null,
        phone: null,
        address: null,
        updated_at: null,
      },
    )
    try {
      const mods = await loadUsuarioModulos(session.user.id)
      setModulos(mods)
    } catch {
      setModulos([])
    }
  }, [session?.user])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const hasFullAccess = canManageUsuarios(profile?.role)
  const rrhhOk = canAccessRrhh(profile?.role)
  const sistemaOk = canAccessSistema(profile?.role)
  /** Sin filas asignadas → no restringir (compatibilidad). Con filas → solo esos módulos. */
  const restricted = !hasFullAccess && (modulos?.length ?? 0) > 0

  const canAccessModulo = useCallback(
    (moduloKey: string) => {
      // Disponibles para todos los roles autenticados
      if (moduloKey === 'perfil' || moduloKey === 'documentaciones' || moduloKey === 'dashboard') {
        return true
      }
      if (isRrhhModulo(moduloKey)) return rrhhOk
      if (isSistemaModulo(moduloKey)) return sistemaOk
      if (hasFullAccess) return true
      if (!restricted) return true
      return (modulos ?? []).some(m => m.modulo === moduloKey)
    },
    [hasFullAccess, restricted, modulos, rrhhOk, sistemaOk],
  )

  const canAccessPath = useCallback(
    (pathname: string) => {
      if (pathname === '/perfil' || pathname.startsWith('/perfil/')) return true
      if (pathname === '/documentaciones' || pathname.startsWith('/documentaciones/')) return true
      const key = moduloKeyFromPath(pathname)
      if (isRrhhModulo(key)) return rrhhOk
      if (isSistemaModulo(key)) return sistemaOk
      if (hasFullAccess) return true
      if (!restricted) return true
      if (!key) return true
      return canAccessModulo(key)
    },
    [hasFullAccess, restricted, canAccessModulo, rrhhOk, sistemaOk],
  )

  return (
    <Ctx.Provider
      value={{
        session,
        loading,
        profile,
        modulos,
        hasFullAccess,
        canAccessPath,
        canAccessModulo,
        refreshProfile,
        signOut: async () => {
          const { registrarAuditoria } = await import('../lib/auditoria')
          await registrarAuditoria({
            accion: 'logout',
            resumen: 'Cierre de sesión',
          })
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

/** Rol efectivo del usuario en un módulo (global admin/dev → su rol global). */
export function useModuloRol(moduloKey: string): string {
  const { profile, modulos, hasFullAccess } = useAuth()
  if (hasFullAccess) return normalizeRole(profile?.role)
  const hit = modulos?.find(m => m.modulo === moduloKey)
  return hit?.rol ?? normalizeRole(profile?.role)
}
