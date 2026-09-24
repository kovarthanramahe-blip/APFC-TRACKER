// Study Progress Insights integration on the APFC Dashboard (Phase 4 Step 2). No DOM rendering —
// exercises the exact computation pages/Dashboard.tsx itself performs (computeStudyProgressInsights
// over this workspace's own studyLog, with the SAME completedTopics/getAllTopicsCount() completion
// target overallPct already derives from) and the exact workspace-accent lookup it makes, the same
// convention every other *.test.ts file in this app uses (see e.g. UpscCseDashboard.test.ts).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { getAllTopicsCount } from '../data/syllabus';
import { computeStudyProgressInsights } from '../lib/studyProgressInsights';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import type { StudyLogEntry } from '../lib/types';

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
afterEach(() => vi.useRealTimers());

function entry(date: string, overrides: Partial<StudyLogEntry> = {}): StudyLogEntry {
  return { date, focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, ...overrides };
}

/** Mirrors EXACTLY the completionTarget expression pages/Dashboard.tsx builds. */
function apfcCompletionTarget(completedTopics: Record<string, boolean>) {
  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;
  return totalTopics > 0 ? { completed: doneTopics, total: totalTopics } : undefined;
}

describe('APFC Dashboard — Study Progress Insights integration', () => {
  it('normal activity: computeStudyProgressInsights reflects the real studyLog and completion target the page reads', () => {
    useAppStore.setState({
      studyLog: { '2026-01-08': entry('2026-01-08', { focusMinutes: 45, topicsCompleted: 2 }) },
      completedTopics: { t1: true, t2: true },
    });
    const state = useAppStore.getState();
    const insights = computeStudyProgressInsights({ studyLog: state.studyLog, completionTarget: apfcCompletionTarget(state.completedTopics), referenceDate: '2026-01-08' });
    expect(insights.currentPeriod.focusMinutes).toBe(45);
    expect(insights.totalActivity.focusMinutes).toBe(45);
    expect(insights.progressPercent).toBe(Math.round((2 / getAllTopicsCount()) * 1000) / 10);
  });

  it('empty study-log state: a fully zeroed/null snapshot, never an error', () => {
    const state = useAppStore.getState();
    expect(state.studyLog).toEqual({});
    const insights = computeStudyProgressInsights({ studyLog: state.studyLog, completionTarget: apfcCompletionTarget(state.completedTopics), referenceDate: '2026-01-08' });
    expect(insights.totalActivity).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.currentPeriod).toEqual({ focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 });
    expect(insights.progressPercent).toBe(0); // 0 done / totalTopics done, never null (APFC always has a real syllabus total)
  });

  it('current vs previous period: a 7-day comparison window computed from the real studyLog', () => {
    useAppStore.setState({
      studyLog: {
        '2026-01-02': entry('2026-01-02', { focusMinutes: 20 }), // previous period
        '2026-01-08': entry('2026-01-08', { focusMinutes: 50 }), // current period
      },
    });
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog, referenceDate: '2026-01-10', periodDays: 7 });
    expect(insights.currentPeriod.focusMinutes).toBe(50);
    expect(insights.previousPeriod.focusMinutes).toBe(20);
    expect(insights.focusMinutesDelta).toBe(30);
    expect(insights.focusMinutesDeltaPct).toBe(150);
  });

  it('streak display: reflects real consecutive-day activity in this workspace\'s studyLog', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T09:00:00'));
    useAppStore.setState({
      studyLog: {
        '2026-01-09': entry('2026-01-09', { focusMinutes: 10 }),
        '2026-01-10': entry('2026-01-10', { focusMinutes: 10 }),
      },
    });
    const insights = computeStudyProgressInsights({ studyLog: useAppStore.getState().studyLog, referenceDate: '2026-01-10' });
    expect(insights.streak).toEqual({ current: 2, best: 2 });
  });

  it('workspace accent: APFC resolves to the green accent', () => {
    const accent = getWorkspaceAccent(useAppStore.getState().activeWorkspaceId);
    expect(useAppStore.getState().activeWorkspaceId).toBe('apfc');
    expect(accent.bg).toBe('bg-green-600');
  });
});

describe('APFC Dashboard — Study Progress Insights workspace isolation', () => {
  it('studyLog logged while APFC is active never appears after switching to another workspace, and the insights computed from each workspace\'s own studyLog differ', () => {
    useAppStore.getState().bumpFocusMinutes('2026-01-08', 45);
    const apfcStudyLog = useAppStore.getState().studyLog;
    expect(Object.keys(apfcStudyLog).length).toBeGreaterThan(0);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const upscStudyLog = useAppStore.getState().studyLog;
    expect(upscStudyLog).toEqual({});

    const apfcInsights = computeStudyProgressInsights({ studyLog: apfcStudyLog });
    const upscInsights = computeStudyProgressInsights({ studyLog: upscStudyLog });
    expect(apfcInsights.totalActivity.focusMinutes).toBe(45);
    expect(upscInsights.totalActivity.focusMinutes).toBe(0);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().studyLog).toEqual(apfcStudyLog);
  });
});
