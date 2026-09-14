import { describe, it, expect } from 'vitest';
import {
  computeUnifiedTopicStatus,
  sortByAttentionPriority,
  MIN_PYQ_ATTEMPTS_FOR_SIGNAL,
  WEAK_PYQ_ACCURACY_THRESHOLD,
} from './topicStatus';
import { computePyqPerformance } from './pyqPerformance';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import type { SyllabusSubject, PYQ, PYQAttempt } from './types';

// Synthetic fixture syllabus/bank — independent of the real data, so these tests exercise the
// classification logic itself rather than being fragile to the real dataset's shape.
const syllabus: SyllabusSubject[] = [
  {
    id: 'subj-a',
    title: 'Subject A',
    shortTitle: 'A',
    colorKey: 'english',
    weightageHint: '',
    topics: [
      { id: 't1', title: 'Topic One' },
      { id: 't2', title: 'Topic Two' },
      { id: 't3', title: 'Topic Three' },
    ],
  },
  {
    id: 'subj-b',
    title: 'Subject B',
    shortTitle: 'B',
    colorKey: 'polity',
    weightageHint: '',
    topics: [{ id: 't4', title: 'Topic Four' }],
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
    submittedAt: new Date().toISOString(),
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

// t1: 5 questions, t2: 5 questions, t3/t4: no bank questions at all (topic exists but was never
// part of any PYQ practice set — must still resolve safely, never invented).
const bank: PYQ[] = [
  ...Array.from({ length: 5 }, (_, i) => pyq(`t1-q${i}`, 't1')),
  ...Array.from({ length: 5 }, (_, i) => pyq(`t2-q${i}`, 't2')),
];

describe('computeUnifiedTopicStatus — new user / no data', () => {
  it('every topic is not_started when nothing is covered and there are no PYQ attempts', () => {
    const statuses = computeUnifiedTopicStatus(syllabus, {}, null);
    expect(statuses).toHaveLength(4);
    for (const s of statuses) {
      expect(s.status).toBe('not_started');
      expect(s.pyqAccuracy).toBeNull();
      expect(s.pyqAttempted).toBe(0);
    }
  });
});

describe('computeUnifiedTopicStatus — no PYQ attempts at all (pyqPerf null)', () => {
  it('falls back to syllabus coverage alone: covered -> needs_practice, uncovered -> not_started', () => {
    const statuses = computeUnifiedTopicStatus(syllabus, { t1: true, t2: false }, null);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    const t2 = statuses.find((s) => s.topicId === 't2')!;
    expect(t1.status).toBe('needs_practice');
    expect(t2.status).toBe('not_started');
  });
});

describe('computeUnifiedTopicStatus — low coverage -> needs_coverage / not_started', () => {
  it('an uncovered topic with PYQ activity is needs_coverage, not not_started', () => {
    const a = attempt({ questionIds: ['t1-q0'], answers: { 't1-q0': 't1-q0-o0' }, correctCount: 1 });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, {}, perf); // t1 never marked covered
    expect(statuses.find((s) => s.topicId === 't1')!.status).toBe('needs_coverage');
  });

  it('low coverage + insufficient PYQ attempts is still needs_coverage (coverage gap dominates)', () => {
    const a = attempt({ questionIds: ['t1-q0'], answers: { 't1-q0': 't1-q0-o0' }, correctCount: 1 });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, {}, perf);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    expect(t1.pyqAttempted).toBe(1); // below MIN_PYQ_ATTEMPTS_FOR_SIGNAL
    expect(t1.status).toBe('needs_coverage');
  });
});

describe('computeUnifiedTopicStatus — high coverage + weak PYQ accuracy -> needs_revision', () => {
  it('flags a covered topic with enough attempts but low accuracy', () => {
    // t1: 3 attempted (meets threshold), 1 correct / 2 wrong -> 33.3% accuracy, below 60%.
    const a = attempt({
      questionIds: ['t1-q0', 't1-q1', 't1-q2'],
      answers: { 't1-q0': 't1-q0-o0', 't1-q1': 't1-q1-o1', 't1-q2': 't1-q2-o1' },
      correctCount: 1,
      wrongCount: 2,
    });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, { t1: true }, perf);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    expect(t1.pyqAttempted).toBe(3);
    expect(t1.pyqAccuracy).toBeLessThan(WEAK_PYQ_ACCURACY_THRESHOLD);
    expect(t1.status).toBe('needs_revision');
  });
});

describe('computeUnifiedTopicStatus — high coverage + strong PYQ accuracy -> strong', () => {
  it('marks a covered, well-performing topic as strong', () => {
    const a = attempt({
      questionIds: ['t1-q0', 't1-q1', 't1-q2'],
      answers: { 't1-q0': 't1-q0-o0', 't1-q1': 't1-q1-o0', 't1-q2': 't1-q2-o0' },
      correctCount: 3,
    });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, { t1: true }, perf);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    expect(t1.pyqAccuracy).toBe(100);
    expect(t1.status).toBe('strong');
  });
});

describe('computeUnifiedTopicStatus — minimum PYQ-attempt threshold behavior', () => {
  it('exactly at the threshold, accuracy is judged (not "needs_practice")', () => {
    const ids = Array.from({ length: MIN_PYQ_ATTEMPTS_FOR_SIGNAL }, (_, i) => `t1-q${i}`);
    const answers = Object.fromEntries(ids.map((id) => [id, `${id}-o0`])); // all correct
    const a = attempt({ questionIds: ids, answers, correctCount: ids.length });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, { t1: true }, perf);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    expect(t1.pyqAttempted).toBe(MIN_PYQ_ATTEMPTS_FOR_SIGNAL);
    expect(t1.status).toBe('strong'); // 100% accuracy, at threshold
  });

  it('one below the threshold is needs_practice regardless of accuracy (even a perfect score)', () => {
    const ids = Array.from({ length: MIN_PYQ_ATTEMPTS_FOR_SIGNAL - 1 }, (_, i) => `t1-q${i}`);
    const answers = Object.fromEntries(ids.map((id) => [id, `${id}-o0`])); // all correct — would be "strong" if judged
    const a = attempt({ questionIds: ids, answers, correctCount: ids.length });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, { t1: true }, perf);
    const t1 = statuses.find((s) => s.topicId === 't1')!;
    expect(t1.status).toBe('needs_practice');
  });
});

describe('computeUnifiedTopicStatus — zero/edge values', () => {
  it('never produces NaN or Infinity for pyqAccuracy', () => {
    const statuses = computeUnifiedTopicStatus(syllabus, {}, null);
    for (const s of statuses) {
      if (s.pyqAccuracy !== null) {
        expect(Number.isFinite(s.pyqAccuracy)).toBe(true);
      }
    }
  });

  it('a topic that never appears in any PYQ attempt resolves to 0 attempted / null accuracy, not an error', () => {
    const a = attempt({ questionIds: ['t1-q0'], answers: { 't1-q0': 't1-q0-o0' }, correctCount: 1 });
    const perf = computePyqPerformance(bank, [a]);
    const statuses = computeUnifiedTopicStatus(syllabus, {}, perf);
    const t3 = statuses.find((s) => s.topicId === 't3')!; // t3 has zero PYQ_BANK questions at all
    expect(t3.pyqAttempted).toBe(0);
    expect(t3.pyqAccuracy).toBeNull();
    expect(t3.status).toBe('not_started');
  });

  it('accuracy right at the weak/strong boundary is strong (>=), just below is needs_revision', () => {
    // 3 correct / 2 wrong = 60% exactly.
    const atBoundary = attempt({
      questionIds: ['t1-q0', 't1-q1', 't1-q2', 't1-q3', 't1-q4'],
      answers: {
        't1-q0': 't1-q0-o0',
        't1-q1': 't1-q1-o0',
        't1-q2': 't1-q2-o0',
        't1-q3': 't1-q3-o1',
        't1-q4': 't1-q4-o1',
      },
      correctCount: 3,
      wrongCount: 2,
    });
    const perfAt = computePyqPerformance(bank, [atBoundary]);
    const t1At = computeUnifiedTopicStatus(syllabus, { t1: true }, perfAt).find((s) => s.topicId === 't1')!;
    expect(t1At.pyqAccuracy).toBe(60);
    expect(t1At.status).toBe('strong');
  });
});

describe('computeUnifiedTopicStatus — determinism', () => {
  it('produces identical output across repeated calls with the same inputs', () => {
    const a = attempt({ questionIds: ['t1-q0', 't1-q1', 't1-q2'], answers: { 't1-q0': 't1-q0-o0', 't1-q1': 't1-q1-o1', 't1-q2': 't1-q2-o0' }, correctCount: 2, wrongCount: 1 });
    const perf = computePyqPerformance(bank, [a]);
    const completed = { t1: true, t4: true };
    const first = computeUnifiedTopicStatus(syllabus, completed, perf);
    const second = computeUnifiedTopicStatus(syllabus, completed, perf);
    expect(first).toEqual(second);
  });
});

describe('sortByAttentionPriority', () => {
  it('orders needs_revision before needs_coverage before not_started before needs_practice before strong', () => {
    const statuses = computeUnifiedTopicStatus(
      syllabus,
      { t1: true, t4: true },
      computePyqPerformance(bank, [
        attempt({ questionIds: ['t1-q0', 't1-q1', 't1-q2'], answers: { 't1-q0': 't1-q0-o1', 't1-q1': 't1-q1-o1', 't1-q2': 't1-q2-o0' }, correctCount: 1, wrongCount: 2 }), // t1: needs_revision
        attempt({ questionIds: ['t2-q0'], answers: { 't2-q0': 't2-q0-o0' }, correctCount: 1 }), // t2: uncovered + attempted -> needs_coverage
      ]),
    );
    // t3: uncovered, no attempts -> not_started. t4: covered, 0 attempts -> needs_practice.
    const sorted = sortByAttentionPriority(statuses);
    const order = sorted.map((s) => s.topicId);
    expect(order.indexOf('t1')).toBeLessThan(order.indexOf('t2')); // needs_revision before needs_coverage
    expect(order.indexOf('t2')).toBeLessThan(order.indexOf('t3')); // needs_coverage before not_started
    expect(order.indexOf('t3')).toBeLessThan(order.indexOf('t4')); // not_started before needs_practice
  });
});

describe('computeUnifiedTopicStatus — real syllabus/PYQ_BANK data', () => {
  it('resolves every real syllabus topic exactly once, using real PYQ ids', () => {
    const realIds = PYQ_BANK.slice(0, 3).map((p) => p.id);
    const a = attempt({
      questionIds: realIds,
      answers: Object.fromEntries(realIds.map((id, i) => [id, i === 0 ? PYQ_BANK[i].correctOptionId : null])),
      correctCount: 1,
      unansweredCount: realIds.length - 1,
    });
    const perf = computePyqPerformance(PYQ_BANK, [a]);
    const statuses = computeUnifiedTopicStatus(SYLLABUS, {}, perf);
    expect(statuses).toHaveLength(getAllTopicsCount());
    // The topic behind the one correctly-answered real question must resolve to a real status.
    const touchedTopicId = PYQ_BANK[0].topicId;
    const touched = statuses.find((s) => s.topicId === touchedTopicId)!;
    expect(touched).toBeDefined();
    expect(touched.pyqAttempted).toBeGreaterThan(0);
    expect(touched.status).toBe('needs_coverage'); // attempted but never marked covered
  });
});
