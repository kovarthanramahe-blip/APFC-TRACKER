// Stage 1 of the Study Plan feature — the planning ENGINE only (no UI, no calendar, no
// persistence). Everything here is a pure function: given the same config + syllabus + progress
// + PYQ performance, generateStudyPlan() always returns the same plan (no Date.now(), no
// Math.random(), no crypto.randomUUID — task ids are built deterministically from their content).
//
// Reuses, never duplicates:
//  - the real syllabus (SyllabusSubject[]) passed in by the caller — this module never hardcodes
//    a second topic list
//  - computeUnifiedTopicStatus (lib/topicStatus, built in F6) for "is this topic covered, and how
//    is PYQ performance on it" — this module only adds scheduling logic on top
import type { SyllabusSubject } from './types';
import { computeUnifiedTopicStatus, type UnifiedTopicStatus, type TopicStatus } from './topicStatus';
import type { PyqPerformanceSnapshot } from './pyqPerformance';
import type { WorkspaceKind } from './workspace';

// --- Config ---------------------------------------------------------------
// 0 = Sunday .. 6 = Saturday, matching JS Date#getDay() — no new day-numbering convention invented.
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface StudyPlanConfig {
  startDate: string; // yyyy-mm-dd, inclusive — the project's existing date convention (see StudyLogEntry.date, store.examDate)
  targetDate: string; // yyyy-mm-dd, inclusive
  studyDaysPerWeek: number; // 1-7
  hoursPerStudyDay: number; // > 0
  preferredStudyDays?: WeekdayIndex[]; // if given, these exact weekdays are used instead of an auto-distributed set
  restDays?: WeekdayIndex[]; // weekdays always excluded, even if also listed in preferredStudyDays
  revisionPriority?: 'balanced' | 'coverage_first' | 'revision_first'; // reserved for tuning; 'balanced' is the only behavior Stage 1 implements
}

export interface StudyPlanValidationError {
  field: string;
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  return !Number.isNaN(new Date(s + 'T00:00:00').getTime());
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/** Deterministic default weekday set for a given days-per-week count: Monday..Saturday are filled
 * first (in that order), Sunday last — so any count below 7 always leaves Sunday free, and
 * "leave at least one rest day whenever the configuration permits" holds without extra logic. */
const DEFAULT_WEEKDAY_FILL_ORDER: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];

function defaultStudyWeekdays(studyDaysPerWeek: number): WeekdayIndex[] {
  return [...DEFAULT_WEEKDAY_FILL_ORDER.slice(0, studyDaysPerWeek)].sort((a, b) => a - b);
}

export function validateStudyPlanConfig(config: StudyPlanConfig): StudyPlanValidationError[] {
  const errors: StudyPlanValidationError[] = [];

  const startValid = isValidDateStr(config.startDate);
  if (!startValid) errors.push({ field: 'startDate', message: 'startDate must be a valid yyyy-mm-dd date.' });

  const targetValid = isValidDateStr(config.targetDate);
  if (!targetValid) errors.push({ field: 'targetDate', message: 'targetDate must be a valid yyyy-mm-dd date.' });

  if (startValid && targetValid && parseDate(config.targetDate).getTime() <= parseDate(config.startDate).getTime()) {
    errors.push({ field: 'targetDate', message: 'targetDate must be after startDate.' });
  }

  if (!Number.isInteger(config.studyDaysPerWeek) || config.studyDaysPerWeek < 1 || config.studyDaysPerWeek > 7) {
    errors.push({ field: 'studyDaysPerWeek', message: 'studyDaysPerWeek must be an integer between 1 and 7.' });
  }

  if (!Number.isFinite(config.hoursPerStudyDay) || config.hoursPerStudyDay <= 0) {
    errors.push({ field: 'hoursPerStudyDay', message: 'hoursPerStudyDay must be a positive number.' });
  }

  for (const [field, days] of [
    ['preferredStudyDays', config.preferredStudyDays],
    ['restDays', config.restDays],
  ] as const) {
    if (days && days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      errors.push({ field, message: `${field} entries must be integers between 0 (Sunday) and 6 (Saturday).` });
    }
  }

  if (errors.length === 0) {
    const weekdays = config.preferredStudyDays?.length ? config.preferredStudyDays : defaultStudyWeekdays(config.studyDaysPerWeek);
    const remaining = weekdays.filter((d) => !config.restDays?.includes(d));
    if (remaining.length === 0) {
      errors.push({ field: 'restDays', message: 'No study days remain once restDays is applied to the configured study weekdays.' });
    }
  }

  return errors;
}

// --- Capacity ---------------------------------------------------------------
// 80-90% target utilization (see GOAL #7): 0.85 is the midpoint, reserved as buffer for missed
// days, unexpected commitments, and revision spillover rather than scheduling every free minute.
export const BUFFER_RATIO = 0.85;

export interface PlanCapacity {
  totalCalendarDays: number;
  studyWeekdays: WeekdayIndex[]; // the actual weekday set used, after preferredStudyDays/restDays are applied
  studyDayDates: string[]; // yyyy-mm-dd, every actual study day between startDate and targetDate inclusive
  minutesPerStudyDay: number;
  totalAvailableMinutes: number; // studyDayDates.length * minutesPerStudyDay — the raw, unbuffered capacity
  plannableMinutes: number; // totalAvailableMinutes * BUFFER_RATIO, floored — what the engine actually schedules into
}

export function calculatePlanCapacity(config: StudyPlanConfig): PlanCapacity {
  const start = parseDate(config.startDate);
  const target = parseDate(config.targetDate);
  const totalCalendarDays = Math.round((target.getTime() - start.getTime()) / 86_400_000) + 1;

  const baseWeekdays = config.preferredStudyDays?.length ? config.preferredStudyDays : defaultStudyWeekdays(config.studyDaysPerWeek);
  const studyWeekdays = [...new Set(baseWeekdays.filter((d) => !config.restDays?.includes(d)))].sort((a, b) => a - b) as WeekdayIndex[];
  const studyWeekdaySet = new Set(studyWeekdays);

  const studyDayDates: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < totalCalendarDays; i++) {
    if (studyWeekdaySet.has(cursor.getDay() as WeekdayIndex)) {
      studyDayDates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const minutesPerStudyDay = Math.round(config.hoursPerStudyDay * 60);
  const totalAvailableMinutes = studyDayDates.length * minutesPerStudyDay;
  const plannableMinutes = Math.floor(totalAvailableMinutes * BUFFER_RATIO);

  return { totalCalendarDays, studyWeekdays, studyDayDates, minutesPerStudyDay, totalAvailableMinutes, plannableMinutes };
}

// --- Workload estimation ---------------------------------------------------
// Anchored to the app's own existing Pomodoro focus-session length (25 minutes — see
// Pomodoro.tsx's DURATIONS.focus) rather than an invented number, since no per-topic time
// metadata exists in the syllabus data. Simple, transparent multiples of that one unit:
//  - coverage (first-time study): ~2 sessions — learning new material takes longer than reviewing it
//  - revision (already covered, weak PYQ accuracy): ~1 session — a focused review, not re-learning
//  - pyq_practice (covered, too little PYQ data to judge): ~1 session of extra practice questions
//  - strong topics: 0 — already covered and performing well, no time allocated
export const POMODORO_UNIT_MINUTES = 25;
export const COVERAGE_MINUTES_PER_TOPIC = POMODORO_UNIT_MINUTES * 2;
export const REVISION_MINUTES_PER_TOPIC = POMODORO_UNIT_MINUTES;
export const PRACTICE_MINUTES_PER_TOPIC = POMODORO_UNIT_MINUTES;

export type PlanTaskType = 'coverage' | 'revision' | 'pyq_practice' | 'review';

export interface TopicWorkload {
  topicId: string;
  taskType: PlanTaskType | null; // null for 'strong' — no task is generated for it
  estimatedMinutes: number;
  reason: string;
}

export function estimateTopicWorkload(status: UnifiedTopicStatus): TopicWorkload {
  const { topicId, status: s, covered, pyqAttempted, pyqAccuracy } = status;
  switch (s) {
    case 'not_started':
      return { topicId, taskType: 'coverage', estimatedMinutes: COVERAGE_MINUTES_PER_TOPIC, reason: 'Not yet started.' };
    case 'needs_coverage':
      return {
        topicId,
        taskType: 'coverage',
        estimatedMinutes: COVERAGE_MINUTES_PER_TOPIC,
        reason: pyqAttempted > 0 ? `Attempted in PYQ practice but not yet marked covered.` : 'Not yet covered.',
      };
    case 'needs_revision':
      return {
        topicId,
        taskType: 'revision',
        estimatedMinutes: REVISION_MINUTES_PER_TOPIC,
        reason: `Covered, but PYQ accuracy is ${Math.round(pyqAccuracy ?? 0)}% over ${pyqAttempted} attempted.`,
      };
    case 'needs_practice':
      return {
        topicId,
        taskType: 'pyq_practice',
        estimatedMinutes: PRACTICE_MINUTES_PER_TOPIC,
        reason: `Covered, but only ${pyqAttempted} PYQ question${pyqAttempted === 1 ? '' : 's'} attempted so far.`,
      };
    case 'strong':
      return { topicId, taskType: null, estimatedMinutes: 0, reason: covered ? 'Covered with strong PYQ accuracy.' : 'Strong.' };
  }
}

// --- Prioritization ---------------------------------------------------------
// Matches the spec order (needs_coverage > needs_revision > needs_practice > not_started), with
// needs_coverage ranked above not_started specifically because it represents a topic the student
// has already engaged with via PYQ practice but hasn't finished covering — closer to done than an
// entirely untouched topic. This is a SCHEDULING order (different in purpose, and intentionally
// different in result, from lib/topicStatus's sortByAttentionPriority, which ranks by how urgently
// a topic deserves a student's attention on the Dashboard, not by what order to schedule it in).
const PLAN_STATUS_ORDER: Record<TopicStatus, number> = {
  needs_coverage: 0,
  needs_revision: 1,
  needs_practice: 2,
  not_started: 3,
  strong: 4,
};

/** Orders topics for scheduling: by the priority above, then by their natural syllabus order (the
 * order `statuses` was built in, which mirrors SYLLABUS's subject/topic order) for determinism. */
export function prioritizeTopics(statuses: UnifiedTopicStatus[]): UnifiedTopicStatus[] {
  return statuses
    .map((status, syllabusIndex) => ({ status, syllabusIndex }))
    .sort((a, b) => PLAN_STATUS_ORDER[a.status.status] - PLAN_STATUS_ORDER[b.status.status] || a.syllabusIndex - b.syllabusIndex)
    .map((x) => x.status);
}

// --- Coverage summary / capacity report -------------------------------------
export interface CoverageSummary {
  totalTopics: number;
  strong: number;
  needsCoverage: number; // not_started + needs_coverage
  needsRevision: number;
  needsPractice: number;
}

export type CapacityVerdict = 'comfortable' | 'tight' | 'insufficient';

export interface StudyPlanCapacityReport {
  availableMinutes: number; // plannableMinutes — what the engine schedules into (buffer already reserved)
  rawAvailableMinutes: number; // totalAvailableMinutes — every study minute with no buffer at all
  requiredMinutes: number; // total estimated workload for every topic that isn't already 'strong'
  deficitMinutes: number; // max(0, requiredMinutes - rawAvailableMinutes)
  verdict: CapacityVerdict;
  message: string;
}

function buildCapacityReport(capacity: PlanCapacity, requiredMinutes: number): StudyPlanCapacityReport {
  const { plannableMinutes, totalAvailableMinutes } = capacity;
  const deficitMinutes = Math.max(0, requiredMinutes - totalAvailableMinutes);
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;

  let verdict: CapacityVerdict;
  let message: string;
  if (requiredMinutes <= plannableMinutes) {
    verdict = 'comfortable';
    message = 'You have enough time to comfortably cover the syllabus, revise weak topics, and practice PYQs, with buffer to spare.';
  } else if (requiredMinutes <= totalAvailableMinutes) {
    verdict = 'tight';
    message = 'The plan fits, but only by using your full available time with no buffer left for missed days — consider adding a study day or extending your hours.';
  } else {
    verdict = 'insufficient';
    message = `Insufficient capacity to comfortably complete the complete syllabus. Required ~${hours(requiredMinutes)}h, available ~${hours(totalAvailableMinutes)}h (deficit ~${hours(deficitMinutes)}h).`;
  }

  return { availableMinutes: plannableMinutes, rawAvailableMinutes: totalAvailableMinutes, requiredMinutes, deficitMinutes, verdict, message };
}

// --- Phases ------------------------------------------------------------------
export type PlanPhaseId = 'coverage' | 'consolidation' | 'revision' | 'focused';

export interface PlanPhase {
  id: PlanPhaseId;
  title: string;
  startDate: string;
  endDate: string;
  focus: string;
}

// --- Task model ---------------------------------------------------------------
export type PlanTaskStatus = 'pending' | 'completed' | 'skipped';

export interface StudyPlanTask {
  id: string; // deterministic: `${topicId}-${taskType}` (unique — a topic gets at most one task per type)
  date: string; // yyyy-mm-dd
  topicId: string;
  subjectId: string;
  phase: PlanPhaseId;
  taskType: PlanTaskType;
  title: string;
  estimatedMinutes: number;
  priority: number; // 1 = highest; the order this task was scheduled in, for Stage 2 rebalancing
  status: PlanTaskStatus;
  reason: string;
}

export interface StudyPlan {
  config: StudyPlanConfig;
  capacity: PlanCapacity;
  capacityReport: StudyPlanCapacityReport;
  coverageSummary: CoverageSummary;
  phases: PlanPhase[];
  tasks: StudyPlanTask[];
  /** Topics whose workload didn't fit within plannable capacity — reported explicitly rather than
   * silently dropped, so the deficit in the capacity report always matches what's actually missing. */
  unscheduledTopicIds: string[];
  /** Multi-Workspace OS, Stage 1 — which workspace this plan belongs to. Optional because
   * generateStudyPlan() itself never sets it (this stays a pure function of its existing inputs);
   * lib/store.ts's persist migration stamps it onto an existing persisted plan as 'apfc'. Nothing
   * writes or reads it yet beyond that migration. */
  workspaceId?: WorkspaceKind;
}

export interface StudyPlanGenerationInput {
  config: StudyPlanConfig;
  syllabus: SyllabusSubject[];
  completedTopics: Record<string, boolean>;
  pyqPerf: PyqPerformanceSnapshot | null;
}

export type StudyPlanResult = { ok: true; plan: StudyPlan } | { ok: false; errors: StudyPlanValidationError[] };

const TASK_TYPE_TITLE: Record<PlanTaskType, string> = {
  coverage: 'Study',
  revision: 'Revise',
  pyq_practice: 'Practice PYQs',
  review: 'Review',
};

// Whenever there is any revision/practice demand at all, at least this share of plannableMinutes
// is reserved for it before coverage claims the rest — so a large coverage backlog never reduces
// revision/PYQ practice to zero (the "balance, not a weak-topic-only plan" requirement, applied in
// the direction of protecting revision/practice from being crowded out by coverage).
const MIN_REVISION_PRACTICE_SHARE = 0.2;

/**
 * Generates a deterministic study plan. Returns validation errors instead of a plan when the
 * config is invalid; never silently produces a plan that claims to fit when it doesn't.
 */
export function generateStudyPlan(input: StudyPlanGenerationInput): StudyPlanResult {
  const errors = validateStudyPlanConfig(input.config);
  if (errors.length > 0) return { ok: false, errors };

  const capacity = calculatePlanCapacity(input.config);
  const statuses = computeUnifiedTopicStatus(input.syllabus, input.completedTopics, input.pyqPerf);
  const subjectByTopic = new Map(input.syllabus.flatMap((s) => s.topics.map((t) => [t.id, s.id])));

  const coverageSummary: CoverageSummary = {
    totalTopics: statuses.length,
    strong: statuses.filter((s) => s.status === 'strong').length,
    needsCoverage: statuses.filter((s) => s.status === 'not_started' || s.status === 'needs_coverage').length,
    needsRevision: statuses.filter((s) => s.status === 'needs_revision').length,
    needsPractice: statuses.filter((s) => s.status === 'needs_practice').length,
  };

  const ordered = prioritizeTopics(statuses);
  const workloads = new Map(ordered.map((s) => [s.topicId, estimateTopicWorkload(s)]));

  const coverageTopics = ordered.filter((s) => s.status === 'not_started' || s.status === 'needs_coverage');
  const revisionTopics = ordered.filter((s) => s.status === 'needs_revision');
  const practiceTopics = ordered.filter((s) => s.status === 'needs_practice');

  const coverageNeeded = coverageTopics.reduce((sum, s) => sum + (workloads.get(s.topicId)?.estimatedMinutes ?? 0), 0);
  const revisionNeeded = revisionTopics.reduce((sum, s) => sum + (workloads.get(s.topicId)?.estimatedMinutes ?? 0), 0);
  const practiceNeeded = practiceTopics.reduce((sum, s) => sum + (workloads.get(s.topicId)?.estimatedMinutes ?? 0), 0);
  const requiredMinutes = coverageNeeded + revisionNeeded + practiceNeeded;

  const capacityReport = buildCapacityReport(capacity, requiredMinutes);

  // Budget split: coverage is top priority but never allowed to consume 100% of the budget when
  // there is real revision/practice demand — see MIN_REVISION_PRACTICE_SHARE above.
  const revisionPracticeNeeded = revisionNeeded + practiceNeeded;
  const reservedForRevisionPractice = revisionPracticeNeeded > 0 ? Math.min(revisionPracticeNeeded, capacity.plannableMinutes * MIN_REVISION_PRACTICE_SHARE) : 0;
  const budgetForCoverage = capacity.plannableMinutes - reservedForRevisionPractice;
  const coverageScheduledMinutes = Math.min(coverageNeeded, Math.max(0, budgetForCoverage));
  const leftoverAfterCoverage = Math.max(0, budgetForCoverage - coverageScheduledMinutes);
  const revisionPracticeBudget = reservedForRevisionPractice + leftoverAfterCoverage;
  const revisionScheduledMinutes = Math.min(revisionNeeded, revisionPracticeBudget);
  const practiceScheduledMinutes = Math.min(practiceNeeded, Math.max(0, revisionPracticeBudget - revisionScheduledMinutes));

  function takeWithinBudget(topics: UnifiedTopicStatus[], budgetMinutes: number): UnifiedTopicStatus[] {
    const taken: UnifiedTopicStatus[] = [];
    let used = 0;
    for (const t of topics) {
      const minutes = workloads.get(t.topicId)?.estimatedMinutes ?? 0;
      if (used + minutes > budgetMinutes) continue; // skip (not truncate the whole pass) so a later, smaller task can still fit
      taken.push(t);
      used += minutes;
    }
    return taken;
  }

  const scheduledCoverage = takeWithinBudget(coverageTopics, coverageScheduledMinutes);
  const scheduledRevision = takeWithinBudget(revisionTopics, revisionScheduledMinutes);
  const scheduledPractice = takeWithinBudget(practiceTopics, practiceScheduledMinutes);

  const scheduledIds = new Set([...scheduledCoverage, ...scheduledRevision, ...scheduledPractice].map((s) => s.topicId));
  const unscheduledTopicIds = [...coverageTopics, ...revisionTopics, ...practiceTopics]
    .filter((s) => !scheduledIds.has(s.topicId))
    .map((s) => s.topicId);

  // Phase count: derived from how many study days coverage alone would take versus how many are
  // actually available — an explainable, data-driven ratio rather than a fixed calendar percentage.
  // <= 1x: no room for anything beyond coverage itself -> a single combined phase.
  // <= 1.5x: some extra room, but not enough for a clean 3-stage split -> two phases.
  // > 1.5x: comfortable room for the full Coverage / Consolidation / Revision sequence.
  const coverageDays = capacity.minutesPerStudyDay > 0 ? Math.ceil(coverageScheduledMinutes / capacity.minutesPerStudyDay) : 0;
  const totalStudyDays = capacity.studyDayDates.length;
  const phaseMode: 1 | 2 | 3 = totalStudyDays === 0 || totalStudyDays <= coverageDays ? 1 : totalStudyDays <= coverageDays * 1.5 ? 2 : 3;

  function phaseFor(taskType: PlanTaskType): PlanPhaseId {
    if (phaseMode === 1) return 'focused';
    if (taskType === 'coverage') return 'coverage';
    if (phaseMode === 2) return 'consolidation';
    return taskType === 'revision' ? 'revision' : 'consolidation';
  }

  // Scheduling order: coverage, then revision, then practice — this ordering is itself what
  // produces the Coverage -> Consolidation -> Revision progression across the calendar; no
  // separate date-range carving is needed on top of it.
  const orderedForScheduling = [...scheduledCoverage, ...scheduledRevision, ...scheduledPractice];

  const tasks: StudyPlanTask[] = [];
  let dayIndex = 0;
  let usedInDay = 0;
  let priority = 1;
  for (const status of orderedForScheduling) {
    const workload = workloads.get(status.topicId);
    if (!workload || !workload.taskType || workload.estimatedMinutes <= 0) continue;

    if (capacity.studyDayDates.length === 0) break; // nothing to assign a date to — already reflected as unscheduled below
    if (usedInDay + workload.estimatedMinutes > capacity.minutesPerStudyDay && usedInDay > 0) {
      dayIndex = Math.min(dayIndex + 1, capacity.studyDayDates.length - 1);
      usedInDay = 0;
    }
    const date = capacity.studyDayDates[dayIndex];
    usedInDay += workload.estimatedMinutes;

    const phase = phaseFor(workload.taskType);
    tasks.push({
      id: `${status.topicId}-${workload.taskType}`,
      date,
      topicId: status.topicId,
      subjectId: subjectByTopic.get(status.topicId) ?? '',
      phase,
      taskType: workload.taskType,
      title: `${TASK_TYPE_TITLE[workload.taskType]}: ${status.topicTitle}`,
      estimatedMinutes: workload.estimatedMinutes,
      priority: priority++,
      status: 'pending',
      reason: workload.reason,
    });
  }

  const phases = buildPhases(tasks);

  return {
    ok: true,
    plan: { config: input.config, capacity, capacityReport, coverageSummary, phases, tasks, unscheduledTopicIds },
  };
}

const PHASE_TITLE: Record<PlanPhaseId, { title: string; focus: string }> = {
  coverage: { title: 'Phase 1: Syllabus Coverage', focus: 'First-pass study of uncovered topics.' },
  consolidation: { title: 'Phase 2: Consolidation + PYQ Practice', focus: 'Extra PYQ practice on topics with too little data to judge yet.' },
  revision: { title: 'Phase 3: Revision + Weak Topics', focus: 'Revisiting covered topics where PYQ accuracy is still weak.' },
  focused: { title: 'Focused Prep', focus: 'Coverage, revision and PYQ practice combined — the available time is too short for separate phases.' },
};

/** Derives phase date ranges from the tasks actually scheduled into them — only phases with at
 * least one task are reported, in the order they occur on the calendar. */
function buildPhases(tasks: StudyPlanTask[]): PlanPhase[] {
  const order: PlanPhaseId[] = ['focused', 'coverage', 'consolidation', 'revision'];
  const phases: PlanPhase[] = [];
  for (const id of order) {
    const phaseTasks = tasks.filter((t) => t.phase === id);
    if (phaseTasks.length === 0) continue;
    const dates = phaseTasks.map((t) => t.date).sort();
    phases.push({ id, ...PHASE_TITLE[id], startDate: dates[0], endDate: dates[dates.length - 1] });
  }
  return phases;
}
