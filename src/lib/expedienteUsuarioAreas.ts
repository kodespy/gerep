import { supabase } from './supabase'

export type UsuarioAreaContexto = {
  areaIds: string[]
  responsableAreaIds: string[]
}

type FuncionarioAreaRow = {
  id: string
  area_id: string | null
  correo: string | null
  user_id: string | null
}

function correoExacto(correo: string | null | undefined, email: string): boolean {
  return String(correo ?? '').trim().toLowerCase() === email
}

/** ILIKE trata `_` y `%` como comodines; un correo con `_` no debe matchear a otra persona. */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Áreas en las que el usuario puede operar (Derivar / ver flujo):
 * 1) funcionarios.area_id (pertenece al área)
 * 2) áreas donde es responsable (areas.responsable_id) — misma regla que el email de derivación
 *
 * `responsableAreaIds` es solo (2): Recepcionar e ítems de desarrollo.
 */
export async function resolveUsuarioAreaContexto(opts: {
  email?: string | null
  userId?: string | null
}): Promise<UsuarioAreaContexto> {
  const email = (opts.email ?? '').trim().toLowerCase()
  const userId = opts.userId ? String(opts.userId) : null
  if (!email && !userId) return { areaIds: [], responsableAreaIds: [] }

  const ids = new Set<string>()
  const responsableIds = new Set<string>()
  const funcionarioIds = new Set<string>()

  let funcionarios: FuncionarioAreaRow[] = []

  if (userId) {
    const { data } = await supabase
      .from('funcionarios')
      .select('id,area_id,correo,user_id')
      .eq('user_id', userId)
      .limit(20)
    funcionarios = data ?? []
  }

  if (!funcionarios.length && email) {
    const { data } = await supabase
      .from('funcionarios')
      .select('id,area_id,correo,user_id')
      .ilike('correo', escapeIlikeExact(email))
      .limit(50)
    funcionarios = (data ?? []).filter(f => correoExacto(f.correo, email))
  }

  if (!funcionarios.length && (email || userId)) {
    const { data: all } = await supabase
      .from('funcionarios')
      .select('id,area_id,correo,user_id')
      .limit(5000)
    funcionarios = (all ?? []).filter(f => {
      if (userId && f.user_id === userId) return true
      return !!(email && correoExacto(f.correo, email))
    })
  }

  for (const f of funcionarios) {
    if (f.id) funcionarioIds.add(String(f.id))
    if (f.area_id) ids.add(String(f.area_id))
  }

  // Áreas donde es responsable (misma regla que el email de derivación)
  if (funcionarioIds.size) {
    const { data: areasResp } = await supabase
      .from('areas')
      .select('id,responsable_id')
      .in('responsable_id', [...funcionarioIds])
      .limit(500)
    for (const a of areasResp ?? []) {
      if (a.id) {
        ids.add(String(a.id))
        responsableIds.add(String(a.id))
      }
    }
  }

  return { areaIds: [...ids], responsableAreaIds: [...responsableIds] }
}

export async function resolveUsuarioAreaIds(opts: {
  email?: string | null
  userId?: string | null
}): Promise<string[]> {
  const { areaIds } = await resolveUsuarioAreaContexto(opts)
  return areaIds
}

export async function resolveUsuarioResponsableAreaIds(opts: {
  email?: string | null
  userId?: string | null
}): Promise<string[]> {
  const { responsableAreaIds } = await resolveUsuarioAreaContexto(opts)
  return responsableAreaIds
}

export function usuarioPuedeEnArea(misAreaIds: string[], areaId: string | null | undefined): boolean {
  if (!areaId || !misAreaIds.length) return false
  const id = String(areaId)
  return misAreaIds.some(a => String(a) === id)
}
