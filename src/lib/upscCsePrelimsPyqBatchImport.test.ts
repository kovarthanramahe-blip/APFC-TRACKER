import { describe, it, expect } from 'vitest';
import {
  resolveMicrosyllabusHint,
  buildUpscCsePrelimsBatchRecords,
  mergeUpscCsePrelimsPyqRecords,
  summarizeUpscCsePrelimsPyqBatch,
  type UpscCsePrelimsPyqBatchFile,
  type UpscCsePrelimsBatchPyq,
} from './upscCsePrelimsPyqBatchImport';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';

const GS1_PAPER = UPSC_CSE_PRELIMS_SYLLABUS.papers.find((p) => p.shortTitle === 'GS Paper I')!;

function fixtureBatch(overrides: Partial<UpscCsePrelimsPyqBatchFile> = {}): UpscCsePrelimsPyqBatchFile {
  return {
    schema: 'upsc-cse-prelims-user-supplied-pyq-batch',
    schemaVersion: 1,
    exam: 'UPSC CSE',
    stage: 'prelims',
    paper: 'GS Paper I',
    year: 2026,
    questionRange: '1-2',
    source: { kind: 'user_provided_text', filename: 'fixture.md', answerKeyProvided: false, verificationStatus: 'provisional' },
    questions: [
      {
        questionNumber: 1,
        question: 'Fixture question one?',
        options: [
          { id: 'a', text: 'Opt A' },
          { id: 'b', text: 'Opt B' },
        ],
        correctOptionId: null,
        subject: 'History',
        microsyllabusHint: 'Ancient India',
        mappingStatus: 'review_required',
      },
      {
        questionNumber: 2,
        question: 'Fixture question two?',
        options: [
          { id: 'a', text: 'Opt A' },
          { id: 'b', text: 'Opt B' },
        ],
        correctOptionId: null,
        subject: 'History',
        microsyllabusHint: 'Something Not In The Syllabus',
        mappingStatus: 'review_required',
      },
    ],
    ...overrides,
  };
}

describe('resolveMicrosyllabusHint — exact match only, never a guess', () => {
  it('resolves a subject+hint pair that exactly matches a real microsyllabus item', () => {
    const result = resolveMicrosyllabusHint(UPSC_CSE_PRELIMS_SYLLABUS, GS1_PAPER.id, 'History', 'Ancient India');
    expect(result.status).toBe('mapped');
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.id === result.microsyllabusId);
    expect(item?.title).toBe('Ancient India');
  });

  it('is case/whitespace-insensitive but still an exact title match', () => {
    const result = resolveMicrosyllabusHint(UPSC_CSE_PRELIMS_SYLLABUS, GS1_PAPER.id, '  history  ', '  ANCIENT INDIA  ');
    expect(result.status).toBe('mapped');
  });

  it('reports needs_review with a reason when the subject itself does not exist under the paper', () => {
    const result = resolveMicrosyllabusHint(UPSC_CSE_PRELIMS_SYLLABUS, GS1_PAPER.id, 'Not A Real Subject', 'Anything');
    expect(result.status).toBe('needs_review');
    expect(result.microsyllabusId).toBeUndefined();
    expect(result.reason).toContain('Not A Real Subject');
  });

  it('reports needs_review with a reason when the microsyllabus hint has no exact match under a real subject (never guesses a near match)', () => {
    const result = resolveMicrosyllabusHint(UPSC_CSE_PRELIMS_SYLLABUS, GS1_PAPER.id, 'History', 'Freedom Struggle');
    expect(result.status).toBe('needs_review');
    expect(result.microsyllabusId).toBeUndefined();
    expect(result.reason).toContain('Freedom Struggle');
    expect(result.reason).toContain('History');
  });
});

describe('buildUpscCsePrelimsBatchRecords', () => {
  it('converts a well-formed batch into records, resolving the mappable hint and leaving the other needs_review', () => {
    const conversion = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);
    expect(conversion.paperResolved).toBe(true);
    expect(conversion.rejected).toEqual([]);
    expect(conversion.records).toHaveLength(2);
    const q1 = conversion.records.find((r) => r.questionNumber === 1)!;
    const q2 = conversion.records.find((r) => r.questionNumber === 2)!;
    expect(q1.mappingStatus).toBe('mapped');
    expect(q1.microsyllabusId).toBeDefined();
    expect(q2.mappingStatus).toBe('needs_review');
    expect(q2.microsyllabusId).toBeUndefined();
  });

  it('never sets correctOptionId when the source supplies null', () => {
    const conversion = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);
    expect(conversion.records.every((r) => r.correctOptionId === undefined)).toBe(true);
  });

  it('rejects a structurally invalid question (too few options) rather than silently dropping or fabricating', () => {
    const batch = fixtureBatch({
      questions: [
        {
          questionNumber: 1,
          question: 'Bad question',
          options: [{ id: 'a', text: 'Only one option' }],
          correctOptionId: null,
          subject: 'History',
          microsyllabusHint: 'Ancient India',
        },
      ],
    });
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    expect(conversion.records).toEqual([]);
    expect(conversion.rejected).toHaveLength(1);
    expect(conversion.rejected[0].issues.some((i) => i.reason === 'too_few_options')).toBe(true);
  });

  it('rejects a repeated question number within the same batch', () => {
    const batch = fixtureBatch();
    batch.questions[1].questionNumber = 1; // collide with question 1
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    // question 1's FIRST occurrence still gets accepted; the SECOND (the collision) is rejected.
    expect(conversion.records).toHaveLength(1);
    expect(conversion.rejected).toHaveLength(1);
    expect(conversion.rejected[0].issues.some((i) => i.reason === 'duplicate_question')).toBe(true);
  });

  it('marks every record needs_review (paperResolved false) when the batch paper matches no paper in the tree', () => {
    const conversion = buildUpscCsePrelimsBatchRecords(fixtureBatch({ paper: 'Not A Real Paper' }), UPSC_CSE_PRELIMS_SYLLABUS);
    expect(conversion.paperResolved).toBe(false);
    expect(conversion.records.every((r) => r.mappingStatus === 'needs_review')).toBe(true);
  });

  it('produces a deterministic id from year+paper+questionNumber — re-running on the same batch yields the same ids', () => {
    const a = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);
    const b = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);
    expect(a.records.map((r) => r.id)).toEqual(b.records.map((r) => r.id));
  });
});

describe('buildUpscCsePrelimsBatchRecords — null subject/microsyllabusHint (unclassified batch)', () => {
  it('a question with subject/microsyllabusHint both null is needs_review, never a crash, never a guess', () => {
    const batch = fixtureBatch({
      questions: [
        {
          questionNumber: 1,
          question: 'Unclassified fixture question?',
          options: [
            { id: 'a', text: 'Opt A' },
            { id: 'b', text: 'Opt B' },
          ],
          correctOptionId: null,
          subject: null,
          microsyllabusHint: null,
          mappingStatus: 'review_required',
        },
      ],
    });
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    expect(conversion.records).toHaveLength(1);
    expect(conversion.records[0].mappingStatus).toBe('needs_review');
    expect(conversion.records[0].microsyllabusId).toBeUndefined();
    expect(conversion.records[0].subject).toBeUndefined();
    expect(conversion.records[0].topic).toBeUndefined();
  });

  it('accepts a numeric-array questionRange (e.g. [51, 100]) exactly like a string range', () => {
    const batch = fixtureBatch({ questionRange: [51, 100] });
    expect(() => buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS)).not.toThrow();
  });
});

describe('mergeUpscCsePrelimsPyqRecords — re-import safety', () => {
  const conversion = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);

  it('merging into an empty bank adds every record, zero duplicates', () => {
    const result = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    expect(result.merged).toHaveLength(2);
    expect(result.addedCount).toBe(2);
    expect(result.duplicateCount).toBe(0);
  });

  it('merging the SAME records again adds nothing — every one is reported as a duplicate', () => {
    const first = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    const second = mergeUpscCsePrelimsPyqRecords(first.merged, conversion.records);
    expect(second.merged).toHaveLength(2); // unchanged
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(2);
    expect(second.duplicateIds.sort()).toEqual(conversion.records.map((r) => r.id).sort());
  });

  it('a genuinely new record (different question number) is still added alongside existing ones', () => {
    const first = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    const extraBatch = fixtureBatch({ questionRange: '3-3', questions: [{ ...fixtureBatch().questions[0], questionNumber: 3 }] });
    const extraConversion = buildUpscCsePrelimsBatchRecords(extraBatch, UPSC_CSE_PRELIMS_SYLLABUS);
    const second = mergeUpscCsePrelimsPyqRecords(first.merged, extraConversion.records);
    expect(second.merged).toHaveLength(3);
    expect(second.addedCount).toBe(1);
    expect(second.duplicateCount).toBe(0);
  });
});

describe('summarizeUpscCsePrelimsPyqBatch', () => {
  it('reports total/valid/mapped/needsReview/duplicates/answerKeyStatus/destination correctly for a fresh import', () => {
    const batch = fixtureBatch();
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    const merge = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    const summary = summarizeUpscCsePrelimsPyqBatch(batch, conversion, merge, 'test-destination');
    expect(summary).toEqual({
      total: 2,
      valid: 2,
      invalid: 0,
      mapped: 1,
      needsReview: 1,
      duplicates: 0,
      answerKeyStatus: 'no_answer_key_supplied',
      destination: 'test-destination',
    });
  });

  it('reports answer_key_present when at least one accepted record has a correctOptionId', () => {
    const batch = fixtureBatch();
    batch.questions[0].correctOptionId = 'a';
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    const merge = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    const summary = summarizeUpscCsePrelimsPyqBatch(batch, conversion, merge, 'test-destination');
    expect(summary.answerKeyStatus).toBe('answer_key_present');
  });

  it('reports duplicates when re-summarizing a merge against an already-populated bank', () => {
    const batch = fixtureBatch();
    const conversion = buildUpscCsePrelimsBatchRecords(batch, UPSC_CSE_PRELIMS_SYLLABUS);
    const firstMerge = mergeUpscCsePrelimsPyqRecords([], conversion.records);
    const secondMerge = mergeUpscCsePrelimsPyqRecords(firstMerge.merged, conversion.records);
    const summary = summarizeUpscCsePrelimsPyqBatch(batch, conversion, secondMerge, 'test-destination');
    expect(summary.duplicates).toBe(2);
  });
});

describe('UpscCsePrelimsBatchPyq — no per-record workspaceId field (workspace isolation by construction)', () => {
  it('a resolved record has no workspaceId, matching every other UPSC CSE data file\'s convention', () => {
    const conversion = buildUpscCsePrelimsBatchRecords(fixtureBatch(), UPSC_CSE_PRELIMS_SYLLABUS);
    const record: UpscCsePrelimsBatchPyq = conversion.records[0];
    expect(record).not.toHaveProperty('workspaceId');
  });
});
