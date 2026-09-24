import { describe, it, expect } from 'vitest';
import {
  UPSC_CSE_PRELIMS_PYQ_BANK,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY,
  UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_STRUCTURE_ISSUES,
  UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_ATTACH_RESULT,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100_SUMMARY,
  UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_STRUCTURE_ISSUES,
  UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_ATTACH_RESULT,
  UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100_SUMMARY,
} from './pyqUpscCsePrelims';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100 } from './upscCsePrelimsPyqBatch2026Q51Q100Raw';
import { UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A } from './upscCsePrelimsAnswerKey2026SetARaw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100 } from './upscCsePrelimsPyqBatch2025Q1Q100Raw';
import { UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A } from './upscCsePrelimsAnswerKey2025SetARaw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100 } from './upscCsePrelimsPyqBatch2024Q1Q100Raw';
import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { getMicrosyllabusItemById } from '../lib/upscCseSyllabus';
import { buildUpscCsePrelimsBatchRecords, mergeUpscCsePrelimsPyqRecords } from '../lib/upscCsePrelimsPyqBatchImport';
import { validateAnswerKeyStructure, attachUpscCsePrelimsAnswerKey } from '../lib/upscCsePrelimsAnswerKeyAttach';
import type { PYQOption } from '../lib/types';
import { SYLLABUS } from './syllabus';
import { PYQ_BANK } from './pyq';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';

// UPSC CSE Prelims integration — the combined GS Paper I dataset built from THREE separately-
// prepared batches: 2026 Q1-50, 2026 Q51-100, and 2025 Q1-100 (see data/pyqUpscCsePrelims.ts's own
// header for how they are chained into one UPSC_CSE_PRELIMS_PYQ_BANK — the 2025 batch is appended on
// top of the already-answer-keyed 2026 bank, never replacing or editing it). See
// src/lib/upscCsePrelimsPyqBatchImport.ts for the pure conversion/merge/summary logic
// (exhaustively unit-tested there, including its own null-subject/null-hint handling). These tests
// assert on the ACTUAL persisted destination, matching this task's own explicit checklist. Tests
// below are grouped as "2026 — ..." (scoped to the 2026 subset, unaffected by the 2025 addition),
// "2025 — ..." (scoped to the 2025 subset), and "combined — ..." (the whole bank, both years).

const ALL_2026_RAW_QUESTIONS = [...UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.questions, ...UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100.questions];
const ALL_2025_RAW_QUESTIONS = UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100.questions;
const ALL_2024_RAW_QUESTIONS = UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100.questions;
const BANK_2026 = () => UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2026);
const BANK_2025 = () => UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2025);
const BANK_2024 = () => UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2024);

// The 2024 batch's own 11 finance/market-structure questions with no defensible microsyllabus item
// (see data/upscCsePrelimsPyqBatch2024Q1Q100Raw.ts's own 'important' notes) — subject preserved,
// microsyllabusHint intentionally left unresolved.
const NEEDS_REVIEW_2024_GAP_QUESTIONS = [31, 32, 33, 82, 83, 84, 85, 87, 89, 90, 100];

describe('UPSC CSE Prelims 2026 — exactly 100 questions, Q1-Q100', () => {
  it('the 2026 subset holds exactly 100 records', () => {
    expect(BANK_2026()).toHaveLength(100);
  });

  it('question numbers are exactly 1..100, each appearing once within 2026', () => {
    expect(BANK_2026().every((r) => r.questionNumber !== undefined)).toBe(true);
    const numbers = BANK_2026()
      .map((r) => r.questionNumber!)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('both source batches contributed exactly 50 records each', () => {
    expect(BANK_2026().filter((r) => r.questionNumber! >= 1 && r.questionNumber! <= 50)).toHaveLength(50);
    expect(BANK_2026().filter((r) => r.questionNumber! >= 51 && r.questionNumber! <= 100)).toHaveLength(50);
  });
});

describe('UPSC CSE Prelims 2026 — year and paper', () => {
  it('every 2026 record is year 2026, paper "GS Paper I"', () => {
    expect(BANK_2026().every((r) => r.year === 2026)).toBe(true);
    expect(BANK_2026().every((r) => r.paper === 'GS Paper I')).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — exact question/option preservation across both batches', () => {
  it('every record\'s question text and options are byte-identical to whichever supplied batch it came from', () => {
    for (const source of ALL_2026_RAW_QUESTIONS) {
      const record = BANK_2026().find((r) => r.questionNumber === source.questionNumber);
      expect(record, `record for Q${source.questionNumber}`).toBeDefined();
      expect(record!.question).toBe(source.question);
      expect(record!.options).toEqual(source.options);
      expect(record!.subject).toBe(source.subject ?? undefined);
    }
  });

  it('Q51-100 records preserve their own batch\'s provenance (different filename from Q1-50)', () => {
    const q51 = BANK_2026().find((r) => r.questionNumber === 51)!;
    expect(q51.provenance.sourceFilename).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100.source.filename);
    expect(q51.provenance.sourceFilename).toBe('Pasted markdown(6).md');
  });

  it('Q1-50 records preserve their own batch\'s provenance', () => {
    const q1 = BANK_2026().find((r) => r.questionNumber === 1)!;
    expect(q1.provenance.sourceFilename).toBe(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50.source.filename);
    expect(q1.provenance.sourceFilename).toBe('Pasted markdown(5).md');
  });

  it('every 2026 record preserves answerKeyProvided: false, matching both supplied batches', () => {
    expect(BANK_2026().every((r) => r.provenance.answerKeyProvided === false)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — Q1-50/Q51-100 batches themselves carried no answer key', () => {
  it('both batch summaries report no_answer_key_supplied — the RAW batches never included one (the answer key below is a separate, later attachment)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
  });
});

describe('UPSC CSE Prelims 2026 — Set A answer key: structural validation', () => {
  it('the persisted structure-issues export is empty — exactly 100 entries, Q1-Q100, only A/B/C/D, no missing/duplicate numbers', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_STRUCTURE_ISSUES).toEqual([]);
  });

  it('the raw answer-key file itself has exactly 100 entries covering Q1-Q100 with no duplicates', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey).toHaveLength(100);
    const numbers = UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.map((e) => e.questionNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('every entry\'s correctOptionId is one of a/b/c/d', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.every((e) => /^[a-dA-D]$/.test(e.correctOptionId))).toBe(true);
  });

  it('validateAnswerKeyStructure independently confirms zero issues against the Q1-Q100 range', () => {
    const issues = validateAnswerKeyStructure(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A, { min: 1, max: 100 });
    expect(issues).toEqual([]);
  });

  it('detects a wrong entry count (a truncated key) as an explicit issue rather than silently accepting it', () => {
    const truncated = { ...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A, answerKey: UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.slice(0, 99) };
    const issues = validateAnswerKeyStructure(truncated, { min: 1, max: 100 });
    expect(issues.some((i) => i.reason === 'wrong_entry_count')).toBe(true);
    expect(issues.some((i) => i.reason === 'missing_question_number' && i.questionNumber === 100)).toBe(true);
  });

  it('detects a duplicate question number as an explicit issue', () => {
    const duplicated = {
      ...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A,
      answerKey: [...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.slice(0, 99), { questionNumber: 1, correctOptionId: 'a' }],
    };
    const issues = validateAnswerKeyStructure(duplicated, { min: 1, max: 100 });
    expect(issues.some((i) => i.reason === 'duplicate_question_number' && i.questionNumber === 1)).toBe(true);
    expect(issues.some((i) => i.reason === 'missing_question_number' && i.questionNumber === 100)).toBe(true);
  });

  it('detects an invalid option letter (outside A-D) as an explicit issue', () => {
    const bad = {
      ...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A,
      answerKey: UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.map((e) => (e.questionNumber === 1 ? { ...e, correctOptionId: 'e' } : e)),
    };
    const issues = validateAnswerKeyStructure(bad, { min: 1, max: 100 });
    expect(issues.some((i) => i.reason === 'invalid_option_letter' && i.questionNumber === 1)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — Set A answer key: Q1-Q100 attachment', () => {
  it('all 100 entries attached, zero skipped', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_ATTACH_RESULT.attached).toBe(100);
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_ATTACH_RESULT.skipped).toEqual([]);
  });

  it('every 2026 record now carries a correctOptionId', () => {
    expect(BANK_2026().every((r) => r.correctOptionId !== undefined)).toBe(true);
  });

  it('every 2026 record\'s correctOptionId matches the supplied answer key exactly, by question number', () => {
    const byNumber = new Map(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.map((e) => [e.questionNumber, e.correctOptionId]));
    for (const record of BANK_2026()) {
      expect(record.correctOptionId).toBe(byNumber.get(record.questionNumber!));
    }
  });

  it('every 2026 record\'s correctOptionId matches an existing option id for that exact question', () => {
    for (const record of BANK_2026()) {
      expect(record.options.some((o) => o.id === record.correctOptionId)).toBe(true);
    }
  });

  it('every 2026 record\'s answerKeySet is "A", preserving the Set-A designation', () => {
    expect(BANK_2026().every((r) => r.answerKeySet === 'A')).toBe(true);
  });

  it('does not touch mappingStatus/microsyllabusId — still 58 mapped, 42 needs_review within 2026 after attaching answers', () => {
    expect(BANK_2026().filter((r) => r.mappingStatus === 'mapped')).toHaveLength(58);
    expect(BANK_2026().filter((r) => r.mappingStatus === 'needs_review')).toHaveLength(42);
  });

  it('does not touch question text, options, provenance, year, or paper', () => {
    for (const source of ALL_2026_RAW_QUESTIONS) {
      const record = BANK_2026().find((r) => r.questionNumber === source.questionNumber)!;
      expect(record.question).toBe(source.question);
      expect(record.options).toEqual(source.options);
      expect(record.year).toBe(2026);
      expect(record.paper).toBe('GS Paper I');
    }
  });

  it('an answer whose letter does not match any real option for that question is never force-attached (reported in skipped instead)', () => {
    const badAnswerKey = {
      ...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A,
      answerKey: UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.map((e) => (e.questionNumber === 1 ? { ...e, correctOptionId: 'z' } : e)),
    };
    const preAnswerBank = BANK_2026().map((r) => ({ ...r, correctOptionId: undefined, answerKeySet: undefined }));
    const result = attachUpscCsePrelimsAnswerKey(preAnswerBank, badAnswerKey);
    expect(result.attached).toBe(99);
    expect(result.skipped).toEqual([{ questionNumber: 1, reason: expect.stringContaining('"z"') }]);
    const q1 = result.updated.find((r) => r.questionNumber === 1)!;
    expect(q1.correctOptionId).toBeUndefined();
  });

  it('an answer key for a question number outside the bank is reported, never silently dropped', () => {
    const preAnswerBank = BANK_2026().map((r) => ({ ...r, correctOptionId: undefined, answerKeySet: undefined }));
    const extraEntryKey = { ...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A, answerKey: [...UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey, { questionNumber: 101, correctOptionId: 'a' }] };
    const result = attachUpscCsePrelimsAnswerKey(preAnswerBank, extraEntryKey);
    expect(result.skipped.some((s) => s.questionNumber === 101)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — valid microsyllabus mappings', () => {
  it('every mapped 2026 record\'s microsyllabusId resolves to a real node in the actual syllabus tree (never invented)', () => {
    const mapped = BANK_2026().filter((r) => r.mappingStatus === 'mapped');
    expect(mapped.length).toBeGreaterThan(0);
    for (const record of mapped) {
      expect(record.microsyllabusId).toBeDefined();
      const node = getMicrosyllabusItemById(UPSC_CSE_PRELIMS_SYLLABUS, record.microsyllabusId!);
      expect(node, `microsyllabus node for "${record.microsyllabusId}"`).toBeDefined();
    }
  });

  it('every needs_review 2026 record has NO microsyllabusId — never silently assigned to another topic', () => {
    const needsReview = BANK_2026().filter((r) => r.mappingStatus === 'needs_review');
    expect(needsReview.every((r) => r.microsyllabusId === undefined)).toBe(true);
  });

  it('Q1-50: 20 mapped, 30 needs_review (unchanged by adding Q51-100)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.mapped).toBe(20);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY.needsReview).toBe(30);
  });

  it('Q51-100: originally supplied with no subject/microsyllabusHint at all; a later classification pass populated subject/microsyllabusHint directly on the raw batch file against the existing taxonomy — 38 mapped, 12 needs_review (3 Ethics/public-administration case-study questions with no GS Paper I subject at all, plus 9 finance-content questions kept at subject-level only, same "Economic & Social Development" gap this batch\'s own header documents)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.mapped).toBe(38);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY.needsReview).toBe(12);
    const q51to100 = BANK_2026().filter((r) => r.questionNumber! >= 51 && r.questionNumber! <= 100);
    const noSubjectAtAll = [51, 52, 53];
    for (const record of q51to100) {
      if (noSubjectAtAll.includes(record.questionNumber!)) {
        expect(record.mappingStatus).toBe('needs_review');
        expect(record.subject).toBeUndefined();
      }
    }
  });

  it('2026 subset: 58 mapped + 42 needs_review = 100', () => {
    const mapped = BANK_2026().filter((r) => r.mappingStatus === 'mapped').length;
    const needsReview = BANK_2026().filter((r) => r.mappingStatus === 'needs_review').length;
    expect(mapped).toBe(58);
    expect(needsReview).toBe(42);
    expect(mapped + needsReview).toBe(100);
  });
});

describe('UPSC CSE Prelims 2025 — exactly 100 questions, Q1-Q100, Set A', () => {
  it('the 2025 subset holds exactly 100 records', () => {
    expect(BANK_2025()).toHaveLength(100);
  });

  it('question numbers are exactly 1..100, each appearing once within 2025', () => {
    expect(BANK_2025().every((r) => r.questionNumber !== undefined)).toBe(true);
    const numbers = BANK_2025()
      .map((r) => r.questionNumber!)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('every 2025 record is year 2025, paper "GS Paper I"', () => {
    expect(BANK_2025().every((r) => r.year === 2025)).toBe(true);
    expect(BANK_2025().every((r) => r.paper === 'GS Paper I')).toBe(true);
  });

  it('every 2025 record\'s question text and options are byte-identical to the supplied batch', () => {
    for (const source of ALL_2025_RAW_QUESTIONS) {
      const record = BANK_2025().find((r) => r.questionNumber === source.questionNumber);
      expect(record, `record for Q${source.questionNumber}`).toBeDefined();
      expect(record!.question).toBe(source.question);
      expect(record!.options).toEqual(source.options);
    }
  });

  it('every 2025 record preserves provenance: user-provided text, no sourceFilename (pasted directly, not uploaded), answerKeyProvided false at batch level, provisional', () => {
    expect(BANK_2025().every((r) => r.provenance.sourceKind === 'user_provided_text')).toBe(true);
    expect(BANK_2025().every((r) => r.provenance.sourceFilename === undefined)).toBe(true);
    expect(BANK_2025().every((r) => r.provenance.answerKeyProvided === false)).toBe(true);
    expect(BANK_2025().every((r) => r.verificationStatus === 'provisional')).toBe(true);
  });

  it('the 2025 batch itself carried no answer key (the Set A key below is a separate, later attachment)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
  });

  it('originally supplied with no subject/microsyllabus mapping at all; a later classification pass populated subject/microsyllabusHint directly on the raw batch file against the existing taxonomy — 91 mapped, 9 needs_review (9 pure-finance/fiscal-arithmetic questions kept at subject-level "Economic & Social Development" only, per the same gap this batch\'s own header documents)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100_SUMMARY.mapped).toBe(91);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100_SUMMARY.needsReview).toBe(9);
    const mapped = BANK_2025().filter((r) => r.mappingStatus === 'mapped').length;
    const needsReview = BANK_2025().filter((r) => r.mappingStatus === 'needs_review').length;
    expect(mapped).toBe(91);
    expect(needsReview).toBe(9);
    expect(BANK_2025().every((r) => r.mappingStatus === 'needs_review' || r.microsyllabusId !== undefined)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2025 — Set A answer key: structural validation', () => {
  it('the persisted structure-issues export is empty — exactly 100 entries, Q1-Q100, only A/B/C/D, no missing/duplicate numbers', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_STRUCTURE_ISSUES).toEqual([]);
  });

  it('the raw answer-key file itself has exactly 100 entries covering Q1-Q100 with no duplicates', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.answerKey).toHaveLength(100);
    const numbers = UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.answerKey.map((e) => e.questionNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('every entry\'s correctOptionId is one of a/b/c/d', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.answerKey.every((e) => /^[a-dA-D]$/.test(e.correctOptionId))).toBe(true);
  });

  it('validateAnswerKeyStructure independently confirms zero issues against the Q1-Q100 range', () => {
    const issues = validateAnswerKeyStructure(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A, { min: 1, max: 100 });
    expect(issues).toEqual([]);
  });

  it('the key\'s set is "A" and it is scoped to year 2025, paper "GS Paper I" (distinct from the 2026 key)', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.set).toBe('A');
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.year).toBe(2025);
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.paper).toBe('GS Paper I');
  });
});

describe('UPSC CSE Prelims 2025 — Set A answer key: Q1-Q100 attachment', () => {
  it('all 100 entries attached, zero skipped', () => {
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_ATTACH_RESULT.attached).toBe(100);
    expect(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_ATTACH_RESULT.skipped).toEqual([]);
  });

  it('every 2025 record now carries a correctOptionId', () => {
    expect(BANK_2025().every((r) => r.correctOptionId !== undefined)).toBe(true);
  });

  it('every 2025 record\'s correctOptionId matches the supplied answer key exactly, by question number', () => {
    const byNumber = new Map(UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A.answerKey.map((e) => [e.questionNumber, e.correctOptionId]));
    for (const record of BANK_2025()) {
      expect(record.correctOptionId).toBe(byNumber.get(record.questionNumber!));
    }
  });

  it('every 2025 record\'s correctOptionId matches an existing option id for that exact question', () => {
    for (const record of BANK_2025()) {
      expect(record.options.some((o) => o.id === record.correctOptionId)).toBe(true);
    }
  });

  it('every 2025 record\'s answerKeySet is "A"', () => {
    expect(BANK_2025().every((r) => r.answerKeySet === 'A')).toBe(true);
  });

  it('the 2025 attach never touched the already-attached 2026 answers', () => {
    expect(BANK_2026().every((r) => r.answerKeySet === 'A')).toBe(true);
    const byNumber2026 = new Map(UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A.answerKey.map((e) => [e.questionNumber, e.correctOptionId]));
    for (const record of BANK_2026()) {
      expect(record.correctOptionId).toBe(byNumber2026.get(record.questionNumber!));
    }
  });
});

describe('UPSC CSE Prelims combined bank — all three exam sittings coexist without collision', () => {
  it('the combined bank holds exactly 300 records: 100 from 2026 + 100 from 2025 + 100 from 2024', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK).toHaveLength(300);
    expect(BANK_2026()).toHaveLength(100);
    expect(BANK_2025()).toHaveLength(100);
    expect(BANK_2024()).toHaveLength(100);
  });

  it('every record id is unique across the combined 300 (year is baked into each id, so Q1-2024/2025/2026 never collide)', () => {
    const ids = UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.id);
    expect(new Set(ids).size).toBe(300);
  });

  it('2024, 2025 and 2026 ids never collide with each other', () => {
    const ids2026 = new Set(BANK_2026().map((r) => r.id));
    const ids2025 = new Set(BANK_2025().map((r) => r.id));
    const ids2024 = BANK_2024().map((r) => r.id);
    expect(BANK_2025().map((r) => r.id).every((id) => !ids2026.has(id))).toBe(true);
    expect(ids2024.every((id) => !ids2026.has(id) && !ids2025.has(id))).toBe(true);
  });
});

describe('UPSC CSE Prelims 2026 — no duplicate IDs / no duplicate question numbers within 2026', () => {
  it('every 2026 record id is unique across the 2026 subset', () => {
    const ids = BANK_2026().map((r) => r.id);
    expect(new Set(ids).size).toBe(100);
  });

  it('every 2026 question number is unique across the 2026 subset', () => {
    const numbers = BANK_2026().map((r) => r.questionNumber);
    expect(new Set(numbers).size).toBe(100);
  });

  it('Q1-50 and Q51-100 ids never collide with each other', () => {
    const q1to50Ids = new Set(BANK_2026().filter((r) => r.questionNumber! <= 50).map((r) => r.id));
    const q51to100Ids = BANK_2026()
      .filter((r) => r.questionNumber! >= 51)
      .map((r) => r.id);
    expect(q51to100Ids.every((id) => !q1to50Ids.has(id))).toBe(true);
  });
});

describe('UPSC CSE Prelims — compatible with the existing interactive MCQ architecture', () => {
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

  it('correctOptionId — the one field these records previously could not honestly supply — is now present on every 2025/2026 record, sourced only from each year\'s own supplied Set A answer key (2024 has no answer key yet — see its own batch file header — so its records correctly stay undefined, never guessed)', () => {
    expect(BANK_2026().every((r) => typeof r.correctOptionId === 'string')).toBe(true);
    expect(BANK_2025().every((r) => typeof r.correctOptionId === 'string')).toBe(true);
    expect(BANK_2024().every((r) => r.correctOptionId === undefined)).toBe(true);
  });

  // PracticeQuestion still mandates `subject: SubjectColorKey` and `topicId` (both APFC-specific —
  // see lib/upscCsePyqImport.ts's own header) and `explanation`, none of which this task adds or
  // ever assigns here; that remains the one gap left between UpscCsePrelimsBatchPyq and PYQ itself.
});

describe('UPSC CSE Prelims — UPSC workspace isolation', () => {
  it('no record carries a workspaceId field — belongs to upsc_cse by construction, same as every other UPSC CSE data file', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BANK.every((r) => !('workspaceId' in r))).toBe(true);
  });

  it('does not populate or alter data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK (a separate, still-empty array)', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});

describe('UPSC CSE Prelims — APFC protection', () => {
  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, s) => sum + s.topics.length, 0)).toBe(134);
  });
});

describe('UPSC CSE Prelims — re-import does not duplicate any batch', () => {
  it('re-running 2026 Q1-50 through build + merge against the already-populated (300-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(300); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(50);
  });

  it('re-running 2026 Q51-100 through build + merge against the already-populated (300-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(300); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(50);
  });

  it('re-running the 2025 Q1-100 batch through build + merge against the already-populated (300-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(300); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(100);
  });

  it('re-running the 2024 Q1-100 batch through build + merge against the already-populated (300-record) bank adds nothing', () => {
    const reconversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const reimport = mergeUpscCsePrelimsPyqRecords(UPSC_CSE_PRELIMS_PYQ_BANK, reconversion.records);
    expect(reimport.merged).toHaveLength(300); // unchanged
    expect(reimport.addedCount).toBe(0);
    expect(reimport.duplicateCount).toBe(100);
  });

  it('re-running the two 2026 batches together against an empty bank reproduces the exact same 2026 100-record set', () => {
    const q1to50 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const firstMerge = mergeUpscCsePrelimsPyqRecords([], q1to50.records);
    const q51to100 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const secondMerge = mergeUpscCsePrelimsPyqRecords(firstMerge.merged, q51to100.records);
    expect(secondMerge.merged.map((r) => r.id).sort()).toEqual(BANK_2026().map((r) => r.id).sort());
  });

  it('re-running all four batches together (2026 Q1-50, 2026 Q51-100, 2025, 2024) against an empty bank reproduces the exact same combined 300-record set', () => {
    const q1to50 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
    const firstMerge = mergeUpscCsePrelimsPyqRecords([], q1to50.records);
    const q51to100 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const secondMerge = mergeUpscCsePrelimsPyqRecords(firstMerge.merged, q51to100.records);
    const batch2025 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const thirdMerge = mergeUpscCsePrelimsPyqRecords(secondMerge.merged, batch2025.records);
    const batch2024 = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
    const fourthMerge = mergeUpscCsePrelimsPyqRecords(thirdMerge.merged, batch2024.records);
    expect(fourthMerge.merged.map((r) => r.id).sort()).toEqual(UPSC_CSE_PRELIMS_PYQ_BANK.map((r) => r.id).sort());
  });
});

// UPSC CSE Prelims 2024 — the third exam sitting (see data/upscCsePrelimsPyqBatch2024Q1Q100Raw.ts's
// own header for full provenance/classification notes).
describe('UPSC CSE Prelims 2024 — exactly 100 questions, Q1-Q100', () => {
  it('the 2024 subset holds exactly 100 records', () => {
    expect(BANK_2024()).toHaveLength(100);
  });

  it('question numbers are exactly 1..100, each appearing once within 2024', () => {
    expect(BANK_2024().every((r) => r.questionNumber !== undefined)).toBe(true);
    const numbers = BANK_2024()
      .map((r) => r.questionNumber!)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('every 2024 record is year 2024, paper "GS Paper I"', () => {
    expect(BANK_2024().every((r) => r.year === 2024)).toBe(true);
    expect(BANK_2024().every((r) => r.paper === 'GS Paper I')).toBe(true);
  });

  it('every 2024 record\'s question text and options are byte-identical to the supplied batch', () => {
    for (const source of ALL_2024_RAW_QUESTIONS) {
      const record = BANK_2024().find((r) => r.questionNumber === source.questionNumber);
      expect(record, `record for Q${source.questionNumber}`).toBeDefined();
      expect(record!.question).toBe(source.question);
      expect(record!.options).toEqual(source.options);
    }
  });

  it('the 2024 batch itself carried no answer key (only a partial Q1-15 screenshot was supplied, never attached — see the batch file\'s own header)', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100_SUMMARY.answerKeyStatus).toBe('no_answer_key_supplied');
    expect(BANK_2024().every((r) => r.correctOptionId === undefined)).toBe(true);
    expect(BANK_2024().every((r) => r.answerKeySet === undefined)).toBe(true);
  });
});

describe('UPSC CSE Prelims 2024 — classification against the existing taxonomy', () => {
  it('89 mapped, 11 needs_review', () => {
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100_SUMMARY.mapped).toBe(89);
    expect(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100_SUMMARY.needsReview).toBe(11);
    const mapped = BANK_2024().filter((r) => r.mappingStatus === 'mapped').length;
    const needsReview = BANK_2024().filter((r) => r.mappingStatus === 'needs_review').length;
    expect(mapped).toBe(89);
    expect(needsReview).toBe(11);
  });

  it('every mapped 2024 record\'s microsyllabusId resolves to a real node in the actual syllabus tree (never invented)', () => {
    const mapped = BANK_2024().filter((r) => r.mappingStatus === 'mapped');
    expect(mapped.length).toBe(89);
    for (const record of mapped) {
      expect(record.microsyllabusId).toBeDefined();
      const node = getMicrosyllabusItemById(UPSC_CSE_PRELIMS_SYLLABUS, record.microsyllabusId!);
      expect(node, `microsyllabus node for "${record.microsyllabusId}"`).toBeDefined();
    }
  });

  it('the 11 needs_review finance/market-structure questions keep subject "Economic & Social Development" (defensible at subject level) but no microsyllabusId — never forced into a misleading item', () => {
    expect(NEEDS_REVIEW_2024_GAP_QUESTIONS).toHaveLength(11);
    for (const qn of NEEDS_REVIEW_2024_GAP_QUESTIONS) {
      const record = BANK_2024().find((r) => r.questionNumber === qn)!;
      expect(record, `record for 2024 Q${qn}`).toBeDefined();
      expect(record.mappingStatus).toBe('needs_review');
      expect(record.subject).toBe('Economic & Social Development');
      expect(record.microsyllabusId).toBeUndefined();
    }
  });

  it('no needs_review 2024 record outside the documented gap list has any microsyllabusId — the gap list is exhaustive', () => {
    const needsReview = BANK_2024().filter((r) => r.mappingStatus === 'needs_review');
    expect(needsReview.map((r) => r.questionNumber!).sort((a, b) => a - b)).toEqual([...NEEDS_REVIEW_2024_GAP_QUESTIONS].sort((a, b) => a - b));
    expect(needsReview.every((r) => r.microsyllabusId === undefined)).toBe(true);
  });
});
