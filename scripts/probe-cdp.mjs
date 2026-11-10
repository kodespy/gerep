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

async function hasColumn(table, col) {
  const r = await fetch(`${url}/rest/v1/${table}?select=${col}&limit=0`, { headers: h })
  return r.ok
}

const cols = [
  'id', 'cdp_numero', 'cdp_date', 'proyecto_id', 'tipo_movimiento', 'descripcion', 'monto_comprometido',
  'estado', 'created_by', 'user_id', 'created_at', 'archivo_adjunto', 'archivo_url', 'compromiso_anterior',
  'monto_anterior', 'comp_anterior', 'observaciones', 'hora_cdp',
]
const existing = []
for (const c of cols) {
  if (await hasColumn('budget_commitments', c)) existing.push(c)
}
console.log('budget_commitments columns:', existing.join(', '))

const buckets = ['cdp_adjuntos', 'cdp-archivos', 'cdp_archivos', 'budget_commitments', 'cdps']
for (const b of buckets) {
  const r = await fetch(`${url}/storage/v1/bucket/${b}`, { headers: h })
  console.log('bucket', b, r.status)
}
