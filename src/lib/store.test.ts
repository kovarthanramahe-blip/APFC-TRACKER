import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage, APP_STORE_PERSIST_VERSION } from './store';
import { createRevisionQueue } from './revisionQueue';
import { DEFAULT_WORKSPACE_ID } from './workspace';
import { hasMeaningfulData } from './cloudSync';
import { selectImportedContentByType, type ImportedContent } from './contentImport';
import { PYQ_BANK } from '../data/pyq';
import type { ContentRelationship } from './contentRelationships';
import type { Note } from './types';
import { countRelatedContent } from './relatedContentSummary';

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
        'contentRelationships',
        'dailyGoalMinutes',
        'importedContent',
        'inactiveWorkspaceOwnedData',
        'notes',
        'personalStudyPlanTasks',
        'phdMicroTargets',
        'phdResearchStartDate',
        'phdTopicAreas',
        'pyqAttempts',
        'revisionQueue',
        'rewardUnlocks',
        'sessions',
        'starredQuestionIds',
        'studyLog',
        'studyPlan',
        'studyPlanGeneratedAt',
        'theme',
        'upscCsePrelimsPyqAttempts',
        'upscCseStudyTasks',
        'upscCseSyllabusCoverage',
      ].sort(),
    );
  });

  // Stage 2 additions to the SAME migration function (see store.ts's combined Stage 1 + Stage 2
  // migration comment) — these specifically cover the version-2 -> version-3 step.
  it('Stage-1-shaped data (already version 2: workspaceId stamped, activeWorkspaceId present, but no inactiveWorkspaceOwnedData yet) gets inactiveWorkspaceOwnedData added', () => {
    const stage1Fixture = { ...(migrateAppStorage(oldFixture(), 1) as any) };
    delete stage1Fixture.inactiveWorkspaceOwnedData; // simulate real version-2 data, pre-Stage-2
    const migrated = migrateAppStorage(stage1Fixture, 2) as any;
    expect(migrated.inactiveWorkspaceOwnedData).toEqual({});
    // and everything Stage 1 already stamped is left exactly as it was — not re-stamped/altered
    expect(migrated.notes[0]).toEqual(stage1Fixture.notes[0]);
    expect(migrated.studyPlan).toEqual(stage1Fixture.studyPlan);
    expect(migrated.activeWorkspaceId).toBe('apfc');
  });

  it('a true Stage-0 fixture (version 1, nothing workspace-related at all) migrates straight to the full Stage-2 shape in one pass', () => {
    const migrated = migrateAppStorage(oldFixture(), 1) as any;
    expect(migrated.activeWorkspaceId).toBe('apfc');
    expect(migrated.inactiveWorkspaceOwnedData).toEqual({});
    expect(migrated.notes[0].workspaceId).toBe('apfc');
  });

  it('never overwrites an already-present inactiveWorkspaceOwnedData archive — only backfills missing fields within each snapshot', () => {
    const fixture = { ...oldFixture(), inactiveWorkspaceOwnedData: { upsc_cse: { notes: [{ id: 'x' }] } } };
    const migrated = migrateAppStorage(fixture, 1) as any;
    // the existing snapshot's own content (notes) is fully preserved, not replaced...
    expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.notes).toEqual([{ id: 'x' }]);
    // ...but the version-4 importedContent / version-5 contentRelationships backfills still reach
    // INTO this archived snapshot too (see withWorkspaceOwnedDefaultsInArchive), not just the
    // top-level active fields.
    expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.importedContent).toEqual([]);
    expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.contentRelationships).toEqual([]);
  });

  it('the full migration (version 1 straight through to current) is idempotent end-to-end', () => {
    const once = migrateAppStorage(oldFixture(), 1);
    const twice = migrateAppStorage(once, 1);
    expect(twice).toEqual(once);
  });
});

// Multi-Workspace OS, Stage 2 — real, tested workspace scoping while there is still only one real
// workspace (apfc). setActiveWorkspaceId is not called by any UI yet (no switcher — see the task
// report), but the mechanism it drives is exercised directly here, exactly like a future switcher
// would call it, to prove isolation actually works before any UI is built on top of it.
describe('Multi-Workspace OS Stage 2 — workspace-scoped write paths & isolation', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      contentRelationships: [],
    });
  }
  beforeEach(fullReset);

  describe('write-path stamping — new records receive the active workspace', () => {
    it('upsertNote stamps a brand-new note with the active workspace', () => {
      useAppStore.getState().upsertNote({
        id: 'n1',
        subject: 'general',
        title: 'T',
        content: 'C',
        createdAt: 'a',
        updatedAt: 'b',
        pinned: false,
      });
      expect(useAppStore.getState().notes[0].workspaceId).toBe('apfc');
    });

    it('upsertNote preserves an already-stamped note\'s workspaceId rather than overwriting it', () => {
      useAppStore.getState().upsertNote({
        id: 'n1',
        subject: 'general',
        title: 'T',
        content: 'C',
        createdAt: 'a',
        updatedAt: 'b',
        pinned: false,
        workspaceId: 'upsc_cse',
      });
      expect(useAppStore.getState().notes[0].workspaceId).toBe('upsc_cse');
    });

    it('addAttempt / addPyqAttempt / addSession stamp new items with the active workspace', () => {
      useAppStore.getState().addAttempt({
        id: 'a1', blueprintId: 'b1', blueprintTitle: 'T', startedAt: 'a', submittedAt: 'b', durationMinutes: 10,
        questionIds: [], answers: {}, correctCount: 0, wrongCount: 0, skippedCount: 0, score: 0, maxScore: 0, subjectBreakdown: {},
      });
      useAppStore.getState().addPyqAttempt({
        id: 'p1', submittedAt: 'a', year: 2020, subject: 'polity', topicId: 't-1', questionIds: [], answers: {},
        correctCount: 0, wrongCount: 0, unansweredCount: 0, score: 0, accuracy: 0,
      });
      useAppStore.getState().addSession({ id: 's1', mode: 'focus', startedAt: 'a', completedAt: 'b', durationMinutes: 25, completedFully: true });
      expect(useAppStore.getState().attempts[0].workspaceId).toBe('apfc');
      expect(useAppStore.getState().pyqAttempts[0].workspaceId).toBe('apfc');
      expect(useAppStore.getState().sessions[0].workspaceId).toBe('apfc');
    });

    it('setStudyPlan stamps the plan and setPersonalStudyPlanTasks stamps every task', () => {
      useAppStore.getState().setStudyPlan({
        config: {} as any, capacity: {} as any, capacityReport: {} as any, coverageSummary: {} as any,
        phases: [], tasks: [], unscheduledTopicIds: [],
      });
      useAppStore.getState().setPersonalStudyPlanTasks([
        { id: 'pt1', date: '2026-01-02', title: 'X', estimatedMinutes: 10, status: 'pending', taskType: 'personal', reason: 'Added by you.' },
      ]);
      expect(useAppStore.getState().studyPlan?.workspaceId).toBe('apfc');
      expect(useAppStore.getState().personalStudyPlanTasks[0].workspaceId).toBe('apfc');
    });
  });

  describe('setActiveWorkspaceId — archive/restore isolation', () => {
    it('is a no-op when switching to the workspace that is already active', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false });
      const before = useAppStore.getState();
      useAppStore.getState().setActiveWorkspaceId('apfc');
      const after = useAppStore.getState();
      expect(after.notes).toBe(before.notes); // same reference — genuinely untouched, not just equal
      expect(after.inactiveWorkspaceOwnedData).toBe(before.inactiveWorkspaceOwnedData);
    });

    it('switching away starts the new workspace completely empty', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'APFC note', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false });
      useAppStore.getState().toggleTopic('t-1');
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      expect(useAppStore.getState().notes).toEqual([]);
      expect(useAppStore.getState().completedTopics).toEqual({});
      expect(useAppStore.getState().activeWorkspaceId).toBe('upsc_cse');
    });

    it('the outgoing workspace\'s data is archived, not lost, and is restored exactly on switching back', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'APFC note', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false });
      useAppStore.getState().toggleTopic('t-1');
      useAppStore.getState().toggleStarredQuestion('q1');
      useAppStore.getState().toggleBookmarkedPyq('p1');
      useAppStore.getState().bumpFocusMinutes('2026-01-01', 30);
      useAppStore.getState().recordRewardUnlocks(['streak_7']);
      useAppStore.getState().recordRevisionCorrect('p1', '2026-01-08');

      useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archive apfc, arrive empty
      expect(useAppStore.getState().notes).toEqual([]);

      useAppStore.getState().setActiveWorkspaceId('apfc'); // restore apfc exactly
      const state = useAppStore.getState();
      expect(state.notes).toHaveLength(1);
      expect(state.notes[0].title).toBe('APFC note');
      expect(state.completedTopics).toEqual({ 't-1': true });
      expect(state.starredQuestionIds).toEqual(['q1']);
      expect(state.bookmarkedPyqIds).toEqual(['p1']);
      expect(state.studyLog['2026-01-01'].focusMinutes).toBe(30);
      expect(state.rewardUnlocks.streak_7).toBeTruthy();
      expect(state.revisionQueue.p1.box).toBe(2);
    });

    it('keyed structures stay fully isolated between two workspaces active in the same session', () => {
      useAppStore.getState().toggleTopic('apfc-topic');
      useAppStore.getState().toggleStarredQuestion('apfc-q');
      useAppStore.getState().recordRevisionCorrect('apfc-pyq', '2026-01-01');

      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().toggleTopic('cse-topic');
      useAppStore.getState().toggleStarredQuestion('cse-q');
      useAppStore.getState().recordRevisionCorrect('cse-pyq', '2026-01-01');

      // upsc_cse's view only ever shows upsc_cse's own data
      expect(useAppStore.getState().completedTopics).toEqual({ 'cse-topic': true });
      expect(useAppStore.getState().starredQuestionIds).toEqual(['cse-q']);
      expect(Object.keys(useAppStore.getState().revisionQueue)).toEqual(['cse-pyq']);

      useAppStore.getState().setActiveWorkspaceId('apfc');
      // apfc's own data is completely untouched by anything done while upsc_cse was active
      expect(useAppStore.getState().completedTopics).toEqual({ 'apfc-topic': true });
      expect(useAppStore.getState().starredQuestionIds).toEqual(['apfc-q']);
      expect(Object.keys(useAppStore.getState().revisionQueue)).toEqual(['apfc-pyq']);
    });

    it('a third, never-before-visited workspace also starts empty (not accidentally sharing data with either existing one)', () => {
      useAppStore.getState().toggleTopic('apfc-topic');
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().toggleTopic('cse-topic');
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().completedTopics).toEqual({});
      expect(useAppStore.getState().notes).toEqual([]);
    });
  });

  describe('resetAllData — Stage 2', () => {
    it('clears inactiveWorkspaceOwnedData for every workspace, not just the active one', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false });
      useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archives apfc's note
      expect(Object.keys(useAppStore.getState().inactiveWorkspaceOwnedData)).toEqual(['apfc']);
      useAppStore.getState().resetAllData();
      expect(useAppStore.getState().inactiveWorkspaceOwnedData).toEqual({});
    });
  });

  describe('exportAllData / importAllData — do not lose workspace-scoped data', () => {
    it('round-trips a non-empty inactiveWorkspaceOwnedData archive', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'APFC note', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false });
      useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archives apfc's note away
      const json = exportAllData();

      fullReset(); // simulate a fresh device with nothing loaded yet
      expect(useAppStore.getState().inactiveWorkspaceOwnedData).toEqual({});

      importAllData(json);
      expect(Object.keys(useAppStore.getState().inactiveWorkspaceOwnedData)).toEqual(['apfc']);
      expect(useAppStore.getState().inactiveWorkspaceOwnedData.apfc?.notes[0]?.title).toBe('APFC note');

      // and switching back to apfc after import restores it correctly, same as within one session
      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().notes[0]?.title).toBe('APFC note');
    });

    it('importAllData defaults inactiveWorkspaceOwnedData to {} for a pre-Stage-2 export (older backup file)', () => {
      const legacyExport = JSON.stringify({ completedTopics: {}, notes: [], attempts: [], pyqAttempts: [] });
      importAllData(legacyExport);
      expect(useAppStore.getState().inactiveWorkspaceOwnedData).toEqual({});
    });
  });
});

// Multi-Workspace OS, Stage 3A — the workspace switcher makes setActiveWorkspaceId a REAL,
// user-triggered action for the first time (Stage 2 only exercised it directly in tests). This
// specifically re-verifies, via the exact same exportAllData/importAllData path cloud sync uses
// (see cloudSync.ts's currentLocalData/reconcileOnSignIn), that switching workspaces through the
// real UI action still can't cause the cross-device data-loss scenario investigated for this
// stage: a device reconciling cloud data must end up with EVERY workspace's data intact, not just
// whichever workspace happened to be active when the cloud row was last written.
describe('Multi-Workspace OS Stage 3A — switcher-driven cloud-sync safety', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      contentRelationships: [],
    });
  }
  beforeEach(fullReset);

  it('a fresh device importing a cloud blob ends up with BOTH the active workspace and every archived workspace intact', () => {
    // Device A: real APFC usage, then a real workspace switch (the actual action the sidebar
    // switcher now calls), then some real UPSC CSE usage.
    useAppStore.getState().upsertNote({ id: 'n-apfc', subject: 'general', title: 'APFC note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().toggleTopic('apfc-topic');
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().upsertNote({ id: 'n-cse', subject: 'general', title: 'UPSC CSE note', content: 'y', createdAt: 'b', updatedAt: 'b', pinned: false });
    useAppStore.getState().toggleTopic('cse-topic');

    const cloudPayload = JSON.parse(exportAllData());

    // Device B: signs in fresh, "cloud wins" (reconcileOnSignIn's real path) — importAllData is
    // exactly what that calls.
    fullReset();
    importAllData(JSON.stringify(cloudPayload));

    // Device B lands on whatever was active when the payload was written (upsc_cse) — its own
    // data is immediately visible, no switch needed.
    expect(useAppStore.getState().activeWorkspaceId).toBe('upsc_cse');
    expect(useAppStore.getState().notes[0]?.title).toBe('UPSC CSE note');
    expect(useAppStore.getState().completedTopics).toEqual({ 'cse-topic': true });

    // And APFC's data — archived at export time — is NOT lost: switching to it on device B
    // restores it exactly.
    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().notes[0]?.title).toBe('APFC note');
    expect(useAppStore.getState().completedTopics).toEqual({ 'apfc-topic': true });
  });

  it('hasMeaningfulData recognizes data immediately after switching to a brand-new workspace (archived data alone is enough)', () => {
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'APFC note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archives the apfc note; upsc_cse itself starts empty
    const payload = JSON.parse(exportAllData());
    // The push gate (startCloudSync) must NOT treat this as "nothing to sync" — that would mean
    // a real device's cloud row never receives the archived workspace's data at all.
    expect(hasMeaningfulData(payload)).toBe(true);
  });

  it('a genuinely empty app (never used, no workspace ever switched) is still correctly treated as having nothing to sync', () => {
    const payload = JSON.parse(exportAllData());
    expect(hasMeaningfulData(payload)).toBe(false);
  });

  it('switching to the same workspace repeatedly does not create phantom archive entries', () => {
    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().inactiveWorkspaceOwnedData).toEqual({});
  });
});

// Multi-Workspace OS, Stage 3B-2A — PYQ-specific isolation. Stage 2's generic swap tests already
// prove the mechanism in general (notes, completedTopics, etc.); this adds explicit coverage for
// PYQ practice progress specifically, since that's what this stage's PYQ architecture depends on.
describe('Multi-Workspace OS Stage 3B-2A — PYQ progress isolation across workspaces', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      contentRelationships: [],
    });
  }
  beforeEach(fullReset);

  function pyqAttemptFixture(id: string): Parameters<ReturnType<typeof useAppStore.getState>['addPyqAttempt']>[0] {
    return {
      id,
      submittedAt: '2026-01-01T00:00:00.000Z',
      year: 2020,
      subject: 'polity',
      topicId: 't-1',
      questionIds: [],
      answers: {},
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      score: 0,
      accuracy: 0,
    };
  }

  it('a PYQ attempt recorded under APFC does not appear after switching to UPSC CSE', () => {
    useAppStore.getState().addPyqAttempt(pyqAttemptFixture('apfc-a1'));
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().pyqAttempts).toEqual([]);
  });

  it('APFC and UPSC CSE accumulate entirely separate PYQ attempt histories, restored exactly on switch-back', () => {
    useAppStore.getState().addPyqAttempt(pyqAttemptFixture('apfc-a1'));
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addPyqAttempt(pyqAttemptFixture('cse-a1'));
    useAppStore.getState().addPyqAttempt(pyqAttemptFixture('cse-a2'));

    expect(useAppStore.getState().pyqAttempts.map((a) => a.id).sort()).toEqual(['cse-a1', 'cse-a2']);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().pyqAttempts.map((a) => a.id)).toEqual(['apfc-a1']);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().pyqAttempts.map((a) => a.id).sort()).toEqual(['cse-a1', 'cse-a2']);
  });

  it('bookmarked PYQs and revision-queue progress are also isolated per workspace', () => {
    useAppStore.getState().toggleBookmarkedPyq('apfc-pyq-1');
    useAppStore.getState().recordRevisionCorrect('apfc-pyq-1', '2026-01-08');

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual([]);
    expect(useAppStore.getState().revisionQueue).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual(['apfc-pyq-1']);
    expect(useAppStore.getState().revisionQueue['apfc-pyq-1'].box).toBe(2);
  });
});

// Import-First Content Repository foundation — the `importedContent` collection (ImportedContent[]
// from lib/contentImport.ts), persisted and workspace-scoped exactly like every other collection
// in this store (see lib/store.ts's WorkspaceOwnedData). No UI writes to this yet — these tests
// exercise the store actions directly, the same way a future UI eventually would.
describe('Import-First Content Repository — importedContent collection', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      contentRelationships: [],
      importedContent: [],
    });
  }
  beforeEach(fullReset);

  function contentFixture(overrides: Partial<ImportedContent> = {}): ImportedContent {
    return {
      id: overrides.id ?? 'c1',
      workspaceId: overrides.workspaceId ?? 'apfc',
      contentType: overrides.contentType ?? 'note',
      title: overrides.title ?? 'Imported thing',
      rawContent: overrides.rawContent ?? 'Some raw text',
      provenance: overrides.provenance ?? { sourceFilename: 'source.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
      metadata: overrides.metadata,
    };
  }

  describe('add / update / delete', () => {
    it('addImportedContent adds a new item, stamped with the active workspace', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      expect(useAppStore.getState().importedContent).toHaveLength(1);
      expect(useAppStore.getState().importedContent[0].workspaceId).toBe('apfc');
    });

    it('addImportedContent always uses the CURRENT active workspace, overriding any workspaceId already on the item', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1', workspaceId: 'phd_research' }));
      expect(useAppStore.getState().importedContent[0].workspaceId).toBe('apfc');
    });

    it('updateImportedContent updates the matching item\'s fields, leaving others untouched', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1', title: 'Original' }));
      useAppStore.getState().updateImportedContent('c1', { title: 'Renamed', rawContent: 'New content' });
      const item = useAppStore.getState().importedContent[0];
      expect(item.title).toBe('Renamed');
      expect(item.rawContent).toBe('New content');
      expect(item.id).toBe('c1');
      expect(item.workspaceId).toBe('apfc');
    });

    it('updateImportedContent cannot change id or workspaceId (not part of its accepted update type)', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      // @ts-expect-error — id/workspaceId are intentionally excluded from the update type
      useAppStore.getState().updateImportedContent('c1', { id: 'different', workspaceId: 'upsc_cse' });
      expect(useAppStore.getState().importedContent[0].id).toBe('c1');
      expect(useAppStore.getState().importedContent[0].workspaceId).toBe('apfc');
    });

    it('updateImportedContent on an unknown id is a safe no-op', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().updateImportedContent('does-not-exist', { title: 'X' });
      expect(useAppStore.getState().importedContent).toHaveLength(1);
      expect(useAppStore.getState().importedContent[0].title).toBe('Imported thing');
    });

    it('deleteImportedContent removes exactly the matching item', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().deleteImportedContent('c1');
      expect(useAppStore.getState().importedContent.map((c) => c.id)).toEqual(['c2']);
    });
  });

  describe('retrieve / content-type filtering', () => {
    it('retrieve: all added items are readable back from the store', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      expect(useAppStore.getState().importedContent.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    });

    it('selectImportedContentByType filters correctly across mixed content types', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'n1', contentType: 'note' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'q1', contentType: 'question_bank' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'q2', contentType: 'question_bank' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'r1', contentType: 'research_document' }));

      const questionBankItems = selectImportedContentByType(useAppStore.getState().importedContent, 'question_bank');
      expect(questionBankItems.map((c) => c.id).sort()).toEqual(['q1', 'q2']);

      const noteItems = selectImportedContentByType(useAppStore.getState().importedContent, 'note');
      expect(noteItems.map((c) => c.id)).toEqual(['n1']);

      const bibliographyItems = selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography');
      expect(bibliographyItems).toEqual([]);
    });
  });

  describe('workspace isolation (mandatory)', () => {
    it('APFC content never appears in UPSC CSE', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'apfc-1' }));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      expect(useAppStore.getState().importedContent).toEqual([]);
    });

    it('UPSC CSE content never appears in PhD Research', () => {
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'cse-1' }));
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().importedContent).toEqual([]);
    });

    it('PhD Research content never appears in APFC', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'phd-1' }));
      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().importedContent).toEqual([]);
    });

    it('all three workspaces keep entirely separate, correctly restored collections', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'apfc-1' }));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'cse-1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'cse-2' }));
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'phd-1' }));

      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().importedContent.map((c) => c.id)).toEqual(['apfc-1']);
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      expect(useAppStore.getState().importedContent.map((c) => c.id).sort()).toEqual(['cse-1', 'cse-2']);
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().importedContent.map((c) => c.id)).toEqual(['phd-1']);
    });
  });

  describe('persistence / migration', () => {
    it('a pre-Stage-4 persisted blob (no importedContent field at all) migrates to importedContent: []', () => {
      const oldBlob = { notes: [], activeWorkspaceId: 'apfc', inactiveWorkspaceOwnedData: {} };
      const migrated = migrateAppStorage(oldBlob, 3) as any;
      expect(migrated.importedContent).toEqual([]);
    });

    it('migration is idempotent for importedContent (running twice does not duplicate or reset it)', () => {
      const withContent = { importedContent: [contentFixture({ id: 'kept' })], activeWorkspaceId: 'apfc', inactiveWorkspaceOwnedData: {} };
      const once = migrateAppStorage(withContent, 3) as any;
      const twice = migrateAppStorage(once, 3) as any;
      expect(twice.importedContent).toEqual([contentFixture({ id: 'kept' })]);
    });

    it('a no-op migration (already current version) leaves importedContent completely untouched', () => {
      const current = { importedContent: [contentFixture({ id: 'kept' })] };
      const migrated = migrateAppStorage(current, APP_STORE_PERSIST_VERSION) as any;
      expect(migrated.importedContent).toEqual([contentFixture({ id: 'kept' })]);
    });
  });

  describe('export / import', () => {
    it('exportAllData / importAllData round-trip importedContent for the active workspace', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      const json = exportAllData();
      fullReset();
      expect(useAppStore.getState().importedContent).toEqual([]);
      importAllData(json);
      expect(useAppStore.getState().importedContent).toHaveLength(1);
      expect(useAppStore.getState().importedContent[0].id).toBe('c1');
    });

    it('exportAllData / importAllData round-trip importedContent archived under an inactive workspace too', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'apfc-1' }));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archives apfc's importedContent away
      const json = exportAllData();
      fullReset();
      importAllData(json);
      expect(useAppStore.getState().inactiveWorkspaceOwnedData.apfc?.importedContent?.[0]?.id).toBe('apfc-1');
      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().importedContent[0]?.id).toBe('apfc-1');
    });

    it('importAllData defaults importedContent to [] for an older export that predates this field', () => {
      const legacyExport = JSON.stringify({ completedTopics: {}, notes: [], attempts: [], pyqAttempts: [] });
      importAllData(legacyExport);
      expect(useAppStore.getState().importedContent).toEqual([]);
    });
  });

  describe('cloud-sync payload inclusion', () => {
    it('hasMeaningfulData recognizes a device whose ONLY data is imported content', () => {
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      const payload = JSON.parse(exportAllData());
      expect(hasMeaningfulData(payload)).toBe(true);
    });

    it('an empty importedContent array does not, by itself, make an otherwise-empty payload "meaningful"', () => {
      const payload = JSON.parse(exportAllData());
      expect(hasMeaningfulData(payload)).toBe(false);
    });
  });

  describe('regression: existing Notes and APFC data are unaffected', () => {
    it('adding imported content never touches the separate `notes` collection', () => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Real note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      expect(useAppStore.getState().notes).toHaveLength(1);
      expect(useAppStore.getState().notes[0].title).toBe('Real note');
      expect(useAppStore.getState().importedContent).toHaveLength(1);
    });

    it('APFC PYQ_BANK is completely unaffected by this stage (still exactly 458 questions)', () => {
      expect(PYQ_BANK.length).toBe(458);
    });
  });
});

// Source <-> Research Document Linking — ContentRelationship[] (lib/contentRelationships.ts),
// persisted and workspace-scoped exactly like importedContent itself (see lib/store.ts's
// WorkspaceOwnedData). These tests exercise the store actions directly, the same way the linking
// UI (pages/WorkingBibliography.tsx, pages/PhdResearch.tsx) eventually does.
describe('Repository relationships — contentRelationships (ImportedContent <-> ImportedContent, and Notes <-> Research Repository)', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      importedContent: [],
      contentRelationships: [],
    });
  }
  beforeEach(fullReset);

  function contentFixture(overrides: Partial<ImportedContent> = {}): ImportedContent {
    return {
      id: overrides.id ?? 'c1',
      workspaceId: overrides.workspaceId ?? 'phd_research',
      contentType: overrides.contentType ?? 'research_document',
      title: overrides.title ?? 'Imported thing',
      rawContent: overrides.rawContent ?? 'Some raw text',
      provenance: overrides.provenance ?? { sourceFilename: 'source.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
      metadata: overrides.metadata,
    };
  }

  function noteFixture(overrides: Partial<Note> = {}): Note {
    return {
      id: overrides.id ?? 'note1',
      subject: overrides.subject ?? 'general',
      title: overrides.title ?? 'A note',
      content: overrides.content ?? 'Note content',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
      pinned: overrides.pinned ?? false,
      workspaceId: overrides.workspaceId,
      topicId: overrides.topicId,
    };
  }

  function relationshipFixture(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
    return {
      id: overrides.id ?? 'r1',
      workspaceId: overrides.workspaceId ?? 'phd_research',
      sourceId: overrides.sourceId ?? 'c1',
      sourceType: overrides.sourceType ?? 'imported_content',
      targetId: overrides.targetId ?? 'c2',
      targetType: overrides.targetType ?? 'imported_content',
      type: overrides.type ?? 'cites',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    };
  }

  const ic = (id: string) => ({ id, type: 'imported_content' as const });
  const note = (id: string) => ({ id, type: 'note' as const });

  describe('create / delete (imported-content <-> imported-content, existing behaviour)', () => {
    it('addContentRelationship creates a relationship stamped with the active workspace', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2', contentType: 'bibliography' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('c2'), target: ic('c1'), type: 'cites' });
      expect(result.status).toBe('ok');
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
      expect(useAppStore.getState().contentRelationships[0].workspaceId).toBe('phd_research');
      expect(useAppStore.getState().contentRelationships[0].sourceType).toBe('imported_content');
      expect(useAppStore.getState().contentRelationships[0].targetType).toBe('imported_content');
    });

    it('deleteContentRelationship removes exactly the matching relationship', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c3' }));
      const r1 = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c3'), type: 'supports' });
      expect(useAppStore.getState().contentRelationships).toHaveLength(2);

      if (r1.status !== 'ok') throw new Error('expected ok');
      useAppStore.getState().deleteContentRelationship(r1.relationship.id);
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
      expect(useAppStore.getState().contentRelationships[0].targetId).toBe('c3');
    });
  });

  describe('imported-content endpoint validation', () => {
    it('rejects a self-link', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c1'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('rejects a duplicate (same source, target and type)', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });
      const result = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'duplicate' });
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    });

    it('rejects a sourceId/targetId that does not exist in the current workspace at all', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('does-not-exist'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
    });
  });

  describe('note endpoint validation', () => {
    it('a note can be the target of a relationship whose source is an imported_content item', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('note1'), type: 'cites' });
      expect(result.status).toBe('ok');
      expect(useAppStore.getState().contentRelationships[0]).toMatchObject({ sourceId: 'c1', sourceType: 'imported_content', targetId: 'note1', targetType: 'note' });
    });

    it('a note can be the source of a relationship too', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      const result = useAppStore.getState().addContentRelationship({ source: note('note1'), target: ic('c1'), type: 'related_to' });
      expect(result.status).toBe('ok');
    });

    it('rejects a note id that does not exist in the active workspace\'s notes', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('does-not-exist'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
    });

    it('an id that is a valid ImportedContent id is never accepted as a note id (ids stay unambiguous across the two collections)', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'shared-id' }));
      const result = useAppStore.getState().addContentRelationship({ source: ic('shared-id'), target: note('shared-id'), type: 'cites' });
      // 'shared-id' is not in state.notes, so as a note target it is invalid — even though the
      // exact same string IS a valid imported_content id.
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
    });

    it('rejects a self-link between a note and itself', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      const result = useAppStore.getState().addContentRelationship({ source: note('note1'), target: note('note1'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
    });
  });

  describe('workspace isolation (mandatory) — cross-workspace relationships are rejected at runtime', () => {
    it('a relationship created in phd_research is invisible after switching to apfc, and restored on switch-back', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().contentRelationships).toEqual([]);

      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    });

    it('APFC content cannot be linked from within UPSC CSE or PhD Research — the id simply is not valid there', () => {
      useAppStore.getState().setActiveWorkspaceId('apfc');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'apfc-doc', workspaceId: 'apfc' }));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // archives apfc's content away
      useAppStore.getState().addImportedContent(contentFixture({ id: 'cse-doc', workspaceId: 'upsc_cse' }));

      // Attempting to link the (now archived, invisible) apfc-doc id from upsc_cse must fail —
      // it is not a member of upsc_cse's own importedContent ids.
      const result = useAppStore.getState().addContentRelationship({ source: ic('apfc-doc'), target: ic('cse-doc'), type: 'related_to' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_source' });
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('UPSC CSE content cannot be linked from within PhD Research', () => {
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'cse-doc', workspaceId: 'upsc_cse' }));
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'phd-doc', workspaceId: 'phd_research' }));

      const result = useAppStore.getState().addContentRelationship({ source: ic('phd-doc'), target: ic('cse-doc'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
    });

    it('PhD Research content cannot be linked from within APFC', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'phd-doc', workspaceId: 'phd_research' }));
      useAppStore.getState().setActiveWorkspaceId('apfc');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'apfc-doc', workspaceId: 'apfc' }));

      const result = useAppStore.getState().addContentRelationship({ source: ic('apfc-doc'), target: ic('phd-doc'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
    });

    it('a note from a different (archived-away) workspace cannot be linked — same runtime rejection as imported content', () => {
      useAppStore.getState().setActiveWorkspaceId('apfc');
      useAppStore.getState().upsertNote(noteFixture({ id: 'apfc-note' }));
      useAppStore.getState().setActiveWorkspaceId('phd_research'); // archives the apfc note away
      useAppStore.getState().addImportedContent(contentFixture({ id: 'phd-doc' }));

      const result = useAppStore.getState().addContentRelationship({ source: ic('phd-doc'), target: note('apfc-note'), type: 'cites' });
      expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('a note relationship created in phd_research is invisible after switching workspace, and restored on switch-back', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('note1'), type: 'cites' });

      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().contentRelationships).toEqual([]);

      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    });
  });

  describe('cascade delete — deleteImportedContent / deleteNote remove dangling relationships', () => {
    it('deleting content referenced as a relationship SOURCE removes that relationship', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().deleteImportedContent('c1');
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('deleting content referenced as a relationship TARGET removes that relationship', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().deleteImportedContent('c2');
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('deleting unrelated content leaves other relationships intact', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c3' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().deleteImportedContent('c3');
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    });

    it('deleting a note referenced as a relationship TARGET removes that relationship', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('note1'), type: 'cites' });

      useAppStore.getState().deleteNote('note1');
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('deleting a note referenced as a relationship SOURCE removes that relationship', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: note('note1'), target: ic('c1'), type: 'related_to' });

      useAppStore.getState().deleteNote('note1');
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });

    it('deleting an imported_content item never removes a relationship whose endpoint id merely coincides but is typed "note"', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'shared-id' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'shared-id' }));
      useAppStore.getState().addContentRelationship({ source: note('shared-id'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().deleteImportedContent('shared-id'); // deletes the IMPORTED_CONTENT item with this id, not the note
      expect(useAppStore.getState().contentRelationships).toHaveLength(1); // the note-sourced relationship survives
    });
  });

  describe('persistence / migration', () => {
    it('a pre-Stage-5 persisted blob (no contentRelationships field at all) migrates to contentRelationships: []', () => {
      const oldBlob = { importedContent: [], activeWorkspaceId: 'phd_research', inactiveWorkspaceOwnedData: {} };
      const migrated = migrateAppStorage(oldBlob, 4) as any;
      expect(migrated.contentRelationships).toEqual([]);
    });

    it('migration is idempotent for contentRelationships', () => {
      const withRelationships = { contentRelationships: [relationshipFixture({ id: 'kept' })], activeWorkspaceId: 'phd_research', inactiveWorkspaceOwnedData: {} };
      const once = migrateAppStorage(withRelationships, 4) as any;
      const twice = migrateAppStorage(once, 4) as any;
      expect(twice.contentRelationships).toEqual([relationshipFixture({ id: 'kept' })]);
    });

    it('a no-op migration (already current version) leaves contentRelationships untouched', () => {
      const current = { contentRelationships: [relationshipFixture({ id: 'kept' })] };
      const migrated = migrateAppStorage(current, APP_STORE_PERSIST_VERSION) as any;
      expect(migrated.contentRelationships).toEqual([relationshipFixture({ id: 'kept' })]);
    });

    it('backfills contentRelationships: [] inside an archived inactiveWorkspaceOwnedData snapshot too', () => {
      const fixture = { inactiveWorkspaceOwnedData: { apfc: { notes: [] } } };
      const migrated = migrateAppStorage(fixture, 4) as any;
      expect(migrated.inactiveWorkspaceOwnedData.apfc.contentRelationships).toEqual([]);
    });

    it('Version 6 — a pre-existing relationship with no sourceType/targetType (Stage-5 shape) migrates to sourceType/targetType: "imported_content"', () => {
      const preV6Relationship = { id: 'old-r1', workspaceId: 'phd_research', sourceId: 'c1', targetId: 'c2', type: 'cites', createdAt: '2026-01-01T00:00:00.000Z' };
      const fixture = { contentRelationships: [preV6Relationship], activeWorkspaceId: 'phd_research', inactiveWorkspaceOwnedData: {} };
      const migrated = migrateAppStorage(fixture, 5) as any;
      expect(migrated.contentRelationships[0]).toEqual({ ...preV6Relationship, sourceType: 'imported_content', targetType: 'imported_content' });
    });

    it('Version 6 migration reaches relationships already archived inside inactiveWorkspaceOwnedData too', () => {
      const preV6Relationship = { id: 'old-r1', workspaceId: 'apfc', sourceId: 'c1', targetId: 'c2', type: 'cites', createdAt: '2026-01-01T00:00:00.000Z' };
      const fixture = { inactiveWorkspaceOwnedData: { apfc: { contentRelationships: [preV6Relationship] } } };
      const migrated = migrateAppStorage(fixture, 5) as any;
      expect(migrated.inactiveWorkspaceOwnedData.apfc.contentRelationships[0]).toMatchObject({ sourceType: 'imported_content', targetType: 'imported_content' });
    });

    it('Version 6 migration never overwrites a relationship that already carries real entity types', () => {
      const alreadyTyped = relationshipFixture({ id: 'r1', sourceType: 'note', targetType: 'imported_content' });
      const fixture = { contentRelationships: [alreadyTyped], activeWorkspaceId: 'phd_research', inactiveWorkspaceOwnedData: {} };
      const migrated = migrateAppStorage(fixture, 5) as any;
      expect(migrated.contentRelationships[0]).toEqual(alreadyTyped);
    });

    it('the full migration (an old blob with no contentRelationships at all, straight through to current) is idempotent end-to-end', () => {
      const oldBlob = { notes: [{ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'b', pinned: false }] };
      const once = migrateAppStorage(oldBlob, 1);
      const twice = migrateAppStorage(once, 1);
      expect(twice).toEqual(once);
    });
  });

  describe('export / import', () => {
    it('exportAllData / importAllData round-trip contentRelationships for the active workspace', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });
      const json = exportAllData();

      fullReset();
      expect(useAppStore.getState().contentRelationships).toEqual([]);

      importAllData(json);
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
      expect(useAppStore.getState().contentRelationships[0].sourceId).toBe('c1');
    });

    it('exportAllData / importAllData round-trip a note<->imported_content relationship, including its entity types', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('note1'), type: 'supports' });
      const json = exportAllData();

      fullReset();
      importAllData(json);
      expect(useAppStore.getState().contentRelationships[0]).toMatchObject({ sourceId: 'c1', sourceType: 'imported_content', targetId: 'note1', targetType: 'note' });
    });

    it('importAllData defaults contentRelationships to [] for an older export that predates this field', () => {
      const legacyExport = JSON.stringify({ completedTopics: {}, notes: [], importedContent: [] });
      importAllData(legacyExport);
      expect(useAppStore.getState().contentRelationships).toEqual([]);
    });
  });

  describe('cloud-sync payload inclusion', () => {
    it('hasMeaningfulData recognizes a payload whose only data is a content relationship', () => {
      const payload = { contentRelationships: [relationshipFixture()] };
      expect(hasMeaningfulData(payload)).toBe(true);
    });
  });

  describe('regression: existing importedContent/bibliography/research-document behaviour is unaffected', () => {
    it('creating a relationship never touches importedContent itself', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1', title: 'Untouched' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });
      expect(useAppStore.getState().importedContent.find((c) => c.id === 'c1')?.title).toBe('Untouched');
    });

    it('selectImportedContentByType filtering still works correctly alongside relationships', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1', contentType: 'research_document' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
      useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });

      expect(selectImportedContentByType(useAppStore.getState().importedContent, 'research_document').map((c) => c.id)).toEqual(['doc1']);
      expect(selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography').map((c) => c.id)).toEqual(['bib1']);
    });

    it('bibliography <-> research-document relationships are completely unaffected by Notes also being able to link', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1', contentType: 'research_document' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });
      useAppStore.getState().addContentRelationship({ source: ic('doc1'), target: note('note1'), type: 'related_to' });

      const all = useAppStore.getState().contentRelationships;
      expect(all).toHaveLength(2);
      const bibToDoc = all.find((r) => r.sourceId === 'bib1');
      expect(bibToDoc).toMatchObject({ targetId: 'doc1', targetType: 'imported_content', type: 'cites' });
    });
  });

  describe('regression: existing Notes editing/import behaviour is unaffected', () => {
    it('upsertNote and deleteNote work exactly as before when no relationships exist', () => {
      useAppStore.getState().upsertNote(noteFixture({ id: 'n1', title: 'Plain note' }));
      expect(useAppStore.getState().notes).toHaveLength(1);
      useAppStore.getState().deleteNote('n1');
      expect(useAppStore.getState().notes).toEqual([]);
    });

    it('adding a relationship never mutates the note itself', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1', title: 'Untouched Note', content: 'Original' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: note('note1'), type: 'cites' });

      const stored = useAppStore.getState().notes.find((n) => n.id === 'note1');
      expect(stored?.title).toBe('Untouched Note');
      expect(stored?.content).toBe('Original');
    });

    it('deleting a note not referenced by any relationship is a safe no-op on contentRelationships', () => {
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c1' }));
      useAppStore.getState().addImportedContent(contentFixture({ id: 'c2' }));
      useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
      useAppStore.getState().addContentRelationship({ source: ic('c1'), target: ic('c2'), type: 'cites' });

      useAppStore.getState().deleteNote('note1');
      expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    });
  });
});

// Related Content Summary — lib/relatedContentSummary.ts's countRelatedContent is a purely
// derived read over the real store's contentRelationships/importedContent/notes, never a stored
// value of its own (see that module's doc comment). These tests exercise it directly against a
// real, mutating store — exactly what pages/PhdResearch.tsx, pages/WorkingBibliography.tsx and
// pages/Notes.tsx call after every render — proving counts are always in sync with no cache to
// invalidate: link, unlink, delete content, delete a note, or switch workspace, and re-read.
describe('Related Content Summary — count correctness across the relationship lifecycle', () => {
  function fullReset() {
    useAppStore.setState({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      completedTopics: {},
      notes: [],
      attempts: [],
      pyqAttempts: [],
      sessions: [],
      studyLog: {},
      starredQuestionIds: [],
      bookmarkedPyqIds: [],
      rewardUnlocks: {},
      studyPlan: null,
      studyPlanGeneratedAt: null,
      personalStudyPlanTasks: [],
      revisionQueue: createRevisionQueue(),
      importedContent: [],
      contentRelationships: [],
    });
  }
  beforeEach(fullReset);

  function contentFixture(overrides: Partial<ImportedContent> = {}): ImportedContent {
    return {
      id: overrides.id ?? 'c1',
      workspaceId: overrides.workspaceId ?? 'phd_research',
      contentType: overrides.contentType ?? 'research_document',
      title: overrides.title ?? 'Item',
      rawContent: overrides.rawContent ?? '',
      provenance: overrides.provenance ?? { sourceFilename: 'x.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
      metadata: overrides.metadata,
    };
  }

  function noteFixture(overrides: Partial<Note> = {}): Note {
    return {
      id: overrides.id ?? 'note1',
      subject: overrides.subject ?? 'general',
      title: overrides.title ?? 'Note',
      content: overrides.content ?? 'x',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
      pinned: overrides.pinned ?? false,
      workspaceId: overrides.workspaceId,
      topicId: overrides.topicId,
    };
  }

  const ic = (id: string) => ({ id, type: 'imported_content' as const });
  const noteEndpoint = (id: string) => ({ id, type: 'note' as const });

  function currentCounts(entityId: string, entityType: 'imported_content' | 'note') {
    const state = useAppStore.getState();
    return countRelatedContent(state.contentRelationships, entityId, entityType, state.importedContent, state.notes);
  }

  it('count updates immediately after linking', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1', contentType: 'research_document' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(0);

    useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(1);
  });

  it('count updates immediately after unlinking', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
    const result = useAppStore.getState().addContentRelationship({ source: ic('doc1'), target: noteEndpoint('note1'), type: 'related_to' });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(currentCounts('doc1', 'imported_content').notes).toBe(1);

    useAppStore.getState().deleteContentRelationship(result.relationship.id);
    expect(currentCounts('doc1', 'imported_content').notes).toBe(0);
  });

  it('count updates immediately after deleting the LINKED content (cascade)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(1);

    useAppStore.getState().deleteImportedContent('bib1'); // cascades the relationship away too
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(0);
  });

  it('count updates immediately after deleting a linked NOTE (cascade)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().upsertNote(noteFixture({ id: 'note1' }));
    useAppStore.getState().addContentRelationship({ source: ic('doc1'), target: noteEndpoint('note1'), type: 'related_to' });
    expect(currentCounts('doc1', 'imported_content').notes).toBe(1);

    useAppStore.getState().deleteNote('note1');
    expect(currentCounts('doc1', 'imported_content').notes).toBe(0);
  });

  it('count updates immediately after deleting the item the count is FOR (nothing crashes, and the relationship itself is gone too)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });

    useAppStore.getState().deleteImportedContent('doc1');
    expect(useAppStore.getState().contentRelationships).toEqual([]);
    expect(() => currentCounts('bib1', 'imported_content')).not.toThrow();
    expect(currentCounts('bib1', 'imported_content').researchDocuments).toBe(0);
  });

  it('workspace isolation: counts reflect only the active workspace\'s own relationships', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(1);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    // doc1/bib1/their relationship are all archived away — nothing in the active (apfc) workspace
    // has that id at all, so the count is correctly zero, not an error.
    expect(currentCounts('doc1', 'imported_content').total).toBe(0);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(currentCounts('doc1', 'imported_content').bibliographyRecords).toBe(1);
  });

  it('switching to a workspace that never had this content keeps counts at zero, not stale', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });

    useAppStore.getState().setActiveWorkspaceId('upsc_cse'); // never visited before, starts empty
    expect(currentCounts('doc1', 'imported_content')).toEqual({ notes: 0, researchDocuments: 0, bibliographyRecords: 0, other: 0, total: 0 });
  });

  it('regression: existing relationship functionality (creation, cascade, isolation) is unaffected by counting', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addImportedContent(contentFixture({ id: 'doc1' }));
    useAppStore.getState().addImportedContent(contentFixture({ id: 'bib1', contentType: 'bibliography' }));
    const result = useAppStore.getState().addContentRelationship({ source: ic('bib1'), target: ic('doc1'), type: 'cites' });
    expect(result.status).toBe('ok');
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    // Reading counts never mutates the store.
    currentCounts('doc1', 'imported_content');
    currentCounts('bib1', 'imported_content');
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);
    expect(useAppStore.getState().importedContent).toHaveLength(2);
  });
});
