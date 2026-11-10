import { GitBranch } from 'lucide-react'
import { Modal } from './ui'
import ExpedienteSeguimientoPanel from './ExpedienteSeguimientoPanel'

export default function ExpedienteSeguimientoModal({
  open,
  onClose,
  expedienteId,
  numeroExpediente,
  asunto,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string | null
  numeroExpediente?: string | null
  asunto?: string | null
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-brand-600" />
          Seguimiento{numeroExpediente ? ` · ${numeroExpediente}` : ''}
        </span>
      }
    >
      {open ? (
        <ExpedienteSeguimientoPanel
          expedienteId={expedienteId}
          numeroExpediente={numeroExpediente}
          asunto={asunto}
        />
      ) : null}
    </Modal>
  )
}
