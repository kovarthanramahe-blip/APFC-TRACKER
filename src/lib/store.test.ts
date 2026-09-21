import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage, APP_STORE_PERSIST_VERSION } from './store';
import { createRevisionQueue } from './revisionQueue';
import { DEFAULT_WORKSPACE_ID } from './workspace';

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

// Multi-Workspace OS, Stage 1 — persist migration. Fixtures below simulate a real pre-Stage-1
// persisted blob (version 1, exactly the shape store.ts wrote before this stage — no
// activeWorkspaceId, no workspaceId anywhere) exactly as it would arrive from localStorage or from
// cloudSync.ts's `importAllData` on a device that hasn't upgraded yet.
describe('migrateAppStorage — Multi-Workspace OS Stage 1', () => {
  function oldFixture() {
    return {
      completedTopics: { 't-1': true, 't-2': false },
      notes: [{ id: 'n1', subject: 'general', title: 'Note 1', content: 'x', createdAt: 'a', updatedAt: 'b', pinned: false }],
      attempts: [{ id: 'a1', blueprintId: 'b1', blueprintTitle: 'T', startedAt: 'a', submittedAt: 'b', durationMinutes: 10 }],
      pyqAttempts: [{ id: 'p1', submittedAt: 'a', year: 2020, subject: 'polity', topicId: 't-1' }],
      sessions: [{ id: 's1', mode: 'focus', startedAt: 'a', completedAt: 'b', durationMinutes: 25, completedFully: true }],
      studyLog: { '2026-01-01': { date: '2026-01-01', focusMinutes: 30, topicsCompleted: 1, testsCompleted: 0 } },
      starredQuestionIds: ['q1', 'q2'],
      bookmarkedPyqIds: ['p1'],
      theme: 'dark',
      dailyGoalMinutes: 90,
      rewardUnlocks: { streak_7: '2026-01-01T00:00:00.000Z' },
      studyPlan: { config: {}, capacity: {}, capacityReport: {}, coverageSummary: {}, phases: [], tasks: [], unscheduledTopicIds: [] },
      studyPlanGeneratedAt: '2026-01-01T00:00:00.000Z',
      personalStudyPlanTasks: [{ id: 'pt1', date: '2026-01-02', title: 'Revise', estimatedMinutes: 30, status: 'pending', taskType: 'personal', reason: 'Added by you.' }],
      revisionQueue: { p1: { pyqId: 'p1', box: 2, dueDate: '2026-01-10', lastReviewedDate: '2026-01-08', reviewCount: 1 } },
    };
  }

  it('stamps every array-of-object entity with workspaceId "apfc"', () => {
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(migrated.notes[0].workspaceId).toBe('apfc');
    expect(migrated.attempts[0].workspaceId).toBe('apfc');
    expect(migrated.pyqAttempts[0].workspaceId).toBe('apfc');
    expect(migrated.sessions[0].workspaceId).toBe('apfc');
    expect(migrated.personalStudyPlanTasks[0].workspaceId).toBe('apfc');
  });

  it('stamps the single current studyPlan with workspaceId "apfc"', () => {
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(migrated.studyPlan.workspaceId).toBe('apfc');
  });

  it('sets activeWorkspaceId to the default when missing', () => {
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(migrated.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(migrated.activeWorkspaceId).toBe('apfc');
  });

  it('preserves every existing APFC value exactly — no data loss, no reinterpretation', () => {
    const before = oldFixture();
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(migrated.completedTopics).toEqual(before.completedTopics);
    expect(migrated.studyLog).toEqual(before.studyLog);
    expect(migrated.starredQuestionIds).toEqual(before.starredQuestionIds);
    expect(migrated.bookmarkedPyqIds).toEqual(before.bookmarkedPyqIds);
    expect(migrated.rewardUnlocks).toEqual(before.rewardUnlocks);
    expect(migrated.revisionQueue).toEqual(before.revisionQueue);
    expect(migrated.theme).toBe(before.theme);
    expect(migrated.dailyGoalMinutes).toBe(before.dailyGoalMinutes);
    expect(migrated.studyPlanGeneratedAt).toBe(before.studyPlanGeneratedAt);
    // every field of each stamped item is preserved verbatim alongside the new workspaceId
    expect(migrated.notes[0]).toMatchObject(before.notes[0]);
    expect(migrated.attempts[0]).toMatchObject(before.attempts[0]);
    expect(migrated.pyqAttempts[0]).toMatchObject(before.pyqAttempts[0]);
    expect(migrated.sessions[0]).toMatchObject(before.sessions[0]);
    expect(migrated.personalStudyPlanTasks[0]).toMatchObject(before.personalStudyPlanTasks[0]);
    expect(migrated.studyPlan).toMatchObject(before.studyPlan);
  });

  it('deliberately does NOT restructure keyed/record or plain-string-array fields (safe scope for this stage)', () => {
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    // still flat Records, not namespaced under a workspace key — unchanged shape
    expect(migrated.completedTopics).toEqual({ 't-1': true, 't-2': false });
    expect(migrated.studyLog['2026-01-01'].workspaceId).toBeUndefined();
    expect(migrated.rewardUnlocks.streak_7).toBe('2026-01-01T00:00:00.000Z');
    expect(migrated.revisionQueue.p1.workspaceId).toBeUndefined();
    // still plain string arrays, not objects
    expect(migrated.starredQuestionIds).toEqual(['q1', 'q2']);
    expect(typeof migrated.starredQuestionIds[0]).toBe('string');
  });

  it('is idempotent — migrating already-migrated data again does not double-stamp or change values', () => {
    const once = migrateAppStorage(oldFixture(), 1) as any;
    const twice = migrateAppStorage(once, 1) as any;
    expect(twice).toEqual(once);
    expect(twice.notes[0].workspaceId).toBe('apfc');
  });

  it('is a no-op when the stored version is already current', () => {
    const fixture = { ...oldFixture(), activeWorkspaceId: 'apfc' };
    const result = migrateAppStorage(fixture, APP_STORE_PERSIST_VERSION) as any;
    expect(result.notes[0].workspaceId).toBeUndefined();
  });

  it('never overwrites an item that already carries a real workspaceId', () => {
    const fixture = oldFixture();
    (fixture.notes[0] as any).workspaceId = 'upsc_cse';
    const migrated = migrateAppStorage(fixture, 1) as any;
    expect(migrated.notes[0].workspaceId).toBe('upsc_cse');
  });

  it('handles a missing/empty persisted state without throwing', () => {
    expect(() => migrateAppStorage(undefined, 1)).not.toThrow();
    expect(() => migrateAppStorage(null, 1)).not.toThrow();
    expect(() => migrateAppStorage({}, 1)).not.toThrow();
    const result = migrateAppStorage({}, 1) as any;
    expect(result.activeWorkspaceId).toBe('apfc');
    expect(result.notes).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const fixture = oldFixture();
    const snapshot = JSON.parse(JSON.stringify(fixture));
    migrateAppStorage(fixture, 1);
    expect(fixture).toEqual(snapshot);
  });

  it('is deterministic — running it twice on the same fresh input produces the same result', () => {
    const a = migrateAppStorage(oldFixture(), 1);
    const b = migrateAppStorage(oldFixture(), 1);
    expect(a).toEqual(b);
  });

  it('does not touch PYQ_BANK/QUESTION_BANK/syllabus/generated-question data — none of it is persisted user state', () => {
    // migrateAppStorage only ever reads/writes keys that exist on the persisted store fixture
    // above; there is no code path in it that imports or reaches data/pyq.ts, data/questionBank.ts,
    // data/syllabus.ts, or data/generatedQuestionBank.ts at all.
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(Object.keys(migrated).sort()).toEqual(
      [
        'activeWorkspaceId',
        'attempts',
        'bookmarkedPyqIds',
        'completedTopics',
        'dailyGoalMinutes',
        'notes',
        'personalStudyPlanTasks',
        'pyqAttempts',
        'revisionQueue',
        'rewardUnlocks',
        'sessions',
        'starredQuestionIds',
        'studyLog',
        'studyPlan',
        'studyPlanGeneratedAt',
        'theme',
      ].sort(),
    );
  });
});
