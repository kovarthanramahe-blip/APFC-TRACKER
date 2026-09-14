import { describe, it, expect } from 'vitest';
import {
  validateStudyPlanConfig,
  calculatePlanCapacity,
  estimateTopicWorkload,
  prioritizeTopics,
  generateStudyPlan,
  BUFFER_RATIO,
  COVERAGE_MINUTES_PER_TOPIC,
  REVISION_MINUTES_PER_TOPIC,
  PRACTICE_MINUTES_PER_TOPIC,
  type StudyPlanConfig,
} from './studyPlan';
import { computeUnifiedTopicStatus } from './topicStatus';
import { computePyqPerformance } from './pyqPerformance';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import type { SyllabusSubject, PYQ, PYQAttempt } from './types';

// Synthetic fixture syllabus/bank — independent of real data, so these tests exercise the
// engine's logic rather than being fragile to the real dataset's exact shape/size.
const syllabus: SyllabusSubject[] = [
  {
    id: 'subj-a',
    title: 'Subject A',
    shortTitle: 'A',
    colorKey: 'english',
    weightageHint: '',
    topics: [
      { id: 't1', title: 'Topic One' }, // will be not_started
      { id: 't2', title: 'Topic Two' }, // will be needs_coverage
      { id: 't3', title: 'Topic Three' }, // will be needs_revision
    ],
  },
  {
    id: 'subj-b',
    title: 'Subject B',
    shortTitle: 'B',
    colorKey: 'polity',
    weightageHint: '',
    topics: [
      { id: 't4', title: 'Topic Four' }, // will be needs_practice
      { id: 't5', title: 'Topic Five' }, // will be strong
    ],
  },
];

function pyq(id: string, topicId: string, subject: PYQ['subject'] = 'english'): PYQ {
  return {
    id,
    year: 2025,
    subject,
    topicId,
    question: `Q ${id}`,
    options: [
      { id: `${id}-o0`, text: 'A' },
      { id: `${id}-o1`, text: 'B' },
    ],
    correctOptionId: `${id}-o0`,
    explanation: '',
    verificationStatus: 'cross_verified',
  };
}

function attempt(overrides: Partial<PYQAttempt>): PYQAttempt {
  return {
    id: overrides.id ?? `a-${Math.random()}`,
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: overrides.questionIds ?? [],
    answers: overrides.answers ?? {},
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    unansweredCount: overrides.unansweredCount ?? 0,
    score: 0,
    accuracy: 0,
  };
}

const bank: PYQ[] = [
  pyq('t2-q0', 't2'),
  pyq('t3-q0', 't3'),
  pyq('t3-q1', 't3'),
  pyq('t3-q2', 't3'),
  pyq('t4-q0', 't4'),
  pyq('t5-q0', 't5'),
  pyq('t5-q1', 't5'),
  pyq('t5-q2', 't5'),
];

// t2: 1 wrong, uncovered -> needs_coverage
// t3: 3 wrong (0%), covered -> needs_revision
// t4: 1 correct, covered -> needs_practice (only 1 attempted)
// t5: 3 correct (100%), covered -> strong
const mixedAttempt = attempt({
  questionIds: ['t2-q0', 't3-q0', 't3-q1', 't3-q2', 't4-q0', 't5-q0', 't5-q1', 't5-q2'],
  answers: {
    't2-q0': 't2-q0-o1',
    't3-q0': 't3-q0-o1',
    't3-q1': 't3-q1-o1',
    't3-q2': 't3-q2-o1',
    't4-q0': 't4-q0-o0',
    't5-q0': 't5-q0-o0',
    't5-q1': 't5-q1-o0',
    't5-q2': 't5-q2-o0',
  },
  correctCount: 4,
  wrongCount: 4,
});
const mixedPerf = computePyqPerformance(bank, [mixedAttempt]);
const mixedCompleted = { t3: true, t4: true, t5: true }; // t1, t2 not covered

function validConfig(overrides: Partial<StudyPlanConfig> = {}): StudyPlanConfig {
  return {
    startDate: '2026-01-01',
    targetDate: '2026-12-20',
    studyDaysPerWeek: 6,
    hoursPerStudyDay: 3,
    ...overrides,
  };
}

// --- 1-4: validation ---------------------------------------------------------
describe('validateStudyPlanConfig', () => {
  it('accepts a valid configuration', () => {
    expect(validateStudyPlanConfig(validConfig())).toEqual([]);
  });

  it('rejects a target date before the start date', () => {
    const errors = validateStudyPlanConfig(validConfig({ startDate: '2026-06-01', targetDate: '2026-01-01' }));
    expect(errors.some((e) => e.field === 'targetDate')).toBe(true);
  });

  it('rejects a target date equal to the start date', () => {
    const errors = validateStudyPlanConfig(validConfig({ startDate: '2026-06-01', targetDate: '2026-06-01' }));
    expect(errors.some((e) => e.field === 'targetDate')).toBe(true);
  });

  it('rejects a malformed date string', () => {
    const errors = validateStudyPlanConfig(validConfig({ startDate: 'not-a-date' }));
    expect(errors.some((e) => e.field === 'startDate')).toBe(true);
  });

  it('rejects zero or negative study hours', () => {
    expect(validateStudyPlanConfig(validConfig({ hoursPerStudyDay: 0 })).some((e) => e.field === 'hoursPerStudyDay')).toBe(true);
    expect(validateStudyPlanConfig(validConfig({ hoursPerStudyDay: -2 })).some((e) => e.field === 'hoursPerStudyDay')).toBe(true);
  });

  it('rejects zero study days per week', () => {
    expect(validateStudyPlanConfig(validConfig({ studyDaysPerWeek: 0 })).some((e) => e.field === 'studyDaysPerWeek')).toBe(true);
  });

  it('rejects studyDaysPerWeek greater than 7', () => {
    expect(validateStudyPlanConfig(validConfig({ studyDaysPerWeek: 8 })).some((e) => e.field === 'studyDaysPerWeek')).toBe(true);
  });

  it('rejects a restDays configuration that excludes every configured study weekday', () => {
    const errors = validateStudyPlanConfig(validConfig({ studyDaysPerWeek: 2, preferredStudyDays: [1, 2], restDays: [1, 2] }));
    expect(errors.some((e) => e.field === 'restDays')).toBe(true);
  });

  it('generateStudyPlan returns validation errors instead of a plan for invalid config', () => {
    const result = generateStudyPlan({ config: validConfig({ hoursPerStudyDay: -1 }), syllabus, completedTopics: {}, pyqPerf: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});

// --- 5-6: capacity -----------------------------------------------------------
describe('calculatePlanCapacity', () => {
  it('computes available minutes as study days x minutes per day, never dividing the syllabus across every calendar day', () => {
    // 2026-01-01 is a Thursday. One week (Jan 1 - Jan 7) with studyDaysPerWeek=5 (default Mon-Fri).
    const capacity = calculatePlanCapacity(validConfig({ startDate: '2026-01-01', targetDate: '2026-01-07', studyDaysPerWeek: 5, hoursPerStudyDay: 2 }));
    // Jan 1 (Thu), 2 (Fri) count; Jan 5 (Mon) - Jan 7 (Wed) count. Jan 3-4 (Sat/Sun) excluded.
    expect(capacity.studyDayDates).toEqual(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']);
    expect(capacity.minutesPerStudyDay).toBe(120);
    expect(capacity.totalAvailableMinutes).toBe(5 * 120);
    expect(capacity.plannableMinutes).toBe(Math.floor(5 * 120 * BUFFER_RATIO));
  });

  it('uses preferredStudyDays exactly when supplied, overriding the default distribution', () => {
    const capacity = calculatePlanCapacity(
      validConfig({ startDate: '2026-01-01', targetDate: '2026-01-07', studyDaysPerWeek: 2, preferredStudyDays: [2, 4], hoursPerStudyDay: 1 }),
    );
    // Only Tuesdays (2) and Thursdays (4) in that window: Jan 1 (Thu), Jan 6 (Tue).
    expect(capacity.studyWeekdays).toEqual([2, 4]);
    expect(capacity.studyDayDates.sort()).toEqual(['2026-01-01', '2026-01-06']);
  });

  it('subtracts restDays from the study weekday set even when they overlap preferredStudyDays', () => {
    const capacity = calculatePlanCapacity(
      validConfig({ startDate: '2026-01-01', targetDate: '2026-01-07', preferredStudyDays: [1, 2, 3], restDays: [2] }),
    );
    expect(capacity.studyWeekdays).toEqual([1, 3]);
  });

  it('leaves at least one rest day by default whenever studyDaysPerWeek < 7', () => {
    const capacity = calculatePlanCapacity(validConfig({ studyDaysPerWeek: 6 }));
    expect(capacity.studyWeekdays).toHaveLength(6);
    expect(capacity.studyWeekdays).not.toContain(0); // Sunday stays free
  });

  it('buffer is respected: plannableMinutes is always <= totalAvailableMinutes', () => {
    const capacity = calculatePlanCapacity(validConfig());
    expect(capacity.plannableMinutes).toBeLessThanOrEqual(capacity.totalAvailableMinutes);
    expect(capacity.plannableMinutes).toBe(Math.floor(capacity.totalAvailableMinutes * BUFFER_RATIO));
  });
});

// --- estimateTopicWorkload ----------------------------------------------------
describe('estimateTopicWorkload', () => {
  const statuses = computeUnifiedTopicStatus(syllabus, mixedCompleted, mixedPerf);
  const byId = (id: string) => statuses.find((s) => s.topicId === id)!;

  it('not-started topics receive coverage workload', () => {
    const w = estimateTopicWorkload(byId('t1'));
    expect(w.taskType).toBe('coverage');
    expect(w.estimatedMinutes).toBe(COVERAGE_MINUTES_PER_TOPIC);
  });

  it('needs_coverage topics receive coverage workload', () => {
    const w = estimateTopicWorkload(byId('t2'));
    expect(w.taskType).toBe('coverage');
    expect(w.estimatedMinutes).toBe(COVERAGE_MINUTES_PER_TOPIC);
  });

  it('covered but weak topics receive revision workload', () => {
    const w = estimateTopicWorkload(byId('t3'));
    expect(w.taskType).toBe('revision');
    expect(w.estimatedMinutes).toBe(REVISION_MINUTES_PER_TOPIC);
  });

  it('covered topics with too little PYQ data receive pyq_practice workload, not revision', () => {
    const w = estimateTopicWorkload(byId('t4'));
    expect(w.taskType).toBe('pyq_practice');
    expect(w.estimatedMinutes).toBe(PRACTICE_MINUTES_PER_TOPIC);
  });

  it('already-strong topics receive no workload', () => {
    const w = estimateTopicWorkload(byId('t5'));
    expect(w.taskType).toBeNull();
    expect(w.estimatedMinutes).toBe(0);
  });

  it('never produces NaN, Infinity or negative estimated minutes for any status', () => {
    for (const s of statuses) {
      const w = estimateTopicWorkload(s);
      expect(Number.isFinite(w.estimatedMinutes)).toBe(true);
      expect(w.estimatedMinutes).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('prioritizeTopics', () => {
  it('orders needs_coverage > needs_revision > needs_practice > not_started > strong', () => {
    const statuses = computeUnifiedTopicStatus(syllabus, mixedCompleted, mixedPerf);
    const order = prioritizeTopics(statuses).map((s) => s.topicId);
    // t2=needs_coverage, t3=needs_revision, t4=needs_practice, t1=not_started, t5=strong
    expect(order.indexOf('t2')).toBeLessThan(order.indexOf('t3'));
    expect(order.indexOf('t3')).toBeLessThan(order.indexOf('t4'));
    expect(order.indexOf('t4')).toBeLessThan(order.indexOf('t1'));
    expect(order.indexOf('t1')).toBeLessThan(order.indexOf('t5'));
  });
});

// --- generateStudyPlan --------------------------------------------------------
describe('generateStudyPlan — complete syllabus coverage', () => {
  it('every syllabus topic is represented in the coverage summary', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total = syllabus.reduce((sum, s) => sum + s.topics.length, 0);
    expect(result.plan.coverageSummary.totalTopics).toBe(total);
    expect(
      result.plan.coverageSummary.strong + result.plan.coverageSummary.needsCoverage + result.plan.coverageSummary.needsRevision + result.plan.coverageSummary.needsPractice,
    ).toBe(total);
  });

  it('every topic is accounted for as either a scheduled task, unscheduled, or strong (never dropped silently)', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    const scheduledIds = new Set(result.plan.tasks.map((t) => t.topicId));
    const accountedFor = scheduledIds.size + result.plan.unscheduledTopicIds.length + result.plan.coverageSummary.strong;
    expect(accountedFor).toBe(syllabus.reduce((sum, s) => sum + s.topics.length, 0));
  });
});

describe('generateStudyPlan — capacity verdicts', () => {
  it('detects insufficient capacity and reports a deficit, never silently claiming completion', () => {
    // Barely any time: 1 study day, 10 minutes — nowhere near enough for 4 real topics.
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-01-02', studyDaysPerWeek: 7, hoursPerStudyDay: 10 / 60 });
    const result = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.capacityReport.verdict).toBe('insufficient');
    expect(result.plan.capacityReport.deficitMinutes).toBeGreaterThan(0);
    expect(result.plan.unscheduledTopicIds.length).toBeGreaterThan(0);
    // Scheduled workload must never exceed what capacity actually allows.
    const scheduledMinutes = result.plan.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    expect(scheduledMinutes).toBeLessThanOrEqual(result.plan.capacity.totalAvailableMinutes);
  });

  it('reports "comfortable" when capacity comfortably exceeds requirements', () => {
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 4 });
    const result = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.capacityReport.verdict).toBe('comfortable');
    expect(result.plan.unscheduledTopicIds).toEqual([]);
  });

  it('scheduled minutes never exceed the buffered plannableMinutes when capacity is ample', () => {
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 4 });
    const result = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    const scheduledMinutes = result.plan.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    expect(scheduledMinutes).toBeLessThanOrEqual(result.plan.capacity.plannableMinutes);
  });
});

describe('generateStudyPlan — phases', () => {
  it('a short preparation period collapses to a single focused phase', () => {
    // Only 3 available study days, barely enough for the coverage workload alone -> no room left
    // for a separate consolidation/revision phase.
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-01-03', studyDaysPerWeek: 6, hoursPerStudyDay: 1 });
    const result = generateStudyPlan({ config, syllabus, completedTopics: {}, pyqPerf: null });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.phases.length).toBeLessThanOrEqual(1);
    if (result.plan.phases.length === 1) expect(result.plan.phases[0].id).toBe('focused');
  });

  it('a long preparation period with mixed topic statuses can use multiple phases', () => {
    const config = validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20', studyDaysPerWeek: 6, hoursPerStudyDay: 3 });
    const result = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    expect(result.plan.phases.length).toBeGreaterThan(1);
    for (const phase of result.plan.phases) {
      expect(phase.id).not.toBe('focused');
    }
  });
});

describe('generateStudyPlan — determinism', () => {
  it('produces identical plans for identical input, with no randomization', () => {
    const config = validConfig();
    const a = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    const b = generateStudyPlan({ config, syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    expect(a).toEqual(b);
  });

  it('produces no duplicate task ids (a topic is never double-assigned)', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    const ids = result.plan.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reflects a change in progress: a previously needs_coverage topic marked covered no longer generates a coverage task', () => {
    const withCoverage = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    const nowCovered = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: { ...mixedCompleted, t2: true }, pyqPerf: mixedPerf });
    if (!withCoverage.ok || !nowCovered.ok) throw new Error('expected ok plans');
    const t2Before = withCoverage.plan.tasks.find((t) => t.topicId === 't2');
    const t2After = nowCovered.plan.tasks.find((t) => t.topicId === 't2');
    expect(t2Before?.taskType).toBe('coverage');
    // t2 now has 1 attempted question (< MIN_PYQ_ATTEMPTS_FOR_SIGNAL) and is covered -> needs_practice, not coverage.
    expect(t2After?.taskType).toBe('pyq_practice');
  });
});

describe('generateStudyPlan — no NaN/Infinity/negative values anywhere in the output', () => {
  it('capacity, capacityReport and every task have finite, non-negative numbers', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: mixedCompleted, pyqPerf: mixedPerf });
    if (!result.ok) throw new Error('expected ok plan');
    const { capacity, capacityReport, tasks } = result.plan;
    for (const n of [capacity.totalAvailableMinutes, capacity.plannableMinutes, capacity.minutesPerStudyDay]) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
    for (const n of [capacityReport.availableMinutes, capacityReport.requiredMinutes, capacityReport.deficitMinutes]) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
    for (const t of tasks) {
      expect(Number.isFinite(t.estimatedMinutes)).toBe(true);
      expect(t.estimatedMinutes).toBeGreaterThan(0);
      expect(Number.isFinite(t.priority)).toBe(true);
    }
  });

  it('handles a brand-new user (no progress, no PYQ activity) without NaN', () => {
    const result = generateStudyPlan({ config: validConfig(), syllabus, completedTopics: {}, pyqPerf: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isFinite(result.plan.capacityReport.requiredMinutes)).toBe(true);
    expect(result.plan.coverageSummary.needsCoverage).toBe(syllabus.reduce((sum, s) => sum + s.topics.length, 0));
  });
});

// --- Real syllabus/PYQ_BANK data ---------------------------------------------
describe('generateStudyPlan — real APFC syllabus data', () => {
  it('runs successfully end-to-end against the real syllabus and PYQ bank', () => {
    const realIds = PYQ_BANK.slice(0, 10).map((p) => p.id);
    const realAttempt = attempt({
      questionIds: realIds,
      answers: Object.fromEntries(realIds.map((id, i) => [id, i % 2 === 0 ? PYQ_BANK.find((p) => p.id === id)!.correctOptionId : null])),
      correctCount: Math.ceil(realIds.length / 2),
      unansweredCount: Math.floor(realIds.length / 2),
    });
    const realPerf = computePyqPerformance(PYQ_BANK, [realAttempt]);
    const result = generateStudyPlan({
      config: validConfig({ startDate: '2026-01-01', targetDate: '2026-12-20' }),
      syllabus: SYLLABUS,
      completedTopics: {},
      pyqPerf: realPerf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.coverageSummary.totalTopics).toBe(getAllTopicsCount());
    expect(result.plan.tasks.length).toBeGreaterThan(0);
  });
});
