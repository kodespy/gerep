import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Escribe un parche de query string. `replace` evita saturar el historial al tipear. */
export function usePatchSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const patch = useCallback((
    updates: Record<string, string | number | boolean | null | undefined>,
    opts?: { replace?: boolean },
  ) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === '' || value === false) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    }, { replace: opts?.replace ?? true })
  }, [setSearchParams])

  return { searchParams, patch }
}

export function readSearchString(sp: URLSearchParams, key: string, fallback = ''): string {
  return sp.get(key) ?? fallback
}

export function readSearchInt(sp: URLSearchParams, key: string, fallback: number): number {
  const raw = Number(sp.get(key))
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}
