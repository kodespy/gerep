import { History } from 'lucide-react'
import ModificacionesAdminPanel from './ModificacionesAdminPanel'
import { Modal } from './ui'

interface ModificacionesAdminModalProps {
  plan: any
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export default function ModificacionesAdminModal({ plan, open, onClose, onSaved }: ModificacionesAdminModalProps) {
  if (!open) return null

  return (
    <Modal
      open
      onClose={onClose}
      wide
      nested
      title={(
        <span className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-500" />
          Gestión de Modificaciones (Adendas)
        </span>
      )}
    >
      <ModificacionesAdminPanel plan={plan} onMutated={onSaved} showHeader={false} />
    </Modal>
  )
}
