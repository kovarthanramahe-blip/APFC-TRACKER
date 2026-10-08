import type { PYQAttempt, MockTestAttempt, PomodoroSession, StudyLogEntry } from './types';
import type { RevisionQueue } from './revisionQueue';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { computePyqPerformance } from './pyqPerformance';
import { computeDailyStudyQueue, type DailyQueueResult } from './studyPlanDailyQueue';
import type { StudyPlan } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import { getGamificationSnapshot, getRewardsSnapshot, type GamificationSnapshot, type RewardsSnapshot } from './gamification';
import { buildDailyActivityTrend, type DailyActivity } from './studyProgressInsights';
import { computeRevisionOSSnapshot } from './revisionOS';

// Command Centre 2.0 (Phase 16) — a thin, pure AGGREGATION layer, the exact same discipline
// lib/commandCentre.ts's own header already documents: every number below comes from an already-
// existing, already-tested engine (lib/studyPlanDailyQueue, lib/gamification, lib/pyqFilters +
// lib/revisionQueue, lib/studyProgressInsights) — the SAME ones pages/Dashboard.tsx already calls
// for APFC's own home page. Nothing here recomputes scheduling, XP, streaks, or revision
// eligibility. No store access: every input is data the caller (pages/CommandCentre.tsx) already
// resolved — either APFC's live fields (when APFC is the active workspace) or its own archived
// slice (lib/store.ts's inactiveWorkspaceOwnedData) otherwise — this module has no opinion on
// which, and never mutates anything. This is what lets Command Centre 2.0 show APFC's real
// Today/Study Pulse/Revision/Gamification numbers regardless of which workspace is currently
// active, consistent with the existing Command Centre's own cross-workspace "Up Next" list.

export interface ApfcHomeData {
  completedTopics: Record<string, boolean>;
  pyqAttempts: readonly PYQAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
  attempts: readonly MockTestAttempt[];
  sessions: readonly PomodoroSession[];
  studyLog: Record<string, StudyLogEntry>;
  starredQuestionIds: readonly string[];
  studyPlan: StudyPlan | null;
  personalStudyPlanTasks: readonly PersonalPlanTask[];
  dailyGoalMinutes: number;
}

export interface RevisionDueBuckets {
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
  /** Day 2 through day 7 from `today` — i.e. after tomorrow, within the next week. */
  dueThisWeek: number;
}

export interface ApfcHomeSnapshot {
  /** 0-100; 0 when the syllabus has no topics at all (never divides by zero). */
  overallSyllabusPct: number;
  dailyQueue: DailyQueueResult;
  todayFocusMinutes: number;
  dailyGoalMinutes: number;
  gamification: GamificationSnapshot;
  rewards: RewardsSnapshot;
  revisionBuckets: RevisionDueBuckets;
  /** Last 7 days, most-recent-last — see lib/studyProgressInsights's own buildDailyActivityTrend. */
  activityTrend: DailyActivity[];
}

/**
 * Buckets APFC's own revision-eligible PYQs by when each is next due, relative to `today`.
 * Delegates entirely to lib/revisionOS.ts's computeRevisionOSSnapshot (Phase 17) — the SAME
 * eligibility (lib/pyqFilters's computeEligibleRevisionIds) and bucket classification Revision OS
 * itself uses, rather than a second, parallel bucketing pass. This function's own signature/return
 * shape (RevisionDueBuckets, no "later" bucket) is preserved exactly for existing callers/tests:
 * Revision OS's own "later" bucket (due beyond 7 days) simply isn't surfaced here, matching this
 * snapshot's original 7-day-ahead scope.
 */
export function bucketRevisionDueDates(queue: RevisionQueue, pyqAttempts: readonly PYQAttempt[], bookmarkedPyqIds: readonly string[], today: string): RevisionDueBuckets {
  const snapshot = computeRevisionOSSnapshot(pyqAttempts, bookmarkedPyqIds, queue, today);
  return {
    overdue: snapshot.byBucket.overdue.length,
    dueToday: snapshot.byBucket.today.length,
    dueTomorrow: snapshot.byBucket.tomorrow.length,
    dueThisWeek: snapshot.byBucket.thisWeek.length,
  };
}

/**
 * Composes APFC's existing Today/Study Pulse/Revision/Gamification engines into one snapshot for
 * Command Centre 2.0 — see this file's own header for why every piece here is a direct reuse of
 * an engine pages/Dashboard.tsx already calls, never a re-derivation.
 */
export function computeApfcHomeSnapshot(data: ApfcHomeData, today: string): ApfcHomeSnapshot {
  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(data.completedTopics).filter(Boolean).length;
  const overallSyllabusPct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const pyqPerf = computePyqPerformance(PYQ_BANK, [...data.pyqAttempts]);
  const dailyQueue = computeDailyStudyQueue({
    plan: data.studyPlan,
    personalTasks: [...data.personalStudyPlanTasks],
    syllabus: SYLLABUS,
    completedTopics: data.completedTopics,
    pyqPerf,
    currentDate: today,
  });

  const gamificationInputs = {
    completedTopics: data.completedTopics,
    attempts: [...data.attempts],
    sessions: [...data.sessions],
    studyLog: data.studyLog,
    starredQuestionIds: [...data.starredQuestionIds],
    pyqAttempts: [...data.pyqAttempts],
  };

  return {
    overallSyllabusPct,
    dailyQueue,
    todayFocusMinutes: data.studyLog[today]?.focusMinutes ?? 0,
    dailyGoalMinutes: data.dailyGoalMinutes,
    gamification: getGamificationSnapshot(gamificationInputs),
    rewards: getRewardsSnapshot(gamificationInputs),
    revisionBuckets: bucketRevisionDueDates(data.revisionQueue, data.pyqAttempts, data.bookmarkedPyqIds, today),
    activityTrend: buildDailyActivityTrend(data.studyLog, today, 7),
  };
}
