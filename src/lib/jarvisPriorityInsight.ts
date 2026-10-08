import type { StudyContext } from './studyContext';
import type { DailyMission, WeeklyChallenge } from './gamificationMissions';
import { getEncouragementMessage } from './gamification';

// JARVIS Experience 2.0 (Phase 23) — the Command Centre's own "Top Priority" card: ONE strong,
// deterministic insight rather than a flood of weak ones (this phase's own "prefer one strong
// recommendation over ten" principle). This file lives OUTSIDE src/lib/jarvis/ on purpose, exactly
// mirroring the separation lib/commandCentre.ts's own "JARVIS Priority Panel" already established
// in Wave 1: a deterministic, page-level intelligence layer, never calling into — or altering —
// the protected JARVIS runtime (src/lib/jarvis/orchestrator.ts, routingPolicy.ts, decisionEngine.ts,
// runtime.ts). Every field below is read straight off StudyContext (lib/studyContext.ts, itself
// built from already-computed Wave 1/2 snapshots) or the already-computed daily mission
// (lib/gamificationMissions.ts) — nothing here recomputes scheduling, revision eligibility, XP, or
// streaks.

export type JarvisInsightCategory = 'priority' | 'recommendation' | 'warning' | 'progress' | 'achievement' | 'motivation';

export interface JarvisInsight {
  category: JarvisInsightCategory;
  /** The short headline — e.g. "2 revision items overdue". */
  title: string;
  /** Why `title` is true, in one sentence — cites real counts only, never an invented cause. */
  reason: string;
  actionLabel: string;
  actionHref: string;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Selects the single most relevant insight for right now, via a fixed, documented priority ladder
 * — never randomised, never re-ordered by an invented score. Same input always produces the same
 * insight (deterministic). The ladder, in order:
 *
 *   1. Overdue planned work (planner.overdueCount > 0)       -> 'priority'
 *   2. Revision due now (revision.dueNow > 0)                -> 'priority'
 *   3. Today's mission still open                            -> 'recommendation'
 *   4. Weak syllabus areas, nothing else urgent               -> 'warning'
 *   5. The weekly challenge is complete                      -> 'achievement'
 *   6. A real multi-day streak in progress (>= 3 days)        -> 'progress'
 *   7. Nothing else — a context-aware encouragement line      -> 'motivation'
 *
 * Steps 1-2 mirror the Wave 3 brief's own worked example ("PRIORITY / Revision overdue / REASON /
 * 2 APFC revision items are overdue. / ACTION / Start revision") almost verbatim. Step 5
 * deliberately keys off the WEEKLY challenge, not the daily mission: the daily mission completes
 * routinely (most days, once any work is logged), so using it here would make 'achievement' the
 * de-facto default for every ordinary good day and starve steps 6-7 — a genuinely rarer, week-scale
 * milestone is what actually earns a distinct "achievement" framing. Step 7 reuses
 * lib/gamification.ts's own getEncouragementMessage — the SAME already-tested, already-used
 * motivational copy Dashboard-era surfaces draw from — rather than inventing new phrasing.
 */
export function computeJarvisPriorityInsight(ctx: StudyContext, dailyMission: DailyMission, weeklyChallenge: WeeklyChallenge): JarvisInsight {
  if (ctx.planner.overdueCount > 0) {
    return {
      category: 'priority',
      title: `${pluralize(ctx.planner.overdueCount, 'overdue task')}`,
      reason: `${pluralize(ctx.planner.overdueCount, 'planned task')} ${ctx.planner.overdueCount === 1 ? 'is' : 'are'} past its scheduled date.`,
      actionLabel: 'Open Study Plan',
      actionHref: '/study-plan',
    };
  }

  if (ctx.revision.dueNow > 0) {
    return {
      category: 'priority',
      title: `${pluralize(ctx.revision.dueNow, 'revision item')} due`,
      reason: `${pluralize(ctx.revision.dueNow, 'APFC revision item')} ${ctx.revision.dueNow === 1 ? 'is' : 'are'} overdue or due today.`,
      actionLabel: 'Start Revision',
      actionHref: '/revision',
    };
  }

  if (!dailyMission.completed) {
    return {
      category: 'recommendation',
      title: dailyMission.title,
      reason: dailyMission.description,
      actionLabel: dailyMission.actionLabel,
      actionHref: dailyMission.actionHref,
    };
  }

  if (ctx.syllabus.weakCount > 0) {
    return {
      category: 'warning',
      title: `${pluralize(ctx.syllabus.weakCount, 'weak syllabus area')}`,
      reason: `${pluralize(ctx.syllabus.weakCount, 'topic')} ${ctx.syllabus.weakCount === 1 ? 'is' : 'are'} covered but recent PYQ accuracy is low.`,
      actionLabel: 'Open Syllabus',
      actionHref: '/syllabus',
    };
  }

  if (weeklyChallenge.completed) {
    return {
      category: 'achievement',
      title: 'Weekly focus challenge complete',
      reason: weeklyChallenge.description,
      actionLabel: 'View History',
      actionHref: '/history',
    };
  }

  if (ctx.gamification.streakCurrent >= 3) {
    return {
      category: 'progress',
      title: `${pluralize(ctx.gamification.streakCurrent, 'day')} streak`,
      reason: `You've studied ${ctx.gamification.streakCurrent} days in a row — keep it going.`,
      actionLabel: 'View Analytics',
      actionHref: '/analytics',
    };
  }

  const message = getEncouragementMessage({
    todayMinutes: ctx.focus.todayMinutes,
    dailyGoalMinutes: ctx.focus.dailyGoalMinutes,
    streakCurrent: ctx.gamification.streakCurrent,
    syllabusPct: ctx.syllabus.completedPct,
    tookTestToday: false,
  });
  return {
    category: 'motivation',
    title: message,
    reason: 'Nothing is overdue right now — a good time to build momentum.',
    actionLabel: 'Start Focus',
    actionHref: '/pomodoro',
  };
}
