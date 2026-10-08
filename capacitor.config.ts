import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apfctracker.app',
  appName: 'APFC Tracker',
  webDir: 'dist',
  // Phase 8J — `server.url` was pointing the Android WebView at the deployed production site
  // instead of this build's own bundled `webDir` ('dist', synced into
  // android/app/src/main/assets/public by `npx cap sync android`). That meant the installed APK
  // never reflected any locally built/uncommitted change — including every Phase 8E-8I fix — no
  // matter how recently the assets were re-synced or the APK rebuilt, since Capacitor ignores the
  // bundled webDir entirely whenever `server.url` is set. Removing it restores the default,
  // bundled-app behaviour: the WebView now loads android/app/src/main/assets/public directly, which
  // `npx cap sync android` refreshes from this repo's own `npm run build` output. The web/Vercel
  // deployment is a completely separate artifact (Vite's own build+hosting, which never reads this
  // file at all) and is unaffected either way.
  android: {
    allowMixedContent: false,
  },
};

export default config;
