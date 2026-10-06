import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 11.2.2 — root cause of "AskJarvis is in the correctly-built, byte-verified APK but
// never visible on the physical device": the production index.html unconditionally injected a
// <script> (vite-plugin-pwa's default `injectRegister: 'auto'`) that registers a PWA service
// worker on EVERY platform the built dist/ output ships to — including the Capacitor Android
// native shell, which loads that exact same dist/ output from the APK's bundled assets. A Capacitor
// WebView's Service Worker registration + Cache Storage persist in the app's data directory across
// `adb install -r`/Android Studio's incremental reinstall (replacing an APK does not clear app
// data), so an OLDER build's service worker can still be the one actively controlling the page —
// intercepting navigation and serving its own stale cached index.html/JS — even after a newer,
// byte-identical-to-Windows APK has been installed. This is a source-verifiable mechanism (not a
// per-component render bug): AskJarvis's own JSX in CommandCentre.tsx was already confirmed correct
// and unconditional. These checks pin the actual fix — that service worker registration is now
// explicit and native-gated — rather than merely grepping for the string "AskJarvis".
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteConfigSource = readFileSync(join(root, 'vite.config.ts'), 'utf-8');
const mainSource = readFileSync(join(root, 'src/main.tsx'), 'utf-8');

describe('vite.config.ts — VitePWA never auto-injects an unconditional registration script', () => {
  it('sets injectRegister: false, so no <script> calling navigator.serviceWorker.register() is injected into index.html for any platform', () => {
    expect(viteConfigSource).toMatch(/injectRegister:\s*false/);
  });
});

describe('src/main.tsx — the PWA service worker is only ever registered on the web, never inside the Capacitor native shell', () => {
  it('imports Capacitor and guards registration on !Capacitor.isNativePlatform()', () => {
    expect(mainSource).toMatch(/import\s*\{\s*Capacitor\s*\}\s*from\s*'@capacitor\/core'/);

    const guardIndex = mainSource.search(/if\s*\(\s*!Capacitor\.isNativePlatform\(\)/);
    expect(guardIndex).toBeGreaterThan(-1);
  });

  it('only calls registerSW() (from virtual:pwa-register) inside that native-gated guard, never unconditionally at module scope', () => {
    const registerCallIndex = mainSource.indexOf('registerSW(');
    const guardIndex = mainSource.search(/if\s*\(\s*!Capacitor\.isNativePlatform\(\)/);
    expect(registerCallIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    // The registerSW() call must be textually AFTER the guard opens and BEFORE the guard's own
    // closing brace — i.e. inside that if-block, not a sibling statement that merely follows it.
    const guardBlockEnd = mainSource.indexOf('\n}', guardIndex);
    expect(registerCallIndex).toBeGreaterThan(guardIndex);
    expect(registerCallIndex).toBeLessThan(guardBlockEnd);
  });
});
