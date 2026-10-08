// Gamification 2.0 (Phase 22) — two new achievements covering the two Wave 1/2 systems the
// existing lib/gamification.ts BADGES/REWARDS arrays predate (Revision OS, Planner + Task OS) and
// therefore never had a condition for. This is deliberately a SEPARATE, additive module rather than
// an edit to lib/gamification.ts itself: BADGES/REWARDS/GamificationInputs/BadgeContext are already
// exercised by gamification.test.ts and consumed by multiple existing call sites
// (commandCentreHome.ts, Analytics.tsx, Dashboard.tsx) — widening their shared, already-wired input
// type purely to add two more conditions would touch far more surface than two new achievements
// need. Same visual system (earned/locked, progress-to-next), same "derived, never a second XP
// ledger" discipline — just a second, small array alongside the existing one.
//
// Both conditions are evaluated from data that genuinely didn't exist before Wave 1/2:
//  - masteredRevisionCount: RevisionQueue items at MAX_BOX (lib/revisionQueue.ts) — the SAME count
//    lib/studyContext.ts's own revision.masteredCount already derives, reused verbatim here, never
//    recomputed.
//  - totalTasksCompleted: StudyPlanTask + PersonalPlanTask combined, status === 'completed' — a
//    real, already-persisted field on both task shapes (lib/studyPlan.ts, lib/studyPlanEditing.ts).

export interface AchievementV2Context {
  masteredRevisionCount: number;
  totalTasksCompleted: number;
}

export type AchievementV2Category = 'revision' | 'planning';

export interface AchievementV2Definition {
  id: string;
  title: string;
  description: string;
  category: AchievementV2Category;
  threshold: number;
  /** Reads the one relevant field off AchievementV2Context for this achievement's own threshold. */
  value: (ctx: AchievementV2Context) => number;
}

export const ACHIEVEMENTS_V2: readonly AchievementV2Definition[] = [
  {
    id: 'v2-revision-master',
    title: 'Revision Master',
    description: 'Master 10 PYQs in the Leitner revision queue',
    category: 'revision',
    threshold: 10,
    value: (c) => c.masteredRevisionCount,
  },
  {
    id: 'v2-planner-pro',
    title: 'Planner Pro',
    description: 'Complete 20 planned tasks (syllabus or personal)',
    category: 'planning',
    threshold: 20,
    value: (c) => c.totalTasksCompleted,
  },
];

export interface AchievementV2State {
  id: string;
  title: string;
  description: string;
  category: AchievementV2Category;
  earned: boolean;
  /** 0-100, rounded; 100 whenever earned even if value exceeds threshold. */
  progressPct: number;
}

export interface AchievementsV2Snapshot {
  earned: AchievementV2State[];
  locked: AchievementV2State[];
}

export function getAchievementsV2Snapshot(ctx: AchievementV2Context): AchievementsV2Snapshot {
  const states: AchievementV2State[] = ACHIEVEMENTS_V2.map((a) => {
    const value = a.value(ctx);
    const earned = value >= a.threshold;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      category: a.category,
      earned,
      progressPct: a.threshold > 0 ? Math.min(100, Math.round((value / a.threshold) * 100)) : earned ? 100 : 0,
    };
  });
  return { earned: states.filter((s) => s.earned), locked: states.filter((s) => !s.earned) };
}
