import type { ApfcHomeSnapshot } from './commandCentreHome';
import type { RevisionQueue } from './revisionQueue';
import type { PomodoroSession } from './types';
import { MAX_BOX } from './revisionQueue';
import { getLocalDateString } from './utils';

// Study Context (Wave 3) — a small, compact, typed snapshot of "what is actually happening in the
// APFC study system right now", built ENTIRELY from already-computed Wave 1/2 outputs
// (ApfcHomeSnapshot — lib/commandCentreHome.ts's own computeApfcHomeSnapshot, the SAME snapshot
// Command Centre's Today/Study Pulse/Revision/Gamification panels already render) plus two small,
// cheap extras this file computes itself because ApfcHomeSnapshot doesn't carry them yet
// (revision review/mastery counts from the raw queue; syllabus weak-topic count from the caller's
// own already-computed topic statuses — see computeStudyContext's own doc comment).
//
// This is deliberately NOT a dump of the whole Zustand store: every field here is either copied
// straight off ApfcHomeSnapshot or derived by a one-line pure reduction over a single already-
// existing collection (RevisionQueue). Nothing here recomputes scheduling, XP, streaks, or
// syllabus/revision eligibility — those remain owned by lib/revisionQueue.ts, lib/gamification.ts,
// lib/studyPlanDailyQueue.ts and lib/pyqFilters.ts respectively.
//
// Two independent consumers share this one context rather than each re-deriving it: Gamification
// 2.0's daily mission/weekly challenge (lib/gamificationMissions.ts) and the deterministic JARVIS
// insight/Q&A layer (lib/jarvisPriorityInsight.ts, lib/jarvisDeterministicQA.ts). None of those
// files live under src/lib/jarvis/ — this stays entirely outside the protected JARVIS runtime/
// Decision Engine, mirroring the SAME separation lib/commandCentre.ts's own "JARVIS Priority Panel"
// already established in Wave 1 (deterministic, page-level, never calling lib/jarvis/runtime.ts).

export interface StudyContextPlanner {
  hasPlan: boolean;
  todayPending: number;
  todayCompleted: number;
  overdueCount: number;
  /** The single most urgent pending item's own title/reason, straight from
   * lib/studyPlanDailyQueue.ts's own recommendedOrder[0] — never re-ranked here. Null when there's
   * no active plan or nothing pending/overdue right now. */
  nextTaskTitle: string | null;
  nextTaskReason: string | null;
}

export interface StudyContextRevision {
  /** overdue + due today — combined because both mean "needs attention now". */
  dueNow: number;
  dueTomorrow: number;
  dueThisWeek: number;
  /** RevisionItem.lastReviewedDate === today, across the whole queue — a real, already-stored
   * field, never a new per-day counter. */
  reviewedToday: number;
  /** box === MAX_BOX, across the whole queue. */
  masteredCount: number;
}

export interface StudyContextSyllabus {
  completedPct: number;
  /** Topics with status 'needs_revision' (lib/topicStatus.ts) — supplied by the caller (see
   * computeStudyContext's own doc comment on why this one field can't be derived from
   * ApfcHomeSnapshot alone). 0 when the caller doesn't have this computed (never guessed). */
  weakCount: number;
}

export interface StudyContextFocus {
  todayMinutes: number;
  dailyGoalMinutes: number;
  todaySessionCount: number;
}

export interface StudyContextHistory {
  /** Sum of the last 7 days' focusMinutes — lib/commandCentreHome.ts's own activityTrend, summed. */
  last7DaysFocusMinutes: number;
  activeDaysLast7: number;
}

export interface StudyContextGamification {
  xp: number;
  level: number;
  streakCurrent: number;
  streakBest: number;
}

export interface StudyContext {
  today: string;
  planner: StudyContextPlanner;
  revision: StudyContextRevision;
  syllabus: StudyContextSyllabus;
  focus: StudyContextFocus;
  history: StudyContextHistory;
  gamification: StudyContextGamification;
}

export interface ComputeStudyContextInput {
  today: string;
  apfcHome: ApfcHomeSnapshot;
  revisionQueue: RevisionQueue;
  /** Raw sessions — ApfcHomeSnapshot's own activityTrend only carries per-day focusMinutes/isActive,
   * never a session count, so an accurate todaySessionCount needs this one extra, already-available
   * collection (the SAME `sessions` field pages/Pomodoro.tsx itself reads off the store). */
  sessions: readonly PomodoroSession[];
  /** The caller's own already-computed syllabus weak-topic count (e.g. lib/syllabusOS.ts's
   * computeSyllabusOverview(...).weakCount, the SAME computation pages/Syllabus.tsx's own overview
   * row already uses) — never recomputed here, since doing so would mean re-running
   * computeUnifiedTopicStatus a second time for a context object that doesn't otherwise need the
   * full per-topic breakdown. Pass 0 when the caller hasn't computed it (e.g. a test with no
   * syllabus signal) — never a fabricated guess. */
  syllabusWeakCount: number;
}

export function computeStudyContext(input: ComputeStudyContextInput): StudyContext {
  const { today, apfcHome, revisionQueue } = input;
  const dailyQueue = apfcHome.dailyQueue;

  const hasPlan = dailyQueue.status === 'active';
  const topPriority = hasPlan && dailyQueue.status === 'active' ? dailyQueue.recommendedOrder[0] : undefined;

  let reviewedToday = 0;
  let masteredCount = 0;
  for (const item of Object.values(revisionQueue)) {
    if (item.lastReviewedDate === today) reviewedToday += 1;
    if (item.box === MAX_BOX) masteredCount += 1;
  }

  const todaySessionCount = input.sessions.filter((s) => s.mode === 'focus' && getLocalDateString(new Date(s.completedAt)) === today).length;

  return {
    today,
    planner: {
      hasPlan,
      todayPending: hasPlan && dailyQueue.status === 'active' ? dailyQueue.todayPending.length : 0,
      todayCompleted: hasPlan && dailyQueue.status === 'active' ? dailyQueue.todayCompletedCount : 0,
      overdueCount: hasPlan && dailyQueue.status === 'active' ? dailyQueue.overdueTasks.length : 0,
      nextTaskTitle: topPriority?.task.title ?? null,
      nextTaskReason: topPriority?.reason ?? null,
    },
    revision: {
      dueNow: apfcHome.revisionBuckets.overdue + apfcHome.revisionBuckets.dueToday,
      dueTomorrow: apfcHome.revisionBuckets.dueTomorrow,
      dueThisWeek: apfcHome.revisionBuckets.dueThisWeek,
      reviewedToday,
      masteredCount,
    },
    syllabus: {
      completedPct: apfcHome.overallSyllabusPct,
      weakCount: input.syllabusWeakCount,
    },
    focus: {
      todayMinutes: apfcHome.todayFocusMinutes,
      dailyGoalMinutes: apfcHome.dailyGoalMinutes,
      todaySessionCount,
    },
    history: {
      last7DaysFocusMinutes: apfcHome.activityTrend.reduce((sum, d) => sum + d.focusMinutes, 0),
      activeDaysLast7: apfcHome.activityTrend.filter((d) => d.isActive).length,
    },
    gamification: {
      xp: apfcHome.gamification.xp,
      level: apfcHome.gamification.level.level,
      streakCurrent: apfcHome.gamification.streaks.current,
      streakBest: apfcHome.gamification.streaks.best,
    },
  };
}
