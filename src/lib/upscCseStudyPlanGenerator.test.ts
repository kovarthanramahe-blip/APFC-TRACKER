import { describe, it, expect } from 'vitest';
import { generateUpscCseStudyPlan, type GenerateUpscCseStudyPlanInput } from './upscCseStudyPlanGenerator';
import { createUpscCseStudyPlanConfig, type UpscCseStudyPlanConfig } from './upscCseStudyPlanConfig';
import type { UpscCseSyllabusTree } from './upscCseSyllabus';
import type { UpscCseGranularNode } from './upscCseGranularSyllabus';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import type { UpscCseStudyTask } from './upscCseStudyTask';

// A small, self-contained synthetic tree — never the real, protected UPSC syllabus data files —
// so these tests exercise the generator's own logic in full isolation and stay stable regardless
// of any future real-syllabus edits.
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
    subject: 'Geography',
    topic: 'Physical Geography',
    microsyllabusId: 'ms3',
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
    questionIds: ['q1', 'q2'],
    answers: { q1: 'b', q2: 'b' }, // both wrong (correctOptionId is 'a')
    correctCount: 0,
    wrongCount: 2,
    unansweredCount: 0,
    accuracy: 0,
    ...overrides,
  };
}

function baseConfig(overrides: Partial<Parameters<typeof createUpscCseStudyPlanConfig>[0]> = {}): UpscCseStudyPlanConfig {
  return createUpscCseStudyPlanConfig(
    { startDate: '2026-09-22', targetDate: '2026-09-24', daysPerWeek: 7, minutesPerDay: 100, planType: 'balanced', ...overrides },
    '2026-09-22T00:00:00.000Z',
  );
}

function baseInput(overrides: Partial<GenerateUpscCseStudyPlanInput> = {}): GenerateUpscCseStudyPlanInput {
  return {
    config: baseConfig(),
    prelimsTree: PRELIMS_TREE,
    mainsTree: MAINS_TREE,
    granularNodes: GRANULAR_NODES,
    coverage: {},
    pyqBank: [],
    attempts: [],
    existingTasks: [],
    ...overrides,
  };
}

describe('generateUpscCseStudyPlan — custom plans', () => {
  it('returns [] for a custom plan, regardless of any other input', () => {
    const input = baseInput({ config: baseConfig({ planType: 'custom' }) });
    expect(generateUpscCseStudyPlan(input)).toEqual([]);
  });
});

describe('generateUpscCseStudyPlan — balanced plans', () => {
  it('plans a not-granularized microsyllabus item at the microsyllabus level and a granularized one at its leaf', () => {
    const tasks = generateUpscCseStudyPlan(baseInput());
    const ms1Task = tasks.find((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId);
    const granularTask = tasks.find((t) => t.granularNodeId === 'ms2-t1');
    expect(ms1Task).toBeDefined();
    expect(ms1Task?.title).toBe('Ancient India');
    expect(ms1Task?.linkedActionHref).toBe('/upsc-syllabus?microsyllabusId=ms1');
    expect(granularTask).toBeDefined();
    expect(granularTask?.title).toBe('Revolt of 1857');
    expect(granularTask?.microsyllabusId).toBe('ms2');
    expect(granularTask?.linkedActionHref).toBe('/upsc-syllabus?granularId=ms2-t1');
  });

  it('never generates a task for a microsyllabus item already marked strong', () => {
    const coverage: UpscCseSyllabusCoverage = { ms1: 'strong' };
    const tasks = generateUpscCseStudyPlan(baseInput({ coverage }));
    expect(tasks.some((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId)).toBe(false);
  });

  it('never generates a task for a granular leaf already marked strong', () => {
    const coverage: UpscCseSyllabusCoverage = { 'ms2-t1': 'strong' };
    const tasks = generateUpscCseStudyPlan(baseInput({ coverage }));
    expect(tasks.some((t) => t.granularNodeId === 'ms2-t1')).toBe(false);
  });

  it('respects minutesPerDay: a candidate that would exceed the remaining daily budget waits for the next study day', () => {
    // ms1 costs 45, ms2-t1 costs 20 — a 50-minute/day budget fits ms1 (45) but not also ms2-t1
    // (45+20=65 > 50), so ms2-t1 must land on day 2, not day 1.
    const tasks = generateUpscCseStudyPlan(baseInput({ config: baseConfig({ minutesPerDay: 50 }) }));
    const ms1Task = tasks.find((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId)!;
    const granularTask = tasks.find((t) => t.granularNodeId === 'ms2-t1')!;
    expect(ms1Task.date).toBe('2026-09-22');
    expect(granularTask.date).toBe('2026-09-23');
  });

  it('only schedules tasks on preferredDays when configured', () => {
    // 2026-09-22 is a Tuesday; restrict to Mondays (1) only within a wider window so at least one
    // Monday falls in range.
    const input = baseInput({
      config: baseConfig({ startDate: '2026-09-22', targetDate: '2026-10-05', preferredDays: [1] }),
    });
    const tasks = generateUpscCseStudyPlan(input);
    for (const t of tasks) {
      expect(new Date(t.date + 'T00:00:00').getDay()).toBe(1);
    }
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('is deterministic: identical input produces an identical output list', () => {
    const input = baseInput();
    expect(generateUpscCseStudyPlan(input)).toEqual(generateUpscCseStudyPlan(input));
  });

  it('never generates a task for a microsyllabus/granular node already covered by an existing, active task', () => {
    const existingTasks: UpscCseStudyTask[] = [
      { id: 'existing-1', date: '2026-09-20', title: 'Ancient India', status: 'pending', createdAt: 'x', microsyllabusId: 'ms1' },
    ];
    const tasks = generateUpscCseStudyPlan(baseInput({ existingTasks }));
    expect(tasks.some((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId)).toBe(false);
  });

  it('a COMPLETED existing task does not suppress regenerating that item (only active tasks count as already planned)', () => {
    const existingTasks: UpscCseStudyTask[] = [
      { id: 'existing-1', date: '2026-09-20', title: 'Ancient India', status: 'completed', createdAt: 'x', completedAt: 'y', microsyllabusId: 'ms1' },
    ];
    const tasks = generateUpscCseStudyPlan(baseInput({ existingTasks }));
    expect(tasks.some((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId)).toBe(true);
  });

  it('ranks a real weak-microsyllabus-backed candidate first, even when it is later in tree order', () => {
    // ms3 (Geography, tree order 3 — last) gets 2 wrong real attempts -> 0% accuracy -> weak.
    const tasks = generateUpscCseStudyPlan(
      baseInput({ pyqBank: [pyq({ id: 'q1' }), pyq({ id: 'q2' })], attempts: [attempt()] }),
    );
    const ms3Index = tasks.findIndex((t) => t.microsyllabusId === 'ms3');
    const ms1Index = tasks.findIndex((t) => t.microsyllabusId === 'ms1' && !t.granularNodeId);
    expect(ms3Index).toBeGreaterThanOrEqual(0);
    expect(ms3Index).toBeLessThan(ms1Index);
    expect(tasks[ms3Index].priority).toBe('high');
    expect(tasks[ms1Index].priority).toBe('medium');
  });

  it('never fabricates a weak-area signal without at least 2 real attempts', () => {
    // Only 1 attempted question on ms3 — below the attempted>=2 threshold — so it must NOT rank first.
    const tasks = generateUpscCseStudyPlan(baseInput({ pyqBank: [pyq({ id: 'q1' })], attempts: [attempt({ questionIds: ['q1'], correctCount: 0, wrongCount: 1 })] }));
    expect(tasks[0].microsyllabusId).not.toBe('ms3');
  });
});

describe('generateUpscCseStudyPlan — subject_focus plans', () => {
  it('generates tasks only for microsyllabus items (and their granular leaves) under the focus subject', () => {
    const input = baseInput({ config: baseConfig({ planType: 'subject_focus', focusSubject: 'History' }) });
    const tasks = generateUpscCseStudyPlan(input);
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(t.subject).toBe('History');
    expect(tasks.some((t) => t.microsyllabusId === 'ms3')).toBe(false);
  });

  it('an unmatched focus subject produces no tasks at all (never falls back to a different subject)', () => {
    const input = baseInput({ config: baseConfig({ planType: 'subject_focus', focusSubject: 'Polity' }) });
    expect(generateUpscCseStudyPlan(input)).toEqual([]);
  });
});
