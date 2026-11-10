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

async function tryTable(t) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: h })
  if (!r.ok) return null
  const data = await r.json()
  return { table: t, keys: data[0] ? Object.keys(data[0]) : [] }
}

const resolutionCols = [
  'id', 'numero', 'fecha', 'fecha_recepcion', 'descripcion', 'observaciones', 'proyecto_id',
  'created_by', 'created_at', 'updated_at', 'user_id', 'monto', 'estado', 'tipo',
  'archivo', 'adjunto', 'archivo_path', 'file_path', 'storage_path', 'documento',
  'documento_path', 'ruta_archivo', 'archivo_url', 'url_archivo', 'file_url',
  'nombre_archivo', 'path', 'file', 'pdf', 'scan', 'link', 'url',
  'archivo_resolucion', 'resolution_file', 'attachment', 'adjunto_path',
  'archivo_adjunto', 'archivo_documento', 'documento_adjunto',
]

const existing = []
for (const c of resolutionCols) {
  if (await hasColumn('resolutions', c)) existing.push(c)
}
console.log('resolutions columns:', existing.join(', '))

const tables = [
  'resolution_archivos', 'resolutions_archivos', 'resolutions_files', 'resolution_files',
  'resolution_attachments', 'resoluciones_archivos', 'archivos_resolucion', 'archivos_resoluciones',
  'resolution_documents', 'resolutions_documents',
]
for (const t of tables) {
  const res = await tryTable(t)
  if (res) console.log(JSON.stringify(res))
}
