import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// When building for GitHub Pages the app is served from a /APFC-TRACKER/ subpath.
const base = process.env.GITHUB_PAGES ? '/APFC-TRACKER/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Phase 11.2.2 — the default ('auto') unconditionally injects a <script> into index.html
      // that calls navigator.serviceWorker.register() on window 'load', on every platform this
      // SAME built index.html/JS/CSS output is shipped to — including the Capacitor Android
      // native shell (capacitor.config.ts's webDir points at this exact dist/ output; `npx cap
      // sync` copies it byte-for-byte into android/app/src/main/assets/public/). A native
      // Android Capacitor WebView already loads its web assets straight from the APK (no real
      // network fetch, no offline-caching benefit to gain) and, unlike a normal browser tab,
      // keeps its Service Worker registration + Cache Storage in the app's persisted data
      // directory across `adb install -r`/Android Studio's incremental reinstall (well-documented
      // Android behavior: replacing an APK does not clear app data; only a full uninstall or
      // Settings -> Storage -> Clear Storage does). That means an OLDER build's service worker can
      // still be registered and actively controlling the page on a device that has since received
      // a newer, byte-verified-correct APK — intercepting navigation and serving its own stale
      // precached index.html (referencing its own stale, differently-hashed JS chunk) instead of
      // ever loading the new one, regardless of how correct the newly installed APK's bundled
      // assets are. `skipWaiting`/`clientsClaim` below only help a new service worker that gets a
      // chance to install and activate — they do nothing if an old one is still the one serving the
      // very navigation request for index.html itself. Registration is now done explicitly in
      // main.tsx instead, gated on `!Capacitor.isNativePlatform()`, so the web/Vercel deployment
      // keeps full PWA/offline behavior and the native shell never registers a service worker at
      // all.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'APFC Tracker — UPSC EPFO Exam Prep',
        short_name: 'APFC Tracker',
        description: 'All-in-one preparation companion for the UPSC EPFO Assistant Provident Fund Commissioner exam.',
        theme_color: '#1c2d9c',
        background_color: '#070b16',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        // Make sure a newly deployed build takes over immediately instead of
        // an old service worker continuing to serve a stale cached bundle.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
