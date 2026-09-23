import { describe, it, expect } from 'vitest';
import { computeResearchDuration } from './phdResearch';

describe('computeResearchDuration', () => {
  it('computes the exact calendar duration from 21 December 2023 to a known later date', () => {
    // 21 Dec 2023 -> 22 Sep 2026: 2 full years (-> 21 Dec 2025), 9 full months (-> 21 Sep 2026), 1 more day.
    const duration = computeResearchDuration('2023-12-21', '2026-09-22');
    expect(duration).toEqual({ totalDays: 1006, years: 2, months: 9, days: 1 });
  });

  it('returns all zeros when today is the same as the start date', () => {
    expect(computeResearchDuration('2023-12-21', '2023-12-21')).toEqual({ totalDays: 0, years: 0, months: 0, days: 0 });
  });

  it('never returns a negative duration when today is before the start date', () => {
    expect(computeResearchDuration('2023-12-21', '2020-01-01')).toEqual({ totalDays: 0, years: 0, months: 0, days: 0 });
  });

  it('handles an exact-year boundary with no leftover months/days', () => {
    const duration = computeResearchDuration('2023-12-21', '2025-12-21');
    expect(duration).toEqual({ totalDays: 731, years: 2, months: 0, days: 0 });
  });

  it('handles a mid-month day-borrow correctly (e.g. crossing into a shorter month)', () => {
    // 21 Dec 2023 -> 5 Jan 2024: 0 years, 0 months, 15 days.
    const duration = computeResearchDuration('2023-12-21', '2024-01-05');
    expect(duration).toEqual({ totalDays: 15, years: 0, months: 0, days: 15 });
  });
});
