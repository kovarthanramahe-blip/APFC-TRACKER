// Study Activity Trend integration on PhD Research Analytics (Phase 4 Step 5). No DOM rendering —
// exercises the exact computation pages/PhdAnalytics.tsx performs: buildDailyActivityTrend over
// THIS workspace's own studyLog, same convention pages/PhdDashboard.test.ts already uses. No
// completion percentage/denominator is invented here — this page's own existing "Target
// Completion" tile (lib/phdAnalytics.ts) is untouched and unrelated to this trend.
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
  });
}
beforeEach(() => {
  fullReset();
  useAppStore.getState().setActiveWorkspaceId('phd_research');
});

describe('PhD Research Analytics — Study Activity Trend integration', () => {
  it('dashboard-equivalent integration: 7 entries, real focus minutes on the matching day, zero elsewhere', () => {
    useAppStore.setState({
      studyLog: { '2026-01-07': { date: '2026-01-07', focusMinutes: 55, topicsCompleted: 0, testsCompleted: 0 } },
    });
    const trend = buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7);
    expect(trend).toHaveLength(7);
    expect(trend.find((d) => d.date === '2026-01-07')?.focusMinutes).toBe(55);
    expect(trend.filter((d) => d.date !== '2026-01-07').every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('empty study log: every day in the trend is safely zeroed, never throws', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7)).not.toThrow();
    expect(buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7).every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('accent resolution: PhD Research Analytics uses the violet accent', () => {
    expect(getWorkspaceAccent(useAppStore.getState().activeWorkspaceId).bg).toBe('bg-violet-600');
  });

  it('workspace isolation: a trend built from PhD Research studyLog never reflects activity logged under either other workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 12);
    const phdStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 111);
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 222);

    const phdTrend = buildDailyActivityTrend(phdStudyLog, '2026-01-10', 7);
    expect(phdTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(12);
  });
});
