import { useEffect, useRef } from 'react'
import {
  fetchNextActaNumero,
  normalizeActaTipo,
  yearFromActaFecha,
  type ActaTipo,
} from '../lib/actaNumero'

/** Recalcula el N° de acta al cambiar Ordinaria / Extraordinaria. */
export default function ActaTipoNumeroSync({
  tipo,
  fecha,
  patchValues,
}: {
  tipo?: string
  fecha?: string
  patchValues?: (partial: Record<string, any>) => void
}) {
  const patchRef = useRef(patchValues)
  patchRef.current = patchValues
  const prevTipo = useRef<ActaTipo | null>(null)

  useEffect(() => {
    const nextTipo = normalizeActaTipo(tipo)
    if (prevTipo.current == null) {
      prevTipo.current = nextTipo
      return
    }
    if (prevTipo.current === nextTipo) return
    prevTipo.current = nextTipo
    let cancelled = false
    void fetchNextActaNumero(yearFromActaFecha(fecha), nextTipo)
      .then(numero => {
        if (!cancelled && numero) patchRef.current?.({ numero })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tipo, fecha])

  return null
}
