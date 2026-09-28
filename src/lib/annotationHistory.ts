// Annotation-only undo/redo history (Phase 7) — deliberately NOT persisted and NOT an
// application-wide undo system, per this feature's own scope: it exists only for the lifetime of
// one AnnotationLayer instance (reset on navigating to a different document or reloading), and only
// ever inverts annotation create/delete/text-edit actions. This module owns just the STACK
// (push/pop/bounds) as pure data; it has no access to the store and never applies an action itself
// — the caller (components/annotations/AnnotationLayer.tsx) is responsible for calling the actual
// store action the popped entry describes.
import type { Annotation, NormalizedPoint } from './annotations';

export type AnnotationHistoryEntry =
  | { action: 'create'; annotation: Annotation }
  | { action: 'delete'; annotation: Annotation }
  | { action: 'updateText'; id: string; before: string; after: string }
  | { action: 'updateGeometry'; id: string; before: NormalizedPoint[]; after: NormalizedPoint[] };

export interface AnnotationHistoryState {
  past: AnnotationHistoryEntry[];
  future: AnnotationHistoryEntry[];
}

export function createHistoryState(): AnnotationHistoryState {
  return { past: [], future: [] };
}

/** Records a just-performed action. Always clears `future` — redoing past this point would replay
 * an action that no longer follows from the current state, exactly like every standard undo stack. */
export function pushHistoryEntry(state: AnnotationHistoryState, entry: AnnotationHistoryEntry): AnnotationHistoryState {
  return { past: [...state.past, entry], future: [] };
}

export function canUndo(state: AnnotationHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: AnnotationHistoryState): boolean {
  return state.future.length > 0;
}

/** Pops the most recent entry for undo. Returns null when there is nothing to undo. The caller
 * still has to actually invert the entry (e.g. a 'create' entry undoes via deleteAnnotation) —
 * this function only manages the stack. */
export function popForUndo(state: AnnotationHistoryState): { entry: AnnotationHistoryEntry; next: AnnotationHistoryState } | null {
  if (state.past.length === 0) return null;
  const entry = state.past[state.past.length - 1];
  return { entry, next: { past: state.past.slice(0, -1), future: [...state.future, entry] } };
}

/** Pops the most recently undone entry for redo. Returns null when there is nothing to redo. */
export function popForRedo(state: AnnotationHistoryState): { entry: AnnotationHistoryEntry; next: AnnotationHistoryState } | null {
  if (state.future.length === 0) return null;
  const entry = state.future[state.future.length - 1];
  return { entry, next: { past: [...state.past, entry], future: state.future.slice(0, -1) } };
}
