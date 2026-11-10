import { supabase } from './supabase'

export type NotifyDerivacionPayload = {
  expediente_id: string
  area_destino_id: string
  numero_expediente?: string | null
  asunto?: string | null
  observacion?: string | null
  tareas?: string[]
  area_origen_nombre?: string | null
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function resolveDestinatario(areaDestinoId: string) {
  const { data, error } = await supabase
    .from('areas')
    .select(`
      id,
      nombre,
      responsable:funcionarios!areas_responsable_id_fkey(
        id,
        nombre_completo,
        correo,
        user_id
      )
    `)
    .eq('id', areaDestinoId)
    .maybeSingle()
  if (error) throw error
  const resp = Array.isArray(data?.responsable) ? data?.responsable[0] : data?.responsable
  return {
    areaNombre: data?.nombre ? String(data.nombre) : '',
    nombre: String(resp?.nombre_completo ?? '').trim(),
    correo: String(resp?.correo ?? '').trim(),
    userId: resp?.user_id ? String(resp.user_id) : null,
  }
}

function buildEmailHtml(opts: {
  destinatario: string
  numero: string
  asunto: string
  areaDestino: string
  areaOrigen: string
  observacion: string
  tareas?: string[]
}) {
  const tareas = (opts.tareas ?? []).map(t => t.trim()).filter(Boolean)
  const tareasSection = tareas.length
    ? `<p><strong>Tareas:</strong></p>
      <ul>${tareas.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : ''

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px;color:#0f766e">Derivación de expediente</h2>
      <p>Hola <strong>${escapeHtml(opts.destinatario)}</strong>,</p>
      <p>
        Se ha derivado el expediente <strong>${escapeHtml(opts.numero)}</strong>
        a tu dependencia <strong>${escapeHtml(opts.areaDestino)}</strong>
        desde <strong>${escapeHtml(opts.areaOrigen)}</strong>.
      </p>
      <p><strong>Asunto:</strong> ${escapeHtml(opts.asunto.toUpperCase())}</p>
      ${opts.observacion ? `<p><strong>Observación:</strong> ${escapeHtml(opts.observacion)}</p>` : ''}
      ${tareasSection}
      <p style="margin-top:24px;font-size:12px;color:#64748b">
        Este mensaje fue enviado automáticamente por el sistema UEP Proyectos.
      </p>
    </div>
  `
}

async function sendViaLocalApi(to: string, subject: string, html: string) {
  const res = await fetch('/api/notify-derivacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false as const, error: String(data?.error || res.statusText) }
  return { ok: true as const }
}

async function sendViaEdgeFunction(payload: NotifyDerivacionPayload) {
  const { data, error } = await supabase.functions.invoke('notify-derivacion', { body: payload })
  if (error) return { ok: false as const, error: error.message, skipped: false }
  if (data?.error) return { ok: false as const, error: String(data.error), skipped: false }
  return { ok: true as const, skipped: !!data?.skipped }
}

/** Envía email (Resend) + intenta notificación in-app. No debe bloquear la derivación. */
export async function notifyDerivacion(payload: NotifyDerivacionPayload): Promise<{
  ok: boolean
  skipped?: boolean
  error?: string
}> {
  try {
    const dest = await resolveDestinatario(payload.area_destino_id)
    if (!dest.correo) {
      return { ok: true, skipped: true, error: 'Sin correo del responsable' }
    }

    const numero = payload.numero_expediente || '—'
    const asunto = payload.asunto || '—'
    const tareas = (payload.tareas ?? []).map(t => t.trim()).filter(Boolean)
    const obs = (payload.observacion ?? '').trim()
    const origen = (payload.area_origen_nombre ?? '').trim() || 'otra dependencia'
    const destinatario = dest.nombre || dest.correo
    const subject = `Expediente derivado: ${numero}`
    const html = buildEmailHtml({
      destinatario,
      numero: String(numero),
      asunto: String(asunto),
      areaDestino: dest.areaNombre,
      areaOrigen: origen,
      observacion: obs,
      ...(tareas.length ? { tareas } : {}),
    })

    if (dest.userId) {
      const descParts = [
        `Expediente ${numero}`,
        dest.areaNombre ? `→ ${dest.areaNombre}` : null,
        obs || null,
      ].filter(Boolean)
      const { error: nErr } = await supabase.from('notificaciones').insert({
        usuario_id: dest.userId,
        titulo: `Expediente derivado: ${numero}`,
        descripcion: descParts.join(' · '),
        leida: false,
        expediente_id: payload.expediente_id,
      })
      if (nErr) console.warn('[notify-derivacion] notificacion:', nErr.message)
    }

    // Producción: Edge Function. Desarrollo: proxy Vite con RESEND_API_KEY de .env.local
    if (import.meta.env.DEV) {
      const local = await sendViaLocalApi(dest.correo, subject, html)
      if (local.ok) return { ok: true }
      // Fallback por si ya desplegaron la función
      const edge = await sendViaEdgeFunction(payload)
      if (edge.ok) return edge
      return { ok: false, error: local.error || edge.error }
    }

    const edge = await sendViaEdgeFunction(payload)
    if (edge.ok) return edge

    // Último recurso en preview local
    const local = await sendViaLocalApi(dest.correo, subject, html)
    return local.ok ? { ok: true } : { ok: false, error: edge.error || local.error }
  } catch (e: any) {
    console.error('[notify-derivacion]', e)
    return { ok: false, error: e?.message ?? 'Error al notificar' }
  }
}
