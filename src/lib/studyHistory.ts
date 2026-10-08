import type { PomodoroSession, PYQAttempt, MockTestAttempt, StudyLogEntry } from './types';
import type { StudyPlanTask } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { RevisionQueue } from './revisionQueue';
import { getLocalDateString } from './utils';
import { computeStreaks, totalFocusMinutes, type StreakInfo } from './gamification';
import { buildDailyActivityTrend, type DailyActivity } from './studyProgressInsights';

// Study History + Analytics (Phase 21) — a pure, read-only AGGREGATION over activity this app
// already records: PomodoroSession (sessions), PYQAttempt, MockTestAttempt, completed
// StudyPlanTask/PersonalPlanTask, and RevisionQueue review metadata. Nothing here is a new
// activity-tracking mechanism — every event below is built from a field an existing record already
// carries, never fabricated or backfilled. "ANALYTICS MUST BE DERIVED FROM REAL RECORDED ACTIVITY"
// (Wave 2 brief): computeStudyHistoryAnalytics below composes already-canonical calculations
// (lib/gamification's computeStreaks/totalFocusMinutes, lib/studyProgressInsights's
// buildDailyActivityTrend) rather than re-deriving them a second way.
//
// One honest limitation, documented rather than worked around: StudyPlanTask/PersonalPlanTask
// record only a SCHEDULED date (`date`), never a completion timestamp — a 'task_completed' event
// is therefore dated by that scheduled date, not a fabricated "completed at" time. See each event
// kind's own comment below for the exact field it's dated by.

export type StudyHistoryEventKind = 'focus_session' | 'pyq_attempt' | 'mock_test' | 'task_completed' | 'revision_review';

export interface StudyHistoryEvent {
  id: string;
  kind: StudyHistoryEventKind;
  /** yyyy-mm-dd — see this file's own header for which real field each kind is dated by. */
  date: string;
  title: string;
  detail: string;
  /** Only meaningful for a completed FOCUS session (never a break) or a completed task's own
   * estimate — omitted entirely rather than shown as 0 for every other kind. */
  minutes?: number;
}

function dateOf(isoTimestamp: string): string {
  return getLocalDateString(new Date(isoTimestamp));
}

export interface BuildStudyHistoryInput {
  sessions: readonly PomodoroSession[];
  pyqAttempts: readonly PYQAttempt[];
  mockTestAttempts: readonly MockTestAttempt[];
  planTasks: readonly StudyPlanTask[];
  personalTasks: readonly PersonalPlanTask[];
  revisionQueue: RevisionQueue;
}

const MODE_TITLE: Record<PomodoroSession['mode'], string> = { focus: 'Focus session', shortBreak: 'Short break', longBreak: 'Long break' };

/**
 * Builds the full chronological event list (newest first) from every already-recorded activity
 * source this app has. Never mutates any input, never invents an event for data that doesn't
 * exist (an empty `sessions`/`pyqAttempts`/etc. contributes nothing — not a zeroed placeholder).
 */
export function buildStudyHistoryEvents(input: BuildStudyHistoryInput): StudyHistoryEvent[] {
  const events: StudyHistoryEvent[] = [];

  // Dated by PomodoroSession.completedAt — the real moment the session ended.
  for (const s of input.sessions) {
    events.push({
      id: `session:${s.id}`,
      kind: 'focus_session',
      date: dateOf(s.completedAt),
      title: MODE_TITLE[s.mode],
      detail: s.subject && s.subject !== 'general' ? `${s.durationMinutes}m · ${s.subject}` : `${s.durationMinutes}m`,
      minutes: s.mode === 'focus' ? s.durationMinutes : undefined,
    });
  }

  // Dated by PYQAttempt.submittedAt — the real moment the test was submitted.
  for (const a of input.pyqAttempts) {
    events.push({
      id: `pyq:${a.id}`,
      kind: 'pyq_attempt',
      date: dateOf(a.submittedAt),
      title: 'PYQ practice',
      detail: `${a.correctCount}/${a.questionIds.length} correct · ${a.accuracy.toFixed(0)}% accuracy`,
    });
  }

  // Dated by MockTestAttempt.submittedAt.
  for (const a of input.mockTestAttempts) {
    events.push({
      id: `mock:${a.id}`,
      kind: 'mock_test',
      date: dateOf(a.submittedAt),
      title: a.blueprintTitle,
      detail: `${a.score}/${a.maxScore} score`,
    });
  }

  // Dated by the task's own SCHEDULED date — see this file's own header for why that's the only
  // honest field available (no completion timestamp exists on either task shape).
  for (const t of [...input.planTasks, ...input.personalTasks]) {
    if (t.status !== 'completed') continue;
    events.push({ id: `task:${t.id}`, kind: 'task_completed', date: t.date, title: t.title, detail: `${t.estimatedMinutes}m planned`, minutes: t.estimatedMinutes });
  }

  // Dated by RevisionItem.lastReviewedDate — only present once reviewCount > 0 (see
  // lib/revisionQueue.ts's own recordCorrect/recordIncorrect); an added-but-never-reviewed item
  // (lastReviewedDate: null) contributes no event, never a fabricated "reviewed today".
  for (const [itemId, item] of Object.entries(input.revisionQueue)) {
    if (item.reviewCount === 0 || !item.lastReviewedDate) continue;
    events.push({
      id: `revision:${itemId}`,
      kind: 'revision_review',
      date: item.lastReviewedDate,
      title: 'Revision review',
      detail: `Box ${item.box} · reviewed ${item.reviewCount} time${item.reviewCount === 1 ? '' : 's'}`,
    });
  }

  events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return events;
}

/** Both bounds inclusive, yyyy-mm-dd — plain string comparison is safe (see every other module's
 * own date-range filter, e.g. lib/studyProgressInsights.ts's sumStudyActivity). */
export function filterEventsByRange(events: readonly StudyHistoryEvent[], startInclusive: string, endInclusive: string): StudyHistoryEvent[] {
  return events.filter((e) => e.date >= startInclusive && e.date <= endInclusive);
}

/** Groups already-sorted events by date, preserving newest-date-first order — a pure display-layer
 * grouping, same convention as pages/StudyPlan.tsx's own groupTasksByDate. */
export function groupEventsByDate(events: readonly StudyHistoryEvent[]): [string, StudyHistoryEvent[]][] {
  const map = new Map<string, StudyHistoryEvent[]>();
  for (const e of events) {
    const existing = map.get(e.date);
    if (existing) existing.push(e);
    else map.set(e.date, [e]);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export interface StudyHistoryAnalyticsSnapshot {
  referenceDate: string;
  /** lib/gamification.ts's own totalFocusMinutes, reused verbatim — the SAME all-time figure
   * pages/Analytics.tsx's own "Total Focused Time" stat already shows. */
  totalFocusMinutes: number;
  focusSessionCount: number;
  /** lib/gamification.ts's own computeStreaks, reused verbatim — never a second streak
   * calculation. */
  streak: StreakInfo;
  /** lib/studyProgressInsights.ts's own buildDailyActivityTrend, reused verbatim. */
  dailyActivity: DailyActivity[];
  eventCountByKind: Record<StudyHistoryEventKind, number>;
}

/**
 * Composes already-canonical calculations into one snapshot for the History page's compact
 * summary row — never a parallel recomputation of streaks/focus totals/daily trend (see this
 * file's own header). `events` only contributes `focusSessionCount`/`eventCountByKind`; everything
 * else reads `studyLog` through the SAME functions pages/Analytics.tsx/Dashboard.tsx already call.
 */
export function computeStudyHistoryAnalytics(
  events: readonly StudyHistoryEvent[],
  studyLog: Record<string, StudyLogEntry>,
  referenceDate: string,
  trendDays: number = 7,
): StudyHistoryAnalyticsSnapshot {
  const eventCountByKind: Record<StudyHistoryEventKind, number> = {
    focus_session: 0,
    pyq_attempt: 0,
    mock_test: 0,
    task_completed: 0,
    revision_review: 0,
  };
  let focusSessionCount = 0;
  for (const e of events) {
    eventCountByKind[e.kind] += 1;
    if (e.kind === 'focus_session' && e.minutes !== undefined) focusSessionCount += 1;
  }

  return {
    referenceDate,
    totalFocusMinutes: totalFocusMinutes(studyLog),
    focusSessionCount,
    streak: computeStreaks(studyLog),
    dailyActivity: buildDailyActivityTrend(studyLog, referenceDate, trendDays),
    eventCountByKind,
  };
}
