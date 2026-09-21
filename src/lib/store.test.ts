import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage, APP_STORE_PERSIST_VERSION } from './store';
import { createRevisionQueue } from './revisionQueue';
import { DEFAULT_WORKSPACE_ID } from './workspace';
import { hasMeaningfulData } from './cloudSync';

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
        'inactiveWorkspaceOwnedData',
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

  it('never overwrites an already-present inactiveWorkspaceOwnedData archive', () => {
    const fixture = { ...oldFixture(), inactiveWorkspaceOwnedData: { upsc_cse: { notes: [{ id: 'x' }] } } };
    const migrated = migrateAppStorage(fixture, 1) as any;
    expect(migrated.inactiveWorkspaceOwnedData).toEqual({ upsc_cse: { notes: [{ id: 'x' }] } });
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
