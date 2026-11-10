import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(Boolean)
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
const h = { apikey: key, Authorization: `Bearer ${key}` }

const r = await fetch(`${url}/rest/v1/modificaciones_administrativas?select=*&limit=1`, { headers: h })
console.log('status', r.status)
const t = await r.text()
console.log(t.slice(0, 500))
