import type { StudyContext } from './studyContext';

// Gamification 2.0 (Phase 22) — Daily Mission + Weekly Challenge. Both are PURELY DERIVED from the
// already-computed StudyContext (lib/studyContext.ts) — no new storage, no persisted "mission
// state", no second XP ledger. A mission's own `current`/`completed` is recomputed fresh every
// call from real, already-tracked data (today's studyLog entry, the real revision queue, the real
// planner queue), so it naturally resets at local midnight (a new date simply has a fresh
// studyLog/dailyQueue) without this file ever touching a clock or persisting anything itself.
//
// Selection is deterministic and STICKY through completion: a category's own "is this relevant
// today" check stays true even once its count reaches the target (see each branch below), so
// finishing a mission shows it as "Done!" rather than silently swapping to a different mission
// mid-session — the same "no flicker" requirement generateUpNextItems (lib/commandCentre.ts) and
// computeDailyStudyQueue (lib/studyPlanDailyQueue.ts) already satisfy for their own lists.

export type DailyMissionCategory = 'planner' | 'revision' | 'focus';

export interface DailyMission {
  category: DailyMissionCategory;
  title: string;
  description: string;
  current: number;
  target: number;
  /** 0-100, rounded; 100 whenever `completed` even if current slightly exceeds target. */
  progressPct: number;
  completed: boolean;
  actionLabel: string;
  actionHref: string;
}

function pct(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / target) * 100));
}

/**
 * Picks ONE daily mission, in a fixed priority order (planner work scheduled today, then revision
 * due/reviewed today, then an always-available focus-minutes goal) — never random, never more than
 * one shown at once (see Phase 22's own "prefer one strong recommendation" principle, also applied
 * to lib/jarvisPriorityInsight.ts). The chosen category stays the SAME mission all day: each
 * branch's own relevance check (`todayPending + todayCompleted > 0`, `dueNow + reviewedToday > 0`)
 * stays true after the mission is completed, since completing work only moves counts between
 * "pending" and "completed"/"reviewed", never to zero-for-both.
 */
export function computeDailyMission(ctx: StudyContext): DailyMission {
  const { planner, revision, focus } = ctx;

  if (planner.hasPlan && planner.todayPending + planner.todayCompleted > 0) {
    const target = planner.todayPending + planner.todayCompleted;
    const current = planner.todayCompleted;
    return {
      category: 'planner',
      title: "Complete today's planned work",
      description: `${current} of ${target} planned task${target === 1 ? '' : 's'} done today.`,
      current,
      target,
      progressPct: pct(current, target),
      completed: planner.todayPending === 0,
      actionLabel: 'Open Study Plan',
      actionHref: '/study-plan',
    };
  }

  if (revision.dueNow + revision.reviewedToday > 0) {
    const target = revision.dueNow + revision.reviewedToday;
    const current = revision.reviewedToday;
    return {
      category: 'revision',
      title: "Clear today's due revisions",
      description: `${current} reviewed, ${revision.dueNow} still due today.`,
      current,
      target,
      progressPct: pct(current, target),
      completed: revision.dueNow === 0,
      actionLabel: 'Start Revision',
      actionHref: '/revision',
    };
  }

  // Always-available fallback — a focus-minutes goal is meaningful even with nothing scheduled.
  // A dailyGoalMinutes of 0 (never actually configurable below 5 — see lib/store.ts's
  // setDailyGoalMinutes) falls back to a sensible 30-minute default rather than an impossible
  // (or trivially-already-met) 0-minute target.
  const target = focus.dailyGoalMinutes > 0 ? focus.dailyGoalMinutes : 30;
  return {
    category: 'focus',
    title: `Focus for ${target} minutes today`,
    description: `${focus.todayMinutes} of ${target} minutes focused today.`,
    current: focus.todayMinutes,
    target,
    progressPct: pct(focus.todayMinutes, target),
    completed: focus.todayMinutes >= target,
    actionLabel: 'Start Focus',
    actionHref: '/pomodoro',
  };
}

export interface WeeklyChallenge {
  title: string;
  description: string;
  current: number;
  target: number;
  progressPct: number;
  completed: boolean;
  actionLabel: string;
  actionHref: string;
}

const WEEKLY_TARGET_DAYS = 5;

/**
 * A single, lightweight weekly focus-minutes goal — target derived from the user's own already-set
 * daily goal (lib/store.ts's dailyGoalMinutes) times a fixed 5 study-day assumption, never an
 * invented or historical-trend-based number. `current` reuses ApfcHomeSnapshot's own 7-day
 * activityTrend sum (via StudyContext.history.last7DaysFocusMinutes) — the SAME total
 * pages/Analytics.tsx's own Study Activity Trend chart already shows, never a second weekly sum.
 */
export function computeWeeklyChallenge(ctx: StudyContext): WeeklyChallenge {
  const dailyTarget = ctx.focus.dailyGoalMinutes > 0 ? ctx.focus.dailyGoalMinutes : 30;
  const target = dailyTarget * WEEKLY_TARGET_DAYS;
  const current = ctx.history.last7DaysFocusMinutes;
  return {
    title: 'Weekly Focus Challenge',
    description: `${current} of ${target} minutes focused in the last 7 days.`,
    current,
    target,
    progressPct: pct(current, target),
    completed: current >= target,
    actionLabel: 'Start Focus',
    actionHref: '/pomodoro',
  };
}
