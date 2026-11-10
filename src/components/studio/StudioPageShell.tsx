import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface StudioPageShellProps {
  /** Etiqueta superior en mayúsculas (p. ej. EJECUCIÓN). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/** Shell Soft Studio: eyebrow + título display fuera de la card. */
export function StudioPageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: StudioPageShellProps) {
  return (
    <div className={cn('fade-up space-y-5', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow != null && eyebrow !== '' && (
            <p className="sr-only">{eyebrow}</p>
          )}
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink dark:text-slate-100">
            {title}
          </h1>
          {description != null && description !== '' && (
            <p className="mt-1 max-w-3xl text-sm text-slate-400 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {actions != null && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  )
}
