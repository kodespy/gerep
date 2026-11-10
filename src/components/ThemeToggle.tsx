import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getStoredTheme, toggleTheme, type ThemeMode } from '../lib/theme'

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  return (
    <button
      type="button"
      title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      aria-label={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setMode(toggleTheme())}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
    >
      {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
