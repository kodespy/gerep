import { supabase } from './supabase'

function reopenHint(error: { message?: string } | null | undefined): string | null {
  const msg = String(error?.message ?? '')
  if (/solo los desarrolladores pueden reabrir/i.test(msg)) {
    return 'Falta aplicar en Supabase la migración 044_expedientes_reabrir_admin_dev.sql (administrador y desarrollador pueden reabrir).'
  }
  return null
}

/** Reactiva un expediente finalizado (admin o desarrollador). Usa RPC si existe. */
export async function reabrirExpediente(id: string): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('reabrir_expediente', { p_id: id })
  if (!rpcErr) return

  const missingRpc = /could not find the function|schema cache|does not exist|p_id/i.test(rpcErr.message)
  if (!missingRpc) {
    throw new Error(reopenHint(rpcErr) ?? rpcErr.message)
  }

  const { data: row, error: readErr } = await supabase
    .from('expedientes')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)

  const estado =
    String(row?.estado ?? '').toLowerCase() === 'finalizado' ? 'En proceso' : row?.estado

  const { error } = await supabase
    .from('expedientes')
    .update({
      estado_finalizado: false,
      ...(estado != null ? { estado } : {}),
    })
    .eq('id', id)
  if (error) throw new Error(reopenHint(error) ?? error.message)
}
