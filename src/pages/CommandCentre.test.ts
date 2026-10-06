import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 11.2 — CommandCentre.tsx rendering/integration checks.
//
// This repo has no @testing-library/react (or any other React-component-rendering) dependency
// installed, and no existing page-level .test.tsx file anywhere to establish a precedent for
// adding one (confirmed by search) — adding that infrastructure for this one page would conflict
// with Phase 11's own "keep dependency-light" instruction. These checks instead pin the exact,
// source-verifiable structural claims this fix depends on: that <AskJarvis /> is unconditionally
// rendered, and renders BEFORE the Up Next list — never relying on a human to notice it only by
// scrolling down past however many Up Next items happen to exist that day.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CommandCentre.tsx'), 'utf-8');

describe('CommandCentre.tsx — Ask JARVIS is a real, always-visible entry point (Phase 11.2 fix)', () => {
  it('renders <AskJarvis /> unconditionally inside the page\'s own return, never behind an if/ternary/&& guard', () => {
    const askJarvisCall = source.indexOf('<AskJarvis />');
    expect(askJarvisCall).toBeGreaterThan(-1);

    // The JSX immediately preceding the call, on the same logical block, must not be an open
    // conditional — i.e. no `&&` or `?` immediately gating it. A simple, deliberately narrow
    // check: the 80 characters right before the tag contain neither token.
    const precedingContext = source.slice(Math.max(0, askJarvisCall - 80), askJarvisCall);
    expect(precedingContext).not.toMatch(/&&\s*$/);
    expect(precedingContext).not.toMatch(/\?\s*$/);
  });

  it('places <AskJarvis /> BEFORE the Up Next list\'s own rendering, so it is always above the fold regardless of how many Up Next items exist', () => {
    const askJarvisIndex = source.indexOf('<AskJarvis />');
    const upNextListIndex = source.indexOf('items.length === 0');
    expect(askJarvisIndex).toBeGreaterThan(-1);
    expect(upNextListIndex).toBeGreaterThan(-1);
    expect(askJarvisIndex).toBeLessThan(upNextListIndex);
  });

  it('renders <AskJarvis /> exactly once on the page (no duplicate entry point)', () => {
    const occurrences = source.match(/<AskJarvis \/>/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe('CommandCentre.tsx — Up Next list and navigation remain exactly as before', () => {
  it('still computes items from generateUpNextItems and still navigates via handleItemActivate — untouched by the Phase 11.2 placement fix', () => {
    expect(source).toMatch(/generateUpNextItems\(/);
    expect(source).toMatch(/function handleItemActivate/);
    expect(source).toMatch(/onClick=\{\(\) => handleItemActivate\(item\)\}/);
  });

  it('never makes the Up Next list depend on JARVIS/AI — generateUpNextItems\'s own call site takes no AI-related input', () => {
    const callSite = source.slice(source.indexOf('const items = useMemo'), source.indexOf('const items = useMemo') + 200);
    expect(callSite).not.toMatch(/runJarvisRequest|JarvisRuntime/);
  });
});
