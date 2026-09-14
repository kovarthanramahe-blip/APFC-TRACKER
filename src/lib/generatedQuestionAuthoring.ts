// Unified Question Architecture, Stage 6C — the authoring data contract for a manually supplied
// source-backed generated question. Pure and deterministic: no network access, no question
// generation, and no touching QUESTION_BANK/PYQ_BANK. This module owns exactly one job — mapping
// a human-filled-out GeneratedQuestionAuthoringInput into the GeneratedQuestionDraft shape Stage
// 6A/6B already validate — and never re-implements any validation rule itself.
import type { SubjectColorKey, GeneratedVerificationStatus, GeneratedQuestionDraft, QuestionOption } from './types';
import { runGeneratedQuestionPipeline, type GeneratedQuestionPipelineResult } from './generatedQuestionPipeline';

/**
 * What a human author actually fills in for one candidate question. Deliberately excludes `id`
 * and `generatedAt`: assigning an id (and checking it doesn't collide with an existing question)
 * and stamping a generation timestamp are registration concerns, not authoring content — handing
 * them to the converter as separate, explicit arguments (rather than defaulting them internally)
 * is what keeps the conversion deterministic and keeps this module from inventing either one.
 *
 * `topicId` is the syllabus topic this question is filed under; `concept` is the (possibly more
 * specific) syllabus topic it was actually generated for/calibrated against — see
 * GeneratedProvenance.topicId's own doc comment in lib/types.ts, which uses that exact phrase.
 * They are very often the same topic, but the format keeps them as two distinct authoring
 * questions ("where does this belong" vs. "what concept was this built from") rather than
 * collapsing them.
 */
export interface GeneratedQuestionAuthoringInput {
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  subject: SubjectColorKey;
  topicId: string;
  sourceAuthority: string;
  sourceTitle: string;
  sourceReference: string;
  /** The source's own publication/effective date, when available — omit entirely when unknown;
   * never defaulted to "now" or any other invented value. */
  sourcePublishedAt?: string;
  concept: string;
  calibratedAgainstPyqIds?: string[];
  verificationStatus: GeneratedVerificationStatus;
}

/**
 * Deterministically maps authoring content into a GeneratedQuestionDraft — a pure field-by-field
 * passthrough with no derived, defaulted, or invented values anywhere. `id` and `generatedAt` are
 * required arguments precisely so this function can't fabricate either one: the same
 * (input, id, generatedAt) triple always produces the same draft, and an absent
 * `sourcePublishedAt`/`calibratedAgainstPyqIds` in `input` stays absent in the result.
 */
export function authoringInputToGeneratedQuestionDraft(input: GeneratedQuestionAuthoringInput, id: string, generatedAt: string): GeneratedQuestionDraft {
  return {
    id,
    subject: input.subject,
    topicId: input.topicId,
    question: input.question,
    options: input.options,
    correctOptionId: input.correctOptionId,
    explanation: input.explanation,
    provenance: {
      kind: 'generated',
      sourceAuthority: input.sourceAuthority,
      sourceTitle: input.sourceTitle,
      sourceReference: input.sourceReference,
      sourcePublishedAt: input.sourcePublishedAt,
      topicId: input.concept,
      calibratedAgainstPyqIds: input.calibratedAgainstPyqIds,
      verificationStatus: input.verificationStatus,
      generatedAt,
    },
  };
}

/**
 * Converts, then immediately runs the existing Stage 6B pipeline over the result — the intended
 * end-to-end entry point for this module, so a caller never has to remember to validate
 * separately. Reuses runGeneratedQuestionPipeline verbatim; no validation rule is repeated here.
 */
export function authorGeneratedQuestion(
  input: GeneratedQuestionAuthoringInput,
  id: string,
  generatedAt: string,
  existingIds: ReadonlySet<string> = new Set(),
): GeneratedQuestionPipelineResult {
  const draft = authoringInputToGeneratedQuestionDraft(input, id, generatedAt);
  return runGeneratedQuestionPipeline(draft, existingIds);
}
