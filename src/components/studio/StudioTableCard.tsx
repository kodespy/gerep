import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface StudioTableCardProps {
  /** Barra superior (búsqueda, acciones). */
  toolbar?: ReactNode
  /** Filtros debajo del toolbar. */
  filters?: ReactNode
  children: ReactNode
  className?: string
  /** Pie (paginación, etc.). */
  footer?: ReactNode
}

/** Card blanca Soft Studio para tablas: borde suave, sombra ligera, cabecera gris. */
export function StudioTableCard({
  toolbar,
  filters,
  children,
  className,
  footer,
}: StudioTableCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white text-ink shadow-studio',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        className,
      )}
    >
      {toolbar != null && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 dark:border-slate-800">
          {toolbar}
        </div>
      )}
      {filters != null && (
        <div className="border-b border-slate-100 bg-table-head/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          {filters}
        </div>
      )}
      {children}
      {footer != null && (
        <div className="border-t border-slate-100 bg-table-head/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
          {footer}
        </div>
      )}
    </div>
  )
}
