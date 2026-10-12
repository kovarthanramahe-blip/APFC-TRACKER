// Premium Study Reader — explicit annotation-to-Revision OS bridge (Wave 4A, Scope C).
//
// Bridges a tagged annotation (lib/annotations.ts's studyTags: 'revision') into the REAL spaced-
// repetition lib/revisionQueue.ts — reusing its existing addItem exactly as-is (idempotent, never
// duplicates, never resets progress — see that module's own doc comment). This is a SEPARATE,
// explicit action from "tag this selection as Revision" (DocumentAnnotator's own
// handleTagSelection, left completely unchanged by this file): tagging only ever writes
// studyTags on the annotation itself; this module is what a user explicitly triggers afterward to
// actually enter the item into the scheduling queue.
//
// Key-safety note: an annotation's own `id` (lib/utils.ts's uuid()) is NEVER used bare as the
// RevisionQueue key. RevisionQueue is already keyed by two other id spaces — PYQ ids (fixed
// literals from the PYQ bank) and ImportedContent ids (also lib/utils.ts's uuid()) — and nothing
// in lib/revisionQueue.ts distinguishes which space a given key came from. A bare annotation id is
// a syntactically identical uuid to an ImportedContent id, so nothing structurally rules out a
// collision; namespacing every annotation-sourced key as `annotation:<id>` removes that ambiguity
// by construction instead of relying on an unverified "ids never collide" assumption.
import type { Annotation } from './annotations';
import { addItem, type RevisionQueue } from './revisionQueue';

export type AnnotationRevisionBridgeStatus = 'added' | 'already_exists' | 'cannot_add';

export interface AnnotationRevisionBridgeResult {
  status: AnnotationRevisionBridgeStatus;
  queue: RevisionQueue;
  /** Present only for 'cannot_add' — a safe, human-readable reason, never a thrown error. */
  reason?: string;
}

/** The stable, collision-safe RevisionQueue key for one annotation — see this module's own header
 * for why this is never the bare annotation id. */
export function revisionQueueKeyForAnnotation(annotationId: string): string {
  return `annotation:${annotationId}`;
}

/** True only for an annotation this bridge can actually represent in the Revision Queue: it must
 * already carry the 'revision' study tag — the SAME tag DocumentAnnotator's existing "Add to
 * Revision" toolbar button already applies (see lib/annotations.ts's `studyTags`); this function
 * never invents a second tagging rule of its own. Every annotation type can in principle carry
 * studyTags (they live on AnnotationBase), so this is deliberately not narrowed to text-anchored
 * annotations only. */
export function canBridgeAnnotationToRevision(annotation: Annotation): boolean {
  return annotation.id.length > 0 && annotation.studyTags.includes('revision');
}

/**
 * Explicit, idempotent bridge: adds `annotation` to `queue` as a fresh (due-today, box 1,
 * unreviewed) RevisionItem, keyed by its namespaced key — never mutates `queue`. Idempotent across
 * repeated clicks and page refreshes to exactly the extent lib/revisionQueue.ts's own addItem
 * already is (the same queue reference is returned, completely unchanged, whenever the key is
 * already present) — this function adds no second idempotency mechanism of its own, and never
 * deletes or rewrites an existing entry.
 */
export function addAnnotationToRevisionQueue(queue: RevisionQueue, annotation: Annotation, today: string): AnnotationRevisionBridgeResult {
  if (!canBridgeAnnotationToRevision(annotation)) {
    return { status: 'cannot_add', queue, reason: 'This annotation is not tagged for revision yet — use "Add to revision" on the selection first.' };
  }
  const key = revisionQueueKeyForAnnotation(annotation.id);
  if (queue[key]) {
    return { status: 'already_exists', queue };
  }
  return { status: 'added', queue: addItem(queue, key, today) };
}

/** Whether `annotation` has already been bridged into `queue` — used by the UI to show "In
 * revision queue" vs. "Add to revision queue" without re-deriving the key logic itself. */
export function isAnnotationInRevisionQueue(queue: RevisionQueue, annotation: Annotation): boolean {
  return Boolean(queue[revisionQueueKeyForAnnotation(annotation.id)]);
}
