import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

type Body = {
  to: string
  subject: string
  html: string
}

async function readJson(req: import('http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

/** Proxy local de Resend (solo `vite` / `vite preview`). La API key nunca llega al browser. */
export function resendDerivacionPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.RESEND_API_KEY || ''
  const from = env.RESEND_FROM || 'UEP Expedientes <onboarding@resend.dev>'

  const handler = async (
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    if (!req.url?.startsWith('/api/notify-derivacion')) {
      next()
      return
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    try {
      if (!apiKey) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'RESEND_API_KEY no configurada en .env.local' }))
        return
      }

      const body = (await readJson(req)) as Body
      if (!body?.to || !body?.subject || !body?.html) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Faltan to, subject o html' }))
        return
      }

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [body.to],
          subject: body.subject,
          html: body.html,
        }),
      })
      const data = await r.json().catch(() => ({}))
      res.statusCode = r.ok ? 200 : 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(r.ok ? { ok: true, id: data?.id ?? null } : { error: data?.message || 'Resend error', details: data }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Error' }))
    }
  }

  return {
    name: 'resend-derivacion-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
