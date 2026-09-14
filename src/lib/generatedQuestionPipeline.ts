// Unified Question Architecture, Stage 6B — the authoring pipeline foundation for a manually
// supplied source-backed GeneratedQuestionDraft (lib/types.ts). Pure and deterministic: no network
// access, no LLM call, no mutation of its input, and it never touches QUESTION_BANK or PYQ_BANK —
// this stage still creates no generated questions and publishes nothing. Its only job is to run
// the four explicit validation stages already defined in lib/generatedQuestionValidation.ts
// (reused verbatim, never re-implemented here) and decide which of three states the draft reached:
// invalid, validated (structurally sound, but not cleared for use), or publishable (structurally
// sound AND its own provenance says it's ready).
import type { GeneratedQuestionDraft } from './types';
import { validateSourceMetadata, validateQuestionStructure, validateTopicLinkage, validateCalibrationIds } from './generatedQuestionValidation';

/** Per-stage error lists, alongside the same errors flattened into one array — lets a caller show
 * either "everything wrong" or "what's wrong with the source metadata specifically" without
 * re-running any validation. */
export interface GeneratedQuestionStageErrors {
  sourceMetadata: string[];
  questionStructure: string[];
  topicLinkage: string[];
  calibrationIds: string[];
}

/**
 * The three states a draft can reach — never conflated:
 * - 'invalid': failed one or more of the four structural/provenance stages.
 * - 'validated': passed every stage, but its provenance.verificationStatus is 'draft' or
 *   'retired' — structurally sound is NOT the same thing as reviewed-and-approved. A candidate
 *   never becomes publishable merely by being well-formed.
 * - 'publishable': passed every stage AND provenance.verificationStatus is 'verified' or
 *   'published' — the only state in which a future stage could ever consider adding this to a
 *   bank or catalog. This stage does not do that; it only decides whether the gate is open.
 *
 * `candidate` in the 'validated'/'publishable' cases is the exact same draft object passed in
 * (never copied or transformed) — source metadata and calibration metadata pass through unchanged
 * because nothing here ever writes to them.
 */
export type GeneratedQuestionPipelineResult =
  | { status: 'invalid'; stageErrors: GeneratedQuestionStageErrors; errors: string[] }
  | { status: 'validated'; candidate: GeneratedQuestionDraft }
  | { status: 'publishable'; candidate: GeneratedQuestionDraft };

const PUBLISHABLE_VERIFICATION_STATUSES: readonly GeneratedQuestionDraft['provenance']['verificationStatus'][] = ['verified', 'published'];

/**
 * Runs the four explicit stages over `draft` in order, then decides validity/publishability.
 * `existingIds`, when supplied, feeds Stage 2's id-collision check (e.g. the caller might pass the
 * union of existing PYQ_BANK/QUESTION_BANK ids) — the only "duplicate" concern anywhere in this
 * pipeline, and a plain deterministic Set lookup, never a similarity/AI check.
 */
export function runGeneratedQuestionPipeline(draft: GeneratedQuestionDraft, existingIds: ReadonlySet<string> = new Set()): GeneratedQuestionPipelineResult {
  // Stage 1: source/provenance metadata.
  const sourceMetadata = validateSourceMetadata(draft.provenance);
  // Stage 2: question structure/options/correct answer.
  const questionStructure = validateQuestionStructure(draft, existingIds);
  // Stage 3: syllabus topic linkage.
  const topicLinkage = validateTopicLinkage(draft);
  // Stage 4: optional PYQ calibration ids.
  const calibrationIds = validateCalibrationIds(draft.provenance);

  const stageErrors: GeneratedQuestionStageErrors = { sourceMetadata, questionStructure, topicLinkage, calibrationIds };
  const errors = [...sourceMetadata, ...questionStructure, ...topicLinkage, ...calibrationIds];

  // Stage 5: typed result.
  if (errors.length > 0) {
    return { status: 'invalid', stageErrors, errors };
  }

  const publishable = PUBLISHABLE_VERIFICATION_STATUSES.includes(draft.provenance.verificationStatus);
  return publishable ? { status: 'publishable', candidate: draft } : { status: 'validated', candidate: draft };
}
