// Unified Question Architecture, Stage 6O — a deterministic, read-only review report over the
// existing 8 Stage 6L generated question drafts. This module produces information only: it never
// changes question text, options, answers, explanations, source metadata, factualBasis,
// verificationStatus, or calibration ids, and it never approves, rejects, publishes, or adds
// anything to QUESTION_BANK or GENERATED_QUESTION_BANK. Its only job is to lay out, for a human
// reviewer, everything Stage 6A-6N already know about each of the 8 questions in one place.
//
// Reuse, not re-implementation: structural validation is runGeneratedQuestionPipeline (Stage 6B),
// approval eligibility is isGeneratedQuestionEligibleForApproval (Stage 6M) — both called read-only,
// never approveGeneratedQuestion, so nothing here can ever move a question to 'approved'. Topic
// existence is cross-checked via verifyConceptTopicExists (Stage 6E,
// generatedQuestionSource.ts) against the concept each question was generated from. Authenticity
// risk is verifyNoAuthenticityClaim (Stage 6G). generatedQuestionCalibration.ts has nothing to
// validate here — none of the 8 questions carries a calibration record (Stage 6K found no
// genuinely relevant PYQ), so calibratedAgainstPyqIds is read directly off each draft's own
// provenance and reported as-is; if a future question ever attaches one, this report already
// surfaces it without needing a code change.
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import type { GeneratedQuestionDraft, GeneratedVerificationStatus, QuestionOption } from './types';
import { TOPIC_TITLES } from './pyqPerformance';
import { verifyConceptTopicExists, type AuthoritativeSourceRecord, type SourceConcept } from './generatedQuestionSource';
import { runGeneratedQuestionPipeline, type GeneratedQuestionPipelineResult } from './generatedQuestionPipeline';
import { verifyNoAuthenticityClaim, type GeneratedQuestionQualityAssessment } from './generatedQuestionQuality';
import { isGeneratedQuestionEligibleForApproval, type ApprovalEligibilityResult } from './generatedQuestionReview';
import { APFC_GENERATED_QUESTION_BATCH } from './apfcGeneratedQuestionBatch';
import { APFC_RESEARCH_BATCH_SOURCES, APFC_RESEARCH_BATCH_CONCEPTS } from './apfcSourceResearchBatch';

export const REVIEW_FLAGS = [
  'trivial_recall',
  'weak_distractors',
  'potentially_ambiguous',
  'source_basis_too_narrow',
  'explanation_insufficient',
  'difficulty_low',
  'wording_unusual',
  'authenticity_risk',
  'none',
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

export interface GeneratedQuestionReviewReportEntry {
  generatedQuestionId: string;
  conceptId: string;
  sourceId: string;
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  sourceAuthority: string;
  sourceTitle: string;
  sourceReference: string;
  factualBasis: string;
  topicId: string;
  topicTitle: string;
  calibratedAgainstPyqIds: string[] | undefined;
  verificationStatus: GeneratedVerificationStatus;
  structuralValidation: GeneratedQuestionPipelineResult;
  topicExistenceCheck: string[];
  approvalEligibility: ApprovalEligibilityResult;
  qualityAssessment: GeneratedQuestionQualityAssessment;
  reviewFlags: ReviewFlag[];
}

/** True when one option's text is a whole-word prefix of another's — e.g. "Section 14B of the
 * Act" vs "Section 14B of the Act, as amended". Requires a word boundary right after the shorter
 * text (the next character is missing, or not alphanumeric), so "Chapter II" vs "Chapter III"
 * correctly does NOT trip this — "ii" is a literal substring prefix of "iii", but there's no word
 * boundary there, and no human would actually confuse those two options. */
function hasPotentiallyAmbiguousOptions(options: QuestionOption[]): boolean {
  const isWordBoundary = (ch: string | undefined) => ch === undefined || !/[a-z0-9]/i.test(ch);
  const texts = options.map((o) => o.text.trim());
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const [shorter, longer] = texts[i].length <= texts[j].length ? [texts[i], texts[j]] : [texts[j], texts[i]];
      if (shorter.length === 0) continue;
      if (longer.toLowerCase().startsWith(shorter.toLowerCase()) && isWordBoundary(longer[shorter.length])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Deterministic, data-grounded review flags — never a random or LLM judgement, always the same
 * output for the same (draft, qualityAssessment, factualBasis) input:
 * - authenticity_risk: verifyNoAuthenticityClaim (Stage 6G) found wording claiming authenticity.
 * - weak_distractors / explanation_insufficient / difficulty_low: the corresponding quality
 *   dimension was rated at its weakest/lowest level.
 * - potentially_ambiguous: one option's text is a prefix of another's — a concrete, checkable risk
 *   of two options reading as "the same answer, worded differently."
 * - source_basis_too_narrow: the concept's factualBasis is too short to plausibly support a
 *   well-formed question on its own.
 * - wording_unusual: the question text carries raw formatting artifacts (leading/trailing
 *   whitespace, doubled spaces).
 * - trivial_recall: both conceptualDepth and apfcPyqStyleFraming were rated only "adequate" (never
 *   "strong") — i.e. the question never rises above plain, workmanlike fact identification.
 * Returns ['none'] when nothing above applies.
 */
export function computeReviewFlags(
  draft: GeneratedQuestionDraft,
  qualityAssessment: GeneratedQuestionQualityAssessment,
  factualBasis: string,
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (verifyNoAuthenticityClaim(draft).length > 0) flags.push('authenticity_risk');
  if (qualityAssessment.dimensions.optionDistractorQuality === 'needs_improvement') flags.push('weak_distractors');
  if (hasPotentiallyAmbiguousOptions(draft.options)) flags.push('potentially_ambiguous');
  if (factualBasis.trim().length < 80) flags.push('source_basis_too_narrow');
  if (qualityAssessment.dimensions.explanationQuality === 'needs_improvement') flags.push('explanation_insufficient');
  if (qualityAssessment.dimensions.difficulty === 'too_easy') flags.push('difficulty_low');
  if (draft.question !== draft.question.trim() || /\s{2,}/.test(draft.question)) flags.push('wording_unusual');
  if (qualityAssessment.dimensions.conceptualDepth === 'adequate' && qualityAssessment.dimensions.apfcPyqStyleFraming === 'adequate') {
    flags.push('trivial_recall');
  }
  return flags.length > 0 ? flags : ['none'];
}

const sourcesBySourceId = new Map<string, AuthoritativeSourceRecord>(APFC_RESEARCH_BATCH_SOURCES.map((s) => [s.sourceId, s]));
const conceptsByConceptId = new Map<string, SourceConcept>(APFC_RESEARCH_BATCH_CONCEPTS.map((c) => [c.conceptId, c]));
const existingIds = new Set<string>([...PYQ_BANK.map((p) => p.id), ...QUESTION_BANK.map((q) => q.id)]);

/**
 * Builds the full review report over the 8 Stage 6L drafts, recomputed fresh from
 * APFC_GENERATED_QUESTION_BATCH / apfcSourceResearchBatch.ts on every call — deterministic because
 * every value it reads from is itself a plain, unmutated data structure and every function it calls
 * is pure. Never mutates any input and never calls approveGeneratedQuestion.
 */
export function buildGeneratedQuestionReviewReport(): GeneratedQuestionReviewReportEntry[] {
  return APFC_GENERATED_QUESTION_BATCH.flatMap((entry) => {
    if (entry.workflowResult.status === 'invalid') return [];
    const draft = entry.workflowResult.draft;
    const concept = conceptsByConceptId.get(entry.conceptId)!;
    const source = sourcesBySourceId.get(concept.sourceId)!;

    return [
      {
        generatedQuestionId: draft.id,
        conceptId: concept.conceptId,
        sourceId: source.sourceId,
        question: draft.question,
        options: draft.options,
        correctOptionId: draft.correctOptionId,
        explanation: draft.explanation,
        sourceAuthority: source.authority,
        sourceTitle: source.title,
        sourceReference: source.reference,
        factualBasis: concept.factualBasis,
        topicId: draft.topicId,
        topicTitle: TOPIC_TITLES[draft.topicId] ?? draft.topicId,
        calibratedAgainstPyqIds: draft.provenance.calibratedAgainstPyqIds,
        verificationStatus: draft.provenance.verificationStatus,
        structuralValidation: runGeneratedQuestionPipeline(draft, existingIds),
        topicExistenceCheck: verifyConceptTopicExists(concept),
        approvalEligibility: isGeneratedQuestionEligibleForApproval(draft, entry.qualityAssessment, { existingIds }),
        qualityAssessment: entry.qualityAssessment,
        reviewFlags: computeReviewFlags(draft, entry.qualityAssessment, concept.factualBasis),
      },
    ];
  });
}
