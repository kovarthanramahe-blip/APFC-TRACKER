// UPSC CSE Syllabus coverage tracking — a minimal, per-microsyllabus-item state (Not Started /
// Learning / Revised / Strong), keyed by the microsyllabus item's own stable id (see
// lib/upscCseSyllabus.ts's UpscCseMicrosyllabusItem). Deliberately NOT reusing APFC's
// completedTopics (a boolean done/not-done map over APFC topic ids, defined in lib/store.ts) —
// UPSC CSE's microsyllabus ids are a completely disjoint id space (never APFC topic ids — see
// data/upscCsePrelimsSyllabus.ts / data/upscCseMainsSyllabus.ts), and a 4-state coverage model
// doesn't fit a boolean map. Persisted as its own workspace-owned field (lib/store.ts's
// `upscCseSyllabusCoverage`), archived/restored by setActiveWorkspaceId's swap exactly like
// completedTopics — so this data is structurally absent while any workspace other than upsc_cse is
// active, and switching away from upsc_cse always empties it back out for whatever workspace comes
// next. This module holds only the pure type/logic; lib/store.ts owns persistence.

export type UpscCseCoverageState = 'not_started' | 'learning' | 'revised' | 'strong';

export const UPSC_CSE_COVERAGE_STATES: readonly UpscCseCoverageState[] = ['not_started', 'learning', 'revised', 'strong'];

export const UPSC_CSE_COVERAGE_LABELS: Record<UpscCseCoverageState, string> = {
  not_started: 'Not Started',
  learning: 'Learning',
  revised: 'Revised',
  strong: 'Strong',
};

export function isUpscCseCoverageState(value: unknown): value is UpscCseCoverageState {
  return typeof value === 'string' && (UPSC_CSE_COVERAGE_STATES as readonly string[]).includes(value);
}

/** Weight used only for the aggregate progress percentage below — never stored, always derived. */
const COVERAGE_WEIGHT: Record<UpscCseCoverageState, number> = {
  not_started: 0,
  learning: 1 / 3,
  revised: 2 / 3,
  strong: 1,
};

export type UpscCseSyllabusCoverage = Record<string, UpscCseCoverageState>;

/** A microsyllabus id with no entry yet has never been touched — defaults to 'not_started' rather
 * than requiring every id to be pre-seeded in the coverage map. */
export function getCoverageState(coverage: UpscCseSyllabusCoverage, microsyllabusId: string): UpscCseCoverageState {
  const state = coverage[microsyllabusId];
  return isUpscCseCoverageState(state) ? state : 'not_started';
}

export interface UpscCseCoverageSummary {
  total: number;
  counts: Record<UpscCseCoverageState, number>;
  /** 0-100, weighted (not_started=0%, learning=33%, revised=67%, strong=100%) — a smoother signal
   * than a plain "strong-only" count for a stage/paper/subject with a mix of in-progress items. */
  weightedPct: number;
}

/** Pure aggregate over any set of microsyllabus ids (a whole stage, one paper, or one subject) —
 * callers pass exactly the ids they want summarised; this never reads a full tree itself. */
export function computeCoverageSummary(microsyllabusIds: readonly string[], coverage: UpscCseSyllabusCoverage): UpscCseCoverageSummary {
  const counts: Record<UpscCseCoverageState, number> = { not_started: 0, learning: 0, revised: 0, strong: 0 };
  let weightedSum = 0;
  for (const id of microsyllabusIds) {
    const state = getCoverageState(coverage, id);
    counts[state] += 1;
    weightedSum += COVERAGE_WEIGHT[state];
  }
  const total = microsyllabusIds.length;
  const weightedPct = total ? Math.round((weightedSum / total) * 100) : 0;
  return { total, counts, weightedPct };
}
