import { supabase } from './supabase'

export const STORAGE_BUCKET_CONVENIOS_ADJUNTOS = 'convenios_adjuntos'
export const STORAGE_BUCKET_RESOLUTIONS_ARCHIVOS = 'resolutions-archivos'
export const STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS = 'expedientes_adjuntos'
export const STORAGE_BUCKET_ACTA_ARCHIVOS = 'acta-archivos'
export const STORAGE_BUCKET_PROYECTO_ADJUNTOS = 'proyecto_adjuntos'
export const STORAGE_BUCKET_RENDICION_ARCHIVOS = 'rendicion-archivos'
export const STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS = 'proyecto-control-formularios'
export const STORAGE_BUCKET_STR_ARCHIVOS = 'str-archivos'
export const STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS = 'proyecto-informes-tecnicos'
export const STORAGE_BUCKET_STR_CONTROL_FORMULARIOS = 'str-control-formularios'
export const STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS = 'proyecto-control-desembolsos'
export const STORAGE_BUCKET_MEMO_ARCHIVOS = 'memo-archivos'

const KNOWN_BUCKET_PREFIXES = [
  STORAGE_BUCKET_CONVENIOS_ADJUNTOS,
  STORAGE_BUCKET_RESOLUTIONS_ARCHIVOS,
  STORAGE_BUCKET_EXPEDIENTES_ADJUNTOS,
  STORAGE_BUCKET_ACTA_ARCHIVOS,
  STORAGE_BUCKET_PROYECTO_ADJUNTOS,
  STORAGE_BUCKET_RENDICION_ARCHIVOS,
  STORAGE_BUCKET_PROYECTO_CONTROL_FORMULARIOS,
  STORAGE_BUCKET_STR_ARCHIVOS,
  STORAGE_BUCKET_PROYECTO_INFORMES_TECNICOS,
  STORAGE_BUCKET_STR_CONTROL_FORMULARIOS,
  STORAGE_BUCKET_PROYECTO_CONTROL_DESEMBOLSOS,
  STORAGE_BUCKET_MEMO_ARCHIVOS,
  'objects',
] as const

/** UUID seguro: randomUUID no existe en HTTP / algunos navegadores. */
function newStorageId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID()
    } catch {
      /* insecure context */
    }
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Convierte URL o path con prefijo de bucket a ruta relativa dentro del bucket. */
export function normalizeStoragePath(input: string, bucket?: string): string {
  const raw = input.trim()
  if (!raw) return raw

  const objectMarker = '/storage/v1/object/'
  const idx = raw.indexOf(objectMarker)
  if (idx >= 0) {
    const rest = raw.slice(idx + objectMarker.length).split('?')[0]
    const segments = rest.split('/').filter(Boolean)
    if (segments[0] === 'public' || segments[0] === 'sign' || segments[0] === 'authenticated') segments.shift()
    if (bucket && segments[0] === bucket) segments.shift()
    else if (segments[0] && KNOWN_BUCKET_PREFIXES.includes(segments[0] as typeof KNOWN_BUCKET_PREFIXES[number])) segments.shift()
    return segments.join('/')
  }

  const prefixes = bucket ? [bucket, ...KNOWN_BUCKET_PREFIXES] : [...KNOWN_BUCKET_PREFIXES]
  for (const prefix of prefixes) {
    if (raw.startsWith(`${prefix}/`)) return raw.slice(prefix.length + 1)
  }
  return raw
}

/** Nombre de archivo válido para keys de Supabase Storage (sin espacios ni acentos). */
export function sanitizeStorageFileName(name: string): string {
  const raw = (name || 'archivo').trim() || 'archivo'
  const lastDot = raw.lastIndexOf('.')
  const base = lastDot > 0 ? raw.slice(0, lastDot) : raw
  const ext = lastDot > 0 ? raw.slice(lastDot + 1) : ''

  const asciiBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 80) || 'archivo'

  const asciiExt = ext
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 12)
    .toLowerCase()

  return asciiExt ? `${asciiBase}.${asciiExt}` : asciiBase
}

export async function uploadStorageFile(bucket: string, prefix: string, file: File): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new Error('Debe iniciar sesión para adjuntar archivos.')

  const safePrefix = prefix
    .split('/')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.replace(/[^a-zA-Z0-9._-]+/g, '_'))
    .join('/')
  const safeName = sanitizeStorageFileName(file.name)
  const path = `${safePrefix}/${newStorageId()}-${safeName}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(`El bucket "${bucket}" no está disponible en Storage. Verifique la configuración en Supabase.`)
    }
    if (/invalid key/i.test(error.message)) {
      throw new Error('Nombre de archivo no válido para Storage. Intente con un nombre más corto, sin espacios ni símbolos.')
    }
    throw error
  }
  return path
}

/** Obtiene URL para abrir/descargar un objeto (firmada, pública o blob). */
export async function getStorageFileUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  const objectPath = normalizeStoragePath(path, bucket)
  if (!objectPath) throw new Error('Ruta de archivo inválida.')

  const signed = await supabase.storage.from(bucket).createSignedUrl(objectPath, expiresIn)
  if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  if (pub.publicUrl) {
    try {
      const probe = await fetch(pub.publicUrl, { method: 'HEAD' })
      if (probe.ok) return pub.publicUrl
    } catch {
      /* private bucket / CORS — seguir con download */
    }
  }

  const { data, error } = await supabase.storage.from(bucket).download(objectPath)
  if (error) {
    throw new Error(signed.error?.message || error.message || 'No se pudo acceder al archivo adjunto.')
  }
  return URL.createObjectURL(data)
}

/** Descarga el archivo vía blob (evita bloqueo de popups del navegador). */
export async function downloadStorageFile(bucket: string, path: string): Promise<void> {
  const objectPath = normalizeStoragePath(path, bucket)
  if (!objectPath) throw new Error('Ruta de archivo inválida.')

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new Error('Debe iniciar sesión para descargar archivos.')

  let blob: Blob | null = null
  const downloaded = await supabase.storage.from(bucket).download(objectPath)
  if (!downloaded.error && downloaded.data) {
    blob = downloaded.data
  } else {
    // Fallback: signed URL → fetch blob (mismo origen de sesión)
    const signed = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600)
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(
        downloaded.error?.message
        || signed.error?.message
        || 'No se pudo descargar el archivo. Verifique que exista en Storage.',
      )
    }
    const res = await fetch(signed.data.signedUrl)
    if (!res.ok) {
      throw new Error(`No se pudo descargar el archivo (${res.status}).`)
    }
    blob = await res.blob()
  }

  const fileName = storageFileLabel(path, bucket) || 'adjunto'
  const blobUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
  }
}

/** Abre o descarga un adjunto. Preferimos descarga directa para no depender de popups. */
export async function openStorageFile(bucket: string, path: string): Promise<void> {
  await downloadStorageFile(bucket, path)
}

export function storageFileLabel(path: string | null | undefined, bucket?: string): string {
  if (!path) return '—'
  const normalized = normalizeStoragePath(path, bucket)
  const base = normalized.split('/').pop() ?? normalized
  const dash = base.indexOf('-')
  return dash > 0 ? base.slice(dash + 1) : base
}

/** @deprecated Use normalizeStoragePath */
export const normalizeObjectPath = normalizeStoragePath

/** @deprecated Use storageFileLabel */
export const objectFileLabel = storageFileLabel

/** @deprecated Use openStorageFile */
export async function openObjectFile(path: string): Promise<void> {
  return openStorageFile(STORAGE_BUCKET_CONVENIOS_ADJUNTOS, path)
}

/** @deprecated Use uploadStorageFile */
export async function uploadObjectFile(prefix: string, file: File): Promise<string> {
  return uploadStorageFile(STORAGE_BUCKET_CONVENIOS_ADJUNTOS, prefix, file)
}

/** @deprecated Use getStorageFileUrl */
export async function getObjectFileUrl(path: string, expiresIn = 3600): Promise<string> {
  return getStorageFileUrl(STORAGE_BUCKET_CONVENIOS_ADJUNTOS, path, expiresIn)
}
