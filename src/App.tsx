import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import { Spinner } from './components/ui'

const AppLayout = lazy(() => import('./layout/AppLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Actividades = lazy(() => import('./pages/planificacion/Actividades'))
const ProgramasExplorer = lazy(() => import('./pages/planificacion/ProgramasExplorer'))
const PlanesAdministrativos = lazy(() => import('./pages/planificacion/PlanesAdministrativos'))
const ProyectosList = lazy(() => import('./pages/proyectos/ProyectosList'))
const ProyectoDetail = lazy(() => import('./pages/proyectos/ProyectoDetail'))
const Actas = lazy(() => import('./pages/ejecucion/Actas'))
const Resoluciones = lazy(() => import('./pages/ejecucion/Resoluciones'))
const Convenios = lazy(() => import('./pages/ejecucion/Convenios'))
const Cdp = lazy(() => import('./pages/ejecucion/Cdp'))
const Strs = lazy(() => import('./pages/pagos/Strs'))
const Devoluciones = lazy(() => import('./pages/pagos/Devoluciones'))
const Rendiciones = lazy(() => import('./pages/pagos/Rendiciones'))
const Memos = lazy(() => import('./pages/memos/Memos'))
const Expedientes = lazy(() => import('./pages/expedientes/Expedientes'))
const ExpedienteDetail = lazy(() => import('./pages/expedientes/ExpedienteDetail'))
const Entidades = lazy(() => import('./pages/catalogos/Catalogos').then(m => ({ default: m.Entidades })))
const Proveedores = lazy(() => import('./pages/catalogos/Catalogos').then(m => ({ default: m.Proveedores })))
const Fuentes = lazy(() => import('./pages/catalogos/Catalogos').then(m => ({ default: m.Fuentes })))
const Areas = lazy(() => import('./pages/catalogos/Catalogos').then(m => ({ default: m.Areas })))
const Funcionarios = lazy(() => import('./pages/catalogos/Catalogos').then(m => ({ default: m.Funcionarios })))
const ObjetosGasto = lazy(() => import('./pages/catalogos/ObjetosGasto').then(m => ({ default: m.ObjetosGasto })))
const Perfil = lazy(() => import('./pages/Perfil'))
const MarcacionesReporte = lazy(() => import('./pages/MarcacionesReporte'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Auditoria = lazy(() => import('./pages/Auditoria'))
const ControlDocumentalProyectos = lazy(() => import('./pages/ControlDocumentalProyectos'))
const ControlDocumentalStr = lazy(() => import('./pages/ControlDocumentalStr'))
const ControlRendicionesCuentas = lazy(() => import('./pages/ControlRendicionesCuentas'))
const Documentaciones = lazy(() => import('./pages/Documentaciones'))
const InformesAdminFinancieros = lazy(() => import('./pages/informes/InformesAdminFinancieros'))
const AsistenteInformes = lazy(() => import('./pages/AsistenteInformes'))

function RouteFallback({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <RouteFallback label="Iniciando sesión…" />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><AppLayout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="planificacion/actividades" element={<Actividades />} />
            <Route path="planificacion/programas" element={<ProgramasExplorer />} />
            <Route path="planificacion/planes-administrativos" element={<PlanesAdministrativos />} />
            <Route path="proyectos" element={<ProyectosList />} />
            <Route path="proyectos/:id" element={<ProyectoDetail />} />
            <Route path="cdp" element={<Cdp />} />
            <Route path="actas" element={<Actas />} />
            <Route path="resoluciones" element={<Resoluciones />} />
            <Route path="convenios" element={<Convenios />} />
            <Route path="pagos/str" element={<Strs />} />
            <Route path="pagos/devoluciones" element={<Devoluciones />} />
            <Route path="rendiciones" element={<Rendiciones />} />
            <Route path="expedientes" element={<Expedientes />} />
            <Route path="expedientes/:id" element={<ExpedienteDetail />} />
            <Route path="memos" element={<Memos />} />
            <Route path="catalogos/entidades" element={<Entidades />} />
            <Route path="catalogos/proveedores" element={<Proveedores />} />
            <Route path="catalogos/fuentes" element={<Fuentes />} />
            <Route path="catalogos/objetos-gasto" element={<ObjetosGasto />} />
            <Route path="catalogos/areas" element={<Areas />} />
            <Route path="catalogos/funcionarios" element={<Funcionarios />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="documentaciones" element={<Documentaciones />} />
            <Route path="informes/admin-financieros" element={<InformesAdminFinancieros />} />
            <Route path="informes/asistente" element={<AsistenteInformes />} />
            <Route path="marcaciones" element={<MarcacionesReporte />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="sistema/control-documental-proyectos" element={<ControlDocumentalProyectos />} />
            <Route path="sistema/control-documental-str" element={<ControlDocumentalStr />} />
            <Route path="sistema/control-rendiciones-cuentas" element={<ControlRendicionesCuentas />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
