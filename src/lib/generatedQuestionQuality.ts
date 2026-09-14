// Unified Question Architecture, Stage 6G — the pure quality/specification layer defining what a
// source-backed generated APFC question must satisfy before a human reviewer can call it
// acceptable. Pure and deterministic: no network access, no LLM call, no question generation, and
// no automatic numeric scoring — a reviewer supplies the dimension ratings and the verdict; this
// module only checks that those ratings use explicit allowed values and that the underlying draft
// clears every deterministic structural/provenance/calibration gate already defined in earlier
// stages. It never touches QUESTION_BANK, PYQ_BANK, or the syllabus.
//
// Reuse, not re-implementation: structural/provenance/topic validation is delegated to
// runGeneratedQuestionPipeline (Stage 6B), which itself composes generatedQuestionValidation.ts's
// (Stage 6A) four rule stages — so this module never re-imports or re-runs those rules directly,
// it only reads the pipeline's result. Calibration validation is delegated to
// generatedQuestionCalibration.ts's validateGeneratedQuestionCalibration (Stage 6F). Converting
// authoring input into a draft is delegated to generatedQuestionAuthoring.ts's
// authoringInputToGeneratedQuestionDraft (Stage 6C). The only genuinely new checks added here are
// ones no earlier stage defines: "exactly one correct option" (a stricter framing than the
// pipeline's "correctOptionId resolves to some option"), "no duplicate option text" (the pipeline
// only rejects duplicate option *ids*), and the authenticity-claim guard applied to the draft's own
// question/explanation text (Stage 6F's isCalibrationClaimingAuthenticity is reused as-is for the
// calibration rationale, since that check already exists for that exact field).
import type { GeneratedQuestionDraft } from './types';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';
import { authoringInputToGeneratedQuestionDraft, type GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { validateGeneratedQuestionCalibration, isCalibrationClaimingAuthenticity, type GeneratedQuestionCalibration } from './generatedQuestionCalibration';

export const QUALITY_RATINGS = ['needs_improvement', 'adequate', 'strong'] as const;
export type QualityRating = (typeof QUALITY_RATINGS)[number];

export const DIFFICULTY_APPROPRIATENESS_LEVELS = ['too_easy', 'appropriate', 'too_hard'] as const;
export type DifficultyAppropriateness = (typeof DIFFICULTY_APPROPRIATENESS_LEVELS)[number];

export const QUALITY_VERDICTS = ['needs_revision', 'acceptable', 'strong'] as const;
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];

/** The eight explicit quality dimensions a reviewer rates. Every field save `difficulty` uses the
 * shared QualityRating scale; `difficulty` uses its own appropriateness scale, since "is this
 * difficulty right for APFC" is a different question from "is this good." */
export interface QualityDimensionAssessments {
  factualAccuracyProvenance: QualityRating;
  syllabusTopicAlignment: QualityRating;
  conceptualDepth: QualityRating;
  apfcPyqStyleFraming: QualityRating;
  optionDistractorQuality: QualityRating;
  difficulty: DifficultyAppropriateness;
  explanationQuality: QualityRating;
  duplicationAuthenticPyqSeparation: QualityRating;
}

export interface GeneratedQuestionQualityAssessment {
  generatedQuestionId: string;
  dimensions: QualityDimensionAssessments;
  verdict: QualityVerdict;
  rationale: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function verifyAssessmentGeneratedQuestionId(assessment: GeneratedQuestionQualityAssessment): string[] {
  return isNonEmptyString(assessment.generatedQuestionId) ? [] : ['generatedQuestionId is required.'];
}

/** Every dimension must use one of its explicit allowed values — no free-text ratings. */
export function verifyQualityDimensions(dimensions: QualityDimensionAssessments): string[] {
  const errors: string[] = [];
  const ratingFields: (keyof QualityDimensionAssessments)[] = [
    'factualAccuracyProvenance',
    'syllabusTopicAlignment',
    'conceptualDepth',
    'apfcPyqStyleFraming',
    'optionDistractorQuality',
    'explanationQuality',
    'duplicationAuthenticPyqSeparation',
  ];
  for (const field of ratingFields) {
    if (!QUALITY_RATINGS.includes(dimensions?.[field] as QualityRating)) {
      errors.push(`dimensions.${field} must be one of: ${QUALITY_RATINGS.join(', ')}.`);
    }
  }
  if (!DIFFICULTY_APPROPRIATENESS_LEVELS.includes(dimensions?.difficulty as DifficultyAppropriateness)) {
    errors.push(`dimensions.difficulty must be one of: ${DIFFICULTY_APPROPRIATENESS_LEVELS.join(', ')}.`);
  }
  return errors;
}

export function verifyQualityVerdict(assessment: GeneratedQuestionQualityAssessment): string[] {
  return QUALITY_VERDICTS.includes(assessment.verdict) ? [] : [`verdict must be one of: ${QUALITY_VERDICTS.join(', ')}.`];
}

export function verifyAssessmentRationale(assessment: GeneratedQuestionQualityAssessment): string[] {
  return isNonEmptyString(assessment.rationale) ? [] : ['rationale is required.'];
}

/** Stricter than the pipeline's "correctOptionId resolves to some option": requires the id to
 * resolve to precisely one option, catching both "no correct answer" (zero matches) and "multiple
 * correct answers" (a duplicate option id coinciding with correctOptionId — two options both
 * "being" the correct one). */
export function verifyExactlyOneCorrectOption(draft: GeneratedQuestionDraft): string[] {
  const options = Array.isArray(draft.options) ? draft.options : [];
  const matches = options.filter((o) => o?.id === draft.correctOptionId).length;
  if (matches === 0) return ['no option matches correctOptionId — a generated question must have exactly one correct answer.'];
  if (matches > 1) return ['multiple options match correctOptionId — a generated question must have exactly one correct answer.'];
  return [];
}

/** The pipeline already rejects a duplicate option *id*; it never inspects option *text*, so a
 * question with two differently-id'd options carrying the same wording would otherwise pass. */
export function verifyNoDuplicateOptionText(draft: GeneratedQuestionDraft): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const opt of Array.isArray(draft.options) ? draft.options : []) {
    const normalized = opt?.text?.trim().toLowerCase();
    if (!normalized) continue; // empty option text is already the pipeline's concern, not this dimension's.
    if (seen.has(normalized)) errors.push(`duplicate option text "${opt.text}".`);
    else seen.add(normalized);
  }
  return errors;
}

// Deliberately the same phrasing Stage 6F's isCalibrationClaimingAuthenticity guards against in a
// calibration rationale — applied here to the draft's own question/explanation text, which no
// earlier stage checks at all. isCalibrationClaimingAuthenticity itself is reused as-is below for
// the one field it already covers, rather than re-implemented.
const AUTHENTICITY_CLAIM_PATTERN = /\bis an actual (?:pyq|past (?:year )?question)\b|\bis a real (?:pyq|past (?:year )?question)\b/;

/** Rejects wording, anywhere it could appear, that claims this generated question actually is an
 * authentic PYQ: the draft's own question text, its explanation, and (when supplied) its
 * calibration's rationale — reusing isCalibrationClaimingAuthenticity for that last one. */
export function verifyNoAuthenticityClaim(draft: GeneratedQuestionDraft, calibration?: GeneratedQuestionCalibration): string[] {
  const errors: string[] = [];
  if (AUTHENTICITY_CLAIM_PATTERN.test(draft.question?.toLowerCase() ?? '')) {
    errors.push('question text must not claim this is an authentic PYQ.');
  }
  if (AUTHENTICITY_CLAIM_PATTERN.test(draft.explanation?.toLowerCase() ?? '')) {
    errors.push('explanation must not claim this is an authentic PYQ.');
  }
  if (calibration && isCalibrationClaimingAuthenticity(calibration)) {
    errors.push('calibration rationale must not claim this is an authentic PYQ.');
  }
  return errors;
}

export interface GeneratedQuestionQualityOptions {
  calibration?: GeneratedQuestionCalibration;
  existingIds?: ReadonlySet<string>;
}

/**
 * Validates a draft against every deterministic quality gate: the reused Stage 6B pipeline (source
 * provenance, syllabus topic linkage, question structure including id-collision against
 * `existingIds`, and structural calibration-id checks), then the checks new to this stage (exactly
 * one correct option, no duplicate option text, no authenticity-claiming wording), then — only when
 * a calibration record is supplied — the reused Stage 6F calibration validator. Never mutates
 * `draft`; returns the flattened list of every violation found.
 */
export function validateGeneratedQuestionForQuality(draft: GeneratedQuestionDraft, options: GeneratedQuestionQualityOptions = {}): string[] {
  const { calibration, existingIds = new Set() } = options;
  const pipelineResult = runGeneratedQuestionPipeline(draft, existingIds);
  const pipelineErrors = pipelineResult.status === 'invalid' ? pipelineResult.errors : [];
  return [
    ...pipelineErrors,
    ...verifyExactlyOneCorrectOption(draft),
    ...verifyNoDuplicateOptionText(draft),
    ...verifyNoAuthenticityClaim(draft, calibration),
    ...(calibration ? validateGeneratedQuestionCalibration(calibration, draft.topicId) : []),
  ];
}

/**
 * Validates a complete quality assessment: the assessment's own structural fields (id, dimension
 * values, verdict, rationale) plus everything validateGeneratedQuestionForQuality checks on the
 * underlying draft. This is the single entry point a future review workflow would call.
 */
export function validateGeneratedQuestionQualityAssessment(
  assessment: GeneratedQuestionQualityAssessment,
  draft: GeneratedQuestionDraft,
  options: GeneratedQuestionQualityOptions = {},
): string[] {
  return [
    ...verifyAssessmentGeneratedQuestionId(assessment),
    ...verifyQualityDimensions(assessment.dimensions),
    ...verifyQualityVerdict(assessment),
    ...verifyAssessmentRationale(assessment),
    ...validateGeneratedQuestionForQuality(draft, options),
  ];
}

/**
 * Convenience entry point starting from authoring input (Stage 6C) rather than an
 * already-constructed draft: converts via authoringInputToGeneratedQuestionDraft, then runs
 * validateGeneratedQuestionQualityAssessment. `id`/`generatedAt` remain required, explicit,
 * caller-supplied arguments for the same reason Stage 6C keeps them explicit — nothing in this
 * module invents an id or a timestamp.
 */
export function assessGeneratedQuestionQuality(
  input: GeneratedQuestionAuthoringInput,
  id: string,
  generatedAt: string,
  assessment: GeneratedQuestionQualityAssessment,
  options: GeneratedQuestionQualityOptions = {},
): string[] {
  const draft = authoringInputToGeneratedQuestionDraft(input, id, generatedAt);
  return validateGeneratedQuestionQualityAssessment(assessment, draft, options);
}
