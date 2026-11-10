import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/brand-colors.css'
import App from './App.tsx'
import { initAnalytics } from './lib/analytics'
import { preloadAlbumColors } from './hooks/useAlbumColors'

initAnalytics()
// Start the sleeve colours before the first render, so pages flood in colour rather than neutral first.
void preloadAlbumColors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
