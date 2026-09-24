// Study Activity Trend integration on UPSC CSE Analytics (Phase 4 Step 5). No DOM rendering —
// exercises the exact computation pages/UpscCseAnalytics.tsx performs: buildDailyActivityTrend
// over THIS workspace's own studyLog, same convention pages/UpscCseDashboard.test.ts already uses.
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { buildDailyActivityTrend } from '../lib/studyProgressInsights';
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
  });
}
beforeEach(() => {
  fullReset();
  useAppStore.getState().setActiveWorkspaceId('upsc_cse');
});

describe('UPSC CSE Analytics — Study Activity Trend integration', () => {
  it('dashboard-equivalent integration: 7 entries, real focus minutes on the matching day, zero elsewhere', () => {
    useAppStore.setState({
      studyLog: { '2026-01-09': { date: '2026-01-09', focusMinutes: 20, topicsCompleted: 0, testsCompleted: 1 } },
    });
    const trend = buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7);
    expect(trend).toHaveLength(7);
    expect(trend.find((d) => d.date === '2026-01-09')?.focusMinutes).toBe(20);
    expect(trend.filter((d) => d.date !== '2026-01-09').every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('empty study log: every day in the trend is safely zeroed, never throws', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7)).not.toThrow();
    expect(buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7).every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('accent resolution: UPSC CSE Analytics uses the existing brand blue', () => {
    expect(getWorkspaceAccent(useAppStore.getState().activeWorkspaceId).bg).toBe('bg-brand-600');
  });

  it('workspace isolation: a trend built from UPSC CSE studyLog never reflects activity logged under another workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 20);
    const upscStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 555);

    const upscTrend = buildDailyActivityTrend(upscStudyLog, '2026-01-10', 7);
    expect(upscTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(20);
  });
});
