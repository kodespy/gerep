import { Wifi, WifiOff } from 'lucide-react'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { cn } from '../lib/utils'
import OfflineDialog from './OfflineDialog'

type Props = {
  /** Si es false, solo el chip (el modal se monta en otro lado). Por defecto incluye el modal. */
  withDialog?: boolean
}

export default function ConnectionStatusButton({ withDialog = true }: Props) {
  const connection = useConnectionStatus()

  return (
    <>
      <button
        type="button"
        onClick={() => { void connection.retry() }}
        disabled={connection.checking}
        title={
          connection.online
            ? 'Conectado a internet · clic para verificar'
            : 'Sin conexión · clic para reintentar'
        }
        aria-label={connection.online ? 'Conectado a internet' : 'Sin conexión a internet'}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors',
          connection.online
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80'
            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950/80',
        )}
      >
        <span className="relative flex h-2 w-2">
          {connection.online ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex h-2 w-2 rounded-full',
              connection.online ? 'bg-emerald-500' : 'bg-rose-500',
            )}
          />
        </span>
        {connection.online ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
        <span className="hidden md:inline">{connection.online ? 'En línea' : 'Sin conexión'}</span>
      </button>
      {withDialog ? (
        <OfflineDialog
          open={!connection.online}
          checking={connection.checking}
          onRetry={() => { void connection.retry() }}
        />
      ) : null}
    </>
  )
}
