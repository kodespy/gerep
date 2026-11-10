export type NotificationStyle = 'toast' | 'banner' | 'none'
export type NotificationDuration = 'short' | 'normal' | 'long'

export interface UserContactPrefs {
  telefono: string
  direccion: string
  avatarUrl: string
}

export interface UserNotificationPrefs {
  derivacionExpedientes: boolean
  nuevasTareas: boolean
  avisosSistema: boolean
  estilo: NotificationStyle
  duracion: NotificationDuration
  modulos: Record<string, boolean>
}

export const NOTIF_MODULES = [
  { key: 'expedientes', label: 'Expedientes' },
  { key: 'actas', label: 'Actas' },
  { key: 'memos', label: 'Memos' },
  { key: 'rendiciones', label: 'Rendiciones' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'strs', label: 'STRs' },
  { key: 'convenios', label: 'Convenios' },
  { key: 'marcaciones', label: 'Marcaciones' },
] as const

const CONTACT_KEY = (uid: string) => `uep.perfil.contact.${uid}`
const NOTIF_KEY = (uid: string) => `uep.perfil.notif.${uid}`

const defaultContact: UserContactPrefs = { telefono: '', direccion: '', avatarUrl: '' }

const defaultNotif: UserNotificationPrefs = {
  derivacionExpedientes: false,
  nuevasTareas: false,
  avisosSistema: false,
  estilo: 'toast',
  duracion: 'normal',
  modulos: Object.fromEntries(NOTIF_MODULES.map(m => [m.key, false])),
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

export function loadContactPrefs(userId: string): UserContactPrefs {
  return readJson(CONTACT_KEY(userId), defaultContact)
}

export function saveContactPrefs(userId: string, prefs: UserContactPrefs): void {
  localStorage.setItem(CONTACT_KEY(userId), JSON.stringify(prefs))
}

export function loadNotificationPrefs(userId: string): UserNotificationPrefs {
  const data = readJson(NOTIF_KEY(userId), defaultNotif)
  return {
    ...defaultNotif,
    ...data,
    modulos: { ...defaultNotif.modulos, ...(data.modulos ?? {}) },
  }
}

export function saveNotificationPrefs(userId: string, prefs: UserNotificationPrefs): void {
  localStorage.setItem(NOTIF_KEY(userId), JSON.stringify(prefs))
}
