import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Feedback item — an unknown/mistyped address previously rendered a completely blank page: no
// <Route> in App.tsx matched, so react-router-dom's <Routes> rendered nothing at all. Structural,
// source-verifiable checks (see NotFound.test.ts's own header for why this repo's page-level
// tests don't render components) that the catch-all route exists, is wired to NotFound, and is
// the LAST route — react-router-dom matches top-to-bottom, so a catch-all placed earlier would
// shadow every real route after it.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf-8');

describe('App.tsx — catch-all 404 route', () => {
  it('declares a path="*" route rendering <NotFound />', () => {
    expect(source).toMatch(/<Route\s+path="\*"\s+element=\{<NotFound\s*\/>\}\s*\/>/);
  });

  it('places the catch-all route LAST, so it never shadows a real route', () => {
    const catchAllIndex = source.indexOf('path="*"');
    const routesCloseIndex = source.indexOf('</Routes>');
    expect(catchAllIndex).toBeGreaterThan(-1);
    expect(routesCloseIndex).toBeGreaterThan(-1);

    const lastRealRouteIndex = Math.max(
      ...Array.from(source.matchAll(/<Route\s+path="(?!\*)[^"]*"/g)).map((m) => m.index ?? -1),
    );
    expect(catchAllIndex).toBeGreaterThan(lastRealRouteIndex);
    expect(catchAllIndex).toBeLessThan(routesCloseIndex);
  });

  it('lazy-loads NotFound exactly like every other route page', () => {
    expect(source).toMatch(/const NotFound = lazy\(\(\) => import\('\.\/pages\/NotFound'\)\);/);
  });
});
