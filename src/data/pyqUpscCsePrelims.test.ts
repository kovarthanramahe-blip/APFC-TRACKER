import { describe, it, expect } from 'vitest';
import {
  UPSC_CSE_PRELIMS_PYQ_BANK,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY,
} from './pyqUpscCsePrelims';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100 } from './upscCsePrelimsPyqBatch2026Q51Q100Raw';
import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { getMicrosyllabusItemById } from '../lib/upscCseSyllabus';
import { buildUpscCsePrelimsBatchRecords, mergeUpscCsePrelimsPyqRecords } from '../lib/upscCsePrelimsPyqBatchImport';
import type { PYQOption } from '../lib/types';
import { SYLLABUS } from './syllabus';
import { PYQ_BANK } from './pyq';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';

// UPSC CSE Prelims 2026 Q1-100 integration — the combined GS Paper I dataset built from TWO
// separately-prepared batches (Q1-50, Q51-100; see data/pyqUpscCsePrelims.ts's own header for how
// they are chained into one UPSC_CSE_PRELIMS_PYQ_BANK). See
// src/lib/upscCsePrelimsPyqBatchImport.ts for the pure conversion/merge/summary logic
// (exhaustively unit-tested there, including its own null-subject/null-hint handling). These tests
// assert on the ACTUAL persisted destination, matching this task's own explicit checklist.

const ALL_RAW_QUESTIONS = [...UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.questions, ...UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100.questions];

describe('UPSC CSE Prelims 2026 — exactly 100 questions, Q1-Q100', () => {
  it('the combined bank holds exactly 100 records', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK).toHaveLength(100);
  });

  it('question numbers are exactly 1..100, each appearing once', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.questionNumber !== undefined)).toBe(true);
    const numbers = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.questionNumber!).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('both source batches contributed exactly 50 records each', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.questionNumber! >= 1 && r.questionNumber! <= 50)).toHaveLength(50);
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.questionNumber! >= 51 && r.questionNumber! <= 100)).toHaveLength(50);
  });
});

describe('UPSC CSE Prelims 2026 — year and paper', () => {
  it('every record is year 2026, paper "GS Paper I"', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.year === 2026)).toBe(true);
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.paper === 'GS Paper I')).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — exact question/option preservation across both batches', () => {
  it('every record\'s question text and options are byte-identical to whichever supplied batch it came from', () => {
    for (const source of ALL_RAW_QUESTIONS) {
      const record = UPSC_CSE_PRELIMS_PYQ_BANK.find((r) => r.questionNumber === source.questionNumber);
      expect(record, `record for Q${source.questionNumber}`).toBeDefined();
      expect(record!.question).toBe(source.question);
      expect(record!.options).toEqual(source.options);
      expect(record!.subject).toBe(source.subject ?? undefined);
    }
  });

  it('Q51-100 records preserve their own batch\'s provenance (different filename from Q1-50)', () => {
    const q51 = UPSC_CSE_PRELIMS_PYQ_BANK.find((r) => r.questionNumber === 51)!;
    expect(q51.provenance.sourceFilename).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100.source.filename);
    expect(q51.provenance.sourceFilename).toBe('Pasted markdown(6).md');
  });

  it('Q1-50 records preserve their own batch\'s provenance', () => {
    const q1 = UPSC_CSE_PRELIMS_PYQ_BANK.find((r) => r.questionNumber === 1)!;
    expect(q1.provenance.sourceFilename).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.source.filename);
    expect(q1.provenance.sourceFilename).toBe('Pasted markdown(5).md');
  });

  it('every record preserves answerKeyProvided: false, matching both supplied batches', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.provenance.answerKeyProvided === false)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — no answer key', () => {
  it('correctOptionId is absent (never fabricated) on every one of the 100 records', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.correctOptionId === undefined)).toBe(true);
  });

  it('both batch summaries report no_answer_key_supplied', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
  });
});

describe('UPSC CSE Prelims 2026 — valid microsyllabus mappings', () => {
  it('every mapped record\'s microsyllabusId resolves to a real node in the actual syllabus tree (never invented)', () => {
    const mapped = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.mappingStatus === 'mapped');
    expect(mapped.length).toBeGreaterThan(0);
    for (const record of mapped) {
      expect(record.microsyllabusId).toBeDefined();
      const node = getMicrosyllabusItemById(UPSC_CSE_PRELIMS_SYLLABUS, record.microsyllabusId!);
      expect(node, `microsyllabus node for "${record.microsyllabusId}"`).toBeDefined();
    }
  });

  it('every needs_review record has NO microsyllabusId — never silently assigned to another topic', () => {
    const needsReview = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.mappingStatus === 'needs_review');
    expect(needsReview.every((r) => r.microsyllabusId === undefined)).toBe(true);
  });

  it('Q1-50: 20 mapped, 30 needs_review (unchanged by adding Q51-100)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.mapped).toBe(20);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.needsReview).toBe(30);
  });

  it('Q51-100: every question was supplied with no subject/microsyllabusHint at all, so all 50 are needs_review (never guessed from question content)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.mapped).toBe(0);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.needsReview).toBe(50);
    const q51to100 = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.questionNumber! >= 51 && r.questionNumber! <= 100);
    expect(q51to100.every((r) => r.mappingStatus === 'needs_review')).toBe(true);
    expect(q51to100.every((r) => r.subject === undefined && r.topic === undefined)).toBe(true);
  });

  it('combined bank: 20 mapped + 80 needs_review = 100', () => {
    const mapped = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.mappingStatus === 'mapped').length;
    const needsReview = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.mappingStatus === 'needs_review').length;
    expect(mapped).toBe(20);
    expect(needsReview).toBe(80);
    expect(mapped + needsReview).toBe(100);
  });
});

describe('UPSC CSE Prelims 2026 — no duplicate IDs / no duplicate question numbers', () => {
  it('every record id is unique across the combined 100', () => {
    const ids = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.id);
    expect(new Set(ids).size).toBe(100);
  });

  it('every question number is unique across the combined 100', () => {
    const numbers = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.questionNumber);
    expect(new Set(numbers).size).toBe(100);
  });

  it('Q1-50 and Q51-100 ids never collide with each other', () => {
    const q1to50Ids = new Set(UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.questionNumber! <= 50).map((r) => r.id));
    const q51to100Ids = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.questionNumber! >= 51).map((r) => r.id);
    expect(q51to100Ids.every((id) => !q1to50Ids.has(id))).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — compatible with the existing interactive MCQ architecture', () => {
  it('every record\'s options are structurally identical to PYQOption[] — the exact shape the shared practice/mock-test UI (lib/types.ts\'s PracticeQuestion) already expects', () => {
    for (const record of UPSC_CSE_PRELIMS_PYQ_BANK) {
      const options: PYQOption[] = record.options; // fails to typecheck if the shapes ever drift apart
      expect(options).toBe(record.options);
      for (const option of options) {
        expect(typeof option.id).toBe('string');
        expect(typeof option.text).toBe('string');
      }
    }
  });

  it('every record has a stable string id and non-empty question text — the other two fields PracticeQuestion requires alongside options', () => {
    for (const record of UPSC_CSE_PRELIMS_PYQ_BANK) {
      expect(typeof record.id).toBe('string');
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.question.trim().length).toBeGreaterThan(0);
    }
  });

  // The one field PracticeQuestion still mandates that these records cannot honestly supply is
  // correctOptionId — deliberately absent throughout (see "no answer key" above). Once a real
  // answer key becomes available, a record here would need only correctOptionId (and a
  // SubjectColorKey/topicId, which are APFC-specific and never assigned here) to become one.
});

describe('UPSC CSE Prelims 2026 — UPSC workspace isolation', () => {
  it('no record carries a workspaceId field — belongs to upsc_cse by construction, same as every other UPSC CSE data file', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => !('workspaceId' in r))).toBe(true);
  });

  it('does not populate or alter data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK (a separate, still-empty array)', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});

describe('UPSC CSE Prelims 2026 — APFC protection', () => {
  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, s) => sum + s.topics.length, 0)).toBe(134);
  });
});

describe('UPSC CSE Prelims 2026 — re-import does not duplicate either batch', () => {
  it('re-running Q1-50 through build + merge against the already-populated (100-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(100); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(50);
  });

  it('re-running Q51-100 through build + merge against the already-populated (100-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(100); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(50);
  });

  it('re-running BOTH batches together against an empty bank reproduces the exact same 100-record set', () => {
    const q1to50 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const firstMerge = mergeUpscCsePrelimsPyqRecords([], q1to50.records);
    const q51to100 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const secondMerge = mergeUpscCsePrelimsPyqRecords(firstMerge.merged, q51to100.records);
    expect(secondMerge.merged.map((r) => r.id).sort()).toEqual(UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.id).sort());
  });
});
