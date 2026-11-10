const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const PROBE_INTERVAL_MS = 30_000
const PROBE_TIMEOUT_MS = 8_000
/** navigator.onLine puede ser true sin internet real (WiFi sin salida); se confirma con el servidor. */
const FAILURES_BEFORE_OFFLINE = 2

export type ConnectionState = {
  online: boolean
  checking: boolean
  lastCheckedAt: number | null
}

let state: ConnectionState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  checking: false,
  lastCheckedAt: null,
}
let consecutiveFailures = 0
let intervalId: ReturnType<typeof setInterval> | null = null
let started = false
const listeners = new Set<(next: ConnectionState) => void>()

function setState(patch: Partial<ConnectionState>) {
  state = { ...state, ...patch }
  listeners.forEach(fn => fn(state))
}

async function probeServer(): Promise<boolean> {
  if (!SUPABASE_URL) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : undefined,
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Verifica la conexión. `immediate` marca offline al primer fallo (botón Reintentar). */
export async function checkConnection({ immediate = false } = {}): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    consecutiveFailures = FAILURES_BEFORE_OFFLINE
    setState({ online: false, checking: false, lastCheckedAt: Date.now() })
    return false
  }

  setState({ checking: true })
  const ok = await probeServer()

  if (ok) {
    consecutiveFailures = 0
    setState({ online: true, checking: false, lastCheckedAt: Date.now() })
    return true
  }

  consecutiveFailures += 1
  const offline = immediate || consecutiveFailures >= FAILURES_BEFORE_OFFLINE
  setState({
    online: offline ? false : state.online,
    checking: false,
    lastCheckedAt: Date.now(),
  })
  return false
}

function handleBrowserOnline() {
  void checkConnection({ immediate: true })
}

function handleBrowserOffline() {
  consecutiveFailures = FAILURES_BEFORE_OFFLINE
  setState({ online: false, checking: false, lastCheckedAt: Date.now() })
}

function handleVisibility() {
  if (document.visibilityState === 'visible') void checkConnection()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', handleBrowserOnline)
  window.addEventListener('offline', handleBrowserOffline)
  document.addEventListener('visibilitychange', handleVisibility)
  intervalId = setInterval(() => { void checkConnection() }, PROBE_INTERVAL_MS)
  void checkConnection()
}

function stop() {
  if (!started) return
  started = false
  window.removeEventListener('online', handleBrowserOnline)
  window.removeEventListener('offline', handleBrowserOffline)
  document.removeEventListener('visibilitychange', handleVisibility)
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}

export function getConnectionState(): ConnectionState {
  return state
}

export function subscribeConnection(listener: (next: ConnectionState) => void): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}
