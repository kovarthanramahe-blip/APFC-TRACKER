import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StudyLogEntry } from './types';
import { computeStreaks } from './gamification';
import {
  addDaysToDateString,
  sumStudyActivity,
  sumAllStudyActivity,
  currentPeriodWindow,
  previousPeriodWindow,
  computePeriodComparison,
  computeProgressPercent,
  computeStudyProgressInsights,
} from './studyProgressInsights';

// Study Progress Insights Foundation — this module is a pure calculation layer over the SAME
// studyLog shape lib/gamification.test.ts's own fixtures already use, and reuses
// lib/gamification.ts's computeStreaks directly rather than a second streak implementation (see
// studyProgressInsights.ts's own header). Every function tested below is deterministic given an
// explicit `referenceDate` — the ONE exception is computeStudyProgressInsights.streak, which reads
// the real system clock via computeStreaks (pre-existing behaviour of the reused function, not
// something this module changes) — those specific assertions pin the clock with vi.setSystemTime.

function entry(date: string, overrides: Partial<StudyLogEntry> = {}): StudyLogEntry {
  return { date, focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, ...overrides };
}

function log(...entries: StudyLogEntry[]): Record<string, StudyLogEntry> {
  return Object.fromEntries(entries.map((e) => [e.date, e]));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('addDaysToDateString — boundary/date cases', () => {
  it('adds/subtracts days within a month normally', () => {
    expect(addDaysToDateString('2026-01-10', 3)).toBe('2026-01-13');
    expect(addDaysToDateString('2026-01-10', -3)).toBe('2026-01-07');
  });

  it('crosses a month boundary correctly', () => {
    expect(addDaysToDateString('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDateString('2026-02-01', -1)).toBe('2026-01-31');
  });

  it('crosses a year boundary correctly', () => {
    expect(addDaysToDateString('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysToDateString('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap-year February correctly (2028 is a leap year)', () => {
    expect(addDaysToDateString('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDateString('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('a non-leap year February has no 29th', () => {
    expect(addDaysToDateString('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('sumStudyActivity — normal activity and empty activity', () => {
  it('sums every field across matching entries within an inclusive date range', () => {
    const studyLog = log(
      entry('2026-01-01', { focusMinutes: 30, topicsCompleted: 1, testsCompleted: 0 }),
      entry('2026-01-02', { focusMinutes: 45, topicsCompleted: 0, testsCompleted: 1 }),
      entry('2026-01-05', { focusMinutes: 10, topicsCompleted: 2, testsCompleted: 0 }), // outside range
    );
    const totals = sumStudyActivity(studyLog, '2026-01-01', '2026-01-02');
    expect(totals).toEqual({ focusMinutes: 75, topicsCompleted: 1, testsCompleted: 1, activeDays: 2 });
  });

  it('an entry present but with all-zero fields does not count as an active day', () => {
    const studyLog = log(entry('2026-01-01', { focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0 }));
    const totals = sumStudyActivity(studyLog, '2026-01-01', '2026-01-01');
    expect(totals).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
  });

  it('empty studyLog produces all-zero totals, never throws', () => {
    expect(() => sumStudyActivity({}, '2026-01-01', '2026-01-31')).not.toThrow();
    expect(sumStudyActivity({}, '2026-01-01', '2026-01-31')).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
  });

  it('a date with no studyLog entry at all is never fabricated — it simply contributes nothing', () => {
    const studyLog = log(entry('2026-01-01', { focusMinutes: 20 }));
    const totals = sumStudyActivity(studyLog, '2026-01-01', '2026-01-10');
    expect(totals.focusMinutes).toBe(20);
    expect(totals.activeDays).toBe(1);
  });
});

describe('sumAllStudyActivity — total study activity', () => {
  it('sums every entry regardless of date (normal activity)', () => {
    const studyLog = log(
      entry('2020-01-01', { focusMinutes: 100, topicsCompleted: 5 }),
      entry('2026-06-15', { focusMinutes: 40, testsCompleted: 2 }),
    );
    expect(sumAllStudyActivity(studyLog)).toEqual({ focusMinutes: 140, topicsCompleted: 5, testsCompleted: 2, activeDays: 2 });
  });

  it('empty studyLog -> all zeros, never throws', () => {
    expect(() => sumAllStudyActivity({})).not.toThrow();
    expect(sumAllStudyActivity({})).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
  });

  it('reuses lib/gamification.ts\'s own totalFocusMinutes for the focus-minutes figure (same value, not a second calculation)', () => {
    const studyLog = log(entry('2026-01-01', { focusMinutes: 33 }), entry('2026-01-02', { focusMinutes: 17 }));
    expect(sumAllStudyActivity(studyLog).focusMinutes).toBe(50);
  });
});

describe('currentPeriodWindow / previousPeriodWindow — current-period and previous-period calculation', () => {
  it('the current window is the N days ending on (inclusive) referenceDate', () => {
    expect(currentPeriodWindow('2026-01-10', 7)).toEqual({ start: '2026-01-04', end: '2026-01-10' });
  });

  it('the previous window is the N days immediately before, with no gap and no overlap', () => {
    const current = currentPeriodWindow('2026-01-10', 7);
    const previous = previousPeriodWindow('2026-01-10', 7);
    expect(previous).toEqual({ start: '2025-12-28', end: '2026-01-03' });
    expect(addDaysToDateString(previous.end, 1)).toBe(current.start); // no gap
  });

  it('a period of 1 day is just referenceDate itself, both for current and (the day before) for previous', () => {
    expect(currentPeriodWindow('2026-01-10', 1)).toEqual({ start: '2026-01-10', end: '2026-01-10' });
    expect(previousPeriodWindow('2026-01-10', 1)).toEqual({ start: '2026-01-09', end: '2026-01-09' });
  });

  it('period windows crossing a year boundary are computed correctly', () => {
    expect(currentPeriodWindow('2026-01-02', 7)).toEqual({ start: '2025-12-27', end: '2026-01-02' });
  });
});

describe('computePeriodComparison — previous-period comparison', () => {
  it('computes both windows\' totals and a positive delta when current beats previous', () => {
    const studyLog = log(
      entry('2026-01-03', { focusMinutes: 20 }), // previous period
      entry('2026-01-08', { focusMinutes: 50 }), // current period
    );
    const cmp = computePeriodComparison(studyLog, '2026-01-10', 7);
    expect(cmp.current.focusMinutes).toBe(50);
    expect(cmp.previous.focusMinutes).toBe(20);
    expect(cmp.focusMinutesDelta).toBe(30);
    expect(cmp.focusMinutesDeltaPct).toBe(150); // +150%
  });

  it('a negative delta when current is lower than previous', () => {
    const studyLog = log(entry('2026-01-03', { focusMinutes: 100 }), entry('2026-01-08', { focusMinutes: 40 }));
    const cmp = computePeriodComparison(studyLog, '2026-01-10', 7);
    expect(cmp.focusMinutesDelta).toBe(-60);
    expect(cmp.focusMinutesDeltaPct).toBe(-60);
  });

  it('focusMinutesDeltaPct is null (never fabricated) when the previous period had zero activity', () => {
    const studyLog = log(entry('2026-01-08', { focusMinutes: 30 }));
    const cmp = computePeriodComparison(studyLog, '2026-01-10', 7);
    expect(cmp.previous.focusMinutes).toBe(0);
    expect(cmp.focusMinutesDelta).toBe(30);
    expect(cmp.focusMinutesDeltaPct).toBeNull();
  });

  it('both periods empty -> zero totals and a null percentage, never throws', () => {
    expect(() => computePeriodComparison({}, '2026-01-10', 7)).not.toThrow();
    const cmp = computePeriodComparison({}, '2026-01-10', 7);
    expect(cmp.current).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(cmp.previous).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(cmp.focusMinutesDelta).toBe(0);
    expect(cmp.focusMinutesDeltaPct).toBeNull();
  });
});

describe('computeProgressPercent — completion percentage, partial/100%/missing target', () => {
  it('partial completion is rounded to 1 decimal place', () => {
    expect(computeProgressPercent({ completed: 1, total: 3 })).toBeCloseTo(33.3, 5);
  });

  it('100% completion when completed === total', () => {
    expect(computeProgressPercent({ completed: 50, total: 50 })).toBe(100);
  });

  it('0% when nothing is completed yet', () => {
    expect(computeProgressPercent({ completed: 0, total: 10 })).toBe(0);
  });

  it('completed beyond total is clamped to 100, never shown over 100%', () => {
    expect(computeProgressPercent({ completed: 12, total: 10 })).toBe(100);
  });

  it('missing target (undefined) -> null, never guessed', () => {
    expect(computeProgressPercent(undefined)).toBeNull();
  });

  it('a target with total <= 0 is treated as missing, never divides by zero', () => {
    expect(computeProgressPercent({ completed: 0, total: 0 })).toBeNull();
    expect(computeProgressPercent({ completed: 5, total: -1 })).toBeNull();
  });
});

describe('computeStudyProgressInsights — normal activity, deterministic given an explicit referenceDate', () => {
  it('assembles totals, current/previous period, and progress percent consistently', () => {
    const studyLog = log(
      entry('2026-01-01', { focusMinutes: 60, topicsCompleted: 1 }),
      entry('2026-01-08', { focusMinutes: 30, topicsCompleted: 1 }),
      entry('2026-01-09', { focusMinutes: 30 }),
    );
    const insights = computeStudyProgressInsights({
      studyLog,
      completionTarget: { completed: 25, total: 100 },
      referenceDate: '2026-01-10',
      periodDays: 7,
    });
    expect(insights.referenceDate).toBe('2026-01-10');
    expect(insights.periodDays).toBe(7);
    expect(insights.totalActivity).toEqual({ focusMinutes: 120, topicsCompleted: 2, testsCompleted: 0, activeDays: 3 });
    expect(insights.currentPeriod.focusMinutes).toBe(60); // Jan 8 (30) + Jan 9 (30), within [Jan 4, Jan 10]
    expect(insights.previousPeriod.focusMinutes).toBe(60); // Jan 1 (60), within [Dec 28, Jan 3]
    expect(insights.progressPercent).toBe(25);
  });

  it('empty activity and no target -> a fully zeroed/null snapshot, never an error', () => {
    const insights = computeStudyProgressInsights({ studyLog: {}, referenceDate: '2026-01-10' });
    expect(insights.totalActivity).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.currentPeriod).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.previousPeriod).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.focusMinutesDelta).toBe(0);
    expect(insights.focusMinutesDeltaPct).toBeNull();
    expect(insights.progressPercent).toBeNull();
    expect(insights.streak).toEqual({ current: 0, best: 0 });
  });

  it('defaults periodDays to 7 and referenceDate to today when omitted', () => {
    const insights = computeStudyProgressInsights({ studyLog: {} });
    expect(insights.periodDays).toBe(7);
    expect(typeof insights.referenceDate).toBe('string');
    expect(insights.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('computeStudyProgressInsights — streak reuses lib/gamification.ts\'s computeStreaks exactly (current streak using existing activity data)', () => {
  it('the returned streak is byte-identical to calling computeStreaks directly on the same studyLog', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T09:00:00'));
    try {
      const studyLog = log(
        entry('2026-01-08', { focusMinutes: 20 }),
        entry('2026-01-09', { focusMinutes: 20 }),
        entry('2026-01-10', { focusMinutes: 20 }),
      );
      const insights = computeStudyProgressInsights({ studyLog, referenceDate: '2026-01-10' });
      expect(insights.streak).toEqual(computeStreaks(studyLog));
      expect(insights.streak).toEqual({ current: 3, best: 3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a gap in activity resets the current streak to 0 while best is preserved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T09:00:00'));
    try {
      const studyLog = log(
        entry('2026-01-01', { focusMinutes: 20 }),
        entry('2026-01-02', { focusMinutes: 20 }),
        entry('2026-01-03', { focusMinutes: 20 }),
        // gap: no activity on Jan 4 - Jan 9, and none today either
      );
      const insights = computeStudyProgressInsights({ studyLog, referenceDate: '2026-01-10' });
      expect(insights.streak).toEqual({ current: 0, best: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});
