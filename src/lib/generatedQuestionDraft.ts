// Unified Question Architecture, Stage 6H — the pure, deterministic workflow that turns an
// already-researched AuthoritativeSourceRecord + SourceConcept (Stage 6E) plus explicitly supplied
// question-authoring content into a GeneratedQuestionDraft, then runs it through every existing
// validation/quality gate. Pure and deterministic: no network access, no LLM call, and no invented
// factual content, source metadata, dates, PYQ ids, answers, or explanations — every fact in the
// resulting draft traces back to a field the caller supplied. It never creates a production-bank
// entry and never touches QUESTION_BANK, PYQ_BANK, syllabus, store, Supabase, routes, or UI.
//
// Reuse, not re-implementation — every check below is delegated to the stage that already owns it:
// - Source/concept structural validity and source<->concept linkage: generatedQuestionSource.ts
//   (Stage 6E)'s validateSourceRecord, validateSourceConcept, verifyConceptTopicExists, and
//   associateConceptsWithSource (used here as a single-concept membership check).
// - Draft construction: generatedQuestionAuthoring.ts (Stage 6C)'s
//   authoringInputToGeneratedQuestionDraft — this module only assembles the intermediate
//   GeneratedQuestionAuthoringInput from source/concept/content, it never maps those fields onto a
//   GeneratedQuestionDraft itself.
// - Question structure, topic linkage, provenance metadata, id-collision, and the
//   validated/publishable decision (does provenance.verificationStatus clear the bar): reused
//   directly from generatedQuestionPipeline.ts (Stage 6B, itself built on Stage 6A's
//   generatedQuestionValidation.ts — not re-imported here for the same reason Stage 6G doesn't:
//   the pipeline already owns and returns that outcome).
// - Calibration structural/referential validity: generatedQuestionCalibration.ts (Stage
//   6F)'s validateGeneratedQuestionCalibration.
// - The checks no earlier stage covers (exactly one correct option, no duplicate option text, no
//   wording claiming authenticity): reused directly from generatedQuestionQuality.ts (Stage 6G)'s
//   verifyExactlyOneCorrectOption / verifyNoDuplicateOptionText / verifyNoAuthenticityClaim.
import type { GeneratedQuestionDraft, SubjectColorKey, GeneratedVerificationStatus, QuestionOption } from './types';
import {
  validateSourceRecord,
  validateSourceConcept,
  verifyConceptTopicExists,
  associateConceptsWithSource,
  type AuthoritativeSourceRecord,
  type SourceConcept,
} from './generatedQuestionSource';
import { authoringInputToGeneratedQuestionDraft, type GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';
import { validateGeneratedQuestionCalibration, type GeneratedQuestionCalibration } from './generatedQuestionCalibration';
import { verifyExactlyOneCorrectOption, verifyNoDuplicateOptionText, verifyNoAuthenticityClaim } from './generatedQuestionQuality';

/** Exactly the question-authoring fields a human caller supplies directly — everything else
 * (topicId, the source metadata fields, calibratedAgainstPyqIds) is derived from `source`/
 * `concept`/`calibration` below, never re-typed by the caller and never invented by this module. */
export interface GeneratedQuestionDraftContent {
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  subject: SubjectColorKey;
  verificationStatus: GeneratedVerificationStatus;
}

export interface GeneratedQuestionDraftWorkflowInput {
  source: AuthoritativeSourceRecord;
  concept: SourceConcept;
  content: GeneratedQuestionDraftContent;
  calibration?: GeneratedQuestionCalibration;
}

/**
 * The three states this workflow can end in, matching the spec's own vocabulary:
 * - 'invalid': failed source, concept, source<->concept linkage, question structure, calibration,
 *   or APFC quality validation.
 * - 'validated': the "valid draft" state — every gate above passed, but provenance.verificationStatus
 *   (content.verificationStatus, carried straight through) is 'draft' or 'retired', so it is NOT
 *   yet publishable. Passing structural validation never promotes a draft to publishable by itself.
 * - 'publishable': the "publishable candidate" state — every gate passed AND
 *   provenance.verificationStatus is 'verified' or 'published'.
 *
 * `sourceConcept` on the two success variants is the exact SourceConcept object passed in
 * (untouched) — carrying `factualBasis` alongside `draft` is how this stage keeps the concept's
 * factual basis linked to the generated question without inventing a new field on
 * GeneratedProvenance to hold it.
 */
export type GeneratedQuestionDraftWorkflowResult =
  | { status: 'invalid'; errors: string[] }
  | { status: 'validated'; draft: GeneratedQuestionDraft; sourceConcept: SourceConcept }
  | { status: 'publishable'; draft: GeneratedQuestionDraft; sourceConcept: SourceConcept };

export interface GeneratedQuestionDraftWorkflowOptions {
  existingIds?: ReadonlySet<string>;
}

function toAuthoringInput(input: GeneratedQuestionDraftWorkflowInput): GeneratedQuestionAuthoringInput {
  return {
    question: input.content.question,
    options: input.content.options,
    correctOptionId: input.content.correctOptionId,
    explanation: input.content.explanation,
    subject: input.content.subject,
    topicId: input.concept.topicId,
    sourceAuthority: input.source.authority,
    sourceTitle: input.source.title,
    sourceReference: input.source.reference,
    sourcePublishedAt: input.source.publishedAt,
    concept: input.concept.topicId,
    calibratedAgainstPyqIds: input.calibration?.referencePyqIds,
    verificationStatus: input.content.verificationStatus,
  };
}

/**
 * Runs the full source-backed draft-generation workflow: (1) source validation, (2) concept
 * validation, (3) topic validation (the concept's own topicId, plus confirming the concept
 * actually belongs to `source`), (4) question structure validation, (5) calibration validation
 * when `input.calibration` is supplied, and (6) the APFC quality checks Stage 6G adds beyond the
 * pipeline. `id`/`generatedAt` are required, explicit, caller-supplied arguments — the same
 * determinism discipline every earlier authoring stage keeps — and `existingIds` feeds the
 * pipeline's id-collision check. Never mutates `input` or any of its nested objects.
 */
export function runGeneratedQuestionDraftWorkflow(
  input: GeneratedQuestionDraftWorkflowInput,
  id: string,
  generatedAt: string,
  options: GeneratedQuestionDraftWorkflowOptions = {},
): GeneratedQuestionDraftWorkflowResult {
  const { existingIds = new Set() } = options;

  // Steps 1-2: source and concept structural validation (Stage 6E, reused).
  const sourceErrors = validateSourceRecord(input.source);
  const conceptErrors = validateSourceConcept(input.concept);

  // Step 3: the concept's own topic must be real, and the concept must actually belong to this
  // source — reusing associateConceptsWithSource (Stage 6E) as a single-concept membership check
  // rather than re-implementing the sourceId comparison here.
  const topicErrors = verifyConceptTopicExists(input.concept);
  const association = associateConceptsWithSource(input.source, [input.concept]);
  const associationErrors =
    association.mismatched.length > 0
      ? [`concept.sourceId "${input.concept.sourceId}" does not match source.sourceId "${input.source.sourceId}".`]
      : [];

  const draft = authoringInputToGeneratedQuestionDraft(toAuthoringInput(input), id, generatedAt);

  // Step 4 (+ topic/provenance linkage + id-collision) and the validated/publishable decision:
  // reused verbatim from the Stage 6B pipeline.
  const pipelineResult = runGeneratedQuestionPipeline(draft, existingIds);
  const pipelineErrors = pipelineResult.status === 'invalid' ? pipelineResult.errors : [];

  // Step 5: calibration validation, only when calibration was actually supplied (Stage 6F, reused).
  const calibrationErrors = input.calibration ? validateGeneratedQuestionCalibration(input.calibration, draft.topicId) : [];

  // Step 6: the APFC quality checks the pipeline itself doesn't cover (Stage 6G, reused).
  const qualityErrors = [
    ...verifyExactlyOneCorrectOption(draft),
    ...verifyNoDuplicateOptionText(draft),
    ...verifyNoAuthenticityClaim(draft, input.calibration),
  ];

  const errors = [...sourceErrors, ...conceptErrors, ...topicErrors, ...associationErrors, ...pipelineErrors, ...calibrationErrors, ...qualityErrors];

  if (errors.length > 0) {
    return { status: 'invalid', errors };
  }

  // errors.length === 0 guarantees pipelineErrors was empty, so pipelineResult.status here is
  // 'validated' or 'publishable' — never 'invalid'. Its own PUBLISHABLE_VERIFICATION_STATUSES rule
  // is what decides that, not re-implemented here.
  return pipelineResult.status === 'publishable'
    ? { status: 'publishable', draft, sourceConcept: input.concept }
    : { status: 'validated', draft, sourceConcept: input.concept };
}
