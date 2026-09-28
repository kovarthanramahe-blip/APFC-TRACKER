import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeXp, totalPyqQuestionsAttempted, XP_RULES, getLevelInfo, xpRequiredForLevel, computeStreaks, type GamificationInputs } from './gamification';
import type { PYQAttempt, StudyLogEntry } from './types';

function baseInputs(overrides: Partial<GamificationInputs> = {}): GamificationInputs {
  return {
    completedTopics: {},
    attempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    pyqAttempts: [],
    ...overrides,
  };
}

function pyqAttempt(overrides: Partial<PYQAttempt>): PYQAttempt {
  return {
    id: overrides.id ?? `pyq-attempt-${Math.random()}`,
    submittedAt: new Date().toISOString(),
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: [],
    answers: {},
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    unansweredCount: overrides.unansweredCount ?? 0,
    score: overrides.score ?? 0,
    accuracy: overrides.accuracy ?? 0,
  };
}

describe('totalPyqQuestionsAttempted', () => {
  it('returns 0 for no attempts', () => {
    expect(totalPyqQuestionsAttempted([])).toBe(0);
  });

  it('counts correct + wrong, ignoring unanswered', () => {
    const attempts = [pyqAttempt({ correctCount: 6, wrongCount: 2, unansweredCount: 12 })];
    expect(totalPyqQuestionsAttempted(attempts)).toBe(8);
  });

  it('sums across multiple attempts', () => {
    const attempts = [
      pyqAttempt({ correctCount: 6, wrongCount: 2 }),
      pyqAttempt({ correctCount: 10, wrongCount: 0 }),
      pyqAttempt({ correctCount: 0, wrongCount: 5 }),
    ];
    expect(totalPyqQuestionsAttempted(attempts)).toBe(23);
  });
});

describe('computeXp — PYQ activity', () => {
  it('empty PYQ activity contributes zero XP', () => {
    const inputs = baseInputs({ pyqAttempts: [] });
    expect(computeXp(inputs)).toBe(0);
  });

  it('a single completed PYQ attempt contributes XP proportional to questions attempted', () => {
    const inputs = baseInputs({ pyqAttempts: [pyqAttempt({ correctCount: 8, wrongCount: 2 })] });
    expect(computeXp(inputs)).toBe(10 * XP_RULES.perPyqQuestionAttempted);
  });

  it('multiple PYQ attempts are counted additively, not just the latest one', () => {
    const inputs = baseInputs({
      pyqAttempts: [pyqAttempt({ correctCount: 8, wrongCount: 2 }), pyqAttempt({ correctCount: 15, wrongCount: 5 })],
    });
    expect(computeXp(inputs)).toBe((10 + 20) * XP_RULES.perPyqQuestionAttempted);
  });

  it('unanswered questions within a PYQ attempt do not contribute XP', () => {
    const inputs = baseInputs({ pyqAttempts: [pyqAttempt({ correctCount: 3, wrongCount: 0, unansweredCount: 47 })] });
    expect(computeXp(inputs)).toBe(3 * XP_RULES.perPyqQuestionAttempted);
  });

  it('reopening a saved attempt for review (no new attempt record) does not add XP twice', () => {
    // Reviewing/reopening a past PYQAttempt never appends a new entry to the array (see
    // openAttempt/openBookmarks in PYQTest.tsx) — computeXp only ever sees the store's actual
    // pyqAttempts array, so calling it twice on the same unchanged array must be deterministic.
    const inputs = baseInputs({ pyqAttempts: [pyqAttempt({ correctCount: 8, wrongCount: 2 })] });
    expect(computeXp(inputs)).toBe(computeXp(inputs));
  });

  it('bookmarking/unbookmarking a question does not affect XP (bookmarks are not part of GamificationInputs)', () => {
    const withPyq = baseInputs({ pyqAttempts: [pyqAttempt({ correctCount: 5, wrongCount: 0 })] });
    // GamificationInputs has no bookmarkedPyqIds field at all — toggling bookmarks in the store
    // cannot change computeXp's result, by construction.
    expect(computeXp(withPyq)).toBe(5 * XP_RULES.perPyqQuestionAttempted);
  });
});

describe('computeXp — existing (pre-F2) XP rules still work exactly as before', () => {
  it('is deterministic: same inputs always produce the same XP', () => {
    const inputs = baseInputs({
      completedTopics: { a: true, b: false, c: true },
      attempts: [{ id: 'm1' } as never],
      studyLog: { '2026-01-01': { date: '2026-01-01', focusMinutes: 40, topicsCompleted: 1, testsCompleted: 0 } },
      starredQuestionIds: ['q1', 'q2'],
    });
    expect(computeXp(inputs)).toBe(computeXp(inputs));
  });

  it('topic completion XP is unchanged', () => {
    const inputs = baseInputs({ completedTopics: { a: true, b: true, c: false } });
    expect(computeXp(inputs)).toBe(2 * XP_RULES.perTopicCompleted);
  });

  it('mock test completion XP is unchanged', () => {
    const inputs = baseInputs({ attempts: [{ id: 'm1' }, { id: 'm2' }] as never });
    expect(computeXp(inputs)).toBe(2 * XP_RULES.perMockTestCompleted);
  });

  it('focus-minute XP is unchanged', () => {
    const inputs = baseInputs({ studyLog: { '2026-01-01': { date: '2026-01-01', focusMinutes: 30, topicsCompleted: 0, testsCompleted: 0 } } });
    // 30 focus minutes + 1 active day
    expect(computeXp(inputs)).toBe(30 * XP_RULES.perFocusMinute + 1 * XP_RULES.perActiveStudyDay);
  });

  it('starred-question XP is unchanged', () => {
    const inputs = baseInputs({ starredQuestionIds: ['q1', 'q2', 'q3'] });
    expect(computeXp(inputs)).toBe(3 * XP_RULES.perStarredQuestion);
  });

  it('combines every source, including the new PYQ term, without interference', () => {
    const inputs = baseInputs({
      completedTopics: { a: true },
      attempts: [{ id: 'm1' }] as never,
      studyLog: { '2026-01-01': { date: '2026-01-01', focusMinutes: 10, topicsCompleted: 0, testsCompleted: 0 } },
      starredQuestionIds: ['q1'],
      pyqAttempts: [pyqAttempt({ correctCount: 4, wrongCount: 1 })],
    });
    const expected =
      1 * XP_RULES.perTopicCompleted +
      1 * XP_RULES.perMockTestCompleted +
      10 * XP_RULES.perFocusMinute +
      1 * XP_RULES.perActiveStudyDay +
      1 * XP_RULES.perStarredQuestion +
      5 * XP_RULES.perPyqQuestionAttempted;
    expect(computeXp(inputs)).toBe(expected);
  });
});

describe('getLevelInfo — level calculation remains correct', () => {
  it('0 XP is level 1', () => {
    expect(getLevelInfo(0).level).toBe(1);
  });

  it('matches the exact XP threshold for each level boundary', () => {
    for (let level = 1; level <= 10; level++) {
      const xpAtLevel = xpRequiredForLevel(level);
      expect(getLevelInfo(xpAtLevel).level).toBe(level);
    }
  });

  it('progress within a level is between 0 and 100', () => {
    const info = getLevelInfo(150);
    expect(info.progressPct).toBeGreaterThanOrEqual(0);
    expect(info.progressPct).toBeLessThanOrEqual(100);
  });
});

function entry(date: string, overrides: Partial<StudyLogEntry> = {}): StudyLogEntry {
  return { date, focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, ...overrides };
}

function log(...entries: StudyLogEntry[]): Record<string, StudyLogEntry> {
  return Object.fromEntries(entries.map((e) => [e.date, e]));
}

// Phase 6 Step 1 — computeStreaks' "today" lookup previously used new Date().toISOString(), i.e.
// UTC, while studyLog is keyed everywhere else by lib/utils.ts's getLocalDateString(). In a
// positive-offset timezone (e.g. IST, UTC+5:30) that mismatch meant a day already active by local
// wall-clock time could still read as inactive here until UTC caught up ~5.5 hours later. The fix
// (this module) now reads the SAME getLocalDateString(cursor) the rest of the app already writes
// under — these tests exercise both a normal date and the IST midnight-boundary case, and pin
// process.env.TZ (a supported, standard way to control Date's local-time getters in Node/Vitest)
// rather than relying on whatever timezone the test runner happens to be configured for.
describe('computeStreaks — local-date "today" boundary (Phase 6 Step 1)', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it('a normal daytime instant: an active day logged under today\'s local date counts as the current streak', () => {
    process.env.TZ = 'Asia/Kolkata';
    // 2026-01-10 15:00 IST — a normal midday instant, well outside the midnight boundary window.
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0)));
    const studyLog = log(entry('2026-01-10', { focusMinutes: 30 }));
    expect(computeStreaks(studyLog).current).toBe(1);
  });

  it('the IST midnight-boundary case: an instant where UTC is still "yesterday" but IST local time is already "today"', () => {
    process.env.TZ = 'Asia/Kolkata';
    // 2026-01-09 20:00 UTC == 2026-01-10 01:30 IST (within the ~00:00-05:29 IST bug window).
    const boundaryInstant = new Date(Date.UTC(2026, 0, 9, 20, 0, 0));
    expect(boundaryInstant.toISOString().slice(0, 10)).toBe('2026-01-09'); // UTC still reads Jan 9
    vi.setSystemTime(boundaryInstant);

    // Study logged under the LOCAL (IST) date — the same key bumpFocusMinutes now writes via
    // getLocalDateString() (see pages/Pomodoro.tsx's own fix).
    const studyLog = log(entry('2026-01-10', { focusMinutes: 25 }));
    expect(computeStreaks(studyLog).current).toBe(1); // correctly found under the local-date key

    // Proves the old UTC-keyed lookup would have missed it entirely (the bug this fix corrects).
    const wouldHaveLookedUpUnderUtcKey = studyLog[boundaryInstant.toISOString().slice(0, 10)];
    expect(wouldHaveLookedUpUnderUtcKey).toBeUndefined();
  });

  it('existing behaviour is unchanged for an ordinary multi-day streak (no boundary involved)', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST
    const studyLog = log(
      entry('2026-01-08', { focusMinutes: 20 }),
      entry('2026-01-09', { focusMinutes: 20 }),
      entry('2026-01-10', { focusMinutes: 20 }),
    );
    expect(computeStreaks(studyLog)).toEqual({ current: 3, best: 3 });
  });

  it('existing behaviour is unchanged: a gap still resets the current streak to 0 while best is preserved', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST
    const studyLog = log(
      entry('2026-01-05', { focusMinutes: 20 }),
      entry('2026-01-06', { focusMinutes: 20 }),
      entry('2026-01-07', { focusMinutes: 20 }),
      // gap: no entry for 2026-01-08, 2026-01-09, or 2026-01-10 (today)
    );
    expect(computeStreaks(studyLog)).toEqual({ current: 0, best: 3 });
  });
});
