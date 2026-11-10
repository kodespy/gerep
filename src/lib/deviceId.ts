const STORAGE_KEY = 'uep.asistencia.device_id'

/** Identificador estable del navegador/dispositivo para asociar a marcaciones. */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing && /^DEV-[A-Z0-9]+$/i.test(existing)) return existing.toUpperCase()
  } catch {
    /* ignore */
  }
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  const id = `DEV-${hex}`
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}
