import { supabase } from './supabase'

export const AVATAR_BUCKET = 'avatars'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

/** Convierte avatar_url de profiles (URL absoluta o path de storage) a URL usable en <img>. */
export function resolveAvatarUrl(
  avatarUrl: string | null | undefined,
  cacheKey?: string | number | null,
): string | null {
  const raw = (avatarUrl ?? '').trim()
  if (!raw) return null

  let url: string | null = null
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    url = raw
  } else {
    const path = raw.replace(/^\/+/, '')
    const bucketMatch = path.match(/^(avatars|objects)\/(.+)$/i)
    if (bucketMatch) {
      const { data } = supabase.storage.from(bucketMatch[1]).getPublicUrl(bucketMatch[2])
      url = data.publicUrl || null
    } else {
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      url = data.publicUrl || null
    }
  }

  if (!url || url.startsWith('data:')) return url
  const bust = cacheKey != null && String(cacheKey) !== '' ? String(cacheKey) : ''
  if (!bust) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${encodeURIComponent(bust)}`
}

function extFromFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

function objectPathFromAvatarUrl(avatarUrl: string | null | undefined, userId: string): string | null {
  const raw = (avatarUrl ?? '').trim()
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('data:')) return null
  const objectPath = raw.replace(/^avatars\//i, '').replace(/^\/+/, '')
  if (!objectPath.startsWith(`${userId}/`)) return null
  return objectPath
}

/** Sube la imagen al bucket avatars y actualiza profiles.avatar_url. Devuelve el path guardado. */
export async function uploadUserAvatar(
  userId: string,
  file: File,
  previousAvatarUrl?: string | null,
): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Formato no permitido. Usá JPG, PNG, WEBP o GIF.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('La imagen no puede superar 2 MB.')
  }

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new Error('Debe iniciar sesión para cambiar el avatar.')

  const ext = extFromFile(file)
  // Path único para invalidar caché del navegador / CDN
  const path = `${userId}/avatar-${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    cacheControl: '60',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (upErr) {
    if (/bucket not found/i.test(upErr.message)) {
      throw new Error('El bucket "avatars" no está disponible. Ejecute la migración 011_storage_avatars.sql en Supabase.')
    }
    throw upErr
  }

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ avatar_url: path, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (dbErr) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
    throw dbErr
  }

  const oldPath = objectPathFromAvatarUrl(previousAvatarUrl, userId)
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
  }

  return path
}

/** Quita el avatar del perfil. */
export async function clearUserAvatar(userId: string, currentPath?: string | null): Promise<void> {
  const objectPath = objectPathFromAvatarUrl(currentPath, userId)
  if (objectPath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]).catch(() => undefined)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}
