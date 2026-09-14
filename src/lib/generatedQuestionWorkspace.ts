// Unified Question Architecture, Stage 6D — a local, typed workspace for source-backed generated
// question drafts (lib/types.ts, lib/generatedQuestionAuthoring.ts), so a future researched
// question can sit in review before anything is ever published. Pure and deterministic: no network
// access, no LLM call, no question generation, and it never reads or writes QUESTION_BANK or
// PYQ_BANK — a workspace item lives entirely apart from both banks until some future stage
// explicitly decides to promote an approved one. This stage does not do that promotion, and it
// does not persist anything (no store/Supabase wiring) — it only defines the shape of a workspace
// item and the handful of pure state transitions a reviewer can apply to one.
import type { GeneratedQuestionDraft } from './types';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { authoringInputToGeneratedQuestionDraft } from './generatedQuestionAuthoring';
import { runGeneratedQuestionPipeline, type GeneratedQuestionPipelineResult } from './generatedQuestionPipeline';

/**
 * A workspace item's own review lifecycle — separate from, and not to be confused with,
 * GeneratedProvenance.verificationStatus (draft/verified/published/retired), which describes the
 * *source's* review state. This is the *workspace's* review state:
 * - 'draft': newly created, or last revalidated and found structurally invalid.
 * - 'validated': last revalidated and found structurally sound (whether or not it's publishable
 *   yet — see approveWorkspaceItem, which re-checks publishability itself rather than trusting
 *   this status).
 * - 'rejected': a reviewer declined it, with a reason recorded in reviewerNote.
 * - 'approved': cleared the existing pipeline's 'publishable' gate. Still not published anywhere —
 *   this stage adds no publishing mechanism at all.
 */
export type WorkspaceStatus = 'draft' | 'validated' | 'rejected' | 'approved';

export interface GeneratedQuestionWorkspaceItem {
  draft: GeneratedQuestionDraft;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  reviewerNote?: string;
}

/**
 * Creates a brand-new workspace item from authoring input, status 'draft', via
 * authoringInputToGeneratedQuestionDraft (Stage 6C) — never re-implements that conversion.
 * `id`/`generatedAt` (the draft's own fields) and `createdAt` (the workspace item's fields) are
 * all required caller-supplied arguments, for the same reason Stage 6C keeps `id`/`generatedAt`
 * explicit: nothing in this module invents an id or a timestamp.
 */
export function createWorkspaceItem(
  input: GeneratedQuestionAuthoringInput,
  id: string,
  generatedAt: string,
  createdAt: string,
): GeneratedQuestionWorkspaceItem {
  return {
    draft: authoringInputToGeneratedQuestionDraft(input, id, generatedAt),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  };
}

export interface WorkspaceValidationOutcome {
  item: GeneratedQuestionWorkspaceItem;
  pipelineResult: GeneratedQuestionPipelineResult;
}

/**
 * Re-runs the existing Stage 6B pipeline (runGeneratedQuestionPipeline, reused verbatim — no
 * validation rule is repeated here) over the item's draft and returns a new item reflecting the
 * outcome: 'validated' when the pipeline says 'validated' or 'publishable', 'draft' when it says
 * 'invalid'. The full pipeline result is also returned so a caller can see exactly what failed (or
 * whether the candidate is currently publishable) without re-running validation itself.
 */
export function validateWorkspaceItem(
  item: GeneratedQuestionWorkspaceItem,
  updatedAt: string,
  existingIds: ReadonlySet<string> = new Set(),
): WorkspaceValidationOutcome {
  const pipelineResult = runGeneratedQuestionPipeline(item.draft, existingIds);
  const status: WorkspaceStatus = pipelineResult.status === 'invalid' ? 'draft' : 'validated';
  return {
    item: { ...item, status, updatedAt },
    pipelineResult,
  };
}

export type WorkspaceApprovalResult =
  | { outcome: 'approved'; item: GeneratedQuestionWorkspaceItem }
  | { outcome: 'refused'; item: GeneratedQuestionWorkspaceItem; pipelineResult: GeneratedQuestionPipelineResult };

/**
 * The only path to status 'approved'. Never trusts a previously stored workspace status (a
 * reviewer could have revalidated a while ago, before an edit) — it always re-runs the pipeline
 * itself and approves if and only if the result is 'publishable' (i.e. structurally valid AND
 * provenance.verificationStatus is 'verified' or 'published'). A structurally valid but
 * 'draft'/'retired' candidate comes back 'validated' from the pipeline, not 'publishable', so it
 * is refused here — approval is deliberately not exposed as a plain status setter for exactly this
 * reason: nothing in this module can mark an item 'approved' without clearing that gate.
 */
export function approveWorkspaceItem(
  item: GeneratedQuestionWorkspaceItem,
  updatedAt: string,
  existingIds: ReadonlySet<string> = new Set(),
): WorkspaceApprovalResult {
  const pipelineResult = runGeneratedQuestionPipeline(item.draft, existingIds);
  if (pipelineResult.status !== 'publishable') {
    return { outcome: 'refused', item, pipelineResult };
  }
  return { outcome: 'approved', item: { ...item, status: 'approved', updatedAt } };
}

/** Rejects an item with a required reviewer reason, recorded as the item's reviewerNote. */
export function rejectWorkspaceItem(
  item: GeneratedQuestionWorkspaceItem,
  reason: string,
  updatedAt: string,
): GeneratedQuestionWorkspaceItem {
  return { ...item, status: 'rejected', reviewerNote: reason, updatedAt };
}

/**
 * Updates only the reviewer note, leaving status untouched — the counterpart to
 * rejectWorkspaceItem's status-changing note write, for a reviewer who wants to leave context
 * without moving the item out of its current lifecycle state.
 */
export function setWorkspaceReviewerNote(
  item: GeneratedQuestionWorkspaceItem,
  reviewerNote: string,
  updatedAt: string,
): GeneratedQuestionWorkspaceItem {
  return { ...item, reviewerNote, updatedAt };
}
