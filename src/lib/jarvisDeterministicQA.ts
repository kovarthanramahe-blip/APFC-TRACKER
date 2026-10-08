import type { StudyContext } from './studyContext';
import type { DailyMission, WeeklyChallenge } from './gamificationMissions';
import { formatMinutes } from './utils';

// JARVIS Experience 2.0 (Phase 23) — a small, conservative deterministic question-answerer for Ask
// JARVIS (pages/CommandCentre.tsx), entirely OUTSIDE src/lib/jarvis/. It exists for exactly one
// reason: src/lib/jarvis/orchestrator.ts's own conservative intent matcher (see its own
// INTENT_RULES) only ever grounds the 'study_next' intent in real data (src/lib/jarvis/runtime.ts's
// groundDeterministicToolResponse) — every other recognised intent, and every question this file's
// own patterns below cover ("what is overdue", "how am I doing this week", "what did I accomplish
// today"), currently falls through to a generic, ungrounded acknowledgement in the real runtime.
// Closing that gap by adding new intents/routes to src/lib/jarvis/ would mean editing the
// orchestrator, routingPolicy and Decision Engine — files this wave's brief explicitly protects.
// Instead, this file answers a SMALL, FIXED set of APFC-specific questions directly from
// StudyContext (lib/studyContext.ts — itself built from already-computed Wave 1/2 snapshots),
// using the exact same conservative, regex-based intent-matching STYLE orchestrator.ts's own
// INTENT_RULES already establishes (narrow, explainable, 'no match' is the honest default) — never
// natural-language understanding. pages/CommandCentre.tsx's AskJarvis tries this FIRST; a query
// that matches nothing here is passed to the real, protected runJarvisRequest() exactly as before
// (see that component's own updated comment). This never alters, wraps, or routes through the real
// JARVIS runtime — it is a second, independent, honestly-labelled source of grounded answers for
// APFC specifically, following the exact same "deterministic page-level intelligence" precedent
// lib/commandCentre.ts's own JARVIS Priority Panel already set in Wave 1.
//
// ANSWER + WHY + ACTION structure throughout (this wave's own stated preference over long
// conversational paragraphs) — never a fabricated number, never data this workspace doesn't have.

export interface JarvisQAAnswer {
  answer: string;
  why: string;
  actionLabel: string;
  actionHref: string;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

type QAHandler = (ctx: StudyContext, dailyMission: DailyMission, weeklyChallenge: WeeklyChallenge) => JarvisQAAnswer;

const QA_RULES: ReadonlyArray<{ id: string; test: (q: string) => boolean; answer: QAHandler }> = [
  {
    id: 'study_next',
    test: (q) => /\b(study (today|next)|what should i (study|do|focus on)( next| today)?|focus on next)\b/.test(q),
    answer: (ctx, mission) => {
      if (ctx.planner.overdueCount > 0) {
        return {
          answer: `Clear your ${pluralize(ctx.planner.overdueCount, 'overdue task')} first.`,
          why: `${pluralize(ctx.planner.overdueCount, 'planned task')} ${ctx.planner.overdueCount === 1 ? 'is' : 'are'} past its scheduled date — the highest-priority unfinished item right now.`,
          actionLabel: 'Open Study Plan',
          actionHref: '/study-plan',
        };
      }
      if (ctx.revision.dueNow > 0) {
        return {
          answer: `You have ${pluralize(ctx.revision.dueNow, 'revision item')} due.`,
          why: 'Revision decays fastest, so it takes priority over new coverage once something is due.',
          actionLabel: 'Start Revision',
          actionHref: '/revision',
        };
      }
      if (ctx.planner.nextTaskTitle) {
        return {
          answer: `Next up: "${ctx.planner.nextTaskTitle}".`,
          why: ctx.planner.nextTaskReason ?? "It's the next item in your study plan's own priority order.",
          actionLabel: 'Open Study Plan',
          actionHref: '/study-plan',
        };
      }
      return {
        answer: mission.title,
        why: mission.description,
        actionLabel: mission.actionLabel,
        actionHref: mission.actionHref,
      };
    },
  },
  {
    id: 'overdue',
    test: (q) => /\boverdue\b/.test(q),
    answer: (ctx) => {
      const total = ctx.planner.overdueCount + ctx.revision.dueNow;
      if (total === 0) {
        return { answer: 'Nothing is overdue right now.', why: 'No planned tasks are past their date and no revision items are due.', actionLabel: 'Open Command Centre', actionHref: '/command-centre' };
      }
      const parts: string[] = [];
      if (ctx.planner.overdueCount > 0) parts.push(`${pluralize(ctx.planner.overdueCount, 'overdue planned task')}`);
      if (ctx.revision.dueNow > 0) parts.push(`${pluralize(ctx.revision.dueNow, 'revision item')} due`);
      return {
        answer: `You have ${parts.join(' and ')}.`,
        why: 'These are the only two sources of "overdue" this app tracks for APFC.',
        actionLabel: ctx.planner.overdueCount > 0 ? 'Open Study Plan' : 'Start Revision',
        actionHref: ctx.planner.overdueCount > 0 ? '/study-plan' : '/revision',
      };
    },
  },
  {
    id: 'weekly_progress',
    test: (q) => /\b(how am i doing|this week|weekly)\b/.test(q),
    answer: (ctx, _mission, weekly) => ({
      answer: `Your focus time this week is ${formatMinutes(ctx.history.last7DaysFocusMinutes)}.`,
      why: `That's ${pluralize(ctx.history.activeDaysLast7, 'active day')} out of the last 7, toward a ${formatMinutes(weekly.target)} weekly goal (${weekly.progressPct}%). Current streak: ${pluralize(ctx.gamification.streakCurrent, 'day')}.`,
      actionLabel: 'View History',
      actionHref: '/history',
    }),
  },
  {
    id: 'syllabus_progress',
    test: (q) => /\bsyllabus\b/.test(q),
    answer: (ctx) => ({
      answer: `Your APFC syllabus is ${ctx.syllabus.completedPct}% complete.`,
      why:
        ctx.syllabus.weakCount > 0
          ? `${pluralize(ctx.syllabus.weakCount, 'topic')} ${ctx.syllabus.weakCount === 1 ? 'is' : 'are'} covered but recent PYQ accuracy is weak.`
          : 'No weak areas are currently flagged — recent PYQ accuracy is holding up across covered topics.',
      actionLabel: 'Open Syllabus',
      actionHref: '/syllabus',
    }),
  },
  {
    id: 'today_accomplished',
    test: (q) => /\b(accomplish|did i do|today's progress|what did i (do|complete))\b/.test(q),
    answer: (ctx) => {
      const nothingToday = ctx.focus.todayMinutes === 0 && ctx.planner.todayCompleted === 0 && ctx.revision.reviewedToday === 0;
      if (nothingToday) {
        return { answer: "Nothing's logged yet today.", why: 'No focus time, completed tasks, or revisions are recorded today so far.', actionLabel: 'Start Focus', actionHref: '/pomodoro' };
      }
      const parts: string[] = [];
      if (ctx.focus.todayMinutes > 0) parts.push(`${formatMinutes(ctx.focus.todayMinutes)} focused (${pluralize(ctx.focus.todaySessionCount, 'session')})`);
      if (ctx.planner.todayCompleted > 0) parts.push(`${pluralize(ctx.planner.todayCompleted, 'planned task')} completed`);
      if (ctx.revision.reviewedToday > 0) parts.push(`${pluralize(ctx.revision.reviewedToday, 'revision item')} reviewed`);
      return {
        answer: `Today so far: ${parts.join(', ')}.`,
        why: 'Pulled straight from your real activity log for today.',
        actionLabel: 'View History',
        actionHref: '/history',
      };
    },
  },
];

/**
 * Tries every QA_RULES pattern in order and returns the FIRST match's answer — mirrors
 * src/lib/jarvis/orchestrator.ts's own resolveIntent() exactly in spirit (narrow, explainable,
 * first match wins). Returns `null` when nothing matches, meaning "this file has no grounded
 * answer for this query" — never a guess, never a generic filler response. The caller
 * (pages/CommandCentre.tsx's AskJarvis) falls through to the real runJarvisRequest() in that case.
 */
export function answerDeterministicQuestion(query: string, ctx: StudyContext, dailyMission: DailyMission, weeklyChallenge: WeeklyChallenge): JarvisQAAnswer | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  for (const rule of QA_RULES) {
    if (rule.test(normalized)) return rule.answer(ctx, dailyMission, weeklyChallenge);
  }
  return null;
}
