// UPSC CSE Study Plan — planning configuration. A single object (not a list) describing HOW the
// user wants their plan built: dates, weekly cadence, daily time budget, and a plan type. This is
// genuinely new data (no existing field covers it) — persisted as its own workspace-owned store
// field (lib/store.ts's `upscCseStudyPlanConfig`, null until the user actually sets one up, so an
// unconfigured workspace never shows a fabricated plan).
//
// Same deterministic discipline as every other pure module in this app: no Date.now() here —
// `today`/`now` are always supplied by the caller.

export type UpscCseStudyPlanType = 'balanced' | 'subject_focus' | 'custom';

export interface UpscCseStudyPlanConfig {
  /** yyyy-mm-dd */
  startDate: string;
  /** yyyy-mm-dd */
  targetDate: string;
  /** How many days a week the user intends to study — 1 to 7. Informational alongside
   * `preferredDays`; when `preferredDays` is non-empty it is the authoritative schedule, this is
   * just the count the user configured. */
  daysPerWeek: number;
  minutesPerDay: number;
  /** 0 (Sunday) - 6 (Saturday); the specific weekdays the user actually wants to study on. Empty
   * means "no specific preference" — the generator then just spreads across all days. */
  preferredDays: number[];
  planType: UpscCseStudyPlanType;
  /** Required only when planType === 'subject_focus' — a real subject title from
   * data/upscCsePrelimsSyllabus.ts / data/upscCseMainsSyllabus.ts (never validated against a
   * fabricated list here; the generator itself only ever matches it against real subject titles). */
  focusSubject?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUpscCseStudyPlanConfigInput {
  startDate: string;
  targetDate: string;
  daysPerWeek: number;
  minutesPerDay: number;
  preferredDays?: number[];
  planType: UpscCseStudyPlanType;
  focusSubject?: string;
}

export interface UpscCseStudyPlanConfigIssue {
  field: 'startDate' | 'targetDate' | 'daysPerWeek' | 'minutesPerDay' | 'focusSubject';
  message: string;
}

/** Every structural validation rule a config must satisfy — never throws; an empty array means the
 * config is valid. */
export function validateUpscCseStudyPlanConfig(input: CreateUpscCseStudyPlanConfigInput): UpscCseStudyPlanConfigIssue[] {
  const issues: UpscCseStudyPlanConfigIssue[] = [];
  if (!input.startDate) issues.push({ field: 'startDate', message: 'Start date is required.' });
  if (!input.targetDate) issues.push({ field: 'targetDate', message: 'Target date is required.' });
  if (input.startDate && input.targetDate && input.targetDate < input.startDate) {
    issues.push({ field: 'targetDate', message: 'Target date must be on or after the start date.' });
  }
  if (!Number.isFinite(input.daysPerWeek) || input.daysPerWeek < 1 || input.daysPerWeek > 7) {
    issues.push({ field: 'daysPerWeek', message: 'Study days per week must be between 1 and 7.' });
  }
  if (!Number.isFinite(input.minutesPerDay) || input.minutesPerDay <= 0) {
    issues.push({ field: 'minutesPerDay', message: 'Minutes per study day must be greater than 0.' });
  }
  if (input.planType === 'subject_focus' && !input.focusSubject?.trim()) {
    issues.push({ field: 'focusSubject', message: 'Subject Focus plans need a subject to focus on.' });
  }
  return issues;
}

export function createUpscCseStudyPlanConfig(input: CreateUpscCseStudyPlanConfigInput, now: string): UpscCseStudyPlanConfig {
  return {
    startDate: input.startDate,
    targetDate: input.targetDate,
    daysPerWeek: Math.round(input.daysPerWeek),
    minutesPerDay: Math.round(input.minutesPerDay),
    preferredDays: input.preferredDays ? [...input.preferredDays].sort((a, b) => a - b) : [],
    planType: input.planType,
    focusSubject: input.planType === 'subject_focus' ? input.focusSubject?.trim() : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpscCseStudyPlanProgress {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  /** 0-100 — how far through the START→TARGET date window `today` is. A pure calendar-time
   * measure, never a completion/mastery percentage (this module has no signal for that). */
  timeElapsedPct: number;
}

/** Pure date-window progress — how much of the plan's start->target date range has elapsed as of
 * `today`. Clamped to [0, totalDays] so a `today` before start or after target never produces a
 * negative or over-100% figure. */
export function computeUpscCseStudyPlanProgress(config: UpscCseStudyPlanConfig, today: string): UpscCseStudyPlanProgress {
  const start = new Date(config.startDate + 'T00:00:00');
  const target = new Date(config.targetDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  const dayMs = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(0, Math.round((target.getTime() - start.getTime()) / dayMs));
  const elapsedDaysRaw = Math.round((now.getTime() - start.getTime()) / dayMs);
  const elapsedDays = Math.min(Math.max(elapsedDaysRaw, 0), totalDays);
  const remainingDays = totalDays - elapsedDays;
  const timeElapsedPct = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;
  return { totalDays, elapsedDays, remainingDays, timeElapsedPct };
}
