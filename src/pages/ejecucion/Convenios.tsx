import CrudModule from '../../components/CrudModule'
import { conveniosConfig } from '../../config/modules'

export default function Convenios() {
  return <CrudModule {...conveniosConfig()} />
}
