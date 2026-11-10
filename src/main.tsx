import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import App from './App'
import FlowbiteProvider from './theme/FlowbiteProvider'
import { applyTheme, getStoredTheme } from './lib/theme'
import './index.css'

applyTheme(getStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* MemoryRouter: la barra de direcciones queda solo en el host (sin /ruta). */}
    <MemoryRouter>
      <FlowbiteProvider>
        <App />
      </FlowbiteProvider>
    </MemoryRouter>
  </React.StrictMode>,
)
