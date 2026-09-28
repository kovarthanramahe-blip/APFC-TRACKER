import { describe, it, expect } from 'vitest';
import { createHistoryState, pushHistoryEntry, canUndo, canRedo, popForUndo, popForRedo, type AnnotationHistoryEntry } from './annotationHistory';
import { createInkAnnotation, createStickyNote } from './annotations';

const strokeEntry: AnnotationHistoryEntry = { action: 'create', annotation: createInkAnnotation({ documentId: 'd1', renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }) };

describe('annotationHistory — empty state', () => {
  it('a fresh history has nothing to undo or redo', () => {
    const h = createHistoryState();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(popForUndo(h)).toBeNull();
    expect(popForRedo(h)).toBeNull();
  });
});

describe('annotationHistory — undo', () => {
  it('undo pops the most recently pushed entry and moves it to the future (redo) side', () => {
    const h = pushHistoryEntry(createHistoryState(), strokeEntry);
    expect(canUndo(h)).toBe(true);
    const popped = popForUndo(h)!;
    expect(popped.entry).toBe(strokeEntry);
    expect(canUndo(popped.next)).toBe(false);
    expect(canRedo(popped.next)).toBe(true);
  });

  it('undo order is last-in-first-out across multiple pushed entries', () => {
    const noteEntry: AnnotationHistoryEntry = { action: 'create', annotation: createStickyNote({ documentId: 'd1', renderMode: 'raw', color: '#fde047', text: 'x' }) };
    let h = createHistoryState();
    h = pushHistoryEntry(h, strokeEntry);
    h = pushHistoryEntry(h, noteEntry);
    const first = popForUndo(h)!;
    expect(first.entry).toBe(noteEntry);
    const second = popForUndo(first.next)!;
    expect(second.entry).toBe(strokeEntry);
    expect(canUndo(second.next)).toBe(false);
  });
});

describe('annotationHistory — redo', () => {
  it('redo restores an undone entry and moves it back onto the past (undo) side', () => {
    let h = pushHistoryEntry(createHistoryState(), strokeEntry);
    const undone = popForUndo(h)!;
    h = undone.next;
    expect(canRedo(h)).toBe(true);
    const redone = popForRedo(h)!;
    expect(redone.entry).toBe(strokeEntry);
    expect(canRedo(redone.next)).toBe(false);
    expect(canUndo(redone.next)).toBe(true);
  });
});

describe('annotationHistory — a new action after an undo clears the redo stack', () => {
  it('pushing a new entry discards whatever was available to redo, matching standard undo-stack semantics', () => {
    let h = pushHistoryEntry(createHistoryState(), strokeEntry);
    const undone = popForUndo(h)!;
    h = undone.next;
    expect(canRedo(h)).toBe(true);

    const newEntry: AnnotationHistoryEntry = { action: 'delete', annotation: strokeEntry.annotation };
    h = pushHistoryEntry(h, newEntry);
    expect(canRedo(h)).toBe(false);
    expect(canUndo(h)).toBe(true);
  });
});

describe('annotationHistory — updateText entries round-trip before/after text', () => {
  it('carries both the pre- and post-edit text so undo/redo can restore either', () => {
    const entry: AnnotationHistoryEntry = { action: 'updateText', id: 'n1', before: 'old', after: 'new' };
    const h = pushHistoryEntry(createHistoryState(), entry);
    const popped = popForUndo(h)!;
    expect(popped.entry).toEqual({ action: 'updateText', id: 'n1', before: 'old', after: 'new' });
  });
});

describe('annotationHistory — immutability', () => {
  it('pushHistoryEntry never mutates the input state', () => {
    const h = createHistoryState();
    const snapshot = JSON.stringify(h);
    pushHistoryEntry(h, strokeEntry);
    expect(JSON.stringify(h)).toBe(snapshot);
  });
});
