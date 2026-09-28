import { describe, it, expect } from 'vitest';
import {
  computeUpscCsePrelimsPerformance,
  upscCsePrelimsQuestionStatus,
  computeUpscCsePrelimsRepeatedMistakes,
  topUpscCsePrelimsRepeatedMistakes,
  topMicrosyllabusByMistakes,
  topUpscCsePrelimsSubjectsByMistakes,
  computeUpscCsePrelimsRecentVsPreviousTrend,
  UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE,
  selectUpscCsePrelimsRepeatedMistakePracticeIds,
  DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP,
  type UpscCsePrelimsRepeatedMistake,
} from './upscCsePrelimsPyqPerformance';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { useAppStore } from './store';
import { createRevisionQueue } from './revisionQueue';
import { DEFAULT_WORKSPACE_ID } from './workspace';

const HISTORY_ANCIENT_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India')!.id;

function q(overrides: Partial<UpscCsePrelimsBatchPyq> = {}): UpscCsePrelimsBatchPyq {
  return {
    id: 'q1',
    year: 2026,
    paper: 'GS Paper I',
    questionNumber: 1,
    question: 'Q?',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correctOptionId: 'a',
    subject: 'History',
    topic: 'Ancient India',
    microsyllabusId: HISTORY_ANCIENT_ID,
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

const BANK: UpscCsePrelimsBatchPyq[] = [
  q({ id: 'q1', questionNumber: 1 }),
  q({ id: 'q2', questionNumber: 2, subject: 'Geography', microsyllabusId: undefined, mappingStatus: 'needs_review', topic: undefined }),
  q({ id: 'q3', questionNumber: 3 }),
];

function attempt(overrides: Partial<UpscCsePrelimsPyqAttempt> = {}): UpscCsePrelimsPyqAttempt {
  return {
    id: 'a1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 2026,
    paper: 'GS Paper I',
    subject: 'all',
    microsyllabusId: 'all',
    questionIds: ['q1', 'q2'],
    answers: { q1: 'a', q2: 'b' },
    correctCount: 1,
    wrongCount: 1,
    unansweredCount: 0,
    accuracy: 50,
    ...overrides,
  };
}

describe('upscCsePrelimsQuestionStatus', () => {
  it('unanswered when no answer recorded', () => {
    expect(upscCsePrelimsQuestionStatus(BANK[0], {})).toBe('unanswered');
  });

  it('correct when the answer matches correctOptionId', () => {
    expect(upscCsePrelimsQuestionStatus(BANK[0], { q1: 'a' })).toBe('correct');
  });

  it('wrong when the answer does not match', () => {
    expect(upscCsePrelimsQuestionStatus(BANK[0], { q1: 'b' })).toBe('wrong');
  });

  it('never "correct" when correctOptionId itself is absent (defensive, should not occur in practice)', () => {
    const noAnswer = q({ correctOptionId: undefined });
    expect(upscCsePrelimsQuestionStatus(noAnswer, { q1: 'a' })).toBe('wrong');
  });
});

describe('computeUpscCsePrelimsPerformance', () => {
  it('returns null when there are no attempts yet', () => {
    expect(computeUpscCsePrelimsPerformance(BANK, [], UPSC_CSE_PRELIMS_SYLLABUS)).toBeNull();
  });

  it('computes overall correct/wrong/attempted/accuracy from real attempts', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    expect(snapshot.overall.testsCompleted).toBe(1);
    expect(snapshot.overall.totalCorrect).toBe(1);
    expect(snapshot.overall.totalWrong).toBe(1);
    expect(snapshot.overall.totalAttempted).toBe(2);
    expect(snapshot.overall.overallAccuracy).toBe(50);
  });

  it('aggregates subject performance, including the Unclassified/needs_review question', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    const history = snapshot.subjects.find((s) => s.subject === 'History')!;
    const geography = snapshot.subjects.find((s) => s.subject === 'Geography')!;
    expect(history.attempted).toBe(1);
    expect(history.correct).toBe(1);
    expect(geography.attempted).toBe(1);
    expect(geography.wrong).toBe(1);
  });

  it('resolves a mapped microsyllabus id\'s real title from the syllabus tree', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    const ancient = snapshot.microsyllabus.find((m) => m.microsyllabusId === HISTORY_ANCIENT_ID)!;
    expect(ancient.title).toBe('Ancient India');
    expect(ancient.subject).toBe('History');
  });

  it('buckets a needs_review question under "Needs Review / Unmapped"', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    const unmapped = snapshot.microsyllabus.find((m) => m.microsyllabusId === 'unmapped')!;
    expect(unmapped.title).toBe('Needs Review / Unmapped');
  });

  it('aggregates year/paper performance', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    expect(snapshot.yearPaper).toEqual([{ year: 2026, paper: 'GS Paper I', attempted: 2, correct: 1, wrong: 1, accuracy: 50, testCount: 1 }]);
  });

  it('unattemptedCount counts bank questions never touched by any attempt', () => {
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [attempt()], UPSC_CSE_PRELIMS_SYLLABUS)!;
    expect(snapshot.unattemptedCount).toBe(1); // q3 never appears in any attempt
  });

  it('weakMicrosyllabus/strongestMicrosyllabus are sorted opposite each other by accuracy', () => {
    const mixedAttempt = attempt({ questionIds: ['q1', 'q3'], answers: { q1: 'a', q3: 'b' }, correctCount: 1, wrongCount: 1 });
    const snapshot = computeUpscCsePrelimsPerformance(BANK, [mixedAttempt], UPSC_CSE_PRELIMS_SYLLABUS)!;
    expect(snapshot.weakMicrosyllabus[0].accuracy).toBeLessThanOrEqual(snapshot.weakMicrosyllabus.at(-1)!.accuracy);
    expect(snapshot.strongestMicrosyllabus[0].accuracy).toBeGreaterThanOrEqual(snapshot.strongestMicrosyllabus.at(-1)!.accuracy);
  });
});

// ============================================================================================
// PYQ Weak Spots & Repeated Mistakes (Phase 6 Step 2)
// ============================================================================================

describe('computeUpscCsePrelimsRepeatedMistakes — empty/single-attempt cases', () => {
  it('an empty attempt history produces an empty result, never throws', () => {
    expect(computeUpscCsePrelimsRepeatedMistakes(BANK, [])).toEqual([]);
  });

  it('a single attempt produces one entry per answered question, correctly split correct/wrong', () => {
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(BANK, [attempt()]); // q1 correct ('a'), q2 wrong ('b' != 'a')
    const byId = Object.fromEntries(mistakes.map((m) => [m.questionId, m]));
    expect(mistakes).toHaveLength(2);
    expect(byId.q1).toMatchObject({ totalAttempts: 1, correctCount: 1, wrongCount: 0, latestCorrect: true });
    expect(byId.q2).toMatchObject({ totalAttempts: 1, correctCount: 0, wrongCount: 1, latestCorrect: false });
  });
});

describe('computeUpscCsePrelimsRepeatedMistakes — full mistake history is preserved, never just the latest attempt', () => {
  it('wrong, wrong, correct -> wrongCount stays 2 even after the later correct answer', () => {
    const attempts = [
      attempt({ id: 'r1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'b' } }), // wrong
      attempt({ id: 'r2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'b' } }), // wrong
      attempt({ id: 'r3', submittedAt: '2026-01-03T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'a' } }), // correct
    ];
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(BANK, attempts);
    expect(mistakes).toEqual([
      { questionId: 'q1', totalAttempts: 3, correctCount: 1, wrongCount: 2, lastAttemptAt: '2026-01-03T00:00:00.000Z', latestCorrect: true },
    ]);
  });
});

describe('computeUpscCsePrelimsRepeatedMistakes — multiple questions aggregated correctly', () => {
  it('each question gets its own independent tally', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'a', q2: 'a' }, correctCount: 2, wrongCount: 0 })]; // both correct
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(BANK, attempts);
    expect(mistakes.map((m) => m.questionId).sort()).toEqual(['q1', 'q2']);
    expect(mistakes.every((m) => m.wrongCount === 0 && m.correctCount === 1)).toBe(true);
  });
});

describe('computeUpscCsePrelimsRepeatedMistakes — 2024 answer-key limitation: never fabricates a result for an unkeyed question', () => {
  it('a question with no correctOptionId (e.g. an unkeyed 2024 record) is skipped entirely, never counted as a mistake', () => {
    const unkeyed2024 = q({ id: 'q2024', year: 2024, correctOptionId: undefined });
    const bankWith2024 = [...BANK, unkeyed2024];
    // The user answered it, but there is no key to score against.
    const attempts = [attempt({ questionIds: ['q1', 'q2024'], answers: { q1: 'a', q2024: 'a' }, correctCount: 1, wrongCount: 0 })];
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(bankWith2024, attempts);
    expect(mistakes.map((m) => m.questionId)).toEqual(['q1']); // q2024 never appears — not correct, not wrong
  });
});

describe('topUpscCsePrelimsRepeatedMistakes — worst-first view', () => {
  it('only includes questions with at least one wrong answer, worst first', () => {
    const attempts = [
      attempt({ id: 'm1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1', 'q2'], answers: { q1: 'b', q2: 'b' } }), // both wrong
      attempt({ id: 'm2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'b' } }), // q1 wrong again
    ];
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(BANK, attempts);
    const top = topUpscCsePrelimsRepeatedMistakes(mistakes, 6);
    expect(top[0]).toMatchObject({ questionId: 'q1', wrongCount: 2 });
    expect(top[1]).toMatchObject({ questionId: 'q2', wrongCount: 1 });
  });
});

describe('topMicrosyllabusByMistakes / topUpscCsePrelimsSubjectsByMistakes — weak-area ranking by mistake volume, reusing computeUpscCsePrelimsPerformance\'s own arrays', () => {
  it('ranks microsyllabus areas by raw wrong count, never a second aggregation pass over attempts', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'b', q2: 'b' }, correctCount: 0, wrongCount: 2 })]; // both wrong
    const snapshot = computeUpscCsePrelimsPerformance(BANK, attempts, UPSC_CSE_PRELIMS_SYLLABUS)!;
    const top = topMicrosyllabusByMistakes(snapshot.microsyllabus, 6);
    expect(top.some((m) => m.microsyllabusId === 'unmapped')).toBe(true); // q2's needs_review bucket is never dropped
  });

  it('never forces a needs_review question into a real microsyllabus — its mistakes surface only under the Unmapped bucket', () => {
    const attempts = [attempt({ questionIds: ['q2'], answers: { q2: 'b' }, correctCount: 0, wrongCount: 1 })]; // q2 is needs_review
    const snapshot = computeUpscCsePrelimsPerformance(BANK, attempts, UPSC_CSE_PRELIMS_SYLLABUS)!;
    const top = topMicrosyllabusByMistakes(snapshot.microsyllabus, 6);
    expect(top).toHaveLength(1);
    expect(top[0].microsyllabusId).toBe('unmapped');
    expect(top[0].title).toBe('Needs Review / Unmapped');
  });

  it('subject-level ranking mirrors the same reuse pattern', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'b', q2: 'b' }, correctCount: 0, wrongCount: 2 })];
    const snapshot = computeUpscCsePrelimsPerformance(BANK, attempts, UPSC_CSE_PRELIMS_SYLLABUS)!;
    const top = topUpscCsePrelimsSubjectsByMistakes(snapshot.subjects, 6);
    expect(top.map((s) => s.subject).sort()).toEqual(['Geography', 'History']);
  });
});

describe('computeUpscCsePrelimsRecentVsPreviousTrend — insufficient data', () => {
  it('fewer than 2 * windowSize attempts -> insufficient_data, never a fabricated trend', () => {
    const attempts = Array.from({ length: UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE }, (_, i) =>
      attempt({ id: `t${i}`, submittedAt: `2026-01-0${i + 1}T00:00:00.000Z`, correctCount: 1, wrongCount: 0 }),
    );
    const trend = computeUpscCsePrelimsRecentVsPreviousTrend(attempts);
    expect(trend.direction).toBe('insufficient_data');
    expect(trend.recentAccuracy).toBeNull();
  });

  it('zero attempts -> insufficient_data with zero counts', () => {
    const trend = computeUpscCsePrelimsRecentVsPreviousTrend([]);
    expect(trend).toEqual({ recentAttemptCount: 0, previousAttemptCount: 0, recentAccuracy: null, previousAccuracy: null, direction: 'insufficient_data' });
  });
});

describe('computeUpscCsePrelimsRecentVsPreviousTrend — improving / declining / stable, using each attempt\'s own stored correct/wrongCount (never recomputed)', () => {
  function windowAttempts(prefix: string, startDay: number, count: number, correctCount: number, wrongCount: number): UpscCsePrelimsPyqAttempt[] {
    return Array.from({ length: count }, (_, i) =>
      attempt({
        id: `${prefix}${i}`,
        submittedAt: `2026-02-${String(startDay + i).padStart(2, '0')}T00:00:00.000Z`,
        correctCount,
        wrongCount,
      }),
    );
  }

  it('improving: recent accuracy well above previous accuracy', () => {
    const previous = windowAttempts('p', 1, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 2, 8); // 20%
    const recent = windowAttempts('r', 10, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 8, 2); // 80%
    const trend = computeUpscCsePrelimsRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('improving');
  });

  it('declining: recent accuracy well below previous accuracy', () => {
    const previous = windowAttempts('p', 1, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 8, 2); // 80%
    const recent = windowAttempts('r', 10, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 2, 8); // 20%
    const trend = computeUpscCsePrelimsRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('declining');
  });

  it('stable: identical accuracy in both windows is safely inside the stable band', () => {
    const previous = windowAttempts('p', 1, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 6, 4); // 60%
    const recent = windowAttempts('r', 10, UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE, 6, 4); // 60%
    const trend = computeUpscCsePrelimsRecentVsPreviousTrend([...previous, ...recent]);
    expect(trend.direction).toBe('stable');
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
      upscCsePrelimsPyqAttempts: [],
    });
  }

  it('computeUpscCsePrelimsRepeatedMistakes fed with upscCsePrelimsPyqAttempts after a workspace switch never reflects another workspace\'s attempts', () => {
    fullReset();
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(attempt({ id: 'upsc-a1', questionIds: ['q1'], answers: { q1: 'b' }, correctCount: 0, wrongCount: 1 }));
    expect(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts)).toHaveLength(1);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);
    expect(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts)).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts)).toHaveLength(1);
  });
});

// ============================================================================================
// Revise My Repeated Mistakes (Phase 6 Step 3) — selectUpscCsePrelimsRepeatedMistakePracticeIds
// ============================================================================================

function mistake(questionId: string, wrongCount: number, overrides: Partial<UpscCsePrelimsRepeatedMistake> = {}): UpscCsePrelimsRepeatedMistake {
  return {
    questionId,
    totalAttempts: wrongCount,
    correctCount: 0,
    wrongCount,
    lastAttemptAt: '2026-01-01T00:00:00.000Z',
    latestCorrect: false,
    ...overrides,
  };
}

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — empty input', () => {
  it('returns [] when there are no repeated mistakes at all', () => {
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds([])).toEqual([]);
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — single mistake', () => {
  it('returns exactly that question id', () => {
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds([mistake('q1', 3)])).toEqual(['q1']);
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — ranking/order preserved', () => {
  it('keeps topUpscCsePrelimsRepeatedMistakes\' own worst-first order (most wrong first, id tie-break)', () => {
    const mistakes = [mistake('q-b', 1), mistake('q-a', 5), mistake('q-c', 5)];
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes)).toEqual(['q-a', 'q-c', 'q-b']);
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — duplicate ids defensively deduplicated', () => {
  it('de-duplicates a questionId that appears more than once in the input', () => {
    const mistakes = [mistake('q1', 3), mistake('q1', 3)];
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes)).toEqual(['q1']);
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — cap enforced', () => {
  it('truncates to the given cap, keeping the worst mistakes first', () => {
    const mistakes = [mistake('q1', 5), mistake('q2', 4), mistake('q3', 3)];
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes, 2)).toEqual(['q1', 'q2']);
  });

  it('returns [] for a zero or negative cap', () => {
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds([mistake('q1', 5)], 0)).toEqual([]);
    expect(selectUpscCsePrelimsRepeatedMistakePracticeIds([mistake('q1', 5)], -1)).toEqual([]);
  });

  it('applies DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP when no cap is given', () => {
    const mistakes = Array.from({ length: 30 }, (_, i) => mistake(`q${i}`, 30 - i));
    const ids = selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes);
    expect(ids).toHaveLength(DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP);
    expect(ids).toEqual(mistakes.slice(0, DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP).map((m) => m.questionId));
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — 2024 answer-key limitation (end-to-end regression)', () => {
  it('a 2024 question (no correctOptionId) can never enter the selector\'s output, even when repeatedly "wrong-looking" per user answer', () => {
    // q1 (2026, keyed) genuinely wrong twice. q2024 (no correctOptionId) answered the same way every
    // time — if correctness were ever fabricated for it, it would rank ABOVE q1 by mistake volume.
    const unkeyed2024 = q({ id: 'q2024', year: 2024, correctOptionId: undefined });
    const bankWith2024 = [...BANK, unkeyed2024];
    const attempts = [
      attempt({ id: 'm1', submittedAt: '2026-01-01T00:00:00.000Z', questionIds: ['q1', 'q2024'], answers: { q1: 'b', q2024: 'a' } }),
      attempt({ id: 'm2', submittedAt: '2026-01-02T00:00:00.000Z', questionIds: ['q1', 'q2024'], answers: { q1: 'b', q2024: 'a' } }),
      attempt({ id: 'm3', submittedAt: '2026-01-03T00:00:00.000Z', questionIds: ['q2024'], answers: { q2024: 'a' } }),
    ];
    const mistakes = computeUpscCsePrelimsRepeatedMistakes(bankWith2024, attempts);
    const ids = selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes);
    expect(ids).toEqual(['q1']);
    expect(ids).not.toContain('q2024');
  });

  it('manual bookmarking of a 2024 question is a completely separate, unmodified mechanism — still works via the real store', () => {
    // selectUpscCsePrelimsRepeatedMistakePracticeIds only feeds the "repeated mistake" candidate
    // list. Revision-queue ELIGIBILITY as a whole (lib/upscCsePrelimsPyqFilters.ts's
    // computeEligibleRevisionIds, untouched by this stage) is "incorrect OR bookmarked" — bookmarking
    // a 2024 question still makes it eligible for revision, entirely independent of the mistake-based
    // exclusion this selector enforces.
    useAppStore.setState({ bookmarkedPyqIds: [] });
    const unkeyed2024 = q({ id: 'q2024', year: 2024, correctOptionId: undefined });
    const bankWith2024 = [...BANK, unkeyed2024];
    const attempts = [attempt({ questionIds: ['q2024'], answers: { q2024: 'a' } })];

    // Never a repeated-mistake candidate, per the test above.
    expect(computeUpscCsePrelimsRepeatedMistakes(bankWith2024, attempts).map((m) => m.questionId)).not.toContain('q2024');

    // But still reachable through the real, separate bookmark mechanism.
    useAppStore.getState().toggleBookmarkedPyq('q2024');
    expect(useAppStore.getState().bookmarkedPyqIds).toContain('q2024');
  });
});

describe('selectUpscCsePrelimsRepeatedMistakePracticeIds — immutability', () => {
  it('never mutates the mistakes input', () => {
    const mistakes = [mistake('q1', 5), mistake('q2', 3)];
    const snapshot = JSON.stringify(mistakes);
    selectUpscCsePrelimsRepeatedMistakePracticeIds(mistakes, 1);
    expect(JSON.stringify(mistakes)).toBe(snapshot);
  });
});

describe('UPSC CSE — workspace isolation of the repeated-mistake selector (Phase 6 Step 3)', () => {
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
      upscCsePrelimsPyqAttempts: [],
    });
  }

  it('a repeated-mistake candidate computed while upsc_cse is active never leaks into apfc, and is restored on switching back', () => {
    fullReset();
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(attempt({ id: 'upsc-a1', questionIds: ['q1'], answers: { q1: 'b' }, correctCount: 0, wrongCount: 1 }));
    const upscIds = selectUpscCsePrelimsRepeatedMistakePracticeIds(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts));
    expect(upscIds).toEqual(['q1']);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    const apfcIds = selectUpscCsePrelimsRepeatedMistakePracticeIds(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts));
    expect(apfcIds).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const restoredIds = selectUpscCsePrelimsRepeatedMistakePracticeIds(computeUpscCsePrelimsRepeatedMistakes(BANK, useAppStore.getState().upscCsePrelimsPyqAttempts));
    expect(restoredIds).toEqual(['q1']);
  });
});
