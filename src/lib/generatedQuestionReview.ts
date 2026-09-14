// Unified Question Architecture, Stage 6M — the human review and approval gate a generated
// question draft must clear before it could ever be considered for publication. Pure and
// deterministic: no network access, no LLM call, no automatic publishing, and no mutation of any
// draft, source metadata, factualBasis, or calibration data. This stage adds no way for a draft to
// reach QUESTION_BANK or PYQ_BANK — it only decides whether a *review record* is itself valid and,
// when its verdict is "approve", whether the underlying draft actually clears every gate.
//
// The central discipline this module exists to enforce: eligibility is never approval. A draft can
// be structurally perfect, source-verified, and rated "strong" by a quality assessment, and still
// not be approved — approval happens if and only if a well-formed review record whose own verdict
// is literally "approve" is supplied. Nothing in this module ever infers or defaults that verdict
// from how good the draft looks; a caller who never calls approveGeneratedQuestion (or who calls it
// with any other verdict) gets no approval, no matter how eligible the draft is.
//
// Reuse, not re-implementation: structural validity, source provenance, syllabus topic linkage, and
// id-collision are reused verbatim from runGeneratedQuestionPipeline (Stage 6B, itself built on
// Stage 6A) — including its own rule for which verificationStatus values count as publishable,
// never re-implemented here. The extra structural checks Stage 6G adds beyond the pipeline (exactly
// one correct option, no duplicate option text, no authenticity-claiming wording) and the
// assessment-level checks (id presence, dimension values, verdict validity, rationale) are reused
// directly from generatedQuestionQuality.ts. Calibration validity, when a calibration record is
// supplied, is reused from generatedQuestionCalibration.ts. The only genuinely new rules here are:
// the quality verdict must specifically be "acceptable" or "strong" to be approval-eligible (Stage
// 6G only checks that the verdict is *some* valid value), the assessment must actually name this
// exact draft, and the review record itself (reviewer, timestamp, rationale, an explicit "approve"
// verdict) must be complete. generatedQuestionWorkspace.ts (Stage 6D) is extended, not
// re-implemented: approveWorkspaceItemWithReview below is a thin wrapper reusing this stage's gate
// to decide the one WorkspaceStatus transition Stage 6D didn't already know how to gate on its own.
import type { GeneratedQuestionDraft } from './types';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';
import {
  verifyExactlyOneCorrectOption,
  verifyNoDuplicateOptionText,
  verifyNoAuthenticityClaim,
  verifyAssessmentGeneratedQuestionId,
  verifyQualityDimensions,
  verifyQualityVerdict,
  verifyAssessmentRationale,
  type GeneratedQuestionQualityAssessment,
  type QualityVerdict,
} from './generatedQuestionQuality';
import { validateGeneratedQuestionCalibration, type GeneratedQuestionCalibration } from './generatedQuestionCalibration';
import type { GeneratedQuestionWorkspaceItem } from './generatedQuestionWorkspace';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const REVIEW_VERDICTS = ['approve', 'reject', 'request_revision'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface GeneratedQuestionReviewRecord {
  generatedQuestionId: string;
  reviewer: string;
  reviewedAt: string;
  verdict: ReviewVerdict;
  rationale: string;
  qualityAssessment: GeneratedQuestionQualityAssessment;
}

/** Structural completeness of the review record itself — required for every verdict, not just
 * "approve": a reject or a request-for-revision with no reviewer, no timestamp, or no rationale is
 * just as incomplete a record. */
export function verifyReviewRecordIsWellFormed(record: GeneratedQuestionReviewRecord): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(record.generatedQuestionId)) errors.push('generatedQuestionId is required.');
  if (!isNonEmptyString(record.reviewer)) errors.push('reviewer is required.');
  if (!isNonEmptyString(record.reviewedAt)) {
    errors.push('reviewedAt is required.');
  } else if (Number.isNaN(Date.parse(record.reviewedAt))) {
    errors.push('reviewedAt must be a valid timestamp.');
  }
  if (!REVIEW_VERDICTS.includes(record.verdict)) {
    errors.push(`verdict must be one of: ${REVIEW_VERDICTS.join(', ')}.`);
  }
  if (!isNonEmptyString(record.rationale)) errors.push('rationale is required.');
  return errors;
}

const APPROVAL_ELIGIBLE_QUALITY_VERDICTS: readonly QualityVerdict[] = ['acceptable', 'strong'];

export interface ApprovalEligibilityOptions {
  existingIds?: ReadonlySet<string>;
  calibration?: GeneratedQuestionCalibration;
}

export interface ApprovalEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * The pure gate check: is `draft`, paired with `qualityAssessment`, eligible to be approved at
 * all? This says nothing about whether anyone actually approved it — see approveGeneratedQuestion
 * for that. Never mutates `draft` or `qualityAssessment`.
 */
export function isGeneratedQuestionEligibleForApproval(
  draft: GeneratedQuestionDraft,
  qualityAssessment: GeneratedQuestionQualityAssessment,
  options: ApprovalEligibilityOptions = {},
): ApprovalEligibilityResult {
  const { existingIds = new Set(), calibration } = options;
  const reasons: string[] = [];

  // Structural validity, source provenance, syllabus topic linkage, and id-collision — reused
  // verbatim from the Stage 6B pipeline.
  const pipelineResult = runGeneratedQuestionPipeline(draft, existingIds);
  if (pipelineResult.status === 'invalid') {
    reasons.push(...pipelineResult.errors);
  } else if (pipelineResult.status === 'validated') {
    // Structurally sound, but the pipeline's own rule says provenance.verificationStatus hasn't
    // cleared the publishable bar yet — not re-implemented here, only read off the result.
    reasons.push('verificationStatus must be "verified" or "published" to be eligible for approval.');
  }

  // The extra structural checks Stage 6G adds beyond the pipeline, reused directly.
  reasons.push(...verifyExactlyOneCorrectOption(draft));
  reasons.push(...verifyNoDuplicateOptionText(draft));
  reasons.push(...verifyNoAuthenticityClaim(draft, calibration));

  if (calibration) {
    reasons.push(...validateGeneratedQuestionCalibration(calibration, draft.topicId));
  }

  // A quality assessment must exist, actually name this draft, be itself well-formed (Stage 6G's
  // assessment-level checks, reused), and carry a verdict of "acceptable" or "strong" — a rating on
  // the content, never by itself an approval.
  if (qualityAssessment.generatedQuestionId !== draft.id) {
    reasons.push(`qualityAssessment.generatedQuestionId "${qualityAssessment.generatedQuestionId}" does not match draft.id "${draft.id}".`);
  }
  reasons.push(...verifyAssessmentGeneratedQuestionId(qualityAssessment));
  reasons.push(...verifyQualityDimensions(qualityAssessment.dimensions));
  reasons.push(...verifyQualityVerdict(qualityAssessment));
  reasons.push(...verifyAssessmentRationale(qualityAssessment));
  if (!APPROVAL_ELIGIBLE_QUALITY_VERDICTS.includes(qualityAssessment.verdict)) {
    reasons.push(`qualityAssessment.verdict must be "acceptable" or "strong" to be eligible for approval (was "${qualityAssessment.verdict}").`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/** The outcome of acting on one review record. 'invalid' covers both a malformed record (wrong
 * verdict for the function called, missing reviewer/timestamp/rationale) and — for
 * approveGeneratedQuestion specifically — an otherwise well-formed "approve" record whose draft
 * simply isn't eligible yet; `reasons` explains exactly which. */
export type GeneratedQuestionReviewOutcome =
  | { status: 'approved'; record: GeneratedQuestionReviewRecord }
  | { status: 'rejected'; record: GeneratedQuestionReviewRecord }
  | { status: 'revision_requested'; record: GeneratedQuestionReviewRecord }
  | { status: 'invalid'; record: GeneratedQuestionReviewRecord; reasons: string[] };

/**
 * The only path to 'approved'. Requires record.verdict to literally be "approve" — eligibility
 * alone, however strong, never substitutes for it — plus a well-formed record and a draft that
 * passes isGeneratedQuestionEligibleForApproval. Never mutates `record` or `draft`.
 */
export function approveGeneratedQuestion(
  record: GeneratedQuestionReviewRecord,
  draft: GeneratedQuestionDraft,
  options: ApprovalEligibilityOptions = {},
): GeneratedQuestionReviewOutcome {
  const recordErrors = verifyReviewRecordIsWellFormed(record);
  if (record.verdict !== 'approve') {
    return { status: 'invalid', record, reasons: [...recordErrors, 'approveGeneratedQuestion requires record.verdict to be "approve".'] };
  }
  const eligibility = isGeneratedQuestionEligibleForApproval(draft, record.qualityAssessment, options);
  const reasons = [...recordErrors, ...eligibility.reasons];
  if (reasons.length > 0) {
    return { status: 'invalid', record, reasons };
  }
  return { status: 'approved', record };
}

/** Rejects with the record's own rationale — never checks draft eligibility, since anything can be
 * rejected, eligible or not. */
export function rejectGeneratedQuestion(record: GeneratedQuestionReviewRecord): GeneratedQuestionReviewOutcome {
  const recordErrors = verifyReviewRecordIsWellFormed(record);
  if (record.verdict !== 'reject') {
    return { status: 'invalid', record, reasons: [...recordErrors, 'rejectGeneratedQuestion requires record.verdict to be "reject".'] };
  }
  return recordErrors.length > 0 ? { status: 'invalid', record, reasons: recordErrors } : { status: 'rejected', record };
}

/** Requests revision with the record's own rationale — same non-eligibility-checking shape as
 * rejectGeneratedQuestion, since a revision request is also never gated on the draft being good. */
export function requestRevisionForGeneratedQuestion(record: GeneratedQuestionReviewRecord): GeneratedQuestionReviewOutcome {
  const recordErrors = verifyReviewRecordIsWellFormed(record);
  if (record.verdict !== 'request_revision') {
    return { status: 'invalid', record, reasons: [...recordErrors, 'requestRevisionForGeneratedQuestion requires record.verdict to be "request_revision".'] };
  }
  return recordErrors.length > 0 ? { status: 'invalid', record, reasons: recordErrors } : { status: 'revision_requested', record };
}

/** Dispatches to the matching action based on record.verdict — the single entry point a review UI
 * (a future stage) would actually call, so it never has to remember which of the three functions
 * above to invoke. */
export function reviewGeneratedQuestion(
  record: GeneratedQuestionReviewRecord,
  draft: GeneratedQuestionDraft,
  options: ApprovalEligibilityOptions = {},
): GeneratedQuestionReviewOutcome {
  switch (record.verdict) {
    case 'approve':
      return approveGeneratedQuestion(record, draft, options);
    case 'reject':
      return rejectGeneratedQuestion(record);
    case 'request_revision':
      return requestRevisionForGeneratedQuestion(record);
    default:
      return { status: 'invalid', record, reasons: verifyReviewRecordIsWellFormed(record) };
  }
}

/**
 * Extends Stage 6D's workspace workflow with this stage's stricter approval gate: only when
 * approveGeneratedQuestion actually returns 'approved' does the returned workspace item move to
 * status 'approved' (carrying the record's rationale as its reviewerNote); otherwise the item comes
 * back completely unchanged, alongside the outcome explaining why. generatedQuestionWorkspace.ts
 * itself needed no changes — its WorkspaceStatus/GeneratedQuestionWorkspaceItem shape already fit.
 */
export function approveWorkspaceItemWithReview(
  item: GeneratedQuestionWorkspaceItem,
  record: GeneratedQuestionReviewRecord,
  updatedAt: string,
  options: ApprovalEligibilityOptions = {},
): { outcome: GeneratedQuestionReviewOutcome; item: GeneratedQuestionWorkspaceItem } {
  const outcome = approveGeneratedQuestion(record, item.draft, options);
  if (outcome.status !== 'approved') {
    return { outcome, item };
  }
  return { outcome, item: { ...item, status: 'approved', updatedAt, reviewerNote: record.rationale } };
}
