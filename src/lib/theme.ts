export type ThemeMode = 'light' | 'dark'

const KEY = 'uep.theme'

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light') return v
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  try {
    localStorage.setItem(KEY, mode)
  } catch { /* ignore */ }
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  applyTheme(next)
  return next
}
