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

const tables = [
  'adendas_administrativo', 'adendas_administrativas', 'adenda_planes_administrativos',
  'adendas_plan_admin', 'plan_admin_adendas', 'adendas_planes_admin',
]
for (const t of tables) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: h })
  if (r.ok) {
    const data = await r.json()
    console.log(t, data[0] ? Object.keys(data[0]).join(', ') : '(empty)')
  } else console.log(t, r.status)
}

// all cols on adendas
const cols = ['plan_administrativo_id', 'plan_financiero_administrativo_id', 'planes_financieros_administrativos_id']
for (const c of cols) {
  const r = await fetch(`${url}/rest/v1/adendas?select=${c}&limit=0`, { headers: h })
  console.log('adendas.' + c, r.ok ? 'OK' : r.status)
}
