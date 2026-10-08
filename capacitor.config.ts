import type { CapacitorConfig } from '@capacitor/cli';

// Phase 13C fix — `server.url` previously pointed the native WebView at the live Vercel
// deployment instead of the bundled `webDir` assets below: Capacitor's documented behaviour for
// `server.url` is to load content from that remote origin on every launch, NEVER from the APK's
// own packaged `dist/` (see android/app/src/main/assets/public, refreshed by `npx cap sync`).
// That meant no local change — this phase's bootstrap included — could ever run on a physical
// device until it was separately deployed to that URL, which this session never does (commit/push
// is explicitly out of scope for every phase). Removing `server` restores Capacitor's normal
// mode: the app runs whatever was most recently built with `npm run build` and synced with
// `npx cap sync android`, matching the local checkout exactly.
const config: CapacitorConfig = {
  appId: 'com.apfctracker.app',
  appName: 'APFC Tracker',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
