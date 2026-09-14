import { describe, it, expect } from 'vitest';
import type { PYQ, Question } from './types';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { pyqToCatalogQuestion, questionToCatalogQuestion, buildQuestionCatalog, isAuthenticPyq } from './questionCatalog';
import { startSession, selectAnswer, computeSessionResults, type QuestionSessionScoring } from './questionSessionEngine';

function pyq(overrides: Partial<PYQ> = {}): PYQ {
  return {
    id: 'pyq-1',
    year: 2023,
    subject: 'polity',
    topicId: 'unknown-topic-id',
    question: 'Sample PYQ question?',
    options: [
      { id: 'pyq-1-o0', text: 'Option A' },
      { id: 'pyq-1-o1', text: 'Option B' },
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
    subject: 'english',
    topic: 'Grammar',
    tag: 'Practice',
    difficulty: 'Medium',
    question: 'Sample practice question?',
    options: [
      { id: 'q-1-o0', text: 'Right' },
      { id: 'q-1-o1', text: 'Wrong' },
    ],
    correctOptionId: 'q-1-o0',
    explanation: 'Because Right.',
    ...overrides,
  };
}

describe('pyqToCatalogQuestion', () => {
  it('maps a PYQ into the catalog shape with pyq provenance', () => {
    const q = pyq();
    const entry = pyqToCatalogQuestion(q);
    expect(entry).toEqual({
      id: 'pyq-1',
      subject: 'polity',
      topicLabel: 'unknown-topic-id', // falls back to the raw topicId when not in TOPIC_TITLES
      question: 'Sample PYQ question?',
      options: q.options,
      correctOptionId: 'pyq-1-o0',
      explanation: 'Because A.',
      provenance: { kind: 'pyq', year: 2023, verificationStatus: 'cross_verified', verificationNote: undefined, source: undefined },
    });
  });

  it('resolves topicLabel to the real syllabus topic title when the topicId exists', () => {
    const realTopic = SYLLABUS[0].topics[0];
    const entry = pyqToCatalogQuestion(pyq({ topicId: realTopic.id }));
    expect(entry.topicLabel).toBe(realTopic.title);
  });

  it('never mutates the input PYQ', () => {
    const q = pyq();
    const snapshot = JSON.stringify(q);
    pyqToCatalogQuestion(q);
    expect(JSON.stringify(q)).toBe(snapshot);
  });

  it('never carries a difficulty — PYQ never had one', () => {
    expect(pyqToCatalogQuestion(pyq()).difficulty).toBeUndefined();
  });
});

describe('questionToCatalogQuestion', () => {
  it('maps a practice-bank Question into the catalog shape with practice_bank provenance', () => {
    const q = question({ tag: 'PYQ-Style' });
    const entry = questionToCatalogQuestion(q);
    expect(entry).toEqual({
      id: 'q-1',
      subject: 'english',
      topicLabel: 'Grammar',
      question: 'Sample practice question?',
      options: q.options,
      correctOptionId: 'q-1-o0',
      explanation: 'Because Right.',
      difficulty: 'Medium',
      provenance: { kind: 'practice_bank', tag: 'PYQ-Style' },
    });
  });

  it('carries difficulty through, unlike a PYQ entry which never has one', () => {
    expect(questionToCatalogQuestion(question({ difficulty: 'Hard' })).difficulty).toBe('Hard');
  });

  it('carries the Practice tag through as-is', () => {
    expect(questionToCatalogQuestion(question({ tag: 'Practice' })).provenance).toEqual({ kind: 'practice_bank', tag: 'Practice' });
  });

  it('never mutates the input Question', () => {
    const q = question();
    const snapshot = JSON.stringify(q);
    questionToCatalogQuestion(q);
    expect(JSON.stringify(q)).toBe(snapshot);
  });
});

describe('buildQuestionCatalog', () => {
  it('concatenates every PYQ followed by every practice-bank question', () => {
    const pyqs = [pyq({ id: 'pyq-1' }), pyq({ id: 'pyq-2' })];
    const questions = [question({ id: 'q-1' })];
    const catalog = buildQuestionCatalog(pyqs, questions);
    expect(catalog.map((e) => e.id)).toEqual(['pyq-1', 'pyq-2', 'q-1']);
    expect(catalog[0].provenance.kind).toBe('pyq');
    expect(catalog[1].provenance.kind).toBe('pyq');
    expect(catalog[2].provenance.kind).toBe('practice_bank');
  });

  it('does not mutate either source array', () => {
    const pyqs = [pyq()];
    const questions = [question()];
    const pyqSnapshot = JSON.stringify(pyqs);
    const questionSnapshot = JSON.stringify(questions);
    buildQuestionCatalog(pyqs, questions);
    expect(JSON.stringify(pyqs)).toBe(pyqSnapshot);
    expect(JSON.stringify(questions)).toBe(questionSnapshot);
  });

  it('returns an empty catalog for two empty sources', () => {
    expect(buildQuestionCatalog([], [])).toEqual([]);
  });
});

describe('isAuthenticPyq', () => {
  it('is true for a pyq-provenance entry and false for a practice_bank one', () => {
    const catalog = buildQuestionCatalog([pyq()], [question()]);
    expect(isAuthenticPyq(catalog[0])).toBe(true);
    expect(isAuthenticPyq(catalog[1])).toBe(false);
  });
});

describe('catalog compatibility with the shared question-session engine', () => {
  it('drives a full session over a mixed PYQ + practice-bank catalog with no adaptation needed', () => {
    const catalog = buildQuestionCatalog([pyq({ id: 'pyq-1' })], [question({ id: 'q-1' })]);
    const scoring: QuestionSessionScoring<(typeof catalog)[number]> = {
      marksCorrect: 2.5,
      marksWrong: -0.833333,
      statusOf: (entry, answers) => {
        const ans = answers[entry.id];
        if (!ans) return 'unanswered';
        return ans === entry.correctOptionId ? 'correct' : 'wrong';
      },
    };
    let state = startSession(catalog);
    state = selectAnswer(state, 'pyq-1', 'pyq-1-o0'); // correct
    state = selectAnswer(state, 'q-1', 'q-1-o1'); // wrong
    const results = computeSessionResults(state, scoring);
    expect(results).toEqual({ total: 2, attempted: 2, correct: 1, wrong: 1, unanswered: 0, score: 2.5 - 0.833333, accuracy: 50 });
  });
});

describe('catalog-to-Mock-Test selection boundary (real data)', () => {
  // Mock Test (MockTestRunner.tsx, Stage 5B) sources questions by mapping
  // pickQuestionsForBlueprint's Question[] output through questionToCatalogQuestion directly —
  // never by building the full catalog and filtering. This proves that path is equivalent to "the
  // practice-bank half of the full catalog", so the 131-question mock pool provably cannot gain a
  // PYQ regardless of which of the two equivalent routes is taken.
  it('the practice-bank subset of the full real catalog is exactly QUESTION_BANK, in order, with no PYQs mixed in', () => {
    const fullCatalog = buildQuestionCatalog(PYQ_BANK, QUESTION_BANK);
    const practiceOnly = fullCatalog.filter((entry) => !isAuthenticPyq(entry));

    expect(practiceOnly).toHaveLength(QUESTION_BANK.length);
    expect(practiceOnly.map((e) => e.id)).toEqual(QUESTION_BANK.map((q) => q.id));
    expect(practiceOnly.every((e) => e.provenance.kind === 'practice_bank')).toBe(true);
    expect(practiceOnly).toEqual(QUESTION_BANK.map(questionToCatalogQuestion));
  });

  it('mapping QUESTION_BANK directly through questionToCatalogQuestion (what MockTestRunner.tsx actually does) never produces a pyq-provenance entry', () => {
    const mockPool = QUESTION_BANK.map(questionToCatalogQuestion);
    expect(mockPool.some(isAuthenticPyq)).toBe(false);
    expect(mockPool).toHaveLength(131);
  });
});
