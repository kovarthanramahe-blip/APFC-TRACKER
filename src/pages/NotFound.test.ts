import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This repo has no @testing-library/react (or any other React-component-rendering) dependency
// installed, and no precedent for adding one for a single page (see CommandCentre.test.ts's own
// header) — these are structural, source-verifiable checks, the same approach already used for
// every other page-level .test.ts file in this codebase.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'NotFound.tsx'), 'utf-8');

describe('NotFound.tsx — the App.tsx catch-all route\'s own page', () => {
  it('exports a default component', () => {
    expect(source).toMatch(/export default function NotFound/);
  });

  it('links back to the Dashboard ("/"), never a dead end with no way back', () => {
    expect(source).toMatch(/<Link\s+to="\/"/);
  });
});
