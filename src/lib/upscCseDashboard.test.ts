import { describe, it, expect } from 'vitest';
import { computeUpscCseDashboardSnapshot, type ComputeUpscCseDashboardSnapshotInput } from './upscCseDashboard';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import type { UpscCseStudyTask } from './upscCseStudyTask';
import { createRevisionQueue } from './revisionQueue';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';

const ANCIENT_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India')!.id;

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
    microsyllabusId: ANCIENT_ID,
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

function attempt(overrides: Partial<UpscCsePrelimsPyqAttempt> = {}): UpscCsePrelimsPyqAttempt {
  return {
    id: 'a1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 2026,
    paper: 'GS Paper I',
    subject: 'all',
    microsyllabusId: 'all',
    questionIds: ['q1'],
    answers: { q1: 'a' },
    correctCount: 1,
    wrongCount: 0,
    unansweredCount: 0,
    accuracy: 100,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ComputeUpscCseDashboardSnapshotInput> = {}): ComputeUpscCseDashboardSnapshotInput {
  return {
    coverage: {},
    prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
    mainsTree: UPSC_CSE_MAINS_SYLLABUS,
    granularNodes: [],
    pyqBank: [],
    attempts: [],
    bookmarkedPyqIds: [],
    revisionQueue: createRevisionQueue(),
    studyTasks: [],
    today: '2026-09-22',
    ...overrides,
  };
}

describe('computeUpscCseDashboardSnapshot', () => {
  it('coverage summaries total exactly the Prelims + Mains microsyllabus counts', () => {
    const snapshot = computeUpscCseDashboardSnapshot(baseInput());
    expect(snapshot.prelimsCoverage.total).toBe(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.length);
    expect(snapshot.mainsCoverage.total).toBe(UPSC_CSE_MAINS_SYLLABUS.microsyllabus.length);
    expect(snapshot.overallCoverage.total).toBe(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.length + UPSC_CSE_MAINS_SYLLABUS.microsyllabus.length);
  });

  it('performance is null and unattemptedCount falls back to totalQuestions when no attempt has ever been submitted', () => {
    const bank = [q({ id: 'q1' }), q({ id: 'q2', questionNumber: 2 })];
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ pyqBank: bank }));
    expect(snapshot.performance).toBeNull();
    expect(snapshot.totalQuestions).toBe(2);
    expect(snapshot.unattemptedCount).toBe(2);
  });

  it('performance is populated and unattemptedCount reflects questions never touched by any attempt', () => {
    const bank = [q({ id: 'q1' }), q({ id: 'q2', questionNumber: 2 })];
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ pyqBank: bank, attempts: [attempt({ questionIds: ['q1'], answers: { q1: 'a' } })] }));
    expect(snapshot.performance).not.toBeNull();
    expect(snapshot.unattemptedCount).toBe(1); // q2 never attempted
  });

  it('bookmarkedCount mirrors the supplied bookmark list', () => {
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ bookmarkedPyqIds: ['q1', 'q2'] }));
    expect(snapshot.bookmarkedCount).toBe(2);
  });

  it('revisionDueCount counts bookmarked/incorrect questions due today', () => {
    const bank = [q({ id: 'q1' })];
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ pyqBank: bank, bookmarkedPyqIds: ['q1'] }));
    expect(snapshot.revisionDueCount).toBe(1);
  });

  it('recentAttempts is sorted most-recent-first and capped at recentLimit', () => {
    const attempts = [
      attempt({ id: 'a1', submittedAt: '2026-09-01T00:00:00.000Z' }),
      attempt({ id: 'a2', submittedAt: '2026-09-20T00:00:00.000Z' }),
      attempt({ id: 'a3', submittedAt: '2026-09-10T00:00:00.000Z' }),
    ];
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ attempts, recentLimit: 2 }));
    expect(snapshot.recentAttempts.map((a) => a.id)).toEqual(['a2', 'a3']);
  });

  it('recentCompletedTasks excludes pending tasks and sorts by completedAt descending', () => {
    const studyTasks: UpscCseStudyTask[] = [
      { id: 't1', date: '2026-09-20', title: 'Old', status: 'completed', createdAt: '2026-09-20T00:00:00.000Z', completedAt: '2026-09-20T09:00:00.000Z' },
      { id: 't2', date: '2026-09-22', title: 'New', status: 'completed', createdAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T09:00:00.000Z' },
      { id: 't3', date: '2026-09-22', title: 'Pending', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
    ];
    const snapshot = computeUpscCseDashboardSnapshot(baseInput({ studyTasks }));
    expect(snapshot.recentCompletedTasks.map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('returns a fully honest empty-state snapshot when nothing at all has happened yet', () => {
    const snapshot = computeUpscCseDashboardSnapshot(baseInput());
    expect(snapshot.performance).toBeNull();
    expect(snapshot.totalQuestions).toBe(0);
    expect(snapshot.unattemptedCount).toBe(0);
    expect(snapshot.revisionDueCount).toBe(0);
    expect(snapshot.bookmarkedCount).toBe(0);
    expect(snapshot.recentAttempts).toEqual([]);
    expect(snapshot.recentCompletedTasks).toEqual([]);
  });
});
