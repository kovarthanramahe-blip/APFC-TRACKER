import { describe, it, expect } from 'vitest';
import { computeUpscCseAnalytics, type ComputeUpscCseAnalyticsInput } from './upscCseAnalytics';
import type { UpscCseSyllabusTree } from './upscCseSyllabus';
import type { UpscCseGranularNode } from './upscCseGranularSyllabus';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import type { UpscCseStudyTask } from './upscCseStudyTask';
import { createRevisionQueue } from './revisionQueue';

// A small, self-contained synthetic tree — never the real, protected UPSC syllabus data — so these
// tests are stable regardless of future real-syllabus edits.
const PRELIMS_TREE: UpscCseSyllabusTree = {
  stage: 'prelims',
  papers: [{ id: 'p1', stage: 'prelims', title: 'GS Paper I', shortTitle: 'GS1', order: 1 }],
  subjects: [
    { id: 'sh', paperId: 'p1', stage: 'prelims', title: 'History', order: 1 },
    { id: 'sg', paperId: 'p1', stage: 'prelims', title: 'Geography', order: 2 },
  ],
  microsyllabus: [
    { id: 'ms1', parentId: 'sh', subjectId: 'sh', paperId: 'p1', stage: 'prelims', title: 'Ancient India', description: 'd', order: 1 },
    { id: 'ms2', parentId: 'sh', subjectId: 'sh', paperId: 'p1', stage: 'prelims', title: 'Modern India', description: 'd', order: 2 },
    { id: 'ms3', parentId: 'sg', subjectId: 'sg', paperId: 'p1', stage: 'prelims', title: 'Physical Geography', description: 'd', order: 3 },
  ],
};

const MAINS_TREE: UpscCseSyllabusTree = { stage: 'mains', papers: [], subjects: [], microsyllabus: [] };

const GRANULAR_NODES: UpscCseGranularNode[] = [
  {
    id: 'ms2-t1',
    level: 'topic',
    parentId: 'ms2',
    stage: 'prelims',
    paperId: 'p1',
    subjectId: 'sh',
    microsyllabusId: 'ms2',
    topicId: 'ms2-t1',
    title: 'Revolt of 1857',
    description: 'd',
    origin: 'derived_study_unit',
    order: 1,
  },
];

function pyq(overrides: Partial<UpscCsePrelimsBatchPyq> = {}): UpscCsePrelimsBatchPyq {
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
    microsyllabusId: 'ms1',
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

function baseInput(overrides: Partial<ComputeUpscCseAnalyticsInput> = {}): ComputeUpscCseAnalyticsInput {
  return {
    coverage: {},
    prelimsTree: PRELIMS_TREE,
    mainsTree: MAINS_TREE,
    granularNodes: GRANULAR_NODES,
    pyqBank: [],
    attempts: [],
    bookmarkedPyqIds: [],
    revisionQueue: createRevisionQueue(),
    studyTasks: [],
    today: '2026-09-22',
    ...overrides,
  };
}

describe('computeUpscCseAnalytics — syllabus coverage', () => {
  const coverage: UpscCseSyllabusCoverage = { ms1: 'strong', 'ms2-t1': 'revised' };

  it('rolls granular leaves into the subject-level summary via expandToLeafCoverageIds', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ coverage }));
    const history = snapshot.subjectCoverage.find((s) => s.subjectId === 'sh')!;
    const geography = snapshot.subjectCoverage.find((s) => s.subjectId === 'sg')!;
    expect(history.summary.total).toBe(2); // ms1 + ms2's granular leaf ms2-t1, never ms2 itself
    expect(history.summary.counts.strong).toBe(1);
    expect(history.summary.counts.revised).toBe(1);
    expect(geography.summary.total).toBe(1);
    expect(geography.summary.counts.not_started).toBe(1);
  });

  it('overallCoverage combines prelims and mains leaf ids', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ coverage }));
    expect(snapshot.overallCoverage.total).toBe(3); // ms1, ms2-t1, ms3
    expect(snapshot.prelimsCoverage.total).toBe(3);
    expect(snapshot.mainsCoverage.total).toBe(0); // MAINS_TREE has no microsyllabus items
  });

  it('an item with no coverage entry defaults to not_started, never fabricated progress', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ coverage: {} }));
    expect(snapshot.overallCoverage.weightedPct).toBe(0);
    expect(snapshot.overallCoverage.counts.not_started).toBe(3);
  });
});

describe('computeUpscCseAnalytics — PYQ performance and honesty', () => {
  it('performance is null and unattemptedCount falls back to totalQuestions when there are no attempts', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ pyqBank: [pyq({ id: 'q1' }), pyq({ id: 'q2' })] }));
    expect(snapshot.performance).toBeNull();
    expect(snapshot.totalQuestions).toBe(2);
    expect(snapshot.unattemptedCount).toBe(2);
  });

  it('unattemptedCount reflects real attempt coverage once attempts exist', () => {
    const bank = [pyq({ id: 'q1' }), pyq({ id: 'q2' }), pyq({ id: 'q3' })];
    const attempts: UpscCsePrelimsPyqAttempt[] = [
      {
        id: 'a1',
        submittedAt: '2026-09-01T00:00:00.000Z',
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
      },
    ];
    const snapshot = computeUpscCseAnalytics(baseInput({ pyqBank: bank, attempts }));
    expect(snapshot.performance).not.toBeNull();
    expect(snapshot.totalQuestions).toBe(3);
    expect(snapshot.unattemptedCount).toBe(1); // q3 was never attempted
  });
});

describe('computeUpscCseAnalytics — revision queue integration', () => {
  it('eligible revision ids combine real incorrect answers with bookmarks, never fabricated', () => {
    const bank = [pyq({ id: 'q1' }), pyq({ id: 'q2' })];
    const attempts: UpscCsePrelimsPyqAttempt[] = [
      {
        id: 'a1',
        submittedAt: '2026-09-01T00:00:00.000Z',
        year: 2026,
        paper: 'GS Paper I',
        subject: 'all',
        microsyllabusId: 'all',
        questionIds: ['q1', 'q2'],
        answers: { q1: 'a', q2: 'b' }, // q1 correct, q2 wrong
        correctCount: 1,
        wrongCount: 1,
        unansweredCount: 0,
        accuracy: 50,
      },
    ];
    const snapshot = computeUpscCseAnalytics(baseInput({ pyqBank: bank, attempts, bookmarkedPyqIds: ['q2'] }));
    // q2 is both incorrect and bookmarked -> counted once, not twice.
    expect(snapshot.revision.totalTracked).toBe(1);
  });
});

describe('computeUpscCseAnalytics — study task analytics', () => {
  const studyTasks: UpscCseStudyTask[] = [
    { id: 't1', date: '2026-09-20', title: 'Overdue pending', status: 'pending', createdAt: 'x', targetMinutes: 30 },
    { id: 't2', date: '2026-09-25', title: 'Completed', status: 'completed', createdAt: 'x', completedAt: 'y', targetMinutes: 45 },
    { id: 't3', date: '2026-09-26', title: 'In progress', status: 'in_progress', createdAt: 'x', targetMinutes: 20 },
  ];

  it('counts, planned minutes, and completion rate are computed from real tasks only', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ studyTasks, today: '2026-09-22' }));
    expect(snapshot.studyTasks.counts).toEqual({ pending: 1, in_progress: 1, completed: 1 });
    expect(snapshot.studyTasks.totalPlannedMinutes).toBe(95);
    expect(snapshot.studyTasks.completionRatePct).toBe(33);
    expect(snapshot.studyTasks.overdueCount).toBe(1);
  });

  it('plannedMinutesCompleted sums targetMinutes ONLY for completed tasks — never claimed as measured time', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ studyTasks, today: '2026-09-22' }));
    expect(snapshot.studyTasks.plannedMinutesCompleted).toBe(45); // only t2's targetMinutes
  });

  it('completionRatePct is 0, never NaN/divide-by-zero, when there are no tasks at all', () => {
    const snapshot = computeUpscCseAnalytics(baseInput({ studyTasks: [] }));
    expect(snapshot.studyTasks.completionRatePct).toBe(0);
    expect(snapshot.studyTasks.overdueCount).toBe(0);
  });
});
