// Unified Question Architecture, Stage 6A — pure validation for a candidate source-backed
// generated question (GeneratedQuestionDraft, lib/types.ts), ahead of any real generation
// pipeline. This module never fetches the network, never mutates its input, and never touches
// QUESTION_BANK or PYQ_BANK — it only decides whether a draft is well-formed enough to even be
// considered. No question-generation, source-import, or similarity/AI logic lives here; ID
// collision checking is the only "duplicate" concern this stage handles, and it's a plain Set
// lookup the caller supplies, not anything approximate.
import type { GeneratedQuestionDraft, GeneratedVerificationStatus } from './types';
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

/**
 * Validates a candidate generated question's base fields (id/subject/topic/question/options/
 * explanation) and its GeneratedProvenance, returning every violation found rather than stopping
 * at the first — so a caller (a future review UI, most likely) can show a complete list at once.
 *
 * `existingIds`, when supplied, is checked for a collision with `draft.id` — the only "duplicate"
 * check this stage performs, and deliberately a plain, deterministic Set membership test (e.g. the
 * caller might pass the union of existing PYQ_BANK/QUESTION_BANK ids), not a similarity check
 * against question text, which is explicitly out of scope for this stage.
 */
export function validateGeneratedQuestion(draft: GeneratedQuestionDraft, existingIds: ReadonlySet<string> = new Set()): GeneratedQuestionValidationResult {
  const errors: string[] = [];

  // --- Base question fields ---
  if (!isNonEmptyString(draft.id)) {
    errors.push('id is required.');
  } else if (existingIds.has(draft.id)) {
    errors.push(`id "${draft.id}" collides with an existing question id.`);
  }

  if (!isNonEmptyString(draft.subject) || !(draft.subject in SUBJECT_COLORS)) {
    errors.push('subject must be a recognised syllabus subject.');
  }

  if (!isNonEmptyString(draft.topicId)) {
    errors.push('topicId is required.');
  } else if (!(draft.topicId in TOPIC_TITLES)) {
    errors.push(`topicId "${draft.topicId}" does not match a known syllabus topic.`);
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

  // --- Provenance fields ---
  const p = draft.provenance;
  if (p?.kind !== 'generated') {
    errors.push('provenance.kind must be "generated".');
  }
  if (!isNonEmptyString(p?.sourceAuthority)) errors.push('provenance.sourceAuthority is required.');
  if (!isNonEmptyString(p?.sourceTitle)) errors.push('provenance.sourceTitle is required.');
  if (!isNonEmptyString(p?.sourceReference)) errors.push('provenance.sourceReference is required (a URL or an official document reference).');
  if (p?.sourcePublishedAt !== undefined && !isValidIsoDate(p.sourcePublishedAt)) {
    errors.push('provenance.sourcePublishedAt, if present, must be a valid date.');
  }
  if (!isNonEmptyString(p?.topicId)) {
    errors.push('provenance.topicId is required.');
  } else if (!(p.topicId in TOPIC_TITLES)) {
    errors.push(`provenance.topicId "${p.topicId}" does not match a known syllabus topic.`);
  }
  if (p?.calibratedAgainstPyqIds !== undefined) {
    if (!Array.isArray(p.calibratedAgainstPyqIds)) {
      errors.push('provenance.calibratedAgainstPyqIds, if present, must be an array of PYQ ids.');
    } else if (p.calibratedAgainstPyqIds.some((id) => !isNonEmptyString(id))) {
      errors.push('provenance.calibratedAgainstPyqIds must not contain empty ids.');
    }
  }
  if (!p || !GENERATED_VERIFICATION_STATUSES.includes(p.verificationStatus)) {
    errors.push(`provenance.verificationStatus must be one of: ${GENERATED_VERIFICATION_STATUSES.join(', ')}.`);
  }
  if (!isNonEmptyString(p?.generatedAt)) {
    errors.push('provenance.generatedAt is required.');
  } else if (!isValidIsoDate(p.generatedAt)) {
    errors.push('provenance.generatedAt must be a valid ISO timestamp.');
  }

  return { valid: errors.length === 0, errors };
}
