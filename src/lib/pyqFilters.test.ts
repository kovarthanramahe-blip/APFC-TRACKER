import { describe, it, expect } from 'vitest';
import {
  getAvailableYears,
  getYearCounts,
  formatYearLabel,
  yearPool,
  getSubjectCounts,
  subjectPool,
  getTopicCounts,
  computeRevisionStatusMap,
  revisionStatusOf,
  filterPYQs,
} from './pyqFilters';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import type { PYQ, PYQAttempt } from './types';

// ---------------------------------------------------------------------------
// Synthetic fixture bank — small, hand-built, and independent of PYQ_BANK, so
// these tests exercise the filtering/aggregation *logic* itself rather than
// relying on (or being fragile to) the real dataset's exact shape.
// ---------------------------------------------------------------------------
function pyq(id: string, year: number, subject: PYQ['subject'], topicId: string, correctOptionId = `${id}-o0`): PYQ {
  return {
    id,
    year,
    subject,
    topicId,
    question: `Question ${id}`,
    options: [
      { id: `${id}-o0`, text: 'Option A' },
      { id: `${id}-o1`, text: 'Option B' },
      { id: `${id}-o2`, text: 'Option C' },
      { id: `${id}-o3`, text: 'Option D' },
    ],
    correctOptionId,
    explanation: `Explanation for ${id}`,
    verificationStatus: 'cross_verified',
  };
}

const bank: PYQ[] = [
  pyq('q1', 2012, 'english', 'en-1'),
  pyq('q2', 2012, 'english', 'en-2'),
  pyq('q3', 2012, 'quant', 'qa-1'),
  pyq('q4', 2016, 'english', 'en-1'),
  pyq('q5', 2016, 'quant', 'qa-1'),
  pyq('q6', 2016, 'quant', 'qa-2'),
  pyq('q7', 2023, 'polity', 'po-1'),
];

function attempt(overrides: Partial<PYQAttempt> & { questionIds: string[]; answers: Record<string, string | null> }): PYQAttempt {
  return {
    id: overrides.id ?? `attempt-${Math.random()}`,
    submittedAt: overrides.submittedAt ?? new Date().toISOString(),
    year: overrides.year ?? 'all',
    subject: overrides.subject ?? 'all',
    topicId: overrides.topicId ?? 'all',
    questionIds: overrides.questionIds,
    answers: overrides.answers,
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    unansweredCount: overrides.unansweredCount ?? 0,
    score: overrides.score ?? 0,
    accuracy: overrides.accuracy ?? 0,
  };
}

describe('year filtering', () => {
  it('getAvailableYears returns the distinct years, sorted ascending', () => {
    expect(getAvailableYears(bank)).toEqual([2012, 2016, 2023]);
  });

  it('getYearCounts counts questions per year correctly', () => {
    expect(getYearCounts(bank)).toEqual({ 2012: 3, 2016: 3, 2023: 1 });
  });

  it('yearPool filters to only the matching year', () => {
    const pool = yearPool(bank, 2016);
    expect(pool.map((p) => p.id).sort()).toEqual(['q4', 'q5', 'q6']);
  });

  it('formatYearLabel formats a specific year as its number', () => {
    expect(formatYearLabel(2023)).toBe('2023');
  });
});

describe('"All Years"', () => {
  it('yearPool returns the entire bank when year is "all"', () => {
    expect(yearPool(bank, 'all')).toHaveLength(bank.length);
  });

  it('formatYearLabel renders "All Years" for the all-years selection', () => {
    expect(formatYearLabel('all')).toBe('All Years');
  });

  it('filterPYQs with year: "all" does not exclude any year', () => {
    const map = new Map();
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'all', revisionStatusMap: map });
    expect(result).toHaveLength(bank.length);
    expect(new Set(result.map((p) => p.year))).toEqual(new Set([2012, 2016, 2023]));
  });
});

describe('subject filtering', () => {
  it('getSubjectCounts counts per subject within a given year only', () => {
    expect(getSubjectCounts(bank, 2016)).toEqual({ english: 1, quant: 2 });
  });

  it('getSubjectCounts omits subjects with zero questions in that year (dynamic, not hardcoded)', () => {
    expect(getSubjectCounts(bank, 2023)).toEqual({ polity: 1 });
    expect(getSubjectCounts(bank, 2023).english).toBeUndefined();
  });

  it('getSubjectCounts across all years aggregates every subject', () => {
    expect(getSubjectCounts(bank, 'all')).toEqual({ english: 3, quant: 3, polity: 1 });
  });

  it('subjectPool filters by year + subject together', () => {
    const pool = subjectPool(bank, 2012, 'english');
    expect(pool.map((p) => p.id).sort()).toEqual(['q1', 'q2']);
  });
});

describe('topic filtering', () => {
  it('getTopicCounts counts per topic within the given year + subject pool', () => {
    const counts = getTopicCounts(bank, 2016, 'quant');
    expect(counts.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'qa-1', count: 1 },
      { id: 'qa-2', count: 1 },
    ]);
  });

  it('getTopicCounts only returns topics actually present for that scope (no hardcoded topic list)', () => {
    const counts = getTopicCounts(bank, 2023, 'polity');
    expect(counts).toEqual([{ id: 'po-1', count: 1 }]);
  });

  it('getTopicCounts respects subject: "all" by pooling every subject in that year', () => {
    const counts = getTopicCounts(bank, 2016, 'all');
    const total = counts.reduce((sum, t) => sum + t.count, 0);
    expect(total).toBe(3);
  });
});

describe('combined filtering (year + subject + topic)', () => {
  it('narrows to exactly the matching subset', () => {
    const map = new Map();
    const result = filterPYQs(bank, { year: 2016, subject: 'quant', topicId: 'qa-2', revisionFilter: 'all', revisionStatusMap: map });
    expect(result.map((p) => p.id)).toEqual(['q6']);
  });

  it('a combination matching nothing returns an empty array (empty-result case)', () => {
    const map = new Map();
    const result = filterPYQs(bank, { year: 2012, subject: 'polity', topicId: 'all', revisionFilter: 'all', revisionStatusMap: map });
    expect(result).toEqual([]);
  });

  it('an out-of-scope topicId for the given year/subject returns an empty array', () => {
    const map = new Map();
    // qa-1 exists only in 2016/2012, not under 2023/polity
    const result = filterPYQs(bank, { year: 2023, subject: 'polity', topicId: 'qa-1', revisionFilter: 'all', revisionStatusMap: map });
    expect(result).toEqual([]);
  });
});

describe('revision modes', () => {
  it('computeRevisionStatusMap marks a never-attempted question as unattempted (via default lookup)', () => {
    const map = computeRevisionStatusMap(bank, []);
    expect(revisionStatusOf(map, 'q1')).toBe('unattempted');
  });

  it('computeRevisionStatusMap marks a correctly-answered question as correct', () => {
    const attempts = [attempt({ questionIds: ['q1'], answers: { q1: 'q1-o0' } })]; // q1's correct option is q1-o0
    const map = computeRevisionStatusMap(bank, attempts);
    expect(revisionStatusOf(map, 'q1')).toBe('correct');
  });

  it('computeRevisionStatusMap marks a wrongly-answered question as incorrect', () => {
    const attempts = [attempt({ questionIds: ['q1'], answers: { q1: 'q1-o1' } })];
    const map = computeRevisionStatusMap(bank, attempts);
    expect(revisionStatusOf(map, 'q1')).toBe('incorrect');
  });

  it('computeRevisionStatusMap treats a skipped answer (null) as unattempted, not wrong', () => {
    const attempts = [attempt({ questionIds: ['q1'], answers: { q1: null } })];
    const map = computeRevisionStatusMap(bank, attempts);
    expect(revisionStatusOf(map, 'q1')).toBe('unattempted');
  });

  it('computeRevisionStatusMap uses only the MOST RECENT attempt touching a question', () => {
    const older = attempt({ submittedAt: '2024-01-01T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o1' } }); // wrong
    const newer = attempt({ submittedAt: '2024-06-01T00:00:00.000Z', questionIds: ['q1'], answers: { q1: 'q1-o0' } }); // correct
    const map = computeRevisionStatusMap(bank, [older, newer]);
    expect(revisionStatusOf(map, 'q1')).toBe('correct');
  });

  it('filterPYQs with revisionFilter "correct" returns only correctly-answered questions', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'q1-o0', q2: 'q2-o1' } })]; // q1 correct, q2 wrong
    const map = computeRevisionStatusMap(bank, attempts);
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'correct', revisionStatusMap: map });
    expect(result.map((p) => p.id)).toEqual(['q1']);
  });

  it('filterPYQs with revisionFilter "incorrect" returns only wrongly-answered questions', () => {
    const attempts = [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'q1-o0', q2: 'q2-o1' } })];
    const map = computeRevisionStatusMap(bank, attempts);
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'incorrect', revisionStatusMap: map });
    expect(result.map((p) => p.id)).toEqual(['q2']);
  });

  it('filterPYQs with revisionFilter "unattempted" excludes every question that has been attempted', () => {
    const attempts = [attempt({ questionIds: ['q1'], answers: { q1: 'q1-o0' } })];
    const map = computeRevisionStatusMap(bank, attempts);
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'unattempted', revisionStatusMap: map });
    expect(result.map((p) => p.id)).not.toContain('q1');
    expect(result).toHaveLength(bank.length - 1);
  });

  it('with zero attempts, revisionFilter "unattempted" matches the entire bank (empty-result baseline)', () => {
    const map = computeRevisionStatusMap(bank, []);
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'unattempted', revisionStatusMap: map });
    expect(result).toHaveLength(bank.length);
  });

  it('with zero attempts, revisionFilter "correct" matches nothing (empty-result case)', () => {
    const map = computeRevisionStatusMap(bank, []);
    const result = filterPYQs(bank, { year: 'all', subject: 'all', topicId: 'all', revisionFilter: 'correct', revisionStatusMap: map });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration smoke tests against the real, committed PYQ_BANK — guards
// against an accidental data edit changing the counts this whole feature is
// built to report, and against a topicId that no longer resolves in SYLLABUS.
// ---------------------------------------------------------------------------
describe('real PYQ_BANK data integrity', () => {
  it('totals exactly 458 questions across the four imported years', () => {
    expect(PYQ_BANK).toHaveLength(458);
  });

  it('matches the documented per-year counts (2012: 99, 2016: 119, 2023: 120, 2025: 120)', () => {
    expect(getYearCounts(PYQ_BANK)).toEqual({ 2012: 99, 2016: 119, 2023: 120, 2025: 120 });
  });

  it('getAvailableYears reflects exactly those four years, ascending, with nothing hardcoded', () => {
    expect(getAvailableYears(PYQ_BANK)).toEqual([2012, 2016, 2023, 2025]);
  });

  it('every question resolves to a real syllabus topic', () => {
    const validTopicIds = new Set(SYLLABUS.flatMap((s) => s.topics.map((t) => t.id)));
    const orphaned = PYQ_BANK.filter((p) => !validTopicIds.has(p.topicId));
    expect(orphaned).toEqual([]);
  });

  it('every question has exactly 4 options and a correctOptionId that matches one of them', () => {
    const bad = PYQ_BANK.filter((p) => p.options.length !== 4 || !p.options.some((o) => o.id === p.correctOptionId));
    expect(bad).toEqual([]);
  });

  it('subject + topic counts for a real year sum back to that year\'s total (no double-count/drop)', () => {
    const subjectSum = Object.values(getSubjectCounts(PYQ_BANK, 2025)).reduce((a, b) => a + (b ?? 0), 0);
    expect(subjectSum).toBe(120);
  });
});
