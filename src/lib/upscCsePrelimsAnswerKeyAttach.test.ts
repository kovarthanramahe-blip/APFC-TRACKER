import { describe, it, expect } from 'vitest';
import {
  validateAnswerKeyStructure,
  attachUpscCsePrelimsAnswerKey,
  type UpscCsePrelimsAnswerKeyFile,
} from './upscCsePrelimsAnswerKeyAttach';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';

function fixtureAnswerKey(overrides: Partial<UpscCsePrelimsAnswerKeyFile> = {}): UpscCsePrelimsAnswerKeyFile {
  return {
    schema: 'upsc-cse-prelims-2026-answer-key',
    schemaVersion: 1,
    exam: 'UPSC CSE',
    stage: 'prelims',
    paper: 'GS Paper I',
    year: 2026,
    set: 'A',
    source: { kind: 'user_provided_answer_key', verificationStatus: 'user_supplied' },
    answerKey: [
      { questionNumber: 1, correctOptionId: 'b' },
      { questionNumber: 2, correctOptionId: 'a' },
    ],
    ...overrides,
  };
}

function fixtureRecord(overrides: Partial<UpscCsePrelimsBatchPyq> = {}): UpscCsePrelimsBatchPyq {
  return {
    id: 'upsc-cse-pyq-2026-gs-paper-i-1',
    year: 2026,
    paper: 'GS Paper I',
    questionNumber: 1,
    question: 'Fixture question?',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
      { id: 'd', text: 'D' },
    ],
    subject: 'History',
    topic: 'Ancient India',
    microsyllabusId: 'prelims-gs1-history-ancient',
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

describe('validateAnswerKeyStructure', () => {
  it('a well-formed key covering exactly the expected range has zero issues', () => {
    const key = fixtureAnswerKey();
    expect(validateAnswerKeyStructure(key, { min: 1, max: 2 })).toEqual([]);
  });

  it('flags a wrong entry count', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'a' }] });
    const issues = validateAnswerKeyStructure(key, { min: 1, max: 2 });
    expect(issues.some((i) => i.reason === 'wrong_entry_count')).toBe(true);
  });

  it('flags a question number outside the expected range', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'a' }, { questionNumber: 99, correctOptionId: 'b' }] });
    const issues = validateAnswerKeyStructure(key, { min: 1, max: 2 });
    expect(issues.some((i) => i.reason === 'invalid_question_number' && i.questionNumber === 99)).toBe(true);
  });

  it('flags a duplicate question number', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'a' }, { questionNumber: 1, correctOptionId: 'b' }] });
    const issues = validateAnswerKeyStructure(key, { min: 1, max: 1 });
    expect(issues.some((i) => i.reason === 'duplicate_question_number' && i.questionNumber === 1)).toBe(true);
  });

  it('flags a missing question number', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'a' }] });
    const issues = validateAnswerKeyStructure(key, { min: 1, max: 2 });
    expect(issues.some((i) => i.reason === 'missing_question_number' && i.questionNumber === 2)).toBe(true);
  });

  it('flags an option letter outside A-D', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'e' }, { questionNumber: 2, correctOptionId: 'a' }] });
    const issues = validateAnswerKeyStructure(key, { min: 1, max: 2 });
    expect(issues.some((i) => i.reason === 'invalid_option_letter' && i.questionNumber === 1)).toBe(true);
  });

  it('accepts uppercase letters too (the domain is A-D, not specifically lowercase)', () => {
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'B' }, { questionNumber: 2, correctOptionId: 'A' }] });
    expect(validateAnswerKeyStructure(key, { min: 1, max: 2 })).toEqual([]);
  });

  it('never mutates its input', () => {
    const key = fixtureAnswerKey();
    const snapshot = JSON.parse(JSON.stringify(key));
    validateAnswerKeyStructure(key, { min: 1, max: 2 });
    expect(key).toEqual(snapshot);
  });
});

describe('attachUpscCsePrelimsAnswerKey', () => {
  it('attaches a matching entry\'s correctOptionId and answerKeySet onto the matching record', () => {
    const bank = [fixtureRecord()];
    const result = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    expect(result.attached).toBe(1);
    expect(result.updated[0].correctOptionId).toBe('b');
    expect(result.updated[0].answerKeySet).toBe('A');
  });

  it('never mutates the input bank array or its records', () => {
    const bank = [fixtureRecord()];
    const snapshot = JSON.parse(JSON.stringify(bank));
    attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    expect(bank).toEqual(snapshot);
    expect(bank[0].correctOptionId).toBeUndefined();
  });

  it('never touches mappingStatus, microsyllabusId, question, options, subject, topic, or provenance', () => {
    const bank = [fixtureRecord()];
    const result = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    const record = result.updated[0];
    expect(record.mappingStatus).toBe('mapped');
    expect(record.microsyllabusId).toBe('prelims-gs1-history-ancient');
    expect(record.question).toBe('Fixture question?');
    expect(record.subject).toBe('History');
    expect(record.topic).toBe('Ancient India');
    expect(record.provenance).toEqual({ importedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('leaves a record with no matching answer-key entry completely untouched', () => {
    const bank = [fixtureRecord({ id: 'x-99', questionNumber: 99 })];
    const result = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    expect(result.attached).toBe(0);
    expect(result.updated[0]).toEqual(bank[0]);
  });

  it('never attaches a letter that doesn\'t match any of that question\'s real options — reports it as skipped instead', () => {
    const bank = [fixtureRecord({ options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] })];
    const key = fixtureAnswerKey({ answerKey: [{ questionNumber: 1, correctOptionId: 'z' }] });
    const result = attachUpscCsePrelimsAnswerKey(bank, key);
    expect(result.attached).toBe(0);
    expect(result.updated[0].correctOptionId).toBeUndefined();
    expect(result.skipped).toEqual([{ questionNumber: 1, reason: expect.stringContaining('"z"') }]);
  });

  it('only attaches to records matching the answer key\'s own year and paper', () => {
    const bank = [fixtureRecord({ year: 2025 })];
    const result = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    expect(result.attached).toBe(0);
    expect(result.updated[0].correctOptionId).toBeUndefined();
  });

  it('reports an answer-key entry with no matching bank record at all, never silently dropping it', () => {
    const bank: UpscCsePrelimsBatchPyq[] = [];
    const result = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    expect(result.attached).toBe(0);
    expect(result.skipped.map((s) => s.questionNumber).sort()).toEqual([1, 2]);
  });

  it('attaching the same key twice is idempotent — correctOptionId ends up identical either way', () => {
    const bank = [fixtureRecord()];
    const once = attachUpscCsePrelimsAnswerKey(bank, fixtureAnswerKey());
    const twice = attachUpscCsePrelimsAnswerKey(once.updated, fixtureAnswerKey());
    expect(twice.updated[0].correctOptionId).toBe(once.updated[0].correctOptionId);
    expect(twice.attached).toBe(1);
  });
});
