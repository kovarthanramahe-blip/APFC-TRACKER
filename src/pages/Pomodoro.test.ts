// Pomodoro — Phase 6 Step 1 regression coverage for the local-date "today" fix. No DOM rendering
// (this page has React state/refs with no exported pure function of its own) — instead this
// exercises the exact store call and comparison expression pages/Pomodoro.tsx itself now performs
// (see its own inline comments at the bumpFocusMinutes call and the todayFocus filter), the same
// convention every other *.test.ts file in this app uses for page-level behaviour it can't reach
// via an export.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { getLocalDateString } from '../lib/utils';
import type { PomodoroSession } from '../lib/types';

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

const originalTz = process.env.TZ;

afterEach(() => {
  fullReset();
  vi.useRealTimers();
  process.env.TZ = originalTz;
});

function session(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return {
    id: overrides.id ?? `session-${Math.random()}`,
    mode: 'focus',
    subject: 'general',
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? new Date().toISOString(),
    durationMinutes: overrides.durationMinutes ?? 25,
    completedFully: overrides.completedFully ?? true,
    ...overrides,
  };
}

describe('Pomodoro — bumpFocusMinutes writes under the correct LOCAL date (Phase 6 Step 1)', () => {
  it('a normal daytime instant: focus minutes are recorded under today\'s local date', () => {
    fullReset();
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST

    // The exact call pages/Pomodoro.tsx's completeSession now makes on a completed focus session.
    useAppStore.getState().bumpFocusMinutes(getLocalDateString(), 25);

    expect(useAppStore.getState().studyLog['2026-01-10']?.focusMinutes).toBe(25);
  });

  it('the IST midnight-boundary instant: focus minutes land under the correct LOCAL date, not the UTC date', () => {
    fullReset();
    process.env.TZ = 'Asia/Kolkata';
    // 2026-01-09 20:00 UTC == 2026-01-10 01:30 IST — within the ~00:00-05:29 IST bug window.
    const boundaryInstant = new Date(Date.UTC(2026, 0, 9, 20, 0, 0));
    const wrongUtcKey = boundaryInstant.toISOString().slice(0, 10); // what the old buggy code used
    expect(wrongUtcKey).toBe('2026-01-09');
    vi.setSystemTime(boundaryInstant);

    useAppStore.getState().bumpFocusMinutes(getLocalDateString(), 25);

    // Correctly keyed under the LOCAL date...
    expect(useAppStore.getState().studyLog['2026-01-10']?.focusMinutes).toBe(25);
    // ...never under the UTC date the pre-fix code would have used.
    expect(useAppStore.getState().studyLog[wrongUtcKey]).toBeUndefined();
  });
});

describe('Pomodoro — "today" session filtering uses the same LOCAL date (Phase 6 Step 1)', () => {
  // Mirrors pages/Pomodoro.tsx's own todayFocus filter predicate exactly:
  // getLocalDateString(new Date(s.completedAt)) === getLocalDateString()
  function todayFocusMinutes(sessions: PomodoroSession[]): number {
    return sessions
      .filter((s) => s.mode === 'focus' && getLocalDateString(new Date(s.completedAt)) === getLocalDateString())
      .reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  it('a session completed earlier the same local day counts as today', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST
    const sessions = [session({ completedAt: new Date(Date.UTC(2026, 0, 10, 4, 0, 0)).toISOString(), durationMinutes: 25 })]; // 2026-01-10 09:30 IST, same local day
    expect(todayFocusMinutes(sessions)).toBe(25);
  });

  it('the IST midnight-boundary instant: a session completed just after local midnight counts as today even though its UTC date is still yesterday', () => {
    process.env.TZ = 'Asia/Kolkata';
    const boundaryInstant = new Date(Date.UTC(2026, 0, 9, 20, 0, 0)); // 2026-01-10 01:30 IST
    vi.setSystemTime(boundaryInstant);
    const sessions = [session({ completedAt: boundaryInstant.toISOString(), durationMinutes: 25 })];
    expect(todayFocusMinutes(sessions)).toBe(25);
  });

  it('a session completed on a genuinely different local day does not count as today', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST
    const sessions = [session({ completedAt: new Date(Date.UTC(2026, 0, 8, 12, 0, 0)).toISOString(), durationMinutes: 25 })]; // 2026-01-08
    expect(todayFocusMinutes(sessions)).toBe(0);
  });

  it('break-mode sessions are excluded regardless of date (unchanged existing behaviour)', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0))); // 2026-01-10 15:00 IST
    const sessions = [session({ mode: 'shortBreak', completedAt: new Date(Date.UTC(2026, 0, 10, 9, 0, 0)).toISOString(), durationMinutes: 5 })];
    expect(todayFocusMinutes(sessions)).toBe(0);
  });
});

describe('Pomodoro — workspace isolation is unaffected by the date fix (Phase 6 Step 1)', () => {
  it('sessions/studyLog remain workspace-owned: a session logged under one workspace never appears after switching', () => {
    fullReset();
    process.env.TZ = 'Asia/Kolkata';
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 9, 30, 0)));

    useAppStore.getState().addSession(session({ id: 'apfc-session' }));
    useAppStore.getState().bumpFocusMinutes(getLocalDateString(), 25);
    expect(useAppStore.getState().sessions).toHaveLength(1);
    expect(useAppStore.getState().studyLog['2026-01-10']?.focusMinutes).toBe(25);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(useAppStore.getState().studyLog).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().sessions.map((s) => s.id)).toEqual(['apfc-session']);
    expect(useAppStore.getState().studyLog['2026-01-10']?.focusMinutes).toBe(25);
  });
});
