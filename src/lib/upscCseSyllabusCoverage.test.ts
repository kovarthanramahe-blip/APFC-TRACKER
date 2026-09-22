import { describe, it, expect } from 'vitest';
import {
  UPSC_CSE_COVERAGE_STATES,
  UPSC_CSE_COVERAGE_LABELS,
  isUpscCseCoverageState,
  getCoverageState,
  computeCoverageSummary,
} from './upscCseSyllabusCoverage';

describe('UPSC CSE coverage — state model', () => {
  it('has exactly the four required states, in order: Not Started, Learning, Revised, Strong', () => {
    expect(UPSC_CSE_COVERAGE_STATES).toEqual(['not_started', 'learning', 'revised', 'strong']);
    expect(UPSC_CSE_COVERAGE_LABELS.not_started).toBe('Not Started');
    expect(UPSC_CSE_COVERAGE_LABELS.learning).toBe('Learning');
    expect(UPSC_CSE_COVERAGE_LABELS.revised).toBe('Revised');
    expect(UPSC_CSE_COVERAGE_LABELS.strong).toBe('Strong');
  });

  it('isUpscCseCoverageState accepts only the four known states', () => {
    for (const state of UPSC_CSE_COVERAGE_STATES) expect(isUpscCseCoverageState(state)).toBe(true);
    expect(isUpscCseCoverageState('bogus')).toBe(false);
    expect(isUpscCseCoverageState(undefined)).toBe(false);
    expect(isUpscCseCoverageState(null)).toBe(false);
    expect(isUpscCseCoverageState(42)).toBe(false);
  });
});

describe('UPSC CSE coverage — getCoverageState', () => {
  it('defaults to not_started for an id with no entry', () => {
    expect(getCoverageState({}, 'prelims-gs1-history-ancient')).toBe('not_started');
  });

  it('returns the stored state for a known id', () => {
    expect(getCoverageState({ 'prelims-gs1-history-ancient': 'strong' }, 'prelims-gs1-history-ancient')).toBe('strong');
  });

  it('falls back to not_started for a corrupted/unrecognized stored value (defensive, never throws)', () => {
    const coverage = { 'x': 'not-a-real-state' } as unknown as Record<string, 'not_started'>;
    expect(getCoverageState(coverage, 'x')).toBe('not_started');
  });
});

describe('UPSC CSE coverage — computeCoverageSummary', () => {
  it('an empty id list summarises to zero everywhere, 0% (never divides by zero)', () => {
    const summary = computeCoverageSummary([], {});
    expect(summary.total).toBe(0);
    expect(summary.weightedPct).toBe(0);
    expect(summary.counts).toEqual({ not_started: 0, learning: 0, revised: 0, strong: 0 });
  });

  it('all not_started is 0%', () => {
    const summary = computeCoverageSummary(['a', 'b', 'c'], {});
    expect(summary.weightedPct).toBe(0);
    expect(summary.counts.not_started).toBe(3);
  });

  it('all strong is 100%', () => {
    const summary = computeCoverageSummary(['a', 'b'], { a: 'strong', b: 'strong' });
    expect(summary.weightedPct).toBe(100);
    expect(summary.counts.strong).toBe(2);
  });

  it('a mix of states produces a weighted percentage between 0 and 100', () => {
    // not_started=0, learning=1/3, revised=2/3, strong=1 -> mean = 0.5 -> 50%
    const summary = computeCoverageSummary(['a', 'b', 'c', 'd'], { a: 'not_started', b: 'learning', c: 'revised', d: 'strong' });
    expect(summary.weightedPct).toBe(50);
    expect(summary.counts).toEqual({ not_started: 1, learning: 1, revised: 1, strong: 1 });
  });

  it('only counts the ids explicitly passed in — never reads beyond that list', () => {
    const coverage: Record<string, 'strong'> = { a: 'strong', b: 'strong', c: 'strong' };
    const summary = computeCoverageSummary(['a'], coverage);
    expect(summary.total).toBe(1);
    expect(summary.weightedPct).toBe(100);
  });
});
