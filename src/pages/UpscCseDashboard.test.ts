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
import { computeStudyProgressInsights, buildDailyActivityTrend } from '../lib/studyProgressInsights';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { computeCoverageSummary } from '../lib/upscCseSyllabusCoverage';
import { getEncouragementMessage } from '../lib/gamification';
import type { UpscCsePrelimsPyqAttempt } from '../lib/upscCsePrelimsPyqAttempt';

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

// Phase 4 Step 3 — the completion TARGET itself (upscCseSyllabusCoverage, and the weightedPct
// derived from it) must never leak across workspaces, same discipline as studyLog above.
describe('UPSC CSE Study Dashboard — Study Progress Insights: completion-target workspace isolation (Phase 4 Step 3)', () => {
  it('upscCseSyllabusCoverage (and the weightedPct derived from it) is archived away while another workspace is active, and is restored exactly on switching back', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.setState({ upscCseSyllabusCoverage: { m1: 'strong', m2: 'revised' } });
    const coverageBefore = computeCoverageSummary(['m1', 'm2', 'm3'], useAppStore.getState().upscCseSyllabusCoverage);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    // upscCseSyllabusCoverage now reflects APFC's own (unrelated, empty) slice, never a
    // merged/leftover view of the UPSC CSE coverage set above.
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const coverageAfter = computeCoverageSummary(['m1', 'm2', 'm3'], useAppStore.getState().upscCseSyllabusCoverage);
    expect(coverageAfter).toEqual(coverageBefore);
  });

  it('marking coverage in another workspace never changes UPSC CSE\'s own upscCseSyllabusCoverage or its derived weightedPct', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.setState({ upscCseSyllabusCoverage: { m1: 'strong' } });
    const before = computeCoverageSummary(['m1'], useAppStore.getState().upscCseSyllabusCoverage);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    // No equivalent field exists for PhD Research at all — nothing to even set here; switching
    // back is enough to prove UPSC CSE's own coverage was never touched.

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(computeCoverageSummary(['m1'], useAppStore.getState().upscCseSyllabusCoverage)).toEqual(before);
  });
});

// Study Activity Trend integration (Phase 4 Step 4) — exercises the exact computation
// pages/UpscCseDashboard.tsx performs: buildDailyActivityTrend(studyLog, today, 7).
describe('UPSC CSE Study Dashboard — Study Activity Trend integration', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('upsc_cse'));

  it('dashboard integration: 7 entries, real focus minutes on the matching day, zero elsewhere', () => {
    useAppStore.setState({
      studyLog: { '2026-01-09': { date: '2026-01-09', focusMinutes: 25, topicsCompleted: 0, testsCompleted: 1 } },
    });
    const trend = buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7);
    expect(trend).toHaveLength(7);
    expect(trend.find((d) => d.date === '2026-01-09')?.focusMinutes).toBe(25);
    expect(trend.filter((d) => d.date !== '2026-01-09').every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('empty study log: every day in the trend is safely zeroed, never throws', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7)).not.toThrow();
    expect(buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7).every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('accent resolution: UPSC CSE\'s trend uses the existing brand blue', () => {
    expect(getWorkspaceAccent(useAppStore.getState().activeWorkspaceId).bg).toBe('bg-brand-600');
  });

  it('workspace isolation: a trend built from UPSC CSE studyLog never reflects activity logged under another workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 25);
    const upscStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 777);
    const apfcStudyLog = useAppStore.getState().studyLog;

    const upscTrend = buildDailyActivityTrend(upscStudyLog, '2026-01-10', 7);
    const apfcTrend = buildDailyActivityTrend(apfcStudyLog, '2026-01-10', 7);
    expect(upscTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(25);
    expect(apfcTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(777);
  });
});

function attemptFixture(id: string, submittedAt: string): UpscCsePrelimsPyqAttempt {
  return {
    id,
    submittedAt,
    year: 'all',
    paper: 'all',
    subject: 'all',
    microsyllabusId: 'all',
    questionIds: [],
    answers: {},
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    accuracy: 0,
  };
}

// Context-aware encouragement integration (Phase 4 Step 6) — exercises the exact inputs
// pages/UpscCseDashboard.tsx now feeds into the EXISTING getEncouragementMessage (lib/gamification.ts,
// already shown on the APFC Dashboard): today's focus minutes from studyLog, the global
// dailyGoalMinutes setting, the SAME streak already computed by Study Progress Insights above, the
// SAME overallCoverage.weightedPct already used as the completion target above, and whether a UPSC
// Prelims PYQ test was submitted today.
describe('UPSC CSE Study Dashboard — Context-aware encouragement integration (Phase 4 Step 6)', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('upsc_cse'));

  it('normal activity: partial progress toward the daily goal reports the exact remaining minutes', () => {
    useAppStore.setState({
      dailyGoalMinutes: 60,
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 40, topicsCompleted: 0, testsCompleted: 0 } },
    });
    const state = useAppStore.getState();
    const todayMinutes = state.studyLog['2026-01-08']?.focusMinutes ?? 0;
    const streak = computeStudyProgressInsights({ studyLog: state.studyLog, referenceDate: '2026-01-08' }).streak.current;
    const overallCoverage = computeCoverageSummary(['m1', 'm2'], { m1: 'strong', m2: 'not_started' });
    const encouragement = getEncouragementMessage({
      todayMinutes,
      dailyGoalMinutes: state.dailyGoalMinutes,
      streakCurrent: streak,
      syllabusPct: overallCoverage.weightedPct,
      tookTestToday: false,
    });
    expect(encouragement).toBe("You're 20 minutes away from today's target.");
  });

  it('a submitted UPSC Prelims PYQ test today takes priority over every other signal', () => {
    useAppStore.setState({
      upscCsePrelimsPyqAttempts: [attemptFixture('a1', '2026-01-08T10:00:00.000Z')],
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 5, topicsCompleted: 0, testsCompleted: 1 } },
    });
    const attempts = useAppStore.getState().upscCsePrelimsPyqAttempts;
    const tookTestToday = attempts.some((a) => a.submittedAt.slice(0, 10) === '2026-01-08');
    expect(tookTestToday).toBe(true);
    const encouragement = getEncouragementMessage({
      todayMinutes: 5,
      dailyGoalMinutes: 60,
      streakCurrent: 3,
      syllabusPct: 90,
      tookTestToday,
    });
    expect(encouragement).toBe('Test completed. Now review the mistakes.');
  });

  it('uses this workspace\'s own overallCoverage.weightedPct as syllabusPct, never a second UPSC completion number', () => {
    const overallCoverage = computeCoverageSummary(['m1', 'm2'], { m1: 'strong', m2: 'revised' });
    expect(overallCoverage.weightedPct).toBeGreaterThanOrEqual(50);
    expect(overallCoverage.weightedPct).toBeLessThan(100);
    const encouragement = getEncouragementMessage({
      todayMinutes: 0,
      dailyGoalMinutes: 60,
      streakCurrent: 0,
      syllabusPct: overallCoverage.weightedPct,
      tookTestToday: false,
    });
    expect(encouragement).toBe('Halfway is not the finish line. Keep moving.');
  });

  it('empty/zero-activity case: no minutes, no streak, no coverage, no test — the first-session message', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);
    const overallCoverage = computeCoverageSummary([], {});
    const encouragement = getEncouragementMessage({
      todayMinutes: 0,
      dailyGoalMinutes: useAppStore.getState().dailyGoalMinutes,
      streakCurrent: 0,
      syllabusPct: overallCoverage.total > 0 ? overallCoverage.weightedPct : 0,
      tookTestToday: false,
    });
    expect(encouragement).toBe("Your first focused session starts today's progress.");
  });

  it('workspace isolation: today\'s minutes and test-taken status come only from this workspace\'s own studyLog/attempts', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 60);
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(attemptFixture('cse-a1', '2026-01-08T09:00:00.000Z'));
    const upscStudyLog = useAppStore.getState().studyLog;
    const upscAttempts = useAppStore.getState().upscCsePrelimsPyqAttempts;

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().studyLog).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().studyLog).toEqual(upscStudyLog);
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual(upscAttempts);
  });
});
