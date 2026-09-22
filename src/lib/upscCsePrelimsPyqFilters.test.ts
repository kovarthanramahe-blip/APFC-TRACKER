import { describe, it, expect } from 'vitest';
import {
  UNCLASSIFIED_SUBJECT,
  UNMAPPED_MICROSYLLABUS,
  questionSubject,
  questionMicrosyllabusId,
  getAvailableYears,
  getYearCounts,
  formatYearLabel,
  getAvailablePapers,
  yearPool,
  paperPool,
  getSubjectCounts,
  subjectPool,
  getMicrosyllabusCounts,
  computeRevisionStatusMap,
  revisionStatusOf,
  filterUpscCsePrelimsPyqs,
  computeEligibleRevisionIds,
} from './upscCsePrelimsPyqFilters';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';

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
    microsyllabusId: 'prelims-gs1-history-ancient',
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

const BANK: UpscCsePrelimsBatchPyq[] = [
  q({ id: 'q1', questionNumber: 1, subject: 'History', microsyllabusId: 'm-hist' }),
  q({ id: 'q2', questionNumber: 2, subject: 'History', microsyllabusId: 'm-hist' }),
  q({ id: 'q3', questionNumber: 3, subject: 'Geography', microsyllabusId: undefined, mappingStatus: 'needs_review', topic: 'World Geography' }),
  q({ id: 'q4', questionNumber: 4, subject: undefined, microsyllabusId: undefined, mappingStatus: 'needs_review', topic: undefined, year: 2026, paper: 'GS Paper I' }),
];

describe('questionSubject / questionMicrosyllabusId — sentinel buckets, never rewriting the record', () => {
  it('returns the real subject when present', () => {
    expect(questionSubject(BANK[0])).toBe('History');
  });

  it('returns UNCLASSIFIED_SUBJECT when subject is absent, without mutating the record', () => {
    expect(questionSubject(BANK[3])).toBe(UNCLASSIFIED_SUBJECT);
    expect(BANK[3].subject).toBeUndefined();
  });

  it('returns the real microsyllabusId when mapped', () => {
    expect(questionMicrosyllabusId(BANK[0])).toBe('m-hist');
  });

  it('returns UNMAPPED_MICROSYLLABUS when needs_review, without mutating the record', () => {
    expect(questionMicrosyllabusId(BANK[2])).toBe(UNMAPPED_MICROSYLLABUS);
    expect(BANK[2].microsyllabusId).toBeUndefined();
  });
});

describe('year/paper helpers', () => {
  it('getAvailableYears/getYearCounts are derived purely from the bank', () => {
    expect(getAvailableYears(BANK)).toEqual([2026]);
    expect(getYearCounts(BANK)).toEqual({ 2026: 4 });
  });

  it('formatYearLabel', () => {
    expect(formatYearLabel('all')).toBe('All Years');
    expect(formatYearLabel(2026)).toBe('2026');
  });

  it('getAvailablePapers', () => {
    expect(getAvailablePapers(BANK)).toEqual(['GS Paper I']);
  });

  it('yearPool / paperPool', () => {
    expect(yearPool(BANK, 'all')).toHaveLength(4);
    expect(yearPool(BANK, 2026)).toHaveLength(4);
    expect(yearPool(BANK, 2025)).toHaveLength(0);
    expect(paperPool(BANK, 2026, 'GS Paper I')).toHaveLength(4);
    expect(paperPool(BANK, 2026, 'Essay')).toHaveLength(0);
  });
});

describe('subject/microsyllabus counting', () => {
  it('getSubjectCounts includes the UNCLASSIFIED_SUBJECT bucket', () => {
    expect(getSubjectCounts(BANK, 'all', 'all')).toEqual({ History: 2, Geography: 1, [UNCLASSIFIED_SUBJECT]: 1 });
  });

  it('subjectPool filters by subject, including the unclassified bucket', () => {
    expect(subjectPool(BANK, 'all', 'all', 'History')).toHaveLength(2);
    expect(subjectPool(BANK, 'all', 'all', UNCLASSIFIED_SUBJECT)).toHaveLength(1);
    expect(subjectPool(BANK, 'all', 'all', 'all')).toHaveLength(4);
  });

  it('getMicrosyllabusCounts includes the UNMAPPED_MICROSYLLABUS bucket', () => {
    const counts = getMicrosyllabusCounts(BANK, 'all', 'all', 'all');
    const map = Object.fromEntries(counts.map((c) => [c.id, c.count]));
    expect(map['m-hist']).toBe(2);
    expect(map[UNMAPPED_MICROSYLLABUS]).toBe(2);
  });
});

describe('computeRevisionStatusMap / revisionStatusOf', () => {
  it('an id with no attempts is unattempted', () => {
    const map = computeRevisionStatusMap(BANK, []);
    expect(revisionStatusOf(map, 'q1')).toBe('unattempted');
  });

  it('a correct/incorrect answer is classified from the bank\'s own correctOptionId', () => {
    const attempts: UpscCsePrelimsPyqAttempt[] = [
      {
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
      },
    ];
    const map = computeRevisionStatusMap(BANK, attempts);
    expect(revisionStatusOf(map, 'q1')).toBe('correct'); // q1's correctOptionId is 'a'
    expect(revisionStatusOf(map, 'q2')).toBe('incorrect'); // q2's correctOptionId is 'a', answered 'b'
  });

  it('the MOST RECENT attempt touching a question wins', () => {
    const older: UpscCsePrelimsPyqAttempt = {
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
    };
    const newer: UpscCsePrelimsPyqAttempt = { ...older, id: 'a2', submittedAt: '2026-02-01T00:00:00.000Z', answers: { q1: 'b' } };
    const map = computeRevisionStatusMap(BANK, [older, newer]);
    expect(revisionStatusOf(map, 'q1')).toBe('incorrect');
  });

  it('a null/skipped answer in an attempt is unattempted, not incorrect', () => {
    const attempt: UpscCsePrelimsPyqAttempt = {
      id: 'a1',
      submittedAt: '2026-01-01T00:00:00.000Z',
      year: 2026,
      paper: 'GS Paper I',
      subject: 'all',
      microsyllabusId: 'all',
      questionIds: ['q1'],
      answers: { q1: null },
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 1,
      accuracy: 0,
    };
    const map = computeRevisionStatusMap(BANK, [attempt]);
    expect(revisionStatusOf(map, 'q1')).toBe('unattempted');
  });
});

describe('filterUpscCsePrelimsPyqs', () => {
  const emptyMap = new Map<string, 'correct' | 'incorrect' | 'unattempted'>();

  it('with all filters "all", returns the whole bank', () => {
    const result = filterUpscCsePrelimsPyqs(BANK, {
      year: 'all',
      paper: 'all',
      subject: 'all',
      microsyllabusId: 'all',
      revisionFilter: 'all',
      revisionStatusMap: emptyMap,
    });
    expect(result).toHaveLength(4);
  });

  it('filters by subject, including the UNCLASSIFIED_SUBJECT bucket', () => {
    const result = filterUpscCsePrelimsPyqs(BANK, {
      year: 'all',
      paper: 'all',
      subject: UNCLASSIFIED_SUBJECT,
      microsyllabusId: 'all',
      revisionFilter: 'all',
      revisionStatusMap: emptyMap,
    });
    expect(result.map((r) => r.id)).toEqual(['q4']);
  });

  it('filters by microsyllabusId, including the UNMAPPED_MICROSYLLABUS bucket', () => {
    const result = filterUpscCsePrelimsPyqs(BANK, {
      year: 'all',
      paper: 'all',
      subject: 'all',
      microsyllabusId: UNMAPPED_MICROSYLLABUS,
      revisionFilter: 'all',
      revisionStatusMap: emptyMap,
    });
    expect(result.map((r) => r.id).sort()).toEqual(['q3', 'q4']);
  });

  it('filters by revisionFilter', () => {
    const map = new Map([['q1', 'incorrect' as const]]);
    const result = filterUpscCsePrelimsPyqs(BANK, {
      year: 'all',
      paper: 'all',
      subject: 'all',
      microsyllabusId: 'all',
      revisionFilter: 'incorrect',
      revisionStatusMap: map,
    });
    expect(result.map((r) => r.id)).toEqual(['q1']);
  });
});

describe('computeEligibleRevisionIds', () => {
  it('includes incorrect ids and bookmarked ids, deduplicated', () => {
    const map = new Map([
      ['q1', 'incorrect' as const],
      ['q2', 'correct' as const],
    ]);
    const eligible = computeEligibleRevisionIds(BANK, map, ['q1', 'q3']);
    expect(eligible.sort()).toEqual(['q1', 'q3']);
  });

  it('an empty revision map and no bookmarks yields no eligible ids', () => {
    expect(computeEligibleRevisionIds(BANK, new Map(), [])).toEqual([]);
  });
});
