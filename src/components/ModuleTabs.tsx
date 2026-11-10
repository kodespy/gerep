import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/utils'

export type ModuleTab<T extends string = string> = {
  id: T
  label: string
  icon?: ReactNode
}

/**
 * Pestañas WAI-ARIA (tabs): tablist + tab + tabpanel, teclado flechas/Home/End.
 * El contenido de cada pestaña se monta fuera; este componente solo navega.
 */
export default function ModuleTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: readonly ModuleTab<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  className?: string
}) {
  const baseId = useId()

  const move = (from: T, delta: number) => {
    const i = tabs.findIndex(t => t.id === from)
    if (i < 0) return
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    onChange(next.id)
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: T) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(id, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(id, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(tabs[0].id)
      document.getElementById(`${baseId}-tab-${tabs[0].id}`)?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = tabs[tabs.length - 1]
      onChange(last.id)
      document.getElementById(`${baseId}-tab-${last.id}`)?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700', className)}
    >
      {tabs.map(t => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            id={`${baseId}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKeyDown(e, t.id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-brand-600 bg-white text-brand-800 dark:bg-slate-900 dark:text-slate-100'
                : 'border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function ModuleTabPanel<T extends string>({
  tabId,
  active,
  labelledBy,
  children,
}: {
  tabId: T
  active: boolean
  labelledBy?: string
  children: ReactNode
}) {
  const baseHint = labelledBy
  return (
    <div
      role="tabpanel"
      hidden={!active}
      aria-labelledby={baseHint}
      id={undefined}
    >
      {active ? children : null}
    </div>
  )
}
