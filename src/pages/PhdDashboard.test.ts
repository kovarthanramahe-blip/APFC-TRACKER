// Store-level integration tests for the PhD Research Dashboard's persistence layer
// (phdResearchStartDate, phdTopicAreas, phdMicroTargets) plus cross-workspace isolation involving
// UPSC CSE's granular syllabus coverage. No DOM rendering — exercises the real Zustand store
// directly, the same convention pages/UpscCseDashboard.test.ts's own suite uses.
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import type { PhdTopicArea } from '../lib/phdTopicArea';
import type { MicroTarget } from '../lib/microTarget';
import { computeStudyProgressInsights } from '../lib/studyProgressInsights';
import { getWorkspaceAccent } from '../lib/workspaceAccent';

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
