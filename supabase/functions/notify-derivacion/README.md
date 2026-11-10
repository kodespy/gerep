# Notificación de derivación (Resend)

## Desarrollo (ya configurado)

1. La clave está en `.env.local` (`RESEND_API_KEY`).
2. Reiniciá `npm run dev` para cargar el proxy `/api/notify-derivacion`.
3. Al derivar un expediente se envía correo al **correo del responsable** del área destino.

Remitente por defecto: `UEP Expedientes <onboarding@resend.dev>`  
(con el dominio de prueba de Resend solo podés enviar a tu propio email de la cuenta Resend, hasta verificar un dominio propio).

## Producción (Supabase Edge Function)

```bash
supabase login
supabase link --project-ref oumwtlgiwakcuhzsrjus
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="UEP Expedientes <onboarding@resend.dev>"
supabase functions deploy notify-derivacion
```

Función: `supabase/functions/notify-derivacion`
