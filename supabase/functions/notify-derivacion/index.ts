import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  expediente_id: string
  area_destino_id: string
  numero_expediente?: string | null
  asunto?: string | null
  observacion?: string | null
  tareas?: string[]
  area_origen_nombre?: string | null
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'No autorizado' })

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json(500, { error: 'RESEND_API_KEY no configurada' })

    const from =
      Deno.env.get('RESEND_FROM') ??
      'UEP Expedientes <onboarding@resend.dev>'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json(401, { error: 'Sesión inválida' })

    const body = (await req.json()) as Body
    if (!body?.expediente_id || !body?.area_destino_id) {
      return json(400, { error: 'Faltan expediente_id o area_destino_id' })
    }

    const { data: area, error: areaErr } = await admin
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
      .eq('id', body.area_destino_id)
      .maybeSingle()

    if (areaErr) return json(500, { error: areaErr.message })

    const resp = Array.isArray(area?.responsable) ? area?.responsable[0] : area?.responsable
    const toEmail = String(resp?.correo ?? '').trim()
    if (!toEmail) {
      return json(200, { ok: true, skipped: true, reason: 'Sin correo del responsable' })
    }

    let numero = body.numero_expediente ?? null
    let asunto = body.asunto ?? null
    if (!numero || !asunto) {
      const { data: exp } = await admin
        .from('expedientes')
        .select('numero_expediente,asunto')
        .eq('id', body.expediente_id)
        .maybeSingle()
      numero = numero || exp?.numero_expediente || '—'
      asunto = asunto || exp?.asunto || '—'
    }

    const tareas = (body.tareas ?? []).map(t => t.trim()).filter(Boolean)
    const destinatario = (resp?.nombre_completo ?? '').trim() || toEmail
    const origen = (body.area_origen_nombre ?? '').trim() || 'otra dependencia'
    const obs = (body.observacion ?? '').trim()

    const tareasSection = tareas.length
      ? `<p><strong>Tareas:</strong></p>
        <ul>${tareas.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : ''

    const subject = `Expediente derivado: ${numero}`
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px;color:#0f766e">Derivación de expediente</h2>
        <p>Hola <strong>${escapeHtml(destinatario)}</strong>,</p>
        <p>
          Se ha derivado el expediente <strong>${escapeHtml(String(numero))}</strong>
          a tu dependencia <strong>${escapeHtml(area?.nombre ?? '')}</strong>
          desde <strong>${escapeHtml(origen)}</strong>.
        </p>
        <p><strong>Asunto:</strong> ${escapeHtml(String(asunto).toUpperCase())}</p>
        ${obs ? `<p><strong>Observación:</strong> ${escapeHtml(obs)}</p>` : ''}
        ${tareasSection}
        <p style="margin-top:24px;font-size:12px;color:#64748b">
          Este mensaje fue enviado automáticamente por el sistema UEP Proyectos.
        </p>
      </div>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject,
        html,
      }),
    })

    const resendJson = await resendRes.json().catch(() => ({}))
    if (!resendRes.ok) {
      return json(502, {
        error: resendJson?.message || 'Error al enviar con Resend',
        details: resendJson,
      })
    }

    const usuarioId = resp?.user_id ? String(resp.user_id) : null
    if (usuarioId) {
      const descParts = [
        `Expediente ${numero}`,
        area?.nombre ? `→ ${area.nombre}` : null,
        obs || null,
      ].filter(Boolean)
      await admin.from('notificaciones').insert({
        usuario_id: usuarioId,
        titulo: `Expediente derivado: ${numero}`,
        descripcion: descParts.join(' · '),
        leida: false,
        expediente_id: payload.expediente_id,
      })
    }

    return json(200, {
      ok: true,
      email_id: resendJson?.id ?? null,
      to: toEmail,
      notified_user: !!usuarioId,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error inesperado'
    return json(500, { error: message })
  }
})

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
