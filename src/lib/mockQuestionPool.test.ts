import { describe, it, expect } from 'vitest';
import type { MockTestBlueprint, PYQ, Question } from './types';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { GENERATED_QUESTION_BANK } from '../data/generatedQuestionBank';
import { MOCK_TEST_BLUEPRINTS } from '../data/mockTests';
import { buildQuestionCatalog, pyqToCatalogQuestion, questionToCatalogQuestion } from './questionCatalog';
import type { GeneratedQuestionDraft } from './types';
import { selectMockQuestionPool, DEFAULT_MOCK_PROVENANCE_POLICY, APPROVED_GENERATED_INCLUSIVE_POLICY } from './mockQuestionPool';
import { generatedQuestionToCatalogQuestion } from './questionCatalog';

function generatedDraft(overrides: Partial<GeneratedQuestionDraft> = {}): GeneratedQuestionDraft {
  return {
    id: 'gen-1',
    subject: 'polity',
    topicId: 't-1',
    question: 'A generated question?',
    options: [
      { id: 'gen-1-o0', text: 'A' },
      { id: 'gen-1-o1', text: 'B' },
    ],
    correctOptionId: 'gen-1-o0',
    explanation: 'Because A.',
    provenance: {
      kind: 'generated',
      sourceAuthority: 'Source Authority',
      sourceTitle: 'Source Title',
      sourceReference: 'Source Reference',
      topicId: 't-1',
      verificationStatus: 'verified',
      generatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function pyq(overrides: Partial<PYQ> = {}): PYQ {
  return {
    id: 'pyq-1',
    year: 2023,
    subject: 'polity',
    topicId: 't-1',
    question: 'A PYQ question?',
    options: [
      { id: 'pyq-1-o0', text: 'A' },
      { id: 'pyq-1-o1', text: 'B' },
    ],
    correctOptionId: 'pyq-1-o0',
    explanation: 'Because A.',
    verificationStatus: 'cross_verified',
    ...overrides,
  };
}

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    subject: 'polity',
    topic: 'Polity Basics',
    tag: 'Practice',
    difficulty: 'Medium',
    question: 'A practice question?',
    options: [
      { id: 'q-1-o0', text: 'A' },
      { id: 'q-1-o1', text: 'B' },
    ],
    correctOptionId: 'q-1-o0',
    explanation: 'Because A.',
    ...overrides,
  };
}

function blueprint(overrides: Partial<MockTestBlueprint> = {}): MockTestBlueprint {
  return {
    id: 'test-blueprint',
    title: 'Test Blueprint',
    description: '',
    durationMinutes: 10,
    subjects: 'all',
    questionCount: 100,
    marksPerCorrect: 2.5,
    negativeMarkFraction: 1 / 3,
    ...overrides,
  };
}

describe('1. existing mock selection returns exactly the same 131 practice-bank questions', () => {
  it('the full-length blueprint over the full real catalog reproduces exactly QUESTION_BANK, ids matching regardless of shuffled order', () => {
    const catalog = buildQuestionCatalog(PYQ_BANK, QUESTION_BANK);
    const fullLength = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'full-length')!;
    const pool = selectMockQuestionPool(catalog, fullLength);

    expect(pool).toHaveLength(131);
    expect(pool).toHaveLength(QUESTION_BANK.length);
    expect([...pool.map((e) => e.id)].sort()).toEqual([...QUESTION_BANK.map((q) => q.id)].sort());
    expect(pool.every((e) => e.provenance.kind === 'practice_bank')).toBe(true);
  });

  it('every real blueprint (full-length, quick sets, subject tests) draws its pool entirely from QUESTION_BANK ids', () => {
    const catalog = buildQuestionCatalog(PYQ_BANK, QUESTION_BANK);
    const questionBankIds = new Set(QUESTION_BANK.map((q) => q.id));
    for (const bp of MOCK_TEST_BLUEPRINTS) {
      const pool = selectMockQuestionPool(catalog, bp);
      expect(pool.every((e) => questionBankIds.has(e.id))).toBe(true);
      expect(pool.length).toBe(Math.min(bp.questionCount, bp.subjects === 'all' ? QUESTION_BANK.length : QUESTION_BANK.filter((q) => (bp.subjects as string[]).includes(q.subject)).length));
    }
  });

  it('DEFAULT_MOCK_PROVENANCE_POLICY is practice_bank only', () => {
    expect(DEFAULT_MOCK_PROVENANCE_POLICY).toEqual(['practice_bank']);
  });
});

describe('2. PYQs cannot enter the existing default mock pool accidentally', () => {
  it('excludes every PYQ from the default-policy pool even when PYQs dominate the catalog', () => {
    const manyPyqs = Array.from({ length: 20 }, (_, i) => pyq({ id: `pyq-${i}`, subject: 'polity' }));
    const fewQuestions = [question({ id: 'q-1', subject: 'polity' }), question({ id: 'q-2', subject: 'polity' })];
    const catalog = buildQuestionCatalog(manyPyqs, fewQuestions);

    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 100 }));
    expect(pool).toHaveLength(2);
    expect(pool.every((e) => e.provenance.kind === 'practice_bank')).toBe(true);
    expect(pool.some((e) => e.provenance.kind === 'pyq')).toBe(false);
  });

  it('excludes PYQs across every real blueprint, not just full-length', () => {
    const catalog = buildQuestionCatalog(PYQ_BANK, QUESTION_BANK);
    for (const bp of MOCK_TEST_BLUEPRINTS) {
      const pool = selectMockQuestionPool(catalog, bp);
      expect(pool.some((e) => e.provenance.kind === 'pyq')).toBe(false);
    }
  });

  it('does not mutate the input catalog', () => {
    const catalog = buildQuestionCatalog([pyq()], [question()]);
    const snapshot = JSON.stringify(catalog);
    selectMockQuestionPool(catalog, blueprint());
    expect(JSON.stringify(catalog)).toBe(snapshot);
  });
});

describe('3. a future mixed pool can be filtered by an explicit provenance policy without changing default behavior', () => {
  it('the default policy still yields only practice-bank entries from a mixed catalog', () => {
    const catalog = buildQuestionCatalog([pyq({ id: 'pyq-1' })], [question({ id: 'q-1' })]);
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }));
    expect(pool.map((e) => e.id)).toEqual(['q-1']);
  });

  it('an explicit ["pyq"] policy selects only PYQ entries from the same mixed catalog', () => {
    const catalog = buildQuestionCatalog([pyq({ id: 'pyq-1' })], [question({ id: 'q-1' })]);
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }), ['pyq']);
    expect(pool.map((e) => e.id)).toEqual(['pyq-1']);
  });

  it('an explicit ["pyq", "practice_bank"] policy selects entries of both kinds', () => {
    const catalog = buildQuestionCatalog([pyq({ id: 'pyq-1' })], [question({ id: 'q-1' })]);
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }), ['pyq', 'practice_bank']);
    expect([...pool.map((e) => e.id)].sort()).toEqual(['pyq-1', 'q-1']);
  });

  it('an explicit ["generated"] policy (no generated questions exist yet) yields an empty pool without erroring', () => {
    const catalog = buildQuestionCatalog([pyq()], [question()]);
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }), ['generated']);
    expect(pool).toEqual([]);
  });
});

describe('subject filtering and question-count capping (unchanged semantics)', () => {
  it('restricts to the blueprint subject when subjects is not "all"', () => {
    const catalog = buildQuestionCatalog(
      [pyq({ id: 'pyq-english', subject: 'english' })],
      [question({ id: 'q-english', subject: 'english' }), question({ id: 'q-polity', subject: 'polity' })],
    );
    const pool = selectMockQuestionPool(catalog, blueprint({ subjects: ['english'], questionCount: 10 }));
    expect(pool.map((e) => e.id)).toEqual(['q-english']);
  });

  it('caps at questionCount without padding when the pool is smaller', () => {
    const catalog = buildQuestionCatalog([], [question({ id: 'q-1' }), question({ id: 'q-2' })]);
    expect(selectMockQuestionPool(catalog, blueprint({ questionCount: 1 }))).toHaveLength(1);
    expect(selectMockQuestionPool(catalog, blueprint({ questionCount: 50 }))).toHaveLength(2);
  });
});

describe('4. APPROVED_GENERATED_INCLUSIVE_POLICY widens eligibility without touching the default', () => {
  it('is the default policy plus "generated", not a replacement for it', () => {
    expect(APPROVED_GENERATED_INCLUSIVE_POLICY).toEqual([...DEFAULT_MOCK_PROVENANCE_POLICY, 'generated']);
  });

  it('DEFAULT_MOCK_PROVENANCE_POLICY itself is unchanged (still practice_bank only)', () => {
    expect(DEFAULT_MOCK_PROVENANCE_POLICY).toEqual(['practice_bank']);
  });

  it('includes a generated-provenance entry alongside practice-bank entries when used explicitly', () => {
    const catalog = [...buildQuestionCatalog([], [question({ id: 'q-1' })]), generatedQuestionToCatalogQuestion(generatedDraft({ id: 'gen-1' }))];
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }), APPROVED_GENERATED_INCLUSIVE_POLICY);
    expect([...pool.map((e) => e.id)].sort()).toEqual(['gen-1', 'q-1']);
  });

  it('a generated-provenance entry is still excluded under the unchanged default policy', () => {
    const catalog = [...buildQuestionCatalog([], [question({ id: 'q-1' })]), generatedQuestionToCatalogQuestion(generatedDraft({ id: 'gen-1' }))];
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }));
    expect(pool.map((e) => e.id)).toEqual(['q-1']);
  });

  it('PYQs still stay excluded even under the generated-inclusive policy (it only adds "generated", not "pyq")', () => {
    const catalog = [
      ...buildQuestionCatalog([pyq({ id: 'pyq-1' })], [question({ id: 'q-1' })]),
      generatedQuestionToCatalogQuestion(generatedDraft({ id: 'gen-1' })),
    ];
    const pool = selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }), APPROVED_GENERATED_INCLUSIVE_POLICY);
    expect([...pool.map((e) => e.id)].sort()).toEqual(['gen-1', 'q-1']);
  });

  it('the real GENERATED_QUESTION_BANK-backed catalog currently yields no generated entries (bank is empty today)', () => {
    const catalog = buildQuestionCatalog(PYQ_BANK, QUESTION_BANK, GENERATED_QUESTION_BANK);
    for (const bp of MOCK_TEST_BLUEPRINTS) {
      const pool = selectMockQuestionPool(catalog, bp, APPROVED_GENERATED_INCLUSIVE_POLICY);
      expect(pool.some((e) => e.provenance.kind === 'generated')).toBe(false);
    }
  });
});

describe('equivalence with the original pickQuestionsForBlueprint mapping', () => {
  it('selecting from a practice-bank-only catalog matches mapping QUESTION_BANK through questionToCatalogQuestion directly', () => {
    const practiceOnlyCatalog = QUESTION_BANK.map(questionToCatalogQuestion);
    const fullLength = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'full-length')!;
    const pool = selectMockQuestionPool(practiceOnlyCatalog, fullLength);
    expect([...pool.map((e) => e.id)].sort()).toEqual([...QUESTION_BANK.map((q) => q.id)].sort());
  });

  it('a lone pyqToCatalogQuestion-mapped entry is excluded by the default policy', () => {
    const catalog = [pyqToCatalogQuestion(pyq())];
    expect(selectMockQuestionPool(catalog, blueprint({ questionCount: 10 }))).toEqual([]);
  });
});
