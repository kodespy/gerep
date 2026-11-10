import { useEffect, useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Modal } from './ui'
import RendicionControlFormularioPanel from './RendicionControlFormularioPanel'
import { supabase } from '../lib/supabase'

/** Botón que abre el Formulario de Control de la rendición. */
export default function RendicionControlFormularioButton({
  rendicionId,
  strNumero,
  onChanged,
}: {
  rendicionId: string
  strNumero?: string | null
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)

  const refreshCount = async () => {
    setLoadingCount(true)
    try {
      const { data, error } = await supabase
        .from('rendicion_control_formularios')
        .select('numero_formulario')
        .eq('rendicion_id', rendicionId)
      if (error) throw error
      const numeros = new Set(
        (data ?? [])
          .map((r: { numero_formulario?: string | null }) => (r.numero_formulario ?? '').trim())
          .filter(Boolean),
      )
      setCount(numeros.size)
    } catch {
      setCount(0)
    } finally {
      setLoadingCount(false)
    }
  }

  useEffect(() => {
    void refreshCount()
  }, [rendicionId])

  return (
    <>
      <button
        type="button"
        title="Formulario de control de rendición"
        onClick={e => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="relative rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
      >
        {loadingCount
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <ClipboardList className="h-4 w-4" />}
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[9px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          void refreshCount()
          onChanged?.()
        }}
        title={`Control de rendición${strNumero ? ` · STR ${strNumero}` : ''}`}
        wide
      >
        <div className="max-h-[min(75vh,720px)] overflow-y-auto pr-1">
          <RendicionControlFormularioPanel rendicionId={rendicionId} />
        </div>
      </Modal>
    </>
  )
}
