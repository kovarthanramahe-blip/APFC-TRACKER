import type { PYQVerificationStatus } from './types';
import {
  deriveCandidateId,
  validateQuestionText,
  validateOptions,
  validateCorrectOption,
  validateYear,
  validateQuestionNumber,
  type UpscCsePrelimsPyq,
  type UpscCsePrelimsPyqOption,
  type UpscCsePrelimsValidationIssue,
} from './upscCsePyqImport';
import { getPapersForStage, getSubjectsForPaper, getMicrosyllabusForSubject, type UpscCseSyllabusTree } from './upscCseSyllabus';

// UPSC CSE Prelims PYQ Batch Import — integrates an already-prepared, pre-structured JSON batch
// (produced externally, outside this app — see this module's own header note below) into
// data/pyqUpscCsePrelims.ts's UPSC_CSE_PRELIMS_PYQ_BANK. Deliberately NOT the same code path as
// lib/upscCsePyqImport.ts's parseUpscCsePrelimsSource (DETECT from raw TEXT): a batch like this
// arrives already parsed into question/option/hint fields, so re-running it through a text parser
// would be pointless at best and lossy at worst. This module instead VALIDATEs each already-
// structured question (reusing lib/upscCsePyqImport.ts's own validators — one shared rulebook, not
// a second one) and RESOLVEs each `microsyllabusHint` against the real, stable microsyllabus ids in
// a supplied UpscCseSyllabusTree (see lib/upscCseSyllabus.ts) — never inventing an id, never
// creating a syllabus node, and never guessing a mapping it isn't confident about. A hint that
// doesn't EXACTLY match (case/whitespace-insensitive) a microsyllabus item title that actually
// exists under the hint's own named subject is left `needs_review`, with the record still stored
// (never silently dropped or reassigned to a different topic) — the resolved id is simply absent.
//
// UpscCsePrelimsBatchPyq reuses lib/upscCsePyqImport.ts's UpscCsePrelimsPyq shape (already the
// correct adapter for an objective UPSC CSE question with an optional, never-fabricated
// correctOptionId — see that module's own header for why lib/types.ts's PYQ can't represent this),
// adding exactly the two fields a pre-classified batch needs on top: the resolved microsyllabusId
// (when confidently mapped) and this record's own mappingStatus.
//
// Re-import safety: mergeUpscCsePrelimsPyqRecords dedupes purely by `id`, which deriveCandidateId
// computes deterministically from year+paper+questionNumber — so importing the exact same batch
// twice can never produce two records for the same question; the second run reports every one of
// them as a duplicate and adds nothing.

export interface UpscCsePrelimsPyqBatchQuestion {
  questionNumber: number;
  question: string;
  options: UpscCsePrelimsPyqOption[];
  /** null (not just absent) is how the supplied batch format spells "no answer key" — mapped to
   * `undefined` on the resulting record, matching UpscCsePrelimsPyq.correctOptionId's own contract. */
  correctOptionId: string | null;
  /** null when the batch's own preparation step didn't classify this question at all — distinct
   * from a classified-but-unmatched hint (see resolveMicrosyllabusHint), and always needs_review
   * either way, since there is nothing to resolve against. */
  subject: string | null;
  microsyllabusHint: string | null;
  /** As supplied by the batch — a blanket "this needs classifying" flag on every question in
   * practice, not itself a resolution. Never treated as the final mappingStatus; this module
   * computes that independently via resolveMicrosyllabusHint. */
  mappingStatus?: string;
}

export interface UpscCsePrelimsPyqBatchSource {
  kind: string;
  filename?: string;
  answerKeyProvided: boolean;
  verificationStatus: string;
}

/** The shape of an already-prepared, externally-produced batch file — see this module's own
 * header. Every field here is read verbatim; nothing is normalised or rewritten before being
 * copied onto the resulting UpscCsePrelimsBatchPyq records. */
export interface UpscCsePrelimsPyqBatchFile {
  schema: string;
  schemaVersion: number;
  exam: string;
  stage: string;
  paper: string;
  year: number;
  /** Informational only — never parsed or relied on for anything (question numbers themselves are
   * what matters). Different batches have supplied this as a string ("1-50") or a two-element
   * array ([51, 100]); both are accepted verbatim. */
  questionRange: string | number[];
  source: UpscCsePrelimsPyqBatchSource;
  /** Freeform notes from whatever externally produced this batch (e.g. "no answer key was
   * supplied") — informational only; nothing in this module reads it, but it is preserved on the
   * typed batch object exactly as supplied rather than being stripped. */
  important?: string[];
  questions: UpscCsePrelimsPyqBatchQuestion[];
}

export type MicrosyllabusMappingStatus = 'mapped' | 'needs_review';

/**
 * A single imported Prelims PYQ record, resolved against the stable microsyllabus tree. Belongs
 * exclusively to the UPSC CSE Prelims destination by construction (see
 * data/pyqUpscCsePrelims.ts) — no per-record workspaceId field, the same convention every other
 * UPSC CSE data file in this app already uses.
 */
export interface UpscCsePrelimsBatchPyq extends UpscCsePrelimsPyq {
  /** The resolved, stable microsyllabus id (see data/upscCsePrelimsSyllabus.ts) — present only
   * when mappingStatus is 'mapped'. Never a guessed/best-effort id. */
  microsyllabusId?: string;
  mappingStatus: MicrosyllabusMappingStatus;
  /** Which answer-key SET (e.g. "A") this record's correctOptionId was attached from — see
   * lib/upscCsePrelimsAnswerKeyAttach.ts. Absent whenever correctOptionId itself is absent; never
   * set independently of it. */
  answerKeySet?: string;
}

// ============================================================================================
// RESOLVE — microsyllabusHint -> a real, stable microsyllabus id, or an explicit needs_review.
// ============================================================================================

export interface MicrosyllabusHintResolution {
  status: MicrosyllabusMappingStatus;
  microsyllabusId?: string;
  /** Populated only when status is 'needs_review' — explains exactly why no confident match was
   * found, so a human reviewing needs_review records isn't left guessing either. */
  reason?: string;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolves one question's (subject, microsyllabusHint) pair against a specific paper within the
 * supplied syllabus tree. Confident ONLY on an exact (case/whitespace-insensitive) title match —
 * first the subject title within the named paper, then the microsyllabus item title within that
 * subject. Never fuzzy-matches, never falls back to a "closest" guess: anything short of an exact
 * match is reported as needs_review with a reason, exactly per this task's "do not guess" rule.
 */
export function resolveMicrosyllabusHint(
  tree: UpscCseSyllabusTree,
  paperId: string,
  subjectHint: string,
  microsyllabusHint: string,
): MicrosyllabusHintResolution {
  const subjects = getSubjectsForPaper(tree, paperId);
  const normalizedSubjectHint = normalizeTitle(subjectHint);
  const subject = subjects.find((s) => normalizeTitle(s.title) === normalizedSubjectHint);
  if (!subject) {
    return {
      status: 'needs_review',
      reason: `No subject titled "${subjectHint}" exists under this paper (available: ${subjects.map((s) => s.title).join(', ')}).`,
    };
  }

  const items = getMicrosyllabusForSubject(tree, subject.id);
  const normalizedItemHint = normalizeTitle(microsyllabusHint);
  const match = items.find((m) => normalizeTitle(m.title) === normalizedItemHint);
  if (!match) {
    return {
      status: 'needs_review',
      reason: `"${microsyllabusHint}" does not exactly match any microsyllabus item under "${subject.title}" (available: ${items.map((m) => m.title).join(', ')}).`,
    };
  }

  return { status: 'mapped', microsyllabusId: match.id };
}

// ============================================================================================
// VALIDATE + CONVERT — reuses lib/upscCsePyqImport.ts's own validators (never a second rulebook),
// plus batch-local duplicate-question-number detection.
// ============================================================================================

export interface RejectedUpscCsePrelimsBatchQuestion {
  questionNumber: number;
  issues: UpscCsePrelimsValidationIssue[];
}

export interface UpscCsePrelimsBatchConversionResult {
  /** False when the batch's own `paper` field doesn't match any paper in the supplied tree — every
   * question is then necessarily needs_review, since there is no paper to scope subject/
   * microsyllabus resolution to. */
  paperResolved: boolean;
  records: UpscCsePrelimsBatchPyq[];
  rejected: RejectedUpscCsePrelimsBatchQuestion[];
}

/**
 * DETECT is a no-op here — the batch arrives already structured (see this module's header) — so
 * this is VALIDATE (reusing lib/upscCsePyqImport.ts's own rules) + RESOLVE microsyllabus ids,
 * combined. Never mutates its inputs; never throws.
 */
export function buildUpscCsePrelimsBatchRecords(
  batch: UpscCsePrelimsPyqBatchFile,
  tree: UpscCseSyllabusTree,
  importedAt: string = new Date().toISOString(),
): UpscCsePrelimsBatchConversionResult {
  const paper = getPapersForStage(tree).find(
    (p) => normalizeTitle(p.title) === normalizeTitle(batch.paper) || normalizeTitle(p.shortTitle) === normalizeTitle(batch.paper),
  );

  const records: UpscCsePrelimsBatchPyq[] = [];
  const rejected: RejectedUpscCsePrelimsBatchQuestion[] = [];
  const seenQuestionNumbers = new Set<number>();

  for (const q of batch.questions) {
    const issues: UpscCsePrelimsValidationIssue[] = [];
    const textIssue = validateQuestionText(q.question);
    if (textIssue) issues.push(textIssue);
    issues.push(...validateOptions(q.options));
    const correctOptionIssue = validateCorrectOption(q.options, q.correctOptionId ?? undefined);
    if (correctOptionIssue) issues.push(correctOptionIssue);
    const yearIssue = validateYear(batch.year);
    if (yearIssue) issues.push(yearIssue);
    const questionNumberIssue = validateQuestionNumber(q.questionNumber);
    if (questionNumberIssue) issues.push(questionNumberIssue);
    if (seenQuestionNumbers.has(q.questionNumber)) {
      issues.push({ reason: 'duplicate_question', message: `Question number ${q.questionNumber} appears more than once in this batch.` });
    }
    seenQuestionNumbers.add(q.questionNumber);

    if (issues.length > 0) {
      rejected.push({ questionNumber: q.questionNumber, issues });
      continue;
    }

    const mapping: MicrosyllabusHintResolution = !paper
      ? { status: 'needs_review', reason: `Batch paper "${batch.paper}" does not match any paper in this syllabus tree.` }
      : q.subject === null || q.microsyllabusHint === null
        ? { status: 'needs_review', reason: 'No subject/microsyllabus classification was supplied for this question.' }
        : resolveMicrosyllabusHint(tree, paper.id, q.subject, q.microsyllabusHint);

    records.push({
      id: deriveCandidateId(batch.year, batch.paper, q.questionNumber),
      year: batch.year,
      paper: batch.paper,
      questionNumber: q.questionNumber,
      question: q.question,
      options: q.options,
      correctOptionId: q.correctOptionId ?? undefined,
      subject: q.subject ?? undefined,
      topic: q.microsyllabusHint ?? undefined,
      microsyllabusId: mapping.microsyllabusId,
      mappingStatus: mapping.status,
      provenance: {
        sourceFilename: batch.source.filename,
        importedAt,
        sourceKind: batch.source.kind,
        answerKeyProvided: batch.source.answerKeyProvided,
      },
      verificationStatus: (batch.source.verificationStatus as PYQVerificationStatus | undefined) ?? 'provisional',
    });
  }

  return { paperResolved: !!paper, records, rejected };
}

// ============================================================================================
// MERGE — the "normal validation/import mechanism" a batch is persisted through: pure, dedupes by
// stable id, never mutates its inputs. Importing the identical batch twice adds nothing the second
// time (see this module's header).
// ============================================================================================

export interface UpscCsePrelimsPyqMergeResult {
  merged: UpscCsePrelimsBatchPyq[];
  addedCount: number;
  duplicateCount: number;
  duplicateIds: string[];
}

export function mergeUpscCsePrelimsPyqRecords(
  existing: readonly UpscCsePrelimsBatchPyq[],
  incoming: readonly UpscCsePrelimsBatchPyq[],
): UpscCsePrelimsPyqMergeResult {
  const seenIds = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  const duplicateIds: string[] = [];
  for (const record of incoming) {
    if (seenIds.has(record.id)) {
      duplicateIds.push(record.id);
      continue;
    }
    seenIds.add(record.id);
    merged.push(record);
  }
  return { merged, addedCount: incoming.length - duplicateIds.length, duplicateCount: duplicateIds.length, duplicateIds };
}

// ============================================================================================
// SUMMARY — the validation summary this task's own instructions require be produced before
// persistence: total / valid / mapped / needs review / duplicates / answer-key status / destination.
// ============================================================================================

export interface UpscCsePrelimsPyqBatchValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  mapped: number;
  needsReview: number;
  duplicates: number;
  answerKeyStatus: 'no_answer_key_supplied' | 'answer_key_present';
  destination: string;
}

export function summarizeUpscCsePrelimsPyqBatch(
  batch: UpscCsePrelimsPyqBatchFile,
  conversion: UpscCsePrelimsBatchConversionResult,
  mergeResult: UpscCsePrelimsPyqMergeResult,
  destination: string,
): UpscCsePrelimsPyqBatchValidationSummary {
  return {
    total: batch.questions.length,
    valid: conversion.records.length,
    invalid: conversion.rejected.length,
    mapped: conversion.records.filter((r) => r.mappingStatus === 'mapped').length,
    needsReview: conversion.records.filter((r) => r.mappingStatus === 'needs_review').length,
    duplicates: mergeResult.duplicateCount,
    answerKeyStatus: conversion.records.some((r) => r.correctOptionId !== undefined) ? 'answer_key_present' : 'no_answer_key_supplied',
    destination,
  };
}
