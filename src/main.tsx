import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tipografías de la marca, alojadas en la propia app (sin Google Fonts: nada sale a terceros y funcionan sin conexión).
// Solo los pesos que se usan: Cormorant 400 (titulares) y 500 (subtítulos); Inter 400, 500 y 600.
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker (solo en producción): permite instalar la app y usarla sin conexión.
// Las actualizaciones se aplican al cerrar y volver a abrir la app, nunca a mitad de una sesión.
if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}
