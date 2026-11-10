import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export function Accordion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-slate-100 ${className}`}>{children}</div>
}

interface AccordionItemProps {
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AccordionItem({ title, icon, children, defaultOpen = false, onOpenChange }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  const toggle = () => {
    setOpen(v => {
      const next = !v
      onOpenChange?.(next)
      return next
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon && <span className="shrink-0 text-brand-600">{icon}</span>}
        <span className="flex-1">{title}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4" onClick={e => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}
