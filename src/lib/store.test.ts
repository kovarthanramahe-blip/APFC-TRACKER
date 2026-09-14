import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData } from './store';
import { createRevisionQueue } from './revisionQueue';

// Focused on Stage 2's revision-queue wiring only — not a broad store audit. The Zustand store
// works directly outside React for in-memory state (persist's localStorage access is safely
// absent in this Vitest environment, as already relied on elsewhere in this codebase).
function resetStore() {
  useAppStore.setState({ revisionQueue: createRevisionQueue() });
}

describe('store — revision queue integration', () => {
  beforeEach(resetStore);

  it('starts as an empty queue', () => {
    expect(useAppStore.getState().revisionQueue).toEqual({});
  });

  it('recordRevisionCorrect advances the item and is reflected in state', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    const item = useAppStore.getState().revisionQueue.q1;
    expect(item.box).toBe(2);
    expect(item.reviewCount).toBe(1);
    expect(item.lastReviewedDate).toBe('2026-01-08');
  });

  it('recordRevisionIncorrect resets the item to box 1', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-01');
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-03'); // now box 3
    useAppStore.getState().recordRevisionIncorrect('q1', '2026-01-08');
    expect(useAppStore.getState().revisionQueue.q1.box).toBe(1);
  });

  it('tracks multiple pyqIds independently', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    useAppStore.getState().recordRevisionIncorrect('q2', '2026-01-08');
    const queue = useAppStore.getState().revisionQueue;
    expect(queue.q1.box).toBe(2);
    expect(queue.q2.box).toBe(1);
  });

  it('resetAllData clears the revision queue back to empty', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    useAppStore.getState().resetAllData();
    expect(useAppStore.getState().revisionQueue).toEqual({});
  });

  it('exportAllData includes the revision queue', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    const exported = JSON.parse(exportAllData());
    expect(exported.revisionQueue.q1.box).toBe(2);
  });

  it('importAllData restores a previously exported revision queue', () => {
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    const exported = exportAllData();
    resetStore();
    expect(useAppStore.getState().revisionQueue).toEqual({});
    importAllData(exported);
    expect(useAppStore.getState().revisionQueue.q1.box).toBe(2);
  });

  it('importAllData defaults to an empty queue when the field is missing (older export)', () => {
    const legacyExport = JSON.stringify({ completedTopics: {}, notes: [], attempts: [], pyqAttempts: [] });
    importAllData(legacyExport);
    expect(useAppStore.getState().revisionQueue).toEqual({});
  });

  it('recording a revision result never touches unrelated store data', () => {
    const before = { pyqAttempts: useAppStore.getState().pyqAttempts, bookmarkedPyqIds: useAppStore.getState().bookmarkedPyqIds };
    useAppStore.getState().recordRevisionCorrect('q1', '2026-01-08');
    expect(useAppStore.getState().pyqAttempts).toBe(before.pyqAttempts);
    expect(useAppStore.getState().bookmarkedPyqIds).toBe(before.bookmarkedPyqIds);
  });
});
