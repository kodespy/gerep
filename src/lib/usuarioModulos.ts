import { supabase } from './supabase'
import type { ModuloRol } from './appModulos'

export interface UsuarioModulo {
  id?: string
  user_id: string
  modulo: string
  rol: ModuloRol
}

export async function loadUsuarioModulos(userId: string): Promise<UsuarioModulo[]> {
  const { data, error } = await supabase
    .from('usuario_modulos')
    .select('id, user_id, modulo, rol')
    .eq('user_id', userId)
    .order('modulo', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    modulo: String(r.modulo),
    rol: (r.rol ?? 'usuario') as ModuloRol,
  }))
}

/** Reemplaza todos los módulos del usuario por el set indicado. */
export async function saveUsuarioModulos(
  userId: string,
  items: { modulo: string; rol: ModuloRol }[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('usuario_modulos')
    .delete()
    .eq('user_id', userId)
  if (delErr) throw delErr

  if (!items.length) return

  const rows = items.map(i => ({
    user_id: userId,
    modulo: i.modulo,
    rol: i.rol,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('usuario_modulos').insert(rows)
  if (error) throw error
}

export function usuarioTieneModulo(
  asignados: UsuarioModulo[] | null | undefined,
  moduloKey: string,
): boolean {
  if (!asignados?.length) return false
  return asignados.some(a => a.modulo === moduloKey)
}
