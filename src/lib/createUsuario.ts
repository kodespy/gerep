import { createClient } from '@supabase/supabase-js'
import { validatePassword } from './generatePassword'
import { supabase } from './supabase'

export type CreateUsuarioInput = {
  name: string
  email: string
  password: string
  role?: string
  phone?: string | null
  address?: string | null
}

/**
 * Crea cuenta Auth + perfil sin cerrar la sesión del administrador.
 * Usa un cliente aislado (sin persistir sesión) para el signUp.
 */
export async function createUsuario(input: CreateUsuarioInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const role = (input.role ?? 'usuario').trim().toLowerCase() || 'usuario'
  const phone = input.phone?.trim() || null
  const address = input.address?.trim() || null

  if (!name) return { ok: false, error: 'El nombre es obligatorio.' }
  if (!email) return { ok: false, error: 'El correo es obligatorio.' }
  if (!password) return { ok: false, error: 'La contraseña es obligatoria.' }
  const pwdErr = validatePassword(password)
  if (pwdErr) return { ok: false, error: pwdErr }

  const url = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !anonKey) return { ok: false, error: 'Supabase no configurado.' }

  const temp = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-create-usuario-temp',
    },
  })

  const { data, error } = await temp.auth.signUp({
    email,
    password,
    options: {
      data: { name, role },
    },
  })

  if (error) return { ok: false, error: error.message }
  const userId = data.user?.id
  if (!userId) {
    return {
      ok: false,
      error: 'No se pudo crear el usuario. Si el correo ya existe o requiere confirmación, revise Auth en Supabase.',
    }
  }

  // Esperar un instante por si hay trigger que inserta el perfil
  await new Promise(r => setTimeout(r, 400))

  const patch = {
    name,
    email,
    role,
    phone,
    address,
    is_blocked: false,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (existing?.id) {
    const { error: upErr } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (upErr) return { ok: false, error: upErr.message }
  } else {
    const { error: insErr } = await supabase.from('profiles').insert({ id: userId, ...patch })
    if (insErr) {
      return {
        ok: false,
        error: `Cuenta Auth creada, pero el perfil falló: ${insErr.message}. Complete el perfil manualmente o revise RLS/trigger de profiles.`,
      }
    }
  }

  return { ok: true, id: userId }
}
