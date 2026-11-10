import { useMemo } from 'react'
import CrudModule, { type CrudConfig } from '../../components/CrudModule'
import MemoFirmadoRowActions from '../../components/MemoFirmadoRowActions'
import MemoCargaMasiva from '../../components/MemoCargaMasiva'
import { memosConfig } from '../../config/memos'
import { useAuth } from '../../context/AuthContext'
import { isDesarrollador } from '../../lib/roles'

export default function Memos() {
  const { profile } = useAuth()
  const puedeCargaMasiva = isDesarrollador(profile?.role)

  const cfg: CrudConfig = useMemo(() => {
    const base = memosConfig()
    return {
      ...base,
      rowActions: (row: any, reload: () => void) => (
        <MemoFirmadoRowActions row={row} reload={reload} />
      ),
      toolbarExtra: puedeCargaMasiva
        ? ({ reload }) => <MemoCargaMasiva onImported={reload} />
        : undefined,
    }
  }, [puedeCargaMasiva])

  return <CrudModule {...cfg} />
}
