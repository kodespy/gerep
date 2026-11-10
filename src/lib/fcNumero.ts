import { supabase } from './supabase'

const FC_NUMERO_RE = /^FC-(\d{4})-(\d{4})$/i

/** Formato: FC-2026-0001 */
export function formatFcNumero(secuencia: number, anio = new Date().getFullYear()): string {
  return `FC-${Math.floor(anio)}-${String(Math.max(1, Math.floor(secuencia))).padStart(4, '0')}`
}

export function parseFcNumero(value: unknown): { secuencia: number; anio: number } | null {
  const m = String(value ?? '').trim().match(FC_NUMERO_RE)
  if (!m) return null
  return { anio: Number(m[1]), secuencia: Number(m[2]) }
}

export function isFcNumero(value: unknown): boolean {
  return FC_NUMERO_RE.test(String(value ?? '').trim())
}

function maxFcSeq(values: unknown[], anio: number): number {
  let max = 0
  for (const v of values) {
    const p = parseFcNumero(v)
    if (p && p.anio === anio && p.secuencia > max) max = p.secuencia
  }
  return max
}

/**
 * Siguiente FC-YYYY-#### global y secuencial.
 * Serie compartida por: Formulario de Control, Informe Técnico y Control de Desembolso.
 */
export async function fetchNextFcNumero(anio = new Date().getFullYear()): Promise<string> {
  const prefix = `FC-${anio}-`
  const [formularios, informes, desembolsos] = await Promise.all([
    supabase
      .from('proyecto_control_formularios')
      .select('numero_formulario')
      .ilike('numero_formulario', `${prefix}%`)
      .limit(5000),
    supabase
      .from('proyecto_informes_tecnicos')
      .select('numero')
      .ilike('numero', `${prefix}%`)
      .limit(5000),
    supabase
      .from('proyecto_control_desembolsos')
      .select('numero')
      .ilike('numero', `${prefix}%`)
      .limit(5000),
  ])

  if (formularios.error) throw new Error(formularios.error.message)
  if (informes.error) throw new Error(informes.error.message)
  if (desembolsos.error) throw new Error(desembolsos.error.message)

  const maxSeq = Math.max(
    maxFcSeq((formularios.data ?? []).map(r => r.numero_formulario), anio),
    maxFcSeq((informes.data ?? []).map(r => r.numero), anio),
    maxFcSeq((desembolsos.data ?? []).map(r => r.numero), anio),
  )
  return formatFcNumero(maxSeq + 1, anio)
}

/** True si el N° FC ya existe en cualquiera de las tres tablas. */
export async function fcNumeroExists(
  numero: string,
  opts?: {
    excludeInformeId?: string | null
    excludeDesembolsoId?: string | null
  },
): Promise<boolean> {
  const num = numero.trim().toUpperCase()
  if (!num) return false
  const excludeInf = (opts?.excludeInformeId ?? '').trim()
  const excludeDes = (opts?.excludeDesembolsoId ?? '').trim()

  const [formularios, informes, desembolsos] = await Promise.all([
    supabase.from('proyecto_control_formularios').select('id').ilike('numero_formulario', num).limit(1),
    supabase.from('proyecto_informes_tecnicos').select('id').ilike('numero', num).limit(10),
    supabase.from('proyecto_control_desembolsos').select('id').ilike('numero', num).limit(10),
  ])
  if (formularios.error) throw new Error(formularios.error.message)
  if (informes.error) throw new Error(informes.error.message)
  if (desembolsos.error) throw new Error(desembolsos.error.message)

  if ((formularios.data ?? []).length > 0) return true
  if ((informes.data ?? []).some(r => !(excludeInf && String(r.id) === excludeInf))) return true
  if ((desembolsos.data ?? []).some(r => !(excludeDes && String(r.id) === excludeDes))) return true
  return false
}
