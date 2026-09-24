import { describe, it, expect } from 'vitest';
import {
  computePyqPerformance,
  pyqQuestionStatus,
  MARKS_CORRECT,
  MARKS_WRONG,
  computeRepeatedMistakes,
  topRepeatedMistakes,
  topTopicsByMistakes,
  topSubjectsByMistakes,
  computeRecentVsPreviousTrend,
  TREND_WINDOW_SIZE,
} from './pyqPerformance';
import { PYQ_BANK } from '../data/pyq';
import { useAppStore } from './store';
import { createRevisionQueue } from './revisionQueue';
import { DEFAULT_WORKSPACE_ID } from './workspace';
import type { PYQ, PYQAttempt } from './types';

// Synthetic fixture bank/attempts — independent of PYQ_BANK, so these tests exercise the
// aggregation *logic* itself rather than being fragile to the real dataset's exact shape.
function pyq(id: string, year: number, subject: PYQ['subject'], topicId: string): PYQ {
  return {
    id,
    year,
    subject,
    topicId,
    question: `Question ${id}`,
    options: [
      { id: `${id}-o0`, text: 'Option A' },
      { id: `${id}-o1`, text: 'Option B' },
    ],
    correctOptionId: `${id}-o0`,
    explanation: `Explanation for ${id}`,
    verificationStatus: 'cross_verified',
  };
}

function attempt(overrides: Partial<PYQAttempt>): PYQAttempt {
  return {
    id: overrides.id ?? `attempt-${Math.random()}`,
    submittedAt: overrides.submittedAt ?? new Date().toISOString(),
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: overrides.questionIds ?? [],
    answers: overrides.answers ?? {},
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    unansweredCount: overrides.unansweredCount ?? 0,
    score: overrides.score ?? 0,
    accuracy: overrides.accuracy ?? 0,
  };
}

// q1, q2: 2012, english, topic t-en-1
// q3: 2016, polity, topic t-po-1
// q4: 2016, polity, topic t-po-2
const bank: PYQ[] = [
  pyq('q1', 2012, 'english', 't-en-1'),
  pyq('q2', 2012, 'english', 't-en-1'),
  pyq('q3', 2016, 'polity', 't-po-1'),
  pyq('q4', 2016, 'polity', 't-po-2'),
];

// attempt1: q1 correct, q2 wrong, q3 left unanswered
const attempt1 = attempt({
  id: 'a1',
  questionIds: ['q1', 'q2', 'q3'],
  answers: { q1: 'q1-o0', q2: 'q2-o1', q3: null },
  correctCount: 1,
  wrongCount: 1,
  unansweredCount: 1,
  score: 10,
});
// attempt2: q4 correct
const attempt2 = attempt({
  id: 'a2',
  questionIds: ['q4'],
  answers: { q4: 'q4-o0' },
  correctCount: 1,
  wrongCount: 0,
  unansweredCount: 0,
  score: 5,
});

describe('pyqQuestionStatus', () => {
  const q = pyq('x', 2012, 'english', 't-en-1');
  it('is correct when the answer matches correctOptionId', () => {
    expect(pyqQuestionStatus(q, { x: 'x-o0' })).toBe('correct');
  });
  it('is wrong when the answer does not match', () => {
    expect(pyqQuestionStatus(q, { x: 'x-o1' })).toBe('wrong');
  });
  it('is unanswered when null or missing', () => {
    expect(pyqQuestionStatus(q, { x: null })).toBe('unanswered');
    expect(pyqQuestionStatus(q, {})).toBe('unanswered');
  });
});

describe('computePyqPerformance — no-data state', () => {
  it('returns null for zero attempts', () => {
    expect(computePyqPerformance(bank, [])).toBeNull();
  });
});

describe('computePyqPerformance — overall aggregate accuracy', () => {
  it('computes accuracy as total correct / (correct + wrong), not an average of per-attempt accuracies', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    expect(perf).not.toBeNull();
    // 2 correct, 1 wrong across both attempts -> 2/3 * 100
    expect(perf!.overall.totalCorrect).toBe(2);
    expect(perf!.overall.totalWrong).toBe(1);
    expect(perf!.overall.totalAttempted).toBe(3);
    expect(perf!.overall.overallAccuracy).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('testsCompleted and averageScore reflect the raw attempt count/scores', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    expect(perf!.overall.testsCompleted).toBe(2);
    expect(perf!.overall.averageScore).toBe(7.5);
  });

  it('handles zero attempted-within-attempts safely (all unanswered)', () => {
    const allSkipped = attempt({ questionIds: ['q1'], answers: { q1: null }, correctCount: 0, wrongCount: 0, unansweredCount: 1 });
    const perf = computePyqPerformance(bank, [allSkipped]);
    expect(perf!.overall.overallAccuracy).toBe(0);
  });
});

describe('computePyqPerformance — years', () => {
  it('supports multiple years and never invents data for a year with no attempts', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const years = perf!.years.map((y) => y.year);
    expect(years).toEqual([2012, 2016]);
    expect(years).not.toContain(2023);
    expect(years).not.toContain(2025);
  });

  it('2012 aggregates q1 (correct) + q2 (wrong); q3 is unanswered so 2016 excludes it from "attempted"', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const y2012 = perf!.years.find((y) => y.year === 2012)!;
    const y2016 = perf!.years.find((y) => y.year === 2016)!;
    expect(y2012).toMatchObject({ attempted: 2, correct: 1, wrong: 1, accuracy: 50 });
    // Only q4 (correct) counts for 2016 — q3 was left unanswered.
    expect(y2016).toMatchObject({ attempted: 1, correct: 1, wrong: 0, accuracy: 100 });
  });

  it('resolves year score using the shared marking scheme constants', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const y2012 = perf!.years.find((y) => y.year === 2012)!;
    expect(y2012.score).toBeCloseTo(1 * MARKS_CORRECT + 1 * MARKS_WRONG, 6);
  });
});

describe('computePyqPerformance — subjects', () => {
  it('aggregates correct/wrong per subject and computes per-subject accuracy', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const english = perf!.subjects.find((s) => s.subject === 'english')!;
    const polity = perf!.subjects.find((s) => s.subject === 'polity')!;
    expect(english).toMatchObject({ attempted: 2, correct: 1, wrong: 1, accuracy: 50 });
    expect(polity).toMatchObject({ attempted: 1, correct: 1, wrong: 0, accuracy: 100 });
  });

  it('identifies the strongest and weakest subject', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    expect(perf!.strongestSubject?.subject).toBe('polity');
    expect(perf!.weakestSubject?.subject).toBe('english');
  });

  it('strongest/weakest subject is null with no attempted questions anywhere', () => {
    const allSkipped = attempt({ questionIds: ['q1'], answers: { q1: null }, unansweredCount: 1 });
    const perf = computePyqPerformance(bank, [allSkipped]);
    expect(perf!.strongestSubject).toBeNull();
    expect(perf!.weakestSubject).toBeNull();
  });
});

describe('computePyqPerformance — topics', () => {
  it('aggregates correct/wrong per topic, never fabricating a topic entry for an unanswered-only question', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const topicIds = perf!.topics.map((t) => t.topicId);
    expect(topicIds).toContain('t-en-1');
    expect(topicIds).toContain('t-po-2');
    // t-po-1's only appearance (q3) was left unanswered, so it never accumulates an entry.
    expect(topicIds).not.toContain('t-po-1');
  });

  it('weakTopics/strongestTopics rank by accuracy with a stable alphabetical tie-break', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    expect(perf!.weakTopics[0].topicId).toBe('t-en-1'); // 50% — weakest
    expect(perf!.strongestTopics[0].topicId).toBe('t-po-2'); // 100% — strongest
  });
});

describe('computePyqPerformance — unattempted questions', () => {
  it('counts bank questions whose most recent touching attempt left them unanswered (or that were never attempted at all)', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    // q3 was left unanswered in attempt1 -> counts as unattempted despite "appearing" in a test.
    expect(perf!.unattemptedCount).toBe(1);
  });

  it('every bank question counts as unattempted when there are no attempts touching it', () => {
    const onlyQ1 = attempt({ questionIds: ['q1'], answers: { q1: 'q1-o0' }, correctCount: 1 });
    const perf = computePyqPerformance(bank, [onlyQ1]);
    // q2, q3, q4 were never part of any attempt.
    expect(perf!.unattemptedCount).toBe(3);
  });
});

describe('computePyqPerformance — real PYQ_BANK sanity', () => {
  it('runs against the real bank without throwing, for a synthetic attempt built from real ids', () => {
    const real = [PYQ_BANK[0], PYQ_BANK[1]];
    const a = attempt({
      questionIds: real.map((p) => p.id),
      answers: Object.fromEntries(real.map((p) => [p.id, p.correctOptionId])),
      correctCount: real.length,
    });
    expect(() => computePyqPerformance(PYQ_BANK, [a])).not.toThrow();
    const perf = computePyqPerformance(PYQ_BANK, [a]);
    expect(perf!.overall.overallAccuracy).toBe(100);
  });
});

// ============================================================================================
// PYQ Weak Spots & Repeated Mistakes (Phase 6 Step 2)
// ============================================================================================

describe('computeRepeatedMistakes — empty/single-attempt cases', () => {
  it('an empty attempt history produces an empty result, never throws', () => {
    expect(computeRepeatedMistakes(bank, [])).toEqual([]);
  });

  it('a single attempt produces one entry per answered question, correctly split correct/wrong', () => {
    const mistakes = computeRepeatedMistakes(bank, [attempt1]); // q1 correct, q2 wrong, q3 unanswered
    const byId = Object.fromEntries(mistakes.map((m) => [m.questionId, m]));
    expect(mistakes).toHaveLength(2); // q3 excluded (never answered)
    expect(byId.q1).toMatchObject({ totalAttempts: 1, correctCount: 1, wrongCount: 0, latestCorrect: true });
    expect(byId.q2).toMatchObject({ totalAttempts: 1, correctCount: 0, wrongCount: 1, latestCorrect: false });
  });
});

describe('computeRepeatedMistakes — full mistake history is preserved, never just the latest attempt', () => {
  it('wrong, wrong, correct -> wrongCount stays 2 even after the later correct answer', () => {
    const attempts = [
      attempt({ id: 'r1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o1' } }), // wrong
      attempt({ id: 'r2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o1' } }), // wrong
      attempt({ id: 'r3', submittedAt: '2026-01-03T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o0' } }), // correct
    ];
    const mistakes = computeRepeatedMistakes(bank, attempts);
    expect(mistakes).toEqual([
      { questionId: 'q1', totalAttempts: 3, correctCount: 1, wrongCount: 2, lastAttemptAt: '2026-01-03T00:00:00.000Z', latestCorrect: true },
    ]);
  });

  it('lastAttemptAt/latestCorrect reflect the most recent attempt regardless of input order', () => {
    // Deliberately out of chronological order — the function must sort internally.
    const attempts = [
      attempt({ id: 'r2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o0' } }), // correct
      attempt({ id: 'r1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o1' } }), // wrong
    ];
    const mistakes = computeRepeatedMistakes(bank, attempts);
    expect(mistakes[0]).toMatchObject({ lastAttemptAt: '2026-01-02T00:00:00.000Z', latestCorrect: true, wrongCount: 1, correctCount: 1 });
  });
});

describe('computeRepeatedMistakes — multiple questions aggregated correctly', () => {
  it('each question gets its own independent tally across several attempts', () => {
    const mistakes = computeRepeatedMistakes(bank, [attempt1, attempt2]);
    const byId = Object.fromEntries(mistakes.map((m) => [m.questionId, m]));
    expect(Object.keys(byId).sort()).toEqual(['q1', 'q2', 'q4']); // q3 excluded (unanswered)
    expect(byId.q4).toMatchObject({ totalAttempts: 1, correctCount: 1, wrongCount: 0 });
  });
});

describe('topRepeatedMistakes — worst-first view', () => {
  it('only includes questions with at least one wrong answer, worst first', () => {
    const attempts = [
      attempt({ id: 'm1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1', 'q2'], answers: { q1: 'q1-o1', q2: 'q2-o1' } }), // both wrong
      attempt({ id: 'm2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o1' } }), // q1 wrong again
      attempt({ id: 'm3', submittedAt: '2026-01-03T00:00:00.000Z', questionIds: ['q4'], answers: { q4: 'q4-o0' } }), // q4 correct, never wrong
    ];
    const mistakes = computeRepeatedMistakes(bank, attempts);
    const top = topRepeatedMistakes(mistakes, 6);
    expect(top.map((m) => m.questionId)).toEqual(['q1', 'q2']); // q4 excluded (0 wrongCount)
    expect(top[0].questionId).toBe('q1'); // 2 wrong beats q2's 1 wrong
    expect(top[0].wrongCount).toBe(2);
  });

  it('respects the limit parameter', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'q1-o1', q2: 'q2-o1' } })];
    const mistakes = computeRepeatedMistakes(bank, attempts);
    expect(topRepeatedMistakes(mistakes, 1)).toHaveLength(1);
  });
});

describe('topTopicsByMistakes / topSubjectsByMistakes — weak-area ranking by mistake volume, reusing computePyqPerformance\'s own arrays', () => {
  it('ranks topics by raw wrong count, not accuracy — never a second aggregation pass over attempts', () => {
    // t-en-1 (q1, q2): 1 wrong across attempt1. t-po-2 (q4): 0 wrong.
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const top = topTopicsByMistakes(perf!.topics, 6);
    expect(top.map((t) => t.topicId)).toEqual(['t-en-1']); // t-po-2 has 0 wrong, excluded; t-po-1's q3 was never answered
  });

  it('subject-level ranking mirrors the same reuse pattern', () => {
    const perf = computePyqPerformance(bank, [attempt1, attempt2]);
    const top = topSubjectsByMistakes(perf!.subjects, 6);
    expect(top.map((s) => s.subject)).toEqual(['english']);
  });
});

describe('computeRecentVsPreviousTrend — insufficient data', () => {
  it('fewer than 2 * windowSize attempts -> insufficient_data, never a fabricated trend', () => {
    const attempts = Array.from({ length: TREND_WINDOW_SIZE }, (_, i) => attempt({ id: `t${i}`, submittedAt: `2026-01-0${i + 1}T00:00:00.000Z`, correctCount: 1 }));
    const trend = computeRecentVsPreviousTrend(attempts);
    expect(trend.direction).toBe('insufficient_data');
    expect(trend.recentAccuracy).toBeNull();
    expect(trend.previousAccuracy).toBeNull();
  });

  it('zero attempts -> insufficient_data with zero counts', () => {
    const trend = computeRecentVsPreviousTrend([]);
    expect(trend).toEqual({ recentAttemptCount: 0, previousAttemptCount: 0, recentAccuracy: null, previousAccuracy: null, direction: 'insufficient_data' });
  });
});

describe('computeRecentVsPreviousTrend — improving / declining / stable, using each attempt\'s own stored correct/wrongCount (never recomputed)', () => {
  function windowAttempts(prefix: string, startDay: number, count: number, correctCount: number, wrongCount: number): PYQAttempt[] {
    return Array.from({ length: count }, (_, i) =>
      attempt({
        id: `${prefix}${i}`,
        submittedAt: `2026-02-${String(startDay + i).padStart(2, '0')}T00:00:00.000Z`,
        correctCount,
        wrongCount,
      }),
    );
  }

  it('improving: recent accuracy well above previous accuracy (beyond the stable band)', () => {
    const previous = windowAttempts('p', 1, TREND_WINDOW_SIZE, 2, 8); // 20% accuracy
    const recent = windowAttempts('r', 10, TREND_WINDOW_SIZE, 8, 2); // 80% accuracy
    const trend = computeRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('improving');
    expect(trend.recentAccuracy).toBe(80);
    expect(trend.previousAccuracy).toBe(20);
  });

  it('declining: recent accuracy well below previous accuracy', () => {
    const previous = windowAttempts('p', 1, TREND_WINDOW_SIZE, 8, 2); // 80%
    const recent = windowAttempts('r', 10, TREND_WINDOW_SIZE, 2, 8); // 20%
    const trend = computeRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('declining');
  });

  it('stable: identical accuracy in both windows is safely inside the stable band', () => {
    const previous = windowAttempts('p', 1, TREND_WINDOW_SIZE, 6, 4); // 60%
    const recent = windowAttempts('r', 10, TREND_WINDOW_SIZE, 6, 4); // 60% — no swing at all
    const trend = computeRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('stable');
    expect(trend.recentAccuracy).toBe(60);
    expect(trend.previousAccuracy).toBe(60);
  });

  it('exactly 2 * windowSize attempts is enough — the boundary is inclusive', () => {
    const previous = windowAttempts('p', 1, TREND_WINDOW_SIZE, 5, 5); // 50%
    const recent = windowAttempts('r', 10, TREND_WINDOW_SIZE, 5, 5); // 50%
    const trend = computeRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('stable');
    expect(trend.recentAttemptCount).toBe(TREND_WINDOW_SIZE);
    expect(trend.previousAttemptCount).toBe(TREND_WINDOW_SIZE);
  });
});

describe('PYQ Weak Spots — workspace isolation (reading the real store, not a mock)', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      contentRelationships: [],
    });
  }

  it('computeRepeatedMistakes fed with pyqAttempts after a workspace switch never reflects the other workspace\'s attempts', () => {
    fullReset();
    useAppStore.getState().addPyqAttempt(attempt({ id: 'apfc-a1', questionIds: ['q1'], answers: { q1: 'q1-o1' } })); // wrong
    expect(computeRepeatedMistakes(bank, useAppStore.getState().pyqAttempts)).toHaveLength(1);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    // pyqAttempts is workspace-owned — structurally empty here, nothing from APFC leaks through.
    expect(useAppStore.getState().pyqAttempts).toEqual([]);
    expect(computeRepeatedMistakes(bank, useAppStore.getState().pyqAttempts)).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(computeRepeatedMistakes(bank, useAppStore.getState().pyqAttempts)).toHaveLength(1);
  });
});
