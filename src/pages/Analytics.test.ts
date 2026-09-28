// Study Activity Trend integration on APFC Analytics (Phase 4 Step 5). No DOM rendering — exercises
// the exact computation pages/Analytics.tsx now performs (buildDailyActivityTrend over this
// workspace's own studyLog, replacing the page's former ad-hoc lastNDays/focusData) and the exact
// workspace-accent lookup it makes, the same convention pages/Dashboard.test.ts already uses.
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
beforeEach(fullReset);

describe('APFC Analytics — Study Activity Trend integration', () => {
  it('dashboard-equivalent integration: 7 entries, real focus minutes on the matching day, zero elsewhere', () => {
    useAppStore.setState({
      studyLog: { '2026-01-08': { date: '2026-01-08', focusMinutes: 35, topicsCompleted: 1, testsCompleted: 0 } },
    });
    const trend = buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7);
    expect(trend).toHaveLength(7);
    expect(trend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(35);
    expect(trend.filter((d) => d.date !== '2026-01-08').every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('empty study log: every day in the trend is safely zeroed, never throws', () => {
    expect(useAppStore.getState().studyLog).toEqual({});
    expect(() => buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7)).not.toThrow();
    expect(buildDailyActivityTrend(useAppStore.getState().studyLog, '2026-01-10', 7).every((d) => d.focusMinutes === 0 && !d.isActive)).toBe(true);
  });

  it('accent resolution: APFC Analytics uses the green accent, same as the dashboard', () => {
    expect(getWorkspaceAccent(useAppStore.getState().activeWorkspaceId).bg).toBe('bg-green-600');
  });

  it('workspace isolation: a trend built from APFC studyLog never reflects activity logged under another workspace', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 35);
    const apfcStudyLog = useAppStore.getState().studyLog;

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 999);
    const upscStudyLog = useAppStore.getState().studyLog;

    const apfcTrend = buildDailyActivityTrend(apfcStudyLog, '2026-01-10', 7);
    const upscTrend = buildDailyActivityTrend(upscStudyLog, '2026-01-10', 7);
    expect(apfcTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(35);
    expect(upscTrend.find((d) => d.date === '2026-01-08')?.focusMinutes).toBe(999);
  });
});
