// Unified Question Architecture, Stage 6F — a pure calibration layer recording how a source-backed
// generated question was calibrated against authentic APFC PYQs. Pure and deterministic: no
// network access, no LLM call, no question generation, and no automatic scoring or ranking — it
// only records and validates calibration evidence a human reviewer supplies. Calibration is
// descriptive only: it never claims, implies, or converts a generated question into an authentic
// PYQ (see isCalibrationClaimingAuthenticity below, which exists purely to make that boundary
// checkable). This module never touches PYQ_BANK, QUESTION_BANK, or the syllabus — it reads
// PYQ_BANK strictly as read-only reference data for id/topic existence checks.
import { PYQ_BANK } from '../data/pyq';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';

export const CALIBRATION_ALIGNMENT_LEVELS = ['closely_aligned', 'partially_aligned', 'loosely_aligned'] as const;
export type CalibrationAlignmentLevel = (typeof CALIBRATION_ALIGNMENT_LEVELS)[number];

export const CALIBRATION_DIFFICULTY_LEVELS = ['easier', 'comparable', 'harder'] as const;
export type CalibrationDifficultyLevel = (typeof CALIBRATION_DIFFICULTY_LEVELS)[number];

/** Each dimension records an evidence-based comparison against the referenced PYQs — never a claim
 * that the generated question *is* one of them. */
export interface CalibrationDimensions {
  subjectTopicAlignment: CalibrationAlignmentLevel;
  conceptualDepth: CalibrationAlignmentLevel;
  questionFraming: CalibrationAlignmentLevel;
  distractorStyle: CalibrationAlignmentLevel;
  difficulty: CalibrationDifficultyLevel;
}

export interface GeneratedQuestionCalibration {
  generatedQuestionId: string;
  referencePyqIds: string[];
  dimensions: CalibrationDimensions;
  /** A concise, evidence-based explanation of the comparison — never a claim of authenticity. */
  rationale: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Structural check: generatedQuestionId is present. Kept separate from the PYQ-existence and
 * dimension/rationale checks below so a caller can see exactly which concern failed. */
export function verifyGeneratedQuestionId(calibration: GeneratedQuestionCalibration): string[] {
  return isNonEmptyString(calibration.generatedQuestionId) ? [] : ['generatedQuestionId is required.'];
}

/** referencePyqIds must be non-empty whenever a calibration record exists at all — a calibration
 * with no PYQs behind it is not evidence of anything — and every id present must resolve to a real
 * PYQ in PYQ_BANK (read-only; never fabricated or substituted). */
export function verifyReferencePyqIdsExist(calibration: GeneratedQuestionCalibration): string[] {
  const errors: string[] = [];
  if (!Array.isArray(calibration.referencePyqIds) || calibration.referencePyqIds.length === 0) {
    errors.push('referencePyqIds must contain at least one PYQ id when calibration is supplied.');
    return errors;
  }
  const knownIds = new Set(PYQ_BANK.map((p) => p.id));
  for (const id of calibration.referencePyqIds) {
    if (!isNonEmptyString(id)) {
      errors.push('referencePyqIds must not contain empty ids.');
    } else if (!knownIds.has(id)) {
      errors.push(`referencePyqIds references unknown PYQ id "${id}".`);
    }
  }
  return errors;
}

/** Every dimension must use one of its explicit allowed values — no free-text ratings. */
export function verifyCalibrationDimensions(dimensions: CalibrationDimensions): string[] {
  const errors: string[] = [];
  const alignmentFields: (keyof CalibrationDimensions)[] = ['subjectTopicAlignment', 'conceptualDepth', 'questionFraming', 'distractorStyle'];
  for (const field of alignmentFields) {
    const value = dimensions?.[field];
    if (!CALIBRATION_ALIGNMENT_LEVELS.includes(value as CalibrationAlignmentLevel)) {
      errors.push(`dimensions.${field} must be one of: ${CALIBRATION_ALIGNMENT_LEVELS.join(', ')}.`);
    }
  }
  if (!CALIBRATION_DIFFICULTY_LEVELS.includes(dimensions?.difficulty as CalibrationDifficultyLevel)) {
    errors.push(`dimensions.difficulty must be one of: ${CALIBRATION_DIFFICULTY_LEVELS.join(', ')}.`);
  }
  return errors;
}

/** A calibration record's rationale is required and must be non-empty whenever calibration is
 * supplied at all — there is no such thing as an undocumented calibration in this model. */
export function verifyCalibrationRationale(calibration: GeneratedQuestionCalibration): string[] {
  return isNonEmptyString(calibration.rationale) ? [] : ['rationale is required when calibration is supplied.'];
}

/**
 * Cross-checks the calibration's own subjectTopicAlignment claim against real PYQ data: only when
 * a reviewer has claimed "closely_aligned" is an actual topicId match with the referenced PYQs
 * required (a "partially_aligned"/"loosely_aligned" claim makes no such promise, so nothing to
 * check). Referenced ids that don't exist in PYQ_BANK are skipped here — that failure already
 * belongs to verifyReferencePyqIdsExist, not duplicated.
 */
export function verifyTopicAlignment(generatedQuestionTopicId: string, calibration: GeneratedQuestionCalibration): string[] {
  if (calibration.dimensions?.subjectTopicAlignment !== 'closely_aligned') return [];
  const errors: string[] = [];
  for (const pyqId of calibration.referencePyqIds ?? []) {
    const pyq = PYQ_BANK.find((p) => p.id === pyqId);
    if (pyq && pyq.topicId !== generatedQuestionTopicId) {
      errors.push(
        `dimensions.subjectTopicAlignment is "closely_aligned" but referenced PYQ "${pyqId}" has topicId "${pyq.topicId}", not "${generatedQuestionTopicId}".`,
      );
    }
  }
  return errors;
}

/**
 * Runs every calibration check and returns the flattened list of violations. `generatedQuestionTopicId`
 * is optional: pass it to also run the topic-alignment cross-check; omit it to validate the
 * calibration record purely on its own terms.
 */
export function validateGeneratedQuestionCalibration(calibration: GeneratedQuestionCalibration, generatedQuestionTopicId?: string): string[] {
  return [
    ...verifyGeneratedQuestionId(calibration),
    ...verifyReferencePyqIdsExist(calibration),
    ...verifyCalibrationDimensions(calibration.dimensions),
    ...verifyCalibrationRationale(calibration),
    ...(generatedQuestionTopicId !== undefined ? verifyTopicAlignment(generatedQuestionTopicId, calibration) : []),
  ];
}

/**
 * A calibration record is descriptive evidence, never a claim of authenticity: this returns true
 * only if a caller has (incorrectly) tried to smuggle an authenticity claim into the free-text
 * rationale field. It does not scan for every conceivable phrasing — it exists so calibration
 * authoring can be guarded against the one mistake this model must never allow: presenting a
 * generated question as if it were a real, historical PYQ.
 */
export function isCalibrationClaimingAuthenticity(calibration: GeneratedQuestionCalibration): boolean {
  const rationale = calibration.rationale?.toLowerCase() ?? '';
  return /\bis an actual (?:pyq|past (?:year )?question)\b/.test(rationale) || /\bis a real (?:pyq|past (?:year )?question)\b/.test(rationale);
}

/**
 * Attaches calibration metadata onto a GeneratedQuestionAuthoringInput's existing
 * calibratedAgainstPyqIds field (Stage 6C) without changing the original input object — a pure
 * field copy, never a mutation. Only referencePyqIds is carried across, because that field is
 * exactly what GeneratedQuestionAuthoringInput/GeneratedProvenance already model
 * (calibratedAgainstPyqIds); the calibration record's dimensions/rationale/generatedQuestionId
 * stay in the calibration record itself, which this stage keeps separate on purpose — the
 * authoring input's job is to describe the question, not to carry the calibration evidence.
 */
export function attachCalibrationToAuthoringInput(
  input: GeneratedQuestionAuthoringInput,
  calibration: GeneratedQuestionCalibration,
): GeneratedQuestionAuthoringInput {
  return { ...input, calibratedAgainstPyqIds: [...calibration.referencePyqIds] };
}
