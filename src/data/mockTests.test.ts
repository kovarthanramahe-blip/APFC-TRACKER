import { describe, it, expect } from 'vitest';
import { MOCK_TEST_BLUEPRINTS, getBlueprint, shuffle, pickQuestionsForBlueprint } from './mockTests';
import { QUESTION_BANK } from './questionBank';
import { SYLLABUS } from './syllabus';

// Mock Test hardening pass — this file (blueprint definitions, question selection/shuffle) had no
// test coverage at all despite backing the entire feature (MockTests.tsx/MockTestRunner.tsx read
// MOCK_TEST_BLUEPRINTS and pickQuestionsForBlueprint/getBlueprint directly, or through
// lib/mockQuestionPool.ts's own already-tested selection policy). These tests protect the existing
// blueprint shape and selection behaviour as-is; they do not change any of it.

describe('MOCK_TEST_BLUEPRINTS — existing blueprint shape', () => {
  it('has exactly one general blueprint per general test (full-length, quick-40, quick-20) plus one subject test per syllabus subject', () => {
    const generalIds = ['full-length', 'quick-40', 'quick-20'];
    for (const id of generalIds) {
      expect(MOCK_TEST_BLUEPRINTS.find((b) => b.id === id)).toBeDefined();
    }
    const subjectBlueprints = MOCK_TEST_BLUEPRINTS.filter((b) => b.subjects !== 'all');
    expect(subjectBlueprints).toHaveLength(SYLLABUS.length);
    for (const subj of SYLLABUS) {
      expect(subjectBlueprints.some((b) => b.id === `subject-${subj.id}`)).toBe(true);
    }
  });

  it('every blueprint uses the same marking scheme: 2.5 marks correct, 1/3rd negative', () => {
    for (const bp of MOCK_TEST_BLUEPRINTS) {
      expect(bp.marksPerCorrect).toBe(2.5);
      expect(bp.negativeMarkFraction).toBeCloseTo(1 / 3);
    }
  });

  it('the full-length blueprint spans every subject and every practice-bank question', () => {
    const fullLength = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'full-length')!;
    expect(fullLength.subjects).toBe('all');
    expect(fullLength.questionCount).toBe(QUESTION_BANK.length);
  });

  it('quick-40 and quick-20 span all subjects with their own fixed question counts', () => {
    const quick40 = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'quick-40')!;
    const quick20 = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'quick-20')!;
    expect(quick40.subjects).toBe('all');
    expect(quick40.questionCount).toBe(40);
    expect(quick20.subjects).toBe('all');
    expect(quick20.questionCount).toBe(20);
  });

  it('each subject blueprint is restricted to exactly its own subject and sized to that subject\'s real question count', () => {
    for (const subj of SYLLABUS) {
      const bp = MOCK_TEST_BLUEPRINTS.find((b) => b.id === `subject-${subj.id}`)!;
      expect(bp.subjects).toEqual([subj.colorKey]);
      expect(bp.questionCount).toBe(QUESTION_BANK.filter((q) => q.subject === subj.colorKey).length);
    }
  });

  it('every blueprint id is unique', () => {
    const ids = MOCK_TEST_BLUEPRINTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getBlueprint', () => {
  it('returns the matching blueprint by id', () => {
    expect(getBlueprint('full-length')?.id).toBe('full-length');
    expect(getBlueprint('quick-20')?.id).toBe('quick-20');
  });

  it('returns undefined for an unknown id', () => {
    expect(getBlueprint('does-not-exist')).toBeUndefined();
  });
});

describe('shuffle', () => {
  it('returns an array of the same length containing exactly the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffle(input);
    expect(input).toEqual(snapshot);
  });

  it('handles an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles a single-element array', () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

describe('pickQuestionsForBlueprint — existing selection behaviour', () => {
  it('draws from the entire QUESTION_BANK when subjects is "all", capped at questionCount', () => {
    const bp = { id: 'b', title: '', description: '', durationMinutes: 10, subjects: 'all' as const, questionCount: 5, marksPerCorrect: 2.5, negativeMarkFraction: 1 / 3 };
    const picked = pickQuestionsForBlueprint(bp);
    expect(picked).toHaveLength(5);
    const bankIds = new Set(QUESTION_BANK.map((q) => q.id));
    expect(picked.every((q) => bankIds.has(q.id))).toBe(true);
  });

  it('restricts to only the blueprint\'s own subject(s)', () => {
    const subject = SYLLABUS[0].colorKey;
    const bp = { id: 'b', title: '', description: '', durationMinutes: 10, subjects: [subject], questionCount: 1000, marksPerCorrect: 2.5, negativeMarkFraction: 1 / 3 };
    const picked = pickQuestionsForBlueprint(bp);
    expect(picked.every((q) => q.subject === subject)).toBe(true);
    expect(picked).toHaveLength(QUESTION_BANK.filter((q) => q.subject === subject).length);
  });

  it('caps at questionCount without padding when the real pool is smaller', () => {
    const bp = { id: 'b', title: '', description: '', durationMinutes: 10, subjects: 'all' as const, questionCount: QUESTION_BANK.length + 500, marksPerCorrect: 2.5, negativeMarkFraction: 1 / 3 };
    expect(pickQuestionsForBlueprint(bp)).toHaveLength(QUESTION_BANK.length);
  });

  it('every real blueprint picks a pool of exactly its own declared questionCount (or the full matching pool if smaller)', () => {
    for (const bp of MOCK_TEST_BLUEPRINTS) {
      const picked = pickQuestionsForBlueprint(bp);
      const matchingPoolSize = bp.subjects === 'all' ? QUESTION_BANK.length : QUESTION_BANK.filter((q) => (bp.subjects as string[]).includes(q.subject)).length;
      expect(picked).toHaveLength(Math.min(bp.questionCount, matchingPoolSize));
    }
  });

  it('never returns duplicate questions for a single blueprint', () => {
    const fullLength = MOCK_TEST_BLUEPRINTS.find((b) => b.id === 'full-length')!;
    const picked = pickQuestionsForBlueprint(fullLength);
    expect(new Set(picked.map((q) => q.id)).size).toBe(picked.length);
  });
});
