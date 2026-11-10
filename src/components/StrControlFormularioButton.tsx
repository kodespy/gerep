import { useEffect, useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Modal } from './ui'
import StrControlFormularioPanel from './StrControlFormularioPanel'
import { supabase } from '../lib/supabase'

/** Botón que abre el Control Documental del STR (str_documento_control). */
export default function StrControlFormularioButton({
  strId,
  strNumero,
  onChanged,
}: {
  strId: string
  strNumero?: string | null
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)

  const refreshCount = async () => {
    setLoadingCount(true)
    try {
      const { count: c, error } = await supabase
        .from('str_documento_control')
        .select('id', { count: 'exact', head: true })
        .eq('str_id', strId)
      if (error) throw error
      setCount(c ?? 0)
    } catch {
      setCount(0)
    } finally {
      setLoadingCount(false)
    }
  }

  useEffect(() => {
    void refreshCount()
  }, [strId])

  return (
    <>
      <button
        type="button"
        title="Control documental de STR"
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
        title={`Control documental · STR${strNumero ? ` ${strNumero}` : ''}`}
        wide
      >
        <div className="max-h-[min(75vh,720px)] overflow-y-auto pr-1">
          <StrControlFormularioPanel strId={strId} />
        </div>
      </Modal>
    </>
  )
}
