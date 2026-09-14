// Unified Question Architecture, Stage 6A/6B — pure validation for a candidate source-backed
// generated question (GeneratedQuestionDraft, lib/types.ts), ahead of any real generation
// pipeline. This module never fetches the network, never mutates its input, and never touches
// QUESTION_BANK or PYQ_BANK — it only decides whether a draft is well-formed enough to even be
// considered. No question-generation, source-import, or similarity/AI logic lives here; ID
// collision checking is the only "duplicate" concern this stage handles, and it's a plain Set
// lookup the caller supplies, not anything approximate.
//
// Rules are split into four focused, independently-exported functions — one per pipeline stage in
// lib/generatedQuestionPipeline.ts (Stage 6B) — so the pipeline can run them as explicit stages
// without duplicating any rule. validateGeneratedQuestion (Stage 6A's original entry point) is now
// a thin composition of all four, kept for any caller that just wants one combined result.
import type { GeneratedQuestionDraft, GeneratedProvenance, GeneratedVerificationStatus } from './types';
import { TOPIC_TITLES } from './pyqPerformance';
import { SUBJECT_COLORS } from './utils';

export const GENERATED_VERIFICATION_STATUSES: readonly GeneratedVerificationStatus[] = ['draft', 'verified', 'published', 'retired'];

export interface GeneratedQuestionValidationResult {
  valid: boolean;
  /** Human-readable, one entry per violated rule. Empty exactly when `valid` is true. */
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/** Stage 1 — source/provenance metadata: who published it, what it's called, where to find it,
 * and its review lifecycle state. Never checks topicId or calibratedAgainstPyqIds — those are
 * their own stages below, kept separate so a caller can report exactly which concern failed. */
export function validateSourceMetadata(provenance: GeneratedProvenance | undefined): string[] {
  const errors: string[] = [];
  if (provenance?.kind !== 'generated') errors.push('provenance.kind must be "generated".');
  if (!isNonEmptyString(provenance?.sourceAuthority)) errors.push('provenance.sourceAuthority is required.');
  if (!isNonEmptyString(provenance?.sourceTitle)) errors.push('provenance.sourceTitle is required.');
  if (!isNonEmptyString(provenance?.sourceReference)) errors.push('provenance.sourceReference is required (a URL or an official document reference).');
  if (provenance?.sourcePublishedAt !== undefined && !isValidIsoDate(provenance.sourcePublishedAt)) {
    errors.push('provenance.sourcePublishedAt, if present, must be a valid date.');
  }
  if (!provenance || !GENERATED_VERIFICATION_STATUSES.includes(provenance.verificationStatus)) {
    errors.push(`provenance.verificationStatus must be one of: ${GENERATED_VERIFICATION_STATUSES.join(', ')}.`);
  }
  if (!isNonEmptyString(provenance?.generatedAt)) {
    errors.push('provenance.generatedAt is required.');
  } else if (!isValidIsoDate(provenance.generatedAt)) {
    errors.push('provenance.generatedAt must be a valid ISO timestamp.');
  }
  return errors;
}

/** Stage 2 — question structure: id (+ collision against `existingIds`), subject, question text,
 * options (≥2, non-empty, unique ids), correctOptionId resolving to a real option, explanation. */
export function validateQuestionStructure(draft: GeneratedQuestionDraft, existingIds: ReadonlySet<string> = new Set()): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(draft.id)) {
    errors.push('id is required.');
  } else if (existingIds.has(draft.id)) {
    errors.push(`id "${draft.id}" collides with an existing question id.`);
  }

  if (!isNonEmptyString(draft.subject) || !(draft.subject in SUBJECT_COLORS)) {
    errors.push('subject must be a recognised syllabus subject.');
  }

  if (!isNonEmptyString(draft.question)) {
    errors.push('question text is required.');
  }

  if (!Array.isArray(draft.options) || draft.options.length < 2) {
    errors.push('at least two options are required.');
  } else {
    const seenOptionIds = new Set<string>();
    for (const opt of draft.options) {
      if (!isNonEmptyString(opt?.id)) errors.push('every option must have a non-empty id.');
      else if (seenOptionIds.has(opt.id)) errors.push(`duplicate option id "${opt.id}".`);
      else seenOptionIds.add(opt.id);
      if (!isNonEmptyString(opt?.text)) errors.push(`option "${opt?.id ?? '?'}" must have non-empty text.`);
    }
    if (!isNonEmptyString(draft.correctOptionId) || !draft.options.some((o) => o.id === draft.correctOptionId)) {
      errors.push('correctOptionId must match the id of one of the provided options.');
    }
  }

  if (!isNonEmptyString(draft.explanation)) {
    errors.push('explanation is required.');
  }

  return errors;
}

/** Stage 3 — syllabus topic linkage: both the draft's own PracticeQuestion.topicId and its
 * provenance's topicId (Stage 6A's audit-trail field) must reference a real syllabus topic, via
 * the same TOPIC_TITLES lookup PYQTest.tsx and the rest of the app already use. */
export function validateTopicLinkage(draft: GeneratedQuestionDraft): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(draft.topicId)) {
    errors.push('topicId is required.');
  } else if (!(draft.topicId in TOPIC_TITLES)) {
    errors.push(`topicId "${draft.topicId}" does not match a known syllabus topic.`);
  }

  const provenanceTopicId = draft.provenance?.topicId;
  if (!isNonEmptyString(provenanceTopicId)) {
    errors.push('provenance.topicId is required.');
  } else if (!(provenanceTopicId in TOPIC_TITLES)) {
    errors.push(`provenance.topicId "${provenanceTopicId}" does not match a known syllabus topic.`);
  }

  return errors;
}

/** Stage 4 — optional PYQ calibration ids: if present at all, must be an array of non-empty
 * strings. Never validated against PYQ_BANK itself — confirming a calibration id refers to a real
 * PYQ is a judgement call for whoever reviews the candidate, not a structural rule. */
export function validateCalibrationIds(provenance: GeneratedProvenance | undefined): string[] {
  const errors: string[] = [];
  if (provenance?.calibratedAgainstPyqIds !== undefined) {
    if (!Array.isArray(provenance.calibratedAgainstPyqIds)) {
      errors.push('provenance.calibratedAgainstPyqIds, if present, must be an array of PYQ ids.');
    } else if (provenance.calibratedAgainstPyqIds.some((id) => !isNonEmptyString(id))) {
      errors.push('provenance.calibratedAgainstPyqIds must not contain empty ids.');
    }
  }
  return errors;
}

/**
 * Validates a candidate generated question's base fields and its GeneratedProvenance in one call,
 * returning every violation found across all four stages rather than stopping at the first — so a
 * caller (a future review UI, most likely) can show a complete list at once. A thin composition of
 * validateSourceMetadata / validateQuestionStructure / validateTopicLinkage / validateCalibrationIds
 * — see lib/generatedQuestionPipeline.ts for the explicit staged version of the same rules.
 */
export function validateGeneratedQuestion(draft: GeneratedQuestionDraft, existingIds: ReadonlySet<string> = new Set()): GeneratedQuestionValidationResult {
  const errors = [
    ...validateSourceMetadata(draft.provenance),
    ...validateQuestionStructure(draft, existingIds),
    ...validateTopicLinkage(draft),
    ...validateCalibrationIds(draft.provenance),
  ];
  return { valid: errors.length === 0, errors };
}
