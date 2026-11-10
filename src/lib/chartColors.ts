// R7 (Phase 2D) — Analytics.tsx and MockTestResult.tsx each independently hardcoded the same raw
// hex/rgba values for their Recharts axis/grid/tooltip/series colors, bypassing the design-token
// system index.css's `@theme` block already defines. Every value below is the exact CSS custom
// property that already carries the identical color (confirmed against index.css) — referenced
// via var(...) so Recharts resolves it at render time through the normal CSS cascade. This
// includes --color-border, the one token among these that's genuinely redefined under html.dark
// (0.18 alpha light / 0.12 alpha dark), so the grid lines and tooltip border now actually adapt
// to the theme instead of staying a fixed rgba(148,163,184,0.2) in both. No new theme mechanism —
// this only points existing chart code at the token source of truth already used everywhere else.
export const CHART_COLORS = {
  grid: 'var(--color-border)',
  axis: 'var(--color-muted-400)',
  tooltipBorder: 'var(--color-border)',
  line: 'var(--color-gold-500)',
  success: 'var(--color-success-600)',
  danger: 'var(--color-danger-600)',
  neutral: 'var(--color-muted-400)',
} as const;
