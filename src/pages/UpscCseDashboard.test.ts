// Store-level integration tests for the UPSC CSE Study Dashboard's persistence layer
// (upscCseStudyTasks). No DOM rendering — exercises the real Zustand store directly, the same
// convention lib/store.test.ts's own Multi-Workspace OS suites use. UI rendering itself is covered
// by this stage's browser smoke test, not here.
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage, APP_STORE_PERSIST_VERSION } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { hasMeaningfulData } from '../lib/cloudSync';
import type { UpscCseStudyTask } from '../lib/upscCseStudyTask';
import { computeStudyProgressInsights } from '../lib/studyProgressInsights';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { computeCoverageSummary } from '../lib/upscCseSyllabusCoverage';

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
    upscCseStudyTasks: [],
  });
}
beforeEach(fullReset);

function taskFixture(id: string): UpscCseStudyTask {
  return { id, date: '2026-09-22', title: `Task ${id}`, status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' };
}

describe('UPSC CSE Study Dashboard — study task persistence (upscCseStudyTasks)', () => {
  it('addUpscCseStudyTask prepends the new task', () => {
    useAppStore.getState().addUpscCseStudyTask(taskFixture('t1'));
    useAppStore.getState().addUpscCseStudyTask(taskFixture('t2'));
    expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('setUpscCseStudyTaskStatus toggles a task to completed and stamps completedAt', () => {
    useAppStore.getState().addUpscCseStudyTask(taskFixture('t1'));
    useAppStore.getState().setUpscCseStudyTaskStatus('t1', 'completed');
    const task = useAppStore.getState().upscCseStudyTasks[0];
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBeDefined();
  });

  it('deleteUpscCseStudyTask removes only the matching task', () => {
    useAppStore.getState().addUpscCseStudyTask(taskFixture('t1'));
    useAppStore.getState().addUpscCseStudyTask(taskFixture('t2'));
    useAppStore.getState().deleteUpscCseStudyTask('t1');
    expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id)).toEqual(['t2']);
  });

  describe('workspace isolation', () => {
    it('a study task added under APFC does not appear after switching to UPSC CSE', () => {
      useAppStore.getState().addUpscCseStudyTask(taskFixture('apfc-t1'));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      expect(useAppStore.getState().upscCseStudyTasks).toEqual([]);
    });

    it('APFC and UPSC CSE accumulate entirely separate task lists, restored exactly on switch-back', () => {
      useAppStore.getState().addUpscCseStudyTask(taskFixture('apfc-t1'));
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addUpscCseStudyTask(taskFixture('cse-t1'));
      useAppStore.getState().addUpscCseStudyTask(taskFixture('cse-t2'));

      expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id).sort()).toEqual(['cse-t1', 'cse-t2']);

      useAppStore.getState().setActiveWorkspaceId('apfc');
      expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id)).toEqual(['apfc-t1']);

      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id).sort()).toEqual(['cse-t1', 'cse-t2']);
    });

    it('switching to a third workspace (phd_research) sees no UPSC CSE study tasks either', () => {
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addUpscCseStudyTask(taskFixture('cse-t1'));
      useAppStore.getState().setActiveWorkspaceId('phd_research');
      expect(useAppStore.getState().upscCseStudyTasks).toEqual([]);
    });
  });

  describe('export / import round trip', () => {
    it('exportAllData includes upscCseStudyTasks for the active workspace', () => {
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addUpscCseStudyTask(taskFixture('cse-t1'));
      const exported = JSON.parse(exportAllData()) as { upscCseStudyTasks: UpscCseStudyTask[] };
      expect(exported.upscCseStudyTasks.map((t) => t.id)).toEqual(['cse-t1']);
    });

    it('importAllData restores upscCseStudyTasks exactly, and defaults to [] when absent from the payload', () => {
      useAppStore.getState().setActiveWorkspaceId('upsc_cse');
      useAppStore.getState().addUpscCseStudyTask(taskFixture('cse-t1'));
      const exported = JSON.parse(exportAllData()) as { upscCseStudyTasks: UpscCseStudyTask[] } & Record<string, unknown>;

      fullReset();
      importAllData(JSON.stringify(exported));
      expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id)).toEqual(['cse-t1']);

      fullReset();
      const { upscCseStudyTasks: _omit, ...withoutField } = exported;
      importAllData(JSON.stringify(withoutField));
      expect(useAppStore.getState().upscCseStudyTasks).toEqual([]);
    });
  });

  describe('resetAllData', () => {
    it('clears upscCseStudyTasks', () => {
      useAppStore.getState().addUpscCseStudyTask(taskFixture('t1'));
      useAppStore.getState().resetAllData();
      expect(useAppStore.getState().upscCseStudyTasks).toEqual([]);
    });
  });

  describe('cloud-sync payload inclusion', () => {
    it('hasMeaningfulData is true when only upscCseStudyTasks is populated', () => {
      expect(hasMeaningfulData({ upscCseStudyTasks: [taskFixture('t1')] })).toBe(true);
    });

    it('hasMeaningfulData is false for an entirely empty payload', () => {
      expect(hasMeaningfulData({ upscCseStudyTasks: [] })).toBe(false);
    });
  });

  describe('migration backfill', () => {
    it('backfills upscCseStudyTasks to [] on a pre-version-9 snapshot with no such field', () => {
      const oldSnapshot = { completedTopics: {}, notes: [] };
      const migrated = migrateAppStorage(oldSnapshot, 1) as { upscCseStudyTasks: UpscCseStudyTask[] };
      expect(migrated.upscCseStudyTasks).toEqual([]);
    });

    it('the migration is idempotent and current version reflects this stage', () => {
      expect(APP_STORE_PERSIST_VERSION).toBeGreaterThanOrEqual(9);
      const once = migrateAppStorage({ completedTopics: {} }, 1);
      const twice = migrateAppStorage(once, 1);
      expect(twice).toEqual(once);
    });

    it('backfills upscCseStudyTasks inside an archived (inactiveWorkspaceOwnedData) snapshot too', () => {
      const oldSnapshot = {
        completedTopics: {},
        activeWorkspaceId: 'apfc',
        inactiveWorkspaceOwnedData: { upsc_cse: { notes: [{ id: 'x' }] } },
      };
      const migrated = migrateAppStorage(oldSnapshot, 1) as {
        inactiveWorkspaceOwnedData: Record<string, { upscCseStudyTasks: UpscCseStudyTask[] }>;
      };
      expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.upscCseStudyTasks).toEqual([]);
    });
  });
});

// Study Progress Insights integration (Phase 4 Step 2) — exercises the exact computation
// pages/UpscCseDashboard.tsx performs: computeStudyProgressInsights over THIS workspace's own
// studyLog, with the completion target reusing lib/upscCseSyllabusCoverage.ts's own
// computeCoverageSummary (never a second UPSC completion calculation).
describe('UPSC CSE Study Dashboard — Study Progress Insights integration', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('upsc_cse'));

  it('normal activity: reflects this workspace\'s own studyLog and the existing coverage.weightedPct as the completion target', () => {
    useAppStore.setState({
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 40, topicsCompleted: 0, testsCompleted: 1 } },
    });
    const overallCoverage = computeCoverageSummary(['m1', 'm2', 'm3', 'm4'], { m1: 'strong', m2: 'strong', m3: 'revised', m4: 'not_started' });
    expect(overallCoverage.total).toBeGreaterThan(0);
    const insights = computeStudyProgressInsights({
      studyLog: useAppStore.getState().studyLog,
      completionTarget: { completed: overallCoverage.weightedPct, total: 100 },
      referenceDate: '2026-01-08',
    });
    expect(insights.currentPeriod.focusMinutes).toBe(40);
    expect(insights.progressPercent).toBe(overallCoverage.weightedPct);
  });

  it('unavailable completion target: an empty coverage map (total 0) leaves progressPercent null, never invented', () => {
    const overallCoverage = computeCoverageSummary([], {});
    expect(overallCoverage.total).toBe(0);
    const insights = computeStudyProgressInsights({
      studyLog: useAppStore.getState().studyLog,
      completionTarget: overallCoverage.total > 0 ? { completed: overallCoverage.weightedPct, total: 100 } : undefined,
    });
    expect(insights.progressPercent).toBeNull();
  });

  it('current vs previous period comparison uses computePeriodComparison, not a second date calculation', () => {
    useAppStore.setState({
      studyLog: {
        '2026-01-02': { date: '2026-01-02', focusMinutes: 15, topicsCompleted: 0, testsCompleted: 0 },
        '2026-01-09': { date: '2026-01-09', focusMinutes: 35, topicsCompleted: 0, testsCompleted: 0 },
      },
    });
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog, referenceDate: '2026-01-10', periodDays: 7 });
    expect(insights.currentPeriod.focusMinutes).toBe(35);
    expect(insights.previousPeriod.focusMinutes).toBe(15);
  });

  it('workspace accent: UPSC CSE resolves to the existing brand blue, not a new colour', () => {
    const accent = getWorkspaceAccent(useAppStore.getState().activeWorkspaceId);
    expect(accent.bg).toBe('bg-brand-600');
  });

  it('workspace isolation: studyLog logged while UPSC CSE is active is invisible after switching to APFC', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 25);
    const upscStudyLog = useAppStore.getState().studyLog;
    expect(Object.keys(upscStudyLog).length).toBeGreaterThan(0);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().studyLog).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().studyLog).toEqual(upscStudyLog);
  });

  it('empty study-log state produces a fully zeroed snapshot, never an error', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog })).not.toThrow();
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog });
    expect(insights.totalActivity).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.streak).toEqual({ current: 0, best: 0 });
  });
});
