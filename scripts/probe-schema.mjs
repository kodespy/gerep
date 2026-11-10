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

async function tryTable(t) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!r.ok) return null
  const data = await r.json()
  return { table: t, keys: data[0] ? Object.keys(data[0]) : [] }
}

const tables = [
  'convenio_archivos', 'convenios_archivos', 'archivos_convenio', 'convenio_adjuntos',
  'convenio_documentos', 'documentos_convenio', 'adjuntos', 'archivos', 'documentos',
  'convenio_files', 'files', 'convenios',
]
for (const t of tables) {
  const res = await tryTable(t)
  if (res) console.log(JSON.stringify(res))
}
