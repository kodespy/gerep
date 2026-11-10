import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, WifiOff } from 'lucide-react'
import { cn } from '../lib/utils'

type Props = {
  open: boolean
  checking: boolean
  onRetry: () => void
}

/** Modal bloqueante sin conexión: no se puede cerrar, solo reintentar. */
export default function OfflineDialog({ open, checking, onRetry }: Props) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="offline-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="offline-title"
          aria-describedby="offline-desc"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.35)] dark:bg-slate-900 dark:shadow-black/50"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
              <WifiOff className="h-7 w-7" />
            </div>
            <h2 id="offline-title" className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sin conexión a internet
            </h2>
            <p id="offline-desc" className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              No se pudo conectar con el servidor. Revisá tu conexión y volvé a intentar.
            </p>
            <button
              type="button"
              onClick={onRetry}
              disabled={checking}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', checking && 'animate-spin')} />
              {checking ? 'Verificando…' : 'Reintentar'}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
