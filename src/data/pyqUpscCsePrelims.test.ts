import { describe, it, expect } from 'vitest';
import { UPSC_CSE_PRELIMS_PYQ_BANK, UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY } from './pyqUpscCsePrelims';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { getMicrosyllabusItemById } from '../lib/upscCseSyllabus';
import { buildUpscCsePrelimsBatchRecords, mergeUpscCsePrelimsPyqRecords } from '../lib/upscCsePrelimsPyqBatchImport';
import { SYLLABUS } from './syllabus';
import { PYQ_BANK } from './pyq';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';

// UPSC CSE Prelims 2026 Q1-50 batch integration — see src/lib/upscCsePrelimsPyqBatchImport.ts for
// the pure conversion/merge/summary logic (exhaustively unit-tested there). These tests instead
// assert on the ACTUAL persisted destination (UPSC_CSE_PRELIMS_PYQ_BANK), matching this task's own
// explicit checklist.

describe('UPSC CSE Prelims 2026 Q1-50 — exactly 50 questions, Q1-Q50', () => {
  it('the bank holds exactly 50 records for this batch', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK).toHaveLength(50);
  });

  it('question numbers are exactly 1..50, each appearing once', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.questionNumber !== undefined)).toBe(true);
    const numbers = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.questionNumber!).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — year and paper', () => {
  it('every record is year 2026', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.year === 2026)).toBe(true);
  });

  it('every record is paper "GS Paper I", preserved exactly as supplied', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.paper === 'GS Paper I')).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — exact question/option preservation', () => {
  it('every record\'s question text and options are byte-identical to the supplied batch', () => {
    for (const source of UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.questions) {
      const record = UPSC_CSE_PRELIMS_PYQ_BANK.find((r) => r.questionNumber === source.questionNumber);
      expect(record, `record for Q${source.questionNumber}`).toBeDefined();
      expect(record!.question).toBe(source.question);
      expect(record!.options).toEqual(source.options);
      expect(record!.subject).toBe(source.subject);
    }
  });

  it('preserves the supplied provenance (source kind, filename, answer-key-provided flag)', () => {
    for (const record of UPSC_CSE_PRELIMS_PYQ_BANK) {
      expect(record.provenance.sourceFilename).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.source.filename);
      expect(record.provenance.sourceKind).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.source.kind);
      expect(record.provenance.answerKeyProvided).toBe(false);
    }
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — no answer key', () => {
  it('correctOptionId is absent (never fabricated) on every record', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => r.correctOptionId === undefined)).toBe(true);
  });

  it('the batch validation summary reports no_answer_key_supplied', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — valid stable microsyllabus IDs', () => {
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
    expect(needsReview.length).toBeGreaterThan(0);
    expect(needsReview.every((r) => r.microsyllabusId === undefined)).toBe(true);
  });

  it('mapping summary: 20 mapped, 30 needs_review (documents the real outcome for this batch)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.mapped).toBe(20);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.needsReview).toBe(30);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.mapped + UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.needsReview).toBe(50);
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — no duplicate IDs / no duplicate question numbers', () => {
  it('every record id is unique', () => {
    const ids = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question number is unique', () => {
    const numbers = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.questionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — UPSC workspace isolation', () => {
  it('no record carries a workspaceId field — belongs to upsc_cse by construction, same as every other UPSC CSE data file', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => !('workspaceId' in r))).toBe(true);
  });

  it('does not populate or alter data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK (a separate, still-empty array)', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — APFC protection', () => {
  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, s) => sum + s.topics.length, 0)).toBe(134);
  });
});

describe('UPSC CSE Prelims 2026 Q1-50 — re-import does not duplicate the batch', () => {
  it('re-running the exact same batch through build + merge against the already-populated bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(50); // unchanged, not 100
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(50);
  });
});
