// Store-level integration tests for the PhD Research Dashboard's persistence layer
// (phdResearchStartDate, phdTopicAreas, phdMicroTargets) plus cross-workspace isolation involving
// UPSC CSE's granular syllabus coverage. No DOM rendering — exercises the real Zustand store
// directly, the same convention pages/UpscCseDashboard.test.ts's own suite uses.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import type { PhdTopicArea } from '../lib/phdTopicArea';
import type { MicroTarget } from '../lib/microTarget';
import { computeStudyProgressInsights, buildDailyActivityTrend } from '../lib/studyProgressInsights';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { getEncouragementMessage } from '../lib/gamification';

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
    upscCseSyllabusCoverage: {},
    phdResearchStartDate: '2023-12-21',
    phdTopicAreas: [],
    phdMicroTargets: [],
  });
}
beforeEach(fullReset);
afterEach(() => vi.useRealTimers());

function areaFixture(id: string): PhdTopicArea {
  return { id, title: `Area ${id}`, createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z' };
}

describe('PhD Research Dashboard — Topic Area persistence (phdTopicAreas)', () => {
  it('addPhdTopicArea prepends the new area', () => {
    useAppStore.getState().addPhdTopicArea(areaFixture('a1'));
    useAppStore.getState().addPhdTopicArea(areaFixture('a2'));
    expect(useAppStore.getState().phdTopicAreas.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('updatePhdTopicArea edits title/description', () => {
    useAppStore.getState().addPhdTopicArea(areaFixture('a1'));
    useAppStore.getState().updatePhdTopicArea('a1', { title: 'Renamed' });
    expect(useAppStore.getState().phdTopicAreas[0].title).toBe('Renamed');
  });

  it('deletePhdTopicArea removes only the matching area', () => {
    useAppStore.getState().addPhdTopicArea(areaFixture('a1'));
    useAppStore.getState().addPhdTopicArea(areaFixture('a2'));
    useAppStore.getState().deletePhdTopicArea('a1');
    expect(useAppStore.getState().phdTopicAreas.map((a) => a.id)).toEqual(['a2']);
  });
});

describe('PhD Research Dashboard — micro-target persistence (phdMicroTargets)', () => {
  it('addPhdMicroTarget builds and prepends a new target via the generic MicroTarget model', () => {
    useAppStore.getState().addPhdMicroTarget({ title: 'Read source X' }, 't1', '2026-09-22T00:00:00.000Z');
    const target = useAppStore.getState().phdMicroTargets[0];
    expect(target.id).toBe('t1');
    expect(target.title).toBe('Read source X');
    expect(target.status).toBe('pending');
  });

  it('setPhdMicroTargetStatus toggles status and stamps completedAt', () => {
    useAppStore.getState().addPhdMicroTarget({ title: 'T' }, 't1', '2026-09-22T00:00:00.000Z');
    useAppStore.getState().setPhdMicroTargetStatus('t1', 'completed');
    expect(useAppStore.getState().phdMicroTargets[0].status).toBe('completed');
    expect(useAppStore.getState().phdMicroTargets[0].completedAt).toBeDefined();
  });

  it('updatePhdMicroTarget edits fields', () => {
    useAppStore.getState().addPhdMicroTarget({ title: 'T' }, 't1', '2026-09-22T00:00:00.000Z');
    useAppStore.getState().updatePhdMicroTarget('t1', { priority: 'high' });
    expect(useAppStore.getState().phdMicroTargets[0].priority).toBe('high');
  });

  it('deletePhdMicroTarget removes only the matching target', () => {
    useAppStore.getState().addPhdMicroTarget({ title: 'A' }, 't1', '2026-09-22T00:00:00.000Z');
    useAppStore.getState().addPhdMicroTarget({ title: 'B' }, 't2', '2026-09-22T00:00:00.000Z');
    useAppStore.getState().deletePhdMicroTarget('t1');
    expect(useAppStore.getState().phdMicroTargets.map((t: MicroTarget) => t.id)).toEqual(['t2']);
  });
});

describe('PhD Research Dashboard — setPhdResearchStartDate', () => {
  it('defaults to 21 December 2023 and can be corrected', () => {
    expect(useAppStore.getState().phdResearchStartDate).toBe('2023-12-21');
    useAppStore.getState().setPhdResearchStartDate('2024-01-01');
    expect(useAppStore.getState().phdResearchStartDate).toBe('2024-01-01');
  });
});

describe('Cross-workspace isolation — PhD ↔ UPSC ↔ APFC', () => {
  it('a Topic Area/micro-target created under PhD Research does not appear after switching to UPSC CSE or APFC', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addPhdTopicArea(areaFixture('phd-a1'));
    useAppStore.getState().addPhdMicroTarget({ title: 'PhD target' }, 'phd-t1', '2026-09-22T00:00:00.000Z');

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().phdTopicAreas).toEqual([]);
    expect(useAppStore.getState().phdMicroTargets).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().phdTopicAreas).toEqual([]);
    expect(useAppStore.getState().phdMicroTargets).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().phdTopicAreas.map((a) => a.id)).toEqual(['phd-a1']);
    expect(useAppStore.getState().phdMicroTargets.map((t) => t.id)).toEqual(['phd-t1']);
  });

  it('UPSC CSE granular syllabus coverage set under UPSC CSE does not appear under APFC or PhD Research', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().setUpscCseCoverageState('some-granular-node-id', 'strong');

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCseSyllabusCoverage['some-granular-node-id']).toBe('strong');
  });

  it('existing UPSC CSE study tasks remain intact and isolated alongside the new PhD fields', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCseStudyTask({ id: 'st1', date: '2026-09-22', title: 'Revise', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' });

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().addPhdTopicArea(areaFixture('phd-a1'));
    expect(useAppStore.getState().upscCseStudyTasks).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCseStudyTasks.map((t) => t.id)).toEqual(['st1']);
  });
});

describe('PhD Research Dashboard — export / import round trip', () => {
  it('exportAllData/importAllData preserve phdResearchStartDate, phdTopicAreas and phdMicroTargets', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().setPhdResearchStartDate('2024-06-01');
    useAppStore.getState().addPhdTopicArea(areaFixture('a1'));
    useAppStore.getState().addPhdMicroTarget({ title: 'T' }, 't1', '2026-09-22T00:00:00.000Z');

    const exported = exportAllData();
    fullReset();
    importAllData(exported);

    expect(useAppStore.getState().phdResearchStartDate).toBe('2024-06-01');
    expect(useAppStore.getState().phdTopicAreas.map((a) => a.id)).toEqual(['a1']);
    expect(useAppStore.getState().phdMicroTargets.map((t) => t.id)).toEqual(['t1']);
  });

  it('importAllData defaults sensibly when these fields are absent from the payload', () => {
    fullReset();
    importAllData(JSON.stringify({}));
    expect(useAppStore.getState().phdResearchStartDate).toBe('2023-12-21');
    expect(useAppStore.getState().phdTopicAreas).toEqual([]);
    expect(useAppStore.getState().phdMicroTargets).toEqual([]);
  });
});

describe('PhD Research Dashboard — migration backfill', () => {
  it('backfills phdResearchStartDate/phdTopicAreas/phdMicroTargets onto a pre-version-10 snapshot', () => {
    const oldSnapshot = { completedTopics: {}, notes: [] };
    const migrated = migrateAppStorage(oldSnapshot, 1) as {
      phdResearchStartDate: string;
      phdTopicAreas: PhdTopicArea[];
      phdMicroTargets: MicroTarget[];
    };
    expect(migrated.phdResearchStartDate).toBe('2023-12-21');
    expect(migrated.phdTopicAreas).toEqual([]);
    expect(migrated.phdMicroTargets).toEqual([]);
  });

  it('backfills the same fields inside an archived (inactiveWorkspaceOwnedData) snapshot', () => {
    const oldSnapshot = {
      completedTopics: {},
      activeWorkspaceId: 'apfc',
      inactiveWorkspaceOwnedData: { phd_research: { notes: [] } },
    };
    const migrated = migrateAppStorage(oldSnapshot, 1) as {
      inactiveWorkspaceOwnedData: Record<string, { phdResearchStartDate: string; phdTopicAreas: PhdTopicArea[]; phdMicroTargets: MicroTarget[] }>;
    };
    expect(migrated.inactiveWorkspaceOwnedData.phd_research.phdResearchStartDate).toBe('2023-12-21');
    expect(migrated.inactiveWorkspaceOwnedData.phd_research.phdTopicAreas).toEqual([]);
    expect(migrated.inactiveWorkspaceOwnedData.phd_research.phdMicroTargets).toEqual([]);
  });

  it('preserves an existing microsyllabus coverage entry by rolling it onto fresh granular leaves during migration', () => {
    // Constitution (prelims-gs1-polity-constitution) is one of this stage's granularized items.
    const oldSnapshot = { completedTopics: {}, upscCseSyllabusCoverage: { 'prelims-gs1-polity-constitution': 'strong' } };
    const migrated = migrateAppStorage(oldSnapshot, 1) as { upscCseSyllabusCoverage: Record<string, string> };
    const leafEntries = Object.entries(migrated.upscCseSyllabusCoverage).filter(([k]) => k.startsWith('prelims-gs1-polity-constitution__'));
    expect(leafEntries.length).toBeGreaterThan(0);
    expect(leafEntries.every(([, v]) => v === 'strong')).toBe(true);
    // the original direct entry is preserved too
    expect(migrated.upscCseSyllabusCoverage['prelims-gs1-polity-constitution']).toBe('strong');
  });
});

// Study Progress Insights integration (Phase 4 Step 2) — exercises the exact computation
// pages/PhdDashboard.tsx performs: computeStudyProgressInsights over THIS workspace's own
// studyLog, with NO completion target (PhD Research has no syllabus/topic-count equivalent to
// derive one from honestly — see pages/PhdDashboard.tsx's own comment on this).
describe('PhD Research Dashboard — Study Progress Insights integration', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('phd_research'));

  it('normal activity: reflects this workspace\'s own studyLog', () => {
    useAppStore.setState({
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 60, topicsCompleted: 0, testsCompleted: 0 } },
    });
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog, referenceDate: '2026-01-08' });
    expect(insights.currentPeriod.focusMinutes).toBe(60);
    expect(insights.totalActivity.focusMinutes).toBe(60);
  });

  it('unavailable completion target: PhD Research never supplies one, so progressPercent is always null, never invented', () => {
    useAppStore.setState({
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 60, topicsCompleted: 0, testsCompleted: 0 } },
    });
    // The exact call pages/PhdDashboard.tsx makes: no completionTarget field at all.
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog });
    expect(insights.progressPercent).toBeNull();
  });

  it('empty study-log state produces a fully zeroed snapshot, never an error', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog })).not.toThrow();
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog });
    expect(insights.totalActivity).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.progressPercent).toBeNull();
    expect(insights.streak).toEqual({ current: 0, best: 0 });
  });

  it('current vs previous period comparison', () => {
    useAppStore.setState({
      studyLog: {
        '2026-01-01': { date: '2026-01-01', focusMinutes: 10, topicsCompleted: 0, testsCompleted: 0 },
        '2026-01-09': { date: '2026-01-09', focusMinutes: 40, topicsCompleted: 0, testsCompleted: 0 },
      },
    });
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog, referenceDate: '2026-01-10', periodDays: 7 });
    expect(insights.currentPeriod.focusMinutes).toBe(40);
    expect(insights.previousPeriod.focusMinutes).toBe(10);
  });

  it('workspace accent: PhD Research resolves to the violet accent', () => {
    const accent = getWorkspaceAccent(useAppStore.getState().activeWorkspaceId);
    expect(accent.bg).toBe('bg-violet-600');
  });

  it('workspace isolation: studyLog logged while PhD Research is active is invisible after switching to UPSC CSE, and never mixes with either other workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 20);
    const phdStudyLog = useAppStore.getState().studyLog;
    expect(Object.keys(phdStudyLog).length).toBeGreaterThan(0);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().studyLog).toEqual({});
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 99);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().studyLog).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().studyLog).toEqual(phdStudyLog); // untouched by the UPSC CSE bump above
  });
});

// Phase 4 Step 3 — PhD Research never supplies a completionTarget, and no amount of progress in
// another workspace can cause one to appear here: progressPercent must stay null regardless of
// APFC's completedTopics or UPSC CSE's upscCseSyllabusCoverage.
describe('PhD Research Dashboard — Study Progress Insights: completion-target workspace isolation (Phase 4 Step 3)', () => {
  it('progressPercent stays null for PhD Research even when APFC and UPSC CSE both have real, non-zero completion targets set', () => {
    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.setState({ completedTopics: { t1: true, t2: true } });

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.setState({ upscCseSyllabusCoverage: { m1: 'strong', m2: 'strong', m3: 'revised' } });

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    // The exact call pages/PhdDashboard.tsx makes — no completionTarget field at all, regardless
    // of what either other workspace has accumulated.
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog });
    expect(insights.progressPercent).toBeNull();
  });
});

// Study Activity Trend integration (Phase 4 Step 4) — exercises the exact computation
// pages/PhdDashboard.tsx performs: buildDailyActivityTrend(studyLog, today, 7).
describe('PhD Research Dashboard — Study Activity Trend integration', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('phd_research'));

  it('dashboard integration: 7 entries, real focus minutes on the matching day, zero elsewhere', () => {
    useAppStore.setState({
      studyLog: { '2026-01-07': { date: '2026-01-07', focusMinutes: 50, topicsCompleted: 0, testsCompleted: 0 } },
    });
    const trend = buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7);
    expect(trend).toHaveLength(7);
    expect(trend.find((d) => d.date === '2026-01-07')?.focusMinutes).toBe(50);
    expect(trend.filter((d) => d.date !== '2026-01-07').every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('empty study log: every day in the trend is safely zeroed, never throws', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7)).not.toThrow();
    expect(buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7).every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('accent resolution: PhD Research\'s trend uses the violet accent', () => {
    expect(getWorkspaceAccent(useAppStore.getState().activeWorkspaceId).bg).toBe('bg-violet-600');
  });

  it('workspace isolation: a trend built from PhD Research studyLog never reflects activity logged under either other workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 15);
    const phdStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 111);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 222);

    const phdTrend = buildDailyActivityTrend(phdStudyLog, '2026-01-10', 7);
    expect(phdTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(15);
  });
});

// Context-aware encouragement integration (Phase 4 Step 6) — exercises the exact inputs
// pages/PhdDashboard.tsx now feeds into the EXISTING getEncouragementMessage (lib/gamification.ts,
// already shown on the APFC Dashboard): today's focus minutes from studyLog, the global
// dailyGoalMinutes setting, and the SAME streak already computed by Study Progress Insights above.
// PhD Research has no syllabus/completion percentage (see the Step 2/3 describe blocks above) and no
// test/quiz concept at all, so syllabusPct is a neutral sentinel (0, never displayed — it only gates
// one low-priority message branch that this guarantees never fires) and tookTestToday is honestly
// false — never a fabricated PhD curriculum metric or test result.
describe('PhD Research Dashboard — Context-aware encouragement integration (Phase 4 Step 6)', () => {
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('phd_research'));

  it('normal activity: partial progress toward the daily goal reports the exact remaining minutes', () => {
    useAppStore.setState({
      dailyGoalMinutes: 60,
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 45, topicsCompleted: 0, testsCompleted: 0 } },
    });
    const state = useAppStore.getState();
    const todayMinutes = state.studyLog['2026-01-08']?.focusMinutes ?? 0;
    const encouragement = getEncouragementMessage({
      todayMinutes,
      dailyGoalMinutes: state.dailyGoalMinutes,
      streakCurrent: computeStudyProgressInsights({ studyLog: state.studyLog, referenceDate: '2026-01-08' }).streak.current,
      syllabusPct: 0,
      tookTestToday: false,
    });
    expect(encouragement).toBe("You're 15 minutes away from today's target.");
  });

  it('streak-only case: no minutes logged today but an active streak keeps the message alive', () => {
    // computeStreaks (lib/gamification.ts, reused as-is by computeStudyProgressInsights) counts
    // consecutive days up to the REAL current date, not referenceDate — same caveat
    // pages/Dashboard.test.ts's own streak test already accounts for with fake timers.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-08T09:00:00'));
    useAppStore.setState({
      studyLog: {
        '2026-01-07': { date: '2026-01-07', focusMinutes: 30, topicsCompleted: 0, testsCompleted: 0 },
        '2026-01-08': { date: '2026-01-08', focusMinutes: 30, topicsCompleted: 0, testsCompleted: 0 },
      },
    });
    const state = useAppStore.getState();
    const streak = computeStudyProgressInsights({ studyLog: state.studyLog, referenceDate: '2026-01-08' }).streak.current;
    expect(streak).toBeGreaterThan(0);
    const encouragement = getEncouragementMessage({
      todayMinutes: 0,
      dailyGoalMinutes: state.dailyGoalMinutes,
      streakCurrent: streak,
      syllabusPct: 0,
      tookTestToday: false,
    });
    expect(encouragement).toBe('Keep the streak alive.');
  });

  it('never fabricates a syllabus/completion percentage: the sentinel syllabusPct never surfaces the "Halfway" message', () => {
    const encouragement = getEncouragementMessage({
      todayMinutes: 0,
      dailyGoalMinutes: 60,
      streakCurrent: 0,
      syllabusPct: 0,
      tookTestToday: false,
    });
    expect(encouragement).not.toBe('Halfway is not the finish line. Keep moving.');
    expect(encouragement).toBe("Your first focused session starts today's progress.");
  });

  it('never fabricates a test result: PhD Research has no test/quiz concept, so tookTestToday is always false', () => {
    const encouragement = getEncouragementMessage({
      todayMinutes: 20,
      dailyGoalMinutes: 60,
      streakCurrent: 1,
      syllabusPct: 0,
      tookTestToday: false,
    });
    expect(encouragement).not.toBe('Test completed. Now review the mistakes.');
  });

  it('empty/zero-activity case: no minutes, no streak — the first-session message', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    const encouragement = getEncouragementMessage({
      todayMinutes: 0,
      dailyGoalMinutes: useAppStore.getState().dailyGoalMinutes,
      streakCurrent: 0,
      syllabusPct: 0,
      tookTestToday: false,
    });
    expect(encouragement).toBe("Your first focused session starts today's progress.");
  });

  it('workspace isolation: today\'s minutes come only from this workspace\'s own studyLog, never another workspace\'s', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 45);
    const phdStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 999);
    expect(useAppStore.getState().studyLog['2026-01-08']?.focusMinutes).toBe(999);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().studyLog).toEqual(phdStudyLog);
    expect(useAppStore.getState().studyLog['2026-01-08']?.focusMinutes).toBe(45);
  });
});
