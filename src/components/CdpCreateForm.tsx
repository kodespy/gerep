import { useEffect, useState, type ComponentProps } from 'react'
import { RecordForm } from './CrudModule'
import { Spinner } from './ui'
import { fetchNextCdpNumero, formatCdpNumero } from '../lib/cdpUtils'

type RecordFormProps = ComponentProps<typeof RecordForm>

/** Formulario de alta CDP con número automático (último + 1). */
export default function CdpCreateForm(props: Omit<RecordFormProps, 'initial'>) {
  const [initial, setInitial] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    let alive = true
    fetchNextCdpNumero()
      .then(cdp_numero => {
        if (alive) setInitial({ cdp_numero })
      })
      .catch(() => {
        if (alive) setInitial({ cdp_numero: formatCdpNumero(1, new Date().getFullYear()) })
      })
    return () => { alive = false }
  }, [])

  if (initial === null) return <Spinner label="Preparando formulario…" />

  return <RecordForm {...props} initial={initial} />
}
