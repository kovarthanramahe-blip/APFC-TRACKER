import { useMemo } from 'react';
import type { MockTestAttempt, PomodoroSession, StudyLogEntry } from './types';
import { getAllTopicsCount } from '../data/syllabus';
import { useAppStore } from './store';

// Everything here is derived (computed) from data the app already tracks —
// completed topics, mock test attempts, study log, starred questions. There
// is deliberately no separate "XP counter" or "earned badges" list stored
// anywhere: that would be a second source of truth that could drift from
// the real data, could be gamed by clicking a toggle repeatedly, and would
// need its own sync/RLS handling. Deriving it means it's automatically
// correct, automatically per-user (it only ever reads the current user's
// already-synced store), and automatically offline-safe.

export interface GamificationInputs {
  completedTopics: Record<string, boolean>;
  attempts: MockTestAttempt[];
  sessions: PomodoroSession[];
  studyLog: Record<string, StudyLogEntry>;
  starredQuestionIds: string[];
}

// --- XP -----------------------------------------------------------------
// Every rule below is keyed off a value that can't be inflated by clicking
// the same action repeatedly: a boolean-keyed map (topics), an array that
// only grows when something real is actually completed (attempts), a
// cumulative real-time total (focus minutes only ever increase while a
// Pomodoro timer genuinely counts down), or a current-size snapshot of a
// toggle set (starred questions) rather than a click counter.
export const XP_RULES = {
  perTopicCompleted: 10,
  perMockTestCompleted: 50,
  perFocusMinute: 1,
  perStarredQuestion: 2,
  perActiveStudyDay: 5,
} as const;

export function totalFocusMinutes(studyLog: Record<string, StudyLogEntry>): number {
  return Object.values(studyLog).reduce((sum, e) => sum + e.focusMinutes, 0);
}

export function computeXp(inputs: GamificationInputs): number {
  const topicsDone = Object.values(inputs.completedTopics).filter(Boolean).length;
  const activeDays = Object.keys(inputs.studyLog).length;
  return (
    topicsDone * XP_RULES.perTopicCompleted +
    inputs.attempts.length * XP_RULES.perMockTestCompleted +
    totalFocusMinutes(inputs.studyLog) * XP_RULES.perFocusMinute +
    inputs.starredQuestionIds.length * XP_RULES.perStarredQuestion +
    activeDays * XP_RULES.perActiveStudyDay
  );
}

// --- Levels ---------------------------------------------------------------
// Cumulative XP required to REACH a level follows 50 * (level-1) * level,
// e.g. level 2 at 100 XP, level 3 at 300 XP, level 4 at 600 XP. A closed
// form (rather than a loop) keeps this cheap to call on every render.
export function xpRequiredForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToNext: number;
  progressPct: number;
}

export function getLevelInfo(xp: number): LevelInfo {
  const level = Math.max(1, Math.floor((50 + Math.sqrt(2500 + 200 * xp)) / 100));
  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  const xpIntoLevel = xp - currentLevelXp;
  return {
    level,
    xp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNext: nextLevelXp - xp,
    progressPct: xpForNextLevel > 0 ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100,
  };
}

// --- Streaks ----------------------------------------------------------------
// A day counts as "active" once, no matter how many sessions/actions happen
// on it — studyLog is already keyed one entry per date, so there is no way
// to double count a day here.
function isActiveDay(entry: StudyLogEntry | undefined): boolean {
  return !!entry && (entry.focusMinutes > 0 || entry.topicsCompleted > 0 || entry.testsCompleted > 0);
}

export interface StreakInfo {
  current: number;
  best: number;
}

export function computeStreaks(studyLog: Record<string, StudyLogEntry>): StreakInfo {
  const activeDates = Object.keys(studyLog)
    .filter((date) => isActiveDay(studyLog[date]))
    .sort();

  let current = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (isActiveDay(studyLog[key])) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  let best = 0;
  let run = 0;
  let prevDate: string | null = null;
  for (const date of activeDates) {
    if (prevDate) {
      const diffDays = Math.round((new Date(date + 'T00:00:00').getTime() - new Date(prevDate + 'T00:00:00').getTime()) / 86_400_000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prevDate = date;
  }
  best = Math.max(best, current);

  return { current, best };
}

// --- Badges -----------------------------------------------------------------
export interface BadgeContext {
  totalFocusSessions: number;
  totalFocusMinutes: number;
  attemptsCount: number;
  syllabusPct: number;
  streaks: StreakInfo;
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  check: (ctx: BadgeContext) => boolean;
}

export const BADGES: BadgeDefinition[] = [
  { id: 'first-session', title: 'First Study Session', description: 'Complete your first focus session', check: (c) => c.totalFocusSessions >= 1 },
  { id: 'first-mock-test', title: 'First Mock Test', description: 'Complete your first mock test', check: (c) => c.attemptsCount >= 1 },
  { id: 'streak-7', title: '7-Day Streak', description: 'Study 7 days in a row', check: (c) => c.streaks.best >= 7 },
  { id: 'focus-10h', title: '10 Hours Focused', description: 'Accumulate 10 hours of focused study', check: (c) => c.totalFocusMinutes >= 600 },
  { id: 'syllabus-milestone', title: 'Syllabus Milestone', description: 'Complete 50% of the syllabus', check: (c) => c.syllabusPct >= 50 },
  { id: 'ten-mock-tests', title: '10 Mock Tests', description: 'Complete 10 mock tests', check: (c) => c.attemptsCount >= 10 },
  { id: 'streak-30', title: '30-Day Streak', description: 'Study 30 days in a row', check: (c) => c.streaks.best >= 30 },
  { id: 'focus-50h', title: '50 Hours Focused', description: 'Accumulate 50 hours of focused study', check: (c) => c.totalFocusMinutes >= 3000 },
];

export function buildBadgeContext(inputs: GamificationInputs): BadgeContext {
  const doneTopics = Object.values(inputs.completedTopics).filter(Boolean).length;
  const totalTopics = getAllTopicsCount();
  return {
    totalFocusSessions: inputs.sessions.filter((s) => s.mode === 'focus' && s.completedFully).length,
    totalFocusMinutes: totalFocusMinutes(inputs.studyLog),
    attemptsCount: inputs.attempts.length,
    syllabusPct: totalTopics ? (doneTopics / totalTopics) * 100 : 0,
    streaks: computeStreaks(inputs.studyLog),
  };
}

// --- Combined snapshot ------------------------------------------------------
export interface GamificationSnapshot {
  xp: number;
  level: LevelInfo;
  streaks: StreakInfo;
  earnedBadges: BadgeDefinition[];
  nextBadge: BadgeDefinition | null;
}

export function getGamificationSnapshot(inputs: GamificationInputs): GamificationSnapshot {
  const xp = computeXp(inputs);
  const ctx = buildBadgeContext(inputs);
  const earnedBadges = BADGES.filter((b) => b.check(ctx));
  const nextBadge = BADGES.find((b) => !b.check(ctx)) ?? null;
  return {
    xp,
    level: getLevelInfo(xp),
    streaks: ctx.streaks,
    earnedBadges,
    nextBadge,
  };
}

// Shared selector hook so pages (Dashboard, Analytics) don't each re-wire
// the same store fields — one source of truth for the derived snapshot.
export function useGamification(): GamificationSnapshot {
  const completedTopics = useAppStore((s) => s.completedTopics);
  const attempts = useAppStore((s) => s.attempts);
  const sessions = useAppStore((s) => s.sessions);
  const studyLog = useAppStore((s) => s.studyLog);
  const starredQuestionIds = useAppStore((s) => s.starredQuestionIds);

  return useMemo(
    () => getGamificationSnapshot({ completedTopics, attempts, sessions, studyLog, starredQuestionIds }),
    [completedTopics, attempts, sessions, studyLog, starredQuestionIds],
  );
}
