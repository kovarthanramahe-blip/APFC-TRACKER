import type { StudyLogEntry } from './types';
import { getLocalDateString } from './utils';
import { totalFocusMinutes, computeStreaks, type StreakInfo } from './gamification';

// Study Progress Insights Foundation — a pure, reusable calculation layer over the studyLog data
// EVERY workspace already persists (lib/store.ts's workspace-owned `studyLog` field), producing the
// numbers a future dashboard could show without inventing a second activity-tracking mechanism.
//
// Nothing here is a new source of truth: it only reads studyLog (and an optional, CALLER-supplied
// completion target — see CompletionTarget below) and derives numbers from it. Streaks are NOT
// recomputed here — computeStreaks (lib/gamification.ts) is already the app's one canonical streak
// implementation, reused as-is. This module adds exactly what doesn't already exist elsewhere:
// date-range activity totals (current/previous period), a day-by-day activity trend, and a
// generic, target-agnostic completion percentage.
//
// Deliberately NOT included (out of scope for this milestone — see the task's own "do not wire a
// new dashboard yet"): no UI, no store wiring, no per-workspace target definitions (e.g. what the
// UPSC CSE syllabus "total" should be) — a caller supplies `completionTarget` explicitly if and
// only if it already has one; this module never guesses one.

export interface StudyActivityTotals {
  focusMinutes: number;
  topicsCompleted: number;
  testsCompleted: number;
  /** Distinct calendar days with at least one of the above > 0 — same "active day" definition
   * lib/gamification.ts's computeStreaks already uses, so a day counted here as active is exactly
   * a day that would extend a streak there too. */
  activeDays: number;
}

const EMPTY_TOTALS: StudyActivityTotals = { focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0, activeDays: 0 };

function isActiveDay(entry: StudyLogEntry): boolean {
  return entry.focusMinutes > 0 || entry.topicsCompleted > 0 || entry.testsCompleted > 0;
}

/** Adds `deltaDays` (may be negative) to a yyyy-mm-dd date string, returning the result as the
 * same LOCAL-calendar yyyy-mm-dd shape (see lib/utils.ts's getLocalDateString) — correct across
 * month/year boundaries and leap years, since it delegates entirely to the JS Date object's own
 * calendar arithmetic rather than any manual day-counting. */
export function addDaysToDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return getLocalDateString(d);
}

/** Sums every studyLog entry whose date falls within [startInclusive, endInclusive] (both
 * yyyy-mm-dd). Plain string comparison is sufficient and safe: yyyy-mm-dd sorts lexicographically
 * identically to chronological order. A date with no studyLog entry contributes nothing — never
 * fabricated as zero-with-an-entry or backfilled; it simply isn't summed, the same way every other
 * reader of studyLog already treats a missing key. */
export function sumStudyActivity(studyLog: Record<string, StudyLogEntry>, startInclusive: string, endInclusive: string): StudyActivityTotals {
  let totals = EMPTY_TOTALS;
  for (const [date, entry] of Object.entries(studyLog)) {
    if (date < startInclusive || date > endInclusive) continue;
    totals = {
      focusMinutes: totals.focusMinutes + entry.focusMinutes,
      topicsCompleted: totals.topicsCompleted + entry.topicsCompleted,
      testsCompleted: totals.testsCompleted + entry.testsCompleted,
      activeDays: totals.activeDays + (isActiveDay(entry) ? 1 : 0),
    };
  }
  return totals;
}

/** All-time totals across every studyLog entry, regardless of date — reuses
 * lib/gamification.ts's own totalFocusMinutes for the focus-minutes figure (the one field an
 * existing canonical calculation already covers) rather than re-summing it a second way. */
export function sumAllStudyActivity(studyLog: Record<string, StudyLogEntry>): StudyActivityTotals {
  const entries = Object.values(studyLog);
  if (entries.length === 0) return EMPTY_TOTALS;
  return {
    focusMinutes: totalFocusMinutes(studyLog),
    topicsCompleted: entries.reduce((sum, e) => sum + e.topicsCompleted, 0),
    testsCompleted: entries.reduce((sum, e) => sum + e.testsCompleted, 0),
    activeDays: entries.filter(isActiveDay).length,
  };
}

export interface DailyActivity {
  /** yyyy-mm-dd (local calendar date — see lib/utils.ts's getLocalDateString). */
  date: string;
  focusMinutes: number;
  topicsCompleted: number;
  testsCompleted: number;
  /** Same "active day" definition computeStreaks/sumStudyActivity already use — a day with none
   * of the three fields above > 0 is NOT active, distinct from a day with no studyLog entry at
   * all (both render as zeroed here; see buildDailyActivityTrend's own doc comment). */
  isActive: boolean;
}

/**
 * A fixed-length, day-by-day activity trend ending on (and including) `referenceDate` — the one
 * piece date-range logic in this module didn't already have a per-day breakdown for (see
 * sumStudyActivity for the AGGREGATE over a range). A calendar date with no studyLog entry is
 * never omitted or backfilled with fabricated activity — it appears as an explicit zeroed
 * DailyActivity entry (isActive: false), exactly the "zero-activity days must appear as zero, not
 * disappear" requirement this was built for. Always returns exactly `days` entries, oldest first.
 */
export function buildDailyActivityTrend(studyLog: Record<string, StudyLogEntry>, referenceDate: string, days: number): DailyActivity[] {
  const trend: DailyActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysToDateString(referenceDate, -i);
    const entry = studyLog[date];
    trend.push({
      date,
      focusMinutes: entry?.focusMinutes ?? 0,
      topicsCompleted: entry?.topicsCompleted ?? 0,
      testsCompleted: entry?.testsCompleted ?? 0,
      isActive: entry ? isActiveDay(entry) : false,
    });
  }
  return trend;
}

export interface PeriodWindow {
  start: string;
  end: string;
}

/** The `periodDays`-day window ending on (and including) `referenceDate` — e.g. periodDays=7,
 * referenceDate='2026-01-10' -> ['2026-01-04', '2026-01-10']. */
export function currentPeriodWindow(referenceDate: string, periodDays: number): PeriodWindow {
  return { start: addDaysToDateString(referenceDate, -(periodDays - 1)), end: referenceDate };
}

/** The `periodDays`-day window immediately BEFORE currentPeriodWindow, with no gap and no overlap
 * — e.g. continuing the example above, previousPeriodWindow -> ['2025-12-28', '2026-01-03']. */
export function previousPeriodWindow(referenceDate: string, periodDays: number): PeriodWindow {
  const currentStart = addDaysToDateString(referenceDate, -(periodDays - 1));
  return { start: addDaysToDateString(currentStart, -periodDays), end: addDaysToDateString(currentStart, -1) };
}

export interface PeriodComparison {
  current: StudyActivityTotals;
  previous: StudyActivityTotals;
  currentWindow: PeriodWindow;
  previousWindow: PeriodWindow;
  focusMinutesDelta: number;
  /** Percentage change in focus minutes vs the previous period, rounded to 1 decimal place. `null`
   * when the previous period had zero focus minutes — a percentage change from a zero baseline is
   * undefined/infinite, never fabricated as some arbitrary number (e.g. "+100%" or "+∞%"). */
  focusMinutesDeltaPct: number | null;
}

export function computePeriodComparison(studyLog: Record<string, StudyLogEntry>, referenceDate: string, periodDays: number): PeriodComparison {
  const currentWindow = currentPeriodWindow(referenceDate, periodDays);
  const previousWindow = previousPeriodWindow(referenceDate, periodDays);
  const current = sumStudyActivity(studyLog, currentWindow.start, currentWindow.end);
  const previous = sumStudyActivity(studyLog, previousWindow.start, previousWindow.end);
  const focusMinutesDelta = current.focusMinutes - previous.focusMinutes;
  return {
    current,
    previous,
    currentWindow,
    previousWindow,
    focusMinutesDelta,
    focusMinutesDeltaPct: previous.focusMinutes > 0 ? Math.round((focusMinutesDelta / previous.focusMinutes) * 1000) / 10 : null,
  };
}

/** A completion target a caller already has (e.g. topics completed vs. an existing syllabus topic
 * count) — never invented by this module. `total` must be a positive number for a percentage to be
 * meaningful at all. */
export interface CompletionTarget {
  completed: number;
  total: number;
}

/** `null` (never 0, never a guess) when `target` is absent or has no meaningful total to divide
 * by — this is what "missing target" looks like to every caller. Otherwise a value in [0, 100],
 * rounded to 1 decimal place. `completed` beyond `total` is clamped to 100, never shown as >100%. */
export function computeProgressPercent(target: CompletionTarget | undefined): number | null {
  if (!target || !Number.isFinite(target.total) || target.total <= 0 || !Number.isFinite(target.completed)) return null;
  const pct = (Math.max(0, target.completed) / target.total) * 100;
  return Math.min(100, Math.round(pct * 10) / 10);
}

export interface StudyProgressInsightsInputs {
  studyLog: Record<string, StudyLogEntry>;
  /** Absent when the active workspace has no completion target yet (e.g. no syllabus tracking) —
   * progressPercent is then null, never guessed. */
  completionTarget?: CompletionTarget;
  /** yyyy-mm-dd; defaults to the real local "today" (lib/utils.ts's getLocalDateString) if
   * omitted. Callers/tests can pass an explicit value for fully deterministic period/comparison
   * calculation independent of the system clock. */
  referenceDate?: string;
  /** Length of the "current"/"previous" comparison windows, in days. Defaults to 7. */
  periodDays?: number;
}

export interface StudyProgressInsights {
  referenceDate: string;
  periodDays: number;
  /** All-time totals across every studyLog entry this workspace has ever recorded. */
  totalActivity: StudyActivityTotals;
  currentPeriod: StudyActivityTotals;
  previousPeriod: StudyActivityTotals;
  focusMinutesDelta: number;
  focusMinutesDeltaPct: number | null;
  /** lib/gamification.ts's own computeStreaks, reused as-is — see this module's header. Note this
   * one field is the sole part of the snapshot NOT purely a function of `referenceDate` (computeStreaks
   * itself reads the real system clock for "today" when walking the current streak backward), so a
   * caller/test wanting a fully deterministic `streak` value needs to control the system clock (see
   * this module's own test file). */
  streak: StreakInfo;
  progressPercent: number | null;
}

/**
 * The single entry point this milestone adds: everything requirement 1 asks for (total activity,
 * current-period activity, completion percentage, current streak, previous-period comparison) in
 * one deterministic (barring the computeStreaks caveat above), pure calculation. Never throws,
 * never fabricates a value it wasn't given data for — an empty `studyLog` and no `completionTarget`
 * produces an entirely zeroed/null snapshot, not an error.
 */
export function computeStudyProgressInsights(inputs: StudyProgressInsightsInputs): StudyProgressInsights {
  const referenceDate = inputs.referenceDate ?? getLocalDateString();
  const periodDays = inputs.periodDays ?? 7;
  const totalActivity = sumAllStudyActivity(inputs.studyLog);
  const comparison = computePeriodComparison(inputs.studyLog, referenceDate, periodDays);
  return {
    referenceDate,
    periodDays,
    totalActivity,
    currentPeriod: comparison.current,
    previousPeriod: comparison.previous,
    focusMinutesDelta: comparison.focusMinutesDelta,
    focusMinutesDeltaPct: comparison.focusMinutesDeltaPct,
    streak: computeStreaks(inputs.studyLog),
    progressPercent: computeProgressPercent(inputs.completionTarget),
  };
}
