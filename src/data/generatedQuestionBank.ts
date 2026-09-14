// Unified Question Architecture, Stage 6N — the production pool of source-backed generated
// questions that have actually cleared the Stage 6M human review/approval gate. Parallels
// data/pyq.ts's PYQ_BANK and data/questionBank.ts's QUESTION_BANK: a plain array of the raw source
// type (GeneratedQuestionDraft), consumed by lib/questionCatalog.ts's buildQuestionCatalog exactly
// like those two banks already are — never pre-mapped to CatalogQuestion here.
//
// The gate is never bypassed: the only way a draft can appear in GENERATED_QUESTION_BANK is via
// selectApprovedGeneratedQuestions below, which calls approveGeneratedQuestion (Stage 6M) for every
// candidate and keeps only the ones it actually returns 'approved' for — this file reuses that
// check, it does not re-implement any part of it. GENERATED_QUESTION_BANK itself starts empty on
// purpose: none of the Stage 6L 8 questions has ever been reviewed or had its verificationStatus
// changed from 'draft', so none of them clears the gate. That emptiness is the correct, honest
// state — not a placeholder to be hand-filled — until a real review record with verdict "approve"
// exists for a question.
import type { GeneratedQuestionDraft } from '../lib/types';
import { approveGeneratedQuestion, type GeneratedQuestionReviewRecord } from '../lib/generatedQuestionReview';
import type { GeneratedQuestionWorkspaceItem } from '../lib/generatedQuestionWorkspace';

export interface GeneratedQuestionApprovalCandidate {
  draft: GeneratedQuestionDraft;
  record: GeneratedQuestionReviewRecord;
}

export interface GeneratedQuestionPoolOptions {
  existingIds?: ReadonlySet<string>;
}

/**
 * Filters (draft, review record) candidates down to only the drafts approveGeneratedQuestion
 * (Stage 6M) actually approves. A candidate that fails any gate — wrong/missing verdict, an
 * ineligible draft, a malformed record — is silently excluded from the result, never included with
 * a warning or partial data. This is the only sanctioned way to populate a generated question pool.
 */
export function selectApprovedGeneratedQuestions(
  candidates: GeneratedQuestionApprovalCandidate[],
  options: GeneratedQuestionPoolOptions = {},
): GeneratedQuestionDraft[] {
  return candidates.flatMap(({ draft, record }) => (approveGeneratedQuestion(record, draft, options).status === 'approved' ? [draft] : []));
}

/**
 * The counterpart for callers who already drove a question through Stage 6D's workspace workflow
 * via generatedQuestionReview.ts's approveWorkspaceItemWithReview: that function is the only place
 * a GeneratedQuestionWorkspaceItem's status can ever become 'approved' (it does so by calling
 * approveGeneratedQuestion itself), so trusting `item.status === 'approved'` here is equivalent to
 * re-running the gate, not a way around it.
 */
export function selectApprovedGeneratedQuestionsFromWorkspaceItems(items: GeneratedQuestionWorkspaceItem[]): GeneratedQuestionDraft[] {
  return items.flatMap((item) => (item.status === 'approved' ? [item.draft] : []));
}

export const GENERATED_QUESTION_BANK: GeneratedQuestionDraft[] = selectApprovedGeneratedQuestions([]);
