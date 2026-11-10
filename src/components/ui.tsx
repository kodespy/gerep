import { type ReactNode } from 'react'
import {
  Alert,
  Badge as FbBadge,
  Button,
  Card as FbCard,
  Modal as FbModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from 'flowbite-react'
import { Inbox, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

const badgeClassMap: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100',
  red: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
  slate: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
  mint: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        badgeClassMap[color] ?? badgeClassMap.slate,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500 dark:text-gray-400">
      <div className="relative h-16 w-16" role="status" aria-label={label}>
        <span
          className="absolute inset-0 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400"
          aria-hidden
        />
        <img
          src="/app-icon.png?v=6"
          alt=""
          className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 object-contain p-1.5 dark:bg-slate-800"
        />
      </div>
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-600 dark:text-gray-400">
      <Inbox className="h-9 w-9" strokeWidth={1.4} aria-hidden />
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
      {hint && <p className="max-w-md text-center text-xs text-gray-600 dark:text-gray-400">{hint}</p>}
      {action}
    </div>
  )
}

export function LoadErrorState({
  title = 'No se pudieron cargar los datos',
  detail,
  onRetry,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 py-14 text-rose-800">
      <AlertTriangle className="h-9 w-9" strokeWidth={1.4} aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="max-w-md text-center text-xs text-rose-700">{detail}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <FbCard
      className={cn(className)}
      theme={{
        root: {
          base: 'glass-effect shadow-studio flex rounded-[1.35rem] border border-slate-200/80 bg-white text-ink dark:border-slate-700 dark:bg-slate-900',
          children: 'flex h-full min-w-0 flex-col',
        },
      }}
    >
      {children}
    </FbCard>
  )
}

/** Deduce color from common estado values across modules. */
export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <Badge>—</Badge>
  const e = estado.toLowerCase()
  let color = 'slate'
  if (['aprobado', 'aprobada', 'finalizado', 'activo', 'vigente', 'completado', 'pagado', 'presentado', 'presentada', 'procesado'].some(k => e.includes(k))) color = 'green'
  else if (['pendiente', 'en proceso', 'en_proceso', 'proceso', 'borrador', 'en revision', 'en revisión', 'parcial'].some(k => e.includes(k))) color = 'amber'
  else if (['rechazado', 'rechazada', 'anulado', 'anulada', 'observado', 'observada', 'vencido'].some(k => e.includes(k))) color = 'red'
  else if (['nuevo', 'ingresado', 'recibido', 'inicio'].some(k => e.includes(k))) color = 'blue'
  return <Badge color={color}>{estado}</Badge>
}

export function Modal({ open, onClose, title, children, wide = false, nested = false }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; nested?: boolean
}) {
  return (
    <FbModal
      show={open}
      onClose={onClose}
      size={wide ? '4xl' : '2xl'}
      dismissible
      position="top-center"
      className={nested ? 'z-[80]' : 'z-[70]'}
    >
      <ModalHeader>{title}</ModalHeader>
      <ModalBody className="space-y-0">{children}</ModalBody>
    </FbModal>
  )
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  message,
  title = 'Confirmar eliminación',
  confirmLabel = 'Eliminar',
  tone = 'danger',
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  message: string
  title?: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}) {
  const danger = tone === 'danger'
  return (
    <FbModal show={open} onClose={onCancel} size="md" popup dismissible className="z-[80]">
      <ModalHeader />
      <ModalBody>
        <div className="text-center">
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${danger ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40'}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            {message || '¿Desea eliminar este registro? Esta acción no se puede deshacer.'}
          </p>
          <div className="flex justify-center gap-3">
            <Button color="alternative" onClick={onCancel}>
              Cancelar
            </Button>
            <Button color={danger ? 'failure' : 'dark'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </ModalBody>
    </FbModal>
  )
}

/** Bloqueo de borrado por registros vinculados. */
export function DeleteBlockedDialog({
  open,
  onClose,
  title,
  description,
  vinculos,
}: {
  open: boolean
  onClose: () => void
  title?: string
  description?: ReactNode
  vinculos: { label: string; count: number }[]
}) {
  return (
    <FbModal show={open} onClose={onClose} size="md" dismissible className="z-[80]">
      <ModalHeader>{title || 'No se puede eliminar'}</ModalHeader>
      <ModalBody>
        <Alert color="failure" className="mb-4">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              {description ?? 'El registro está vinculado con otros datos y no puede eliminarse mientras existan relaciones.'}
            </div>
          </div>
        </Alert>
        {vinculos.length > 0 && (
          <ul className="space-y-2">
            {vinculos.map(v => (
              <li
                key={v.label}
                className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm dark:bg-red-950/40"
              >
                <span className="font-semibold text-gray-700 dark:text-gray-200">{v.label}</span>
                <FbBadge color="failure">
                  {v.count} registro{v.count === 1 ? '' : 's'}
                </FbBadge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Elimine o reasigne los registros vinculados e intente nuevamente.
        </p>
      </ModalBody>
      <ModalFooter className="justify-end">
        <Button color="dark" onClick={onClose}>
          Entendido
        </Button>
      </ModalFooter>
    </FbModal>
  )
}

export function StatCard({ icon, label, value, sub, tone = 'brand' }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'sky' | 'rose' | 'violet' | 'mint'
}) {
  const tones: Record<string, string> = {
    brand: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    amber: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    sky: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    rose: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    violet: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    mint: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          {sub && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
      </div>
    </Card>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow = 'Gestión',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow != null && eyebrow !== '' && (
          <p className="sr-only">{eyebrow}</p>
        )}
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink dark:text-white">
          {title}
        </h1>
        {subtitle != null && subtitle !== '' && (
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
