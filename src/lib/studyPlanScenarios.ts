// Stage 6 of the Study Plan feature — "what if" scenario planning on top of Stage 5's plan health.
// Every function here is a thin, typed wrapper around Stage 5's own scenario helpers
// (forecastAfterMissedDays / forecastWithTargetDateShift) plus a comparison against the current
// plan health — no forecasting math is reimplemented here. Pure and deterministic: a scenario
// result depends only on its inputs, never mutates `input.plan`/config, and is never persisted —
// callers (the UI) hold it in local component state only.
import {
  computePlanHealth,
  forecastAfterMissedDays,
  forecastWithTargetDateShift,
  type PlanHealthInput,
  type PlanHealthReport,
  type PlanHealthVerdict,
  type PlanForecast,
} from './studyPlanHealth';

// --- Comparable snapshot (GOAL #5) -----------------------------------------------------------
/** The subset of a PlanHealthReport that's meaningful to compare "current plan" vs "scenario". */
export interface ScenarioSnapshot {
  verdict: PlanHealthVerdict;
  forecast: PlanForecast;
  remainingStudyDays: number;
  requiredMinutesPerStudyDay: number;
  configuredMinutesPerStudyDay: number;
  capacityDifferenceMinutes: number;
  utilizationPercentage: number;
  remainingTaskMinutes: number;
}

function snapshotOf(report: PlanHealthReport): ScenarioSnapshot {
  return {
    verdict: report.verdict,
    forecast: report.forecast,
    remainingStudyDays: report.required.remainingStudyDays,
    requiredMinutesPerStudyDay: report.required.requiredMinutesPerStudyDay,
    configuredMinutesPerStudyDay: report.required.configuredMinutesPerStudyDay,
    capacityDifferenceMinutes: report.required.capacityDifferenceMinutes,
    utilizationPercentage: report.required.utilizationPercentage,
    remainingTaskMinutes: report.required.remainingTaskMinutes,
  };
}

// Higher = healthier. 'completed' (nothing left to do) ranks above 'on_track' since there is
// nothing further that could go wrong with the remaining plan.
const VERDICT_RANK: Record<PlanHealthVerdict, number> = {
  over_capacity: 0,
  at_risk: 1,
  tight: 2,
  on_track: 3,
  completed: 4,
};

export type ScenarioOutcome = 'improves' | 'worsens' | 'unchanged';

/** Deterministic improves/worsens/unchanged: primarily by health-verdict rank; when the scenario
 * and current plan land on the same verdict, the required-minutes-per-day figure breaks the tie
 * (less required time per day = improves, more = worsens). */
function compareOutcome(current: ScenarioSnapshot, scenario: ScenarioSnapshot): ScenarioOutcome {
  const rankDelta = VERDICT_RANK[scenario.verdict] - VERDICT_RANK[current.verdict];
  if (rankDelta > 0) return 'improves';
  if (rankDelta < 0) return 'worsens';
  const requiredDelta = scenario.requiredMinutesPerStudyDay - current.requiredMinutesPerStudyDay;
  if (requiredDelta < 0) return 'improves';
  if (requiredDelta > 0) return 'worsens';
  return 'unchanged';
}

export interface ScenarioComparison {
  current: ScenarioSnapshot;
  scenario: ScenarioSnapshot;
  outcome: ScenarioOutcome;
  /** scenario - current required minutes/day. Positive = the scenario needs MORE time per day. */
  requiredMinutesPerDayDelta: number;
  /** scenario - current remaining workload (minutes). Positive = MORE work remains in the scenario. */
  remainingTaskMinutesDelta: number;
}

function buildComparison(currentReport: PlanHealthReport, scenarioReport: PlanHealthReport): ScenarioComparison {
  const current = snapshotOf(currentReport);
  const scenario = snapshotOf(scenarioReport);
  return {
    current,
    scenario,
    outcome: compareOutcome(current, scenario),
    requiredMinutesPerDayDelta: scenario.requiredMinutesPerStudyDay - current.requiredMinutesPerStudyDay,
    remainingTaskMinutesDelta: scenario.remainingTaskMinutes - current.remainingTaskMinutes,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// --- Recommendation text (GOAL #6) -----------------------------------------------------------
// Every message is derived directly from the computed verdict/outcome — never generic
// motivational text, and always states this is a "what if" (never presented as a certainty).
function missedDaysRecommendation(missedDays: number, scenario: ScenarioSnapshot): string {
  if (missedDays === 0) return 'No days missed — this matches your current plan.';
  const days = plural(missedDays, 'day');
  if (scenario.verdict === 'over_capacity') return `Missing ${days} would make the remaining workload exceed available capacity.`;
  if (scenario.verdict === 'completed') return `Missing ${days} would not affect your plan — all work is already complete.`;
  if (scenario.verdict === 'on_track') return `You can miss ${days} and remain on track based on the current plan.`;
  if (scenario.verdict === 'tight') return `Missing ${days} would make the plan tight. Consider adding study time or extending the target date.`;
  return `Missing ${days} would put the plan at risk. Consider adding study time or extending the target date.`; // at_risk
}

function targetDateRecommendation(shiftDays: number, scenario: ScenarioSnapshot, outcome: ScenarioOutcome): string {
  if (shiftDays === 0) return 'No change to your target date — this matches your current plan.';
  const direction = shiftDays > 0 ? 'Extending' : 'Shortening';
  const days = plural(Math.abs(shiftDays), 'day');
  if (scenario.verdict === 'over_capacity') return `${direction} the target date by ${days} still leaves the remaining workload over capacity.`;
  if (outcome === 'improves') return `${direction} the target date by ${days} reduces the required daily study time.`;
  if (outcome === 'worsens') return `${direction} the target date by ${days} increases the required daily study time.`;
  return `${direction} the target date by ${days} does not meaningfully change your plan health.`;
}

// --- Public result shapes ---------------------------------------------------------------------
export interface MissedDaysScenarioResult {
  type: 'missed_days';
  missedDays: number;
  comparison: ScenarioComparison;
  recommendation: string;
}

export interface TargetDateScenarioResult {
  type: 'target_date_shift';
  targetDateShiftDays: number;
  comparison: ScenarioComparison;
  recommendation: string;
}

export type ScenarioResult = MissedDaysScenarioResult | TargetDateScenarioResult;

export type ScenarioRunResult<T> = { ok: true; result: T } | { ok: false; error: string };

// --- GOAL #2: missed-days scenario --------------------------------------------------------------
/** "What if I miss N upcoming study days?" Never mutates the real plan/store — reuses Stage 5's
 * forecastAfterMissedDays for all of the actual forecasting math. */
export function simulateMissedStudyDays(input: PlanHealthInput, missedDays: number): ScenarioRunResult<MissedDaysScenarioResult> {
  if (!Number.isInteger(missedDays)) return { ok: false, error: 'Missed days must be a whole number.' };
  if (missedDays < 0) return { ok: false, error: 'Missed days cannot be negative.' };

  const currentReport = computePlanHealth(input);
  const scenarioReport = forecastAfterMissedDays(input, missedDays);
  const comparison = buildComparison(currentReport, scenarioReport);

  return {
    ok: true,
    result: {
      type: 'missed_days',
      missedDays,
      comparison,
      recommendation: missedDaysRecommendation(missedDays, comparison.scenario),
    },
  };
}

// --- GOAL #3: target-date scenario ---------------------------------------------------------------
/** "What if my target date moves by N days?" (positive = later/extend, negative = earlier/shorten,
 * 0 = unchanged). Never mutates the real plan/store — reuses Stage 5's forecastWithTargetDateShift
 * for all of the actual date/capacity recalculation. */
export function simulateTargetDateShift(input: PlanHealthInput, targetDateShiftDays: number): ScenarioRunResult<TargetDateScenarioResult> {
  if (!Number.isInteger(targetDateShiftDays)) return { ok: false, error: 'Target date shift must be a whole number of days.' };

  const currentReport = computePlanHealth(input);
  const scenarioReport = forecastWithTargetDateShift(input, targetDateShiftDays);
  const comparison = buildComparison(currentReport, scenarioReport);

  return {
    ok: true,
    result: {
      type: 'target_date_shift',
      targetDateShiftDays,
      comparison,
      recommendation: targetDateRecommendation(targetDateShiftDays, comparison.scenario, comparison.outcome),
    },
  };
}
