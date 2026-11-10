import CrudModule from '../../components/CrudModule'
import { devolucionesConfig } from '../../config/modules'

export default function Devoluciones() {
  const cfg = devolucionesConfig()
  return <CrudModule {...cfg} embedded={false} />
}
