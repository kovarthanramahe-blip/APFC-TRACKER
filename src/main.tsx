import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Phase 11.2.2 — explicit, platform-gated PWA service worker registration (see vite.config.ts's
// own Phase 11.2.2 comment for the full root-cause writeup). Only the web/Vercel deployment ever
// registers one; the Capacitor native shell never does, so it can never get stuck serving a stale
// cached shell across an APK reinstall.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}
