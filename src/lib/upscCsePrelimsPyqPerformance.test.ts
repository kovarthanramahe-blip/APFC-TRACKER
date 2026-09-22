import { describe, it, expect } from 'vitest';
import { computeUpscCsePrelimsPerformance, upscCsePrelimsQuestionStatus } from './upscCsePrelimsPyqPerformance';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';

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
