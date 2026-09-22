import { validateCorrectOption } from './upscCsePyqImport';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims Answer Key Attach — attaches an already-prepared, externally-supplied answer
// key onto the existing UPSC_CSE_PRELIMS_PYQ_BANK (data/pyqUpscCsePrelims.ts). Never derives,
// researches, or guesses an answer: every correctOptionId this module ever sets comes verbatim from
// the supplied answer-key file, and ONLY when it exactly matches one of that question's own,
// already-stored option ids (reusing lib/upscCsePyqImport.ts's own validateCorrectOption — one
// shared rulebook, not a second one). An entry whose stated letter doesn't match any real option
// for that question is never force-attached; it is reported and the record's correctOptionId stays
// exactly as it was (absent, if nothing had been attached to it before).
//
// Deliberately does NOT touch mappingStatus, microsyllabusId, question text, options, provenance,
// year, or paper on any record — this module's only effect is adding correctOptionId (and, on the
// SAME record, answerKeySet, which preserves which answer-key edition the letter came from) to
// records the answer key actually covers.

export interface UpscCsePrelimsAnswerKeyEntry {
  questionNumber: number;
  correctOptionId: string;
}

export interface UpscCsePrelimsAnswerKeySource {
  kind: string;
  verificationStatus: string;
}

/** The shape of an already-prepared, externally-produced answer-key file. Every field is read
 * verbatim; nothing is normalised or rewritten before being copied onto a matched record. */
export interface UpscCsePrelimsAnswerKeyFile {
  schema: string;
  schemaVersion: number;
  exam: string;
  stage: string;
  paper: string;
  year: number;
  /** e.g. "A" — UPSC Prelims papers are printed in multiple randomised option-orderings ("sets"),
   * each with its own answer key. Preserved on every record this key attaches to (see
   * UpscCsePrelimsBatchPyq.answerKeySet below) rather than being collapsed away. */
  set: string;
  source: UpscCsePrelimsAnswerKeySource;
  answerKey: UpscCsePrelimsAnswerKeyEntry[];
}

// ============================================================================================
// VALIDATE — the answer-key file's own internal structure, independent of any question bank:
// exactly the expected entry count, no missing/duplicate question numbers, no option letter
// outside A-D. This is what this task's own "validation summary" checklist requires be checked
// BEFORE any attachment happens.
// ============================================================================================

export type AnswerKeyStructureIssueReason =
  | 'wrong_entry_count'
  | 'invalid_question_number'
  | 'duplicate_question_number'
  | 'missing_question_number'
  | 'invalid_option_letter';

export interface AnswerKeyStructureIssue {
  reason: AnswerKeyStructureIssueReason;
  message: string;
  questionNumber?: number;
}

const VALID_OPTION_LETTERS = /^[a-dA-D]$/;

/**
 * Validates an answer-key file against an expected, contiguous question-number range (e.g.
 * Q1-Q100) — never mutates its input, never throws. An empty result means the file is exactly the
 * expected shape: `max - min + 1` entries, one per question number in range, each with a letter in
 * A-D. Whether each letter actually matches a REAL option for its question needs the question bank
 * too — see attachUpscCsePrelimsAnswerKey below, which performs that check separately.
 */
export function validateAnswerKeyStructure(
  file: UpscCsePrelimsAnswerKeyFile,
  expectedRange: { min: number; max: number },
): AnswerKeyStructureIssue[] {
  const issues: AnswerKeyStructureIssue[] = [];
  const expectedCount = expectedRange.max - expectedRange.min + 1;

  if (file.answerKey.length !== expectedCount) {
    issues.push({
      reason: 'wrong_entry_count',
      message: `Expected exactly ${expectedCount} answer-key entries (Q${expectedRange.min}-Q${expectedRange.max}), found ${file.answerKey.length}.`,
    });
  }

  const seen = new Set<number>();
  for (const entry of file.answerKey) {
    if (!Number.isInteger(entry.questionNumber) || entry.questionNumber < expectedRange.min || entry.questionNumber > expectedRange.max) {
      issues.push({
        reason: 'invalid_question_number',
        message: `Question number ${entry.questionNumber} is outside the expected Q${expectedRange.min}-Q${expectedRange.max} range.`,
        questionNumber: entry.questionNumber,
      });
      continue;
    }
    if (seen.has(entry.questionNumber)) {
      issues.push({
        reason: 'duplicate_question_number',
        message: `Question number ${entry.questionNumber} appears more than once in the answer key.`,
        questionNumber: entry.questionNumber,
      });
    }
    seen.add(entry.questionNumber);

    if (!VALID_OPTION_LETTERS.test(entry.correctOptionId)) {
      issues.push({
        reason: 'invalid_option_letter',
        message: `"${entry.correctOptionId}" for Q${entry.questionNumber} is not one of A/B/C/D.`,
        questionNumber: entry.questionNumber,
      });
    }
  }

  for (let n = expectedRange.min; n <= expectedRange.max; n++) {
    if (!seen.has(n)) {
      issues.push({ reason: 'missing_question_number', message: `No answer-key entry found for question ${n}.`, questionNumber: n });
    }
  }

  return issues;
}

// ============================================================================================
// ATTACH — folds a validated answer key onto an existing UPSC_CSE_PRELIMS_PYQ_BANK. Pure: returns
// a NEW array, never mutates `bank` or `answerKeyFile`.
// ============================================================================================

export interface UpscCsePrelimsAnswerKeySkippedEntry {
  questionNumber: number;
  reason: string;
}

export interface AttachAnswerKeyResult {
  /** Same length and order as the input bank — every record either unchanged, or a new object with
   * correctOptionId/answerKeySet added. */
  updated: UpscCsePrelimsBatchPyq[];
  attached: number;
  skipped: UpscCsePrelimsAnswerKeySkippedEntry[];
}

/**
 * Attaches `answerKeyFile`'s entries onto `bank`, matched by (year, paper, questionNumber). An
 * entry only ever attaches when: (1) a bank record with that exact year/paper/questionNumber
 * exists, and (2) validateCorrectOption confirms the stated letter matches one of THAT record's own
 * options. Anything else is reported in `skipped`, never force-attached, and the record in question
 * is returned completely unchanged (including if it already had no correctOptionId — this function
 * never removes or overwrites a correctOptionId that fails these checks).
 */
export function attachUpscCsePrelimsAnswerKey(bank: readonly UpscCsePrelimsBatchPyq[], answerKeyFile: UpscCsePrelimsAnswerKeyFile): AttachAnswerKeyResult {
  const entryByQuestionNumber = new Map(answerKeyFile.answerKey.map((e) => [e.questionNumber, e]));
  const skipped: UpscCsePrelimsAnswerKeySkippedEntry[] = [];
  let attached = 0;

  const updated = bank.map((record) => {
    if (record.year !== answerKeyFile.year || record.paper !== answerKeyFile.paper) return record;
    if (record.questionNumber === undefined) return record;

    const entry = entryByQuestionNumber.get(record.questionNumber);
    if (!entry) return record; // no answer-key coverage for this question — left exactly as-is

    const issue = validateCorrectOption(record.options, entry.correctOptionId);
    if (issue) {
      skipped.push({ questionNumber: record.questionNumber, reason: issue.message });
      return record;
    }

    attached++;
    return { ...record, correctOptionId: entry.correctOptionId, answerKeySet: answerKeyFile.set };
  });

  // Defensive: an answer-key entry whose question number matches NO record in this bank at all
  // (shouldn't happen for an answer key covering exactly the same range as the bank, but never
  // silently dropped either).
  const bankQuestionNumbers = new Set(
    bank.filter((r) => r.year === answerKeyFile.year && r.paper === answerKeyFile.paper).map((r) => r.questionNumber),
  );
  for (const entry of answerKeyFile.answerKey) {
    if (!bankQuestionNumbers.has(entry.questionNumber)) {
      skipped.push({
        questionNumber: entry.questionNumber,
        reason: `No existing record found for Q${entry.questionNumber} (year ${answerKeyFile.year}, paper "${answerKeyFile.paper}").`,
      });
    }
  }

  return { updated, attached, skipped };
}
