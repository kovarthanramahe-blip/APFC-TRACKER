// Phase 2D (R7) — Analytics.tsx/MockTestResult.tsx used to hardcode raw hex/rgba Recharts colors
// independently of index.css's design-token system. CHART_COLORS now points at that system
// instead. No DOM rendering here (this repo has no @testing-library/react — confirmed in several
// other test files) — this reads index.css as text and checks the two things that actually matter:
// (1) every `var(--color-x)` CHART_COLORS references names a token index.css really defines, so a
// future rename of a token can't silently leave a chart pointing at nothing; (2) grid/tooltipBorder
// deliberately use --color-border, the one token among these that index.css actually redefines
// under html.dark — the concrete fix for R7's "not dark-mode-aware" finding.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHART_COLORS } from './chartColors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(join(__dirname, '../index.css'), 'utf-8');

function cssVarName(value: string): string {
  const match = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (!match) throw new Error(`Not a var() reference: ${value}`);
  return match[1];
}

describe('CHART_COLORS — every entry resolves to a real design token (R7)', () => {
  for (const [key, value] of Object.entries(CHART_COLORS)) {
    it(`${key} (${value}) is defined as a custom property in index.css`, () => {
      const name = cssVarName(value);
      // A light-mode definition (inside the @theme block or :root) is mandatory for every token;
      // this regex matches "  --color-x: ..." regardless of which rule block it's declared in.
      expect(indexCss).toMatch(new RegExp(`${name}\\s*:`));
    });
  }
});

describe('CHART_COLORS — grid/tooltipBorder use the one token that is genuinely dark-mode-aware (R7)', () => {
  it('both reference --color-border, not a static axis/neutral color', () => {
    expect(CHART_COLORS.grid).toBe('var(--color-border)');
    expect(CHART_COLORS.tooltipBorder).toBe('var(--color-border)');
  });

  it('--color-border is redefined under html.dark with a different value than its light definition', () => {
    const lightMatch = /^\s*--color-border:\s*([^;]+);/m.exec(indexCss);
    // `html.dark {` (with the brace) finds the actual rule, not an earlier comment that merely
    // mentions "html.dark" in prose (this file has one, just above the light --color-border line).
    const darkBlock = indexCss.slice(indexCss.indexOf('html.dark {'));
    const darkMatch = /^\s*--color-border:\s*([^;]+);/m.exec(darkBlock);
    expect(lightMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();
    expect(darkMatch![1].trim()).not.toBe(lightMatch![1].trim());
  });
});

describe('CHART_COLORS — series colors stay visually distinct (no flattening of correct/wrong/neutral)', () => {
  it('success, danger, and neutral are three different tokens', () => {
    const values = [CHART_COLORS.success, CHART_COLORS.danger, CHART_COLORS.neutral];
    expect(new Set(values).size).toBe(values.length);
  });
});
