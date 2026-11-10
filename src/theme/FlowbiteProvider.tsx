import { type ReactNode } from 'react'
import { ThemeProvider } from 'flowbite-react'

/** Proveedor global de Flowbite React (estilos y theming de componentes). */
export default function FlowbiteProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
