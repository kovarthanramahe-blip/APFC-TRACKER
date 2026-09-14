// A pure, read-only "how ready am I for the exam right now?" composite score — the capstone view
// over five signals every one of which is already computed elsewhere in this app. This module
// NEVER recomputes any of those signals itself (no second topic-status/PYQ-accuracy/mock-accuracy/
// plan-execution/revision-mastery calculation) — it only reads their already-established outputs
// and combines them with documented weights. Pure and deterministic: no Date.now(), no
// Math.random(); `currentDate` is always supplied by the caller, exactly like every other Study
// Plan / revision-queue module in this codebase.
import type { SyllabusSubject, MockTestAttempt, PYQ, PYQAttempt } from './types';
import { computeUnifiedTopicStatus, MIN_PYQ_ATTEMPTS_FOR_SIGNAL, type UnifiedTopicStatus, type TopicStatus } from './topicStatus';
import type { PyqPerformanceSnapshot } from './pyqPerformance';
import { computeAggregateAccuracy } from './mockTestStats';
import { computeStudyPlanProgress, type ExecutionState } from './studyPlanProgress';
import type { StudyPlan } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import type { PomodoroSession } from './types';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './pyqFilters';
import { getQueueCounts, type RevisionQueue } from './revisionQueue';

export interface ExamReadinessInput {
  syllabus: SyllabusSubject[];
  completedTopics: Record<string, boolean>;
  /** Already-computed via lib/pyqPerformance's computePyqPerformance — never recomputed here. */
  pyqPerf: PyqPerformanceSnapshot | null;
  /** Raw bank + attempts, needed only for the separate revision-ELIGIBILITY concern
   * (lib/pyqFilters), which is intentionally distinct from pyqPerf's accuracy aggregation. */
  pyqBank: PYQ[];
  pyqAttempts: PYQAttempt[];
  bookmarkedPyqIds: string[];
  revisionQueue: RevisionQueue;
  mockTestAttempts: MockTestAttempt[];
  studyPlan: StudyPlan | null;
  personalTasks: PersonalPlanTask[];
  sessions: PomodoroSession[];
  /** yyyy-mm-dd, local date — never inferred internally. */
  currentDate: string;
}

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Dimension model --------------------------------------------------------------------------
export type ExamReadinessDimension = 'syllabus' | 'pyqAccuracy' | 'mockTests' | 'studyPlanExecution' | 'revisionMastery';

export interface DimensionScore {
  dimension: ExamReadinessDimension;
  label: string;
  score: number; // 0-100, always clamped
  weight: number; // out of 100 — see WEIGHTS below
  /** false when there was not enough data to say anything real — the 0 score in that case is a
   * conservative placeholder, never a claim that the student is doing badly. */
  hasData: boolean;
  reason: string;
}

// Weights are explicit and sum to exactly 100. Knowledge signals (syllabus + PYQ + mock = 80)
// deliberately outweigh process signals (plan pacing + revision mastery = 20): being on schedule
// or having cleared your revision queue says something about discipline, not about whether you'd
// actually pass the exam today.
export const DIMENSION_WEIGHTS: Record<ExamReadinessDimension, number> = {
  syllabus: 30,
  pyqAccuracy: 30,
  mockTests: 20,
  studyPlanExecution: 10,
  revisionMastery: 10,
};

// --- Verdict -----------------------------------------------------------------------------------
export type ExamReadinessVerdict = 'needs_work' | 'getting_there' | 'exam_ready';

// Documented thresholds — below GETTING_THERE_MIN is 'needs_work', at/above EXAM_READY_MIN is
// 'exam_ready', the (wide, deliberately non-noisy) band between is 'getting_there'.
export const VERDICT_GETTING_THERE_MIN = 40;
export const VERDICT_EXAM_READY_MIN = 75;

function deriveVerdict(overallScore: number): ExamReadinessVerdict {
  if (overallScore >= VERDICT_EXAM_READY_MIN) return 'exam_ready';
  if (overallScore >= VERDICT_GETTING_THERE_MIN) return 'getting_there';
  return 'needs_work';
}

// --- Dimension 1: syllabus coverage/strength ----------------------------------------------------
// Reuses lib/topicStatus's own per-topic classification verbatim — never a second coverage/PYQ
// calculation. Each status contributes a documented point value rather than a binary strong/not:
// a topic needing only more PYQ practice (needs_practice) is genuinely closer to "known" than one
// never covered at all (not_started), and the score should reflect that gradient.
const STATUS_POINTS: Record<TopicStatus, number> = {
  strong: 100,
  needs_practice: 70, // covered, likely fine — just not enough PYQ data yet to confirm
  needs_revision: 40, // covered, but demonstrably weak on PYQs
  needs_coverage: 15, // some PYQ engagement but never marked covered
  not_started: 0,
};

function scoreSyllabus(statuses: UnifiedTopicStatus[]): DimensionScore {
  const total = statuses.length;
  if (total === 0) {
    return { dimension: 'syllabus', label: 'Syllabus Coverage', score: 0, weight: DIMENSION_WEIGHTS.syllabus, hasData: false, reason: 'No syllabus topics found.' };
  }
  const avg = statuses.reduce((sum, s) => sum + STATUS_POINTS[s.status], 0) / total;
  const strongCount = statuses.filter((s) => s.status === 'strong').length;
  const remaining = total - strongCount;
  return {
    dimension: 'syllabus',
    label: 'Syllabus Coverage',
    score: clampScore(avg),
    weight: DIMENSION_WEIGHTS.syllabus,
    hasData: true,
    reason: `${remaining} of ${total} topics are not yet strong.`,
  };
}

// --- Dimension 2: PYQ accuracy -------------------------------------------------------------------
// Reuses pyqPerf.overall.overallAccuracy verbatim (lib/pyqPerformance) — never a second accuracy
// calculation. Below MIN_PYQ_ATTEMPTS_FOR_SIGNAL (the same threshold lib/topicStatus already uses
// for "is this enough data to trust"), the raw accuracy is scaled down toward 0 proportionally to
// how little data there is, rather than trusted outright — a 100% accuracy from one lucky guess
// must never score the same as 100% over fifty questions.
function scorePyqAccuracy(pyqPerf: PyqPerformanceSnapshot | null): DimensionScore {
  if (!pyqPerf || pyqPerf.overall.totalAttempted === 0) {
    return { dimension: 'pyqAccuracy', label: 'PYQ Accuracy', score: 0, weight: DIMENSION_WEIGHTS.pyqAccuracy, hasData: false, reason: 'No PYQ attempts recorded yet.' };
  }
  const { totalAttempted, overallAccuracy } = pyqPerf.overall;
  const confidence = Math.min(1, totalAttempted / MIN_PYQ_ATTEMPTS_FOR_SIGNAL);
  return {
    dimension: 'pyqAccuracy',
    label: 'PYQ Accuracy',
    score: clampScore(overallAccuracy * confidence),
    weight: DIMENSION_WEIGHTS.pyqAccuracy,
    hasData: true,
    reason: `PYQ accuracy is ${round1(overallAccuracy)}% over ${totalAttempted} attempted question${totalAttempted === 1 ? '' : 's'}.`,
  };
}

// --- Dimension 3: mock-test performance -----------------------------------------------------------
// Reuses lib/mockTestStats's computeAggregateAccuracy verbatim. A dedicated, documented sample-size
// threshold (there is no existing one for mock tests elsewhere in the app) applies the same
// low-sample dampening as the PYQ dimension, so a single short mock test can't claim full confidence.
export const MIN_MOCK_QUESTIONS_FOR_SIGNAL = 20; // roughly one full mock test's worth of questions

function scoreMockTests(attempts: MockTestAttempt[]): DimensionScore {
  const totalAttempted = attempts.reduce((sum, a) => sum + a.correctCount + a.wrongCount, 0);
  if (attempts.length === 0 || totalAttempted === 0) {
    return { dimension: 'mockTests', label: 'Mock Test Performance', score: 0, weight: DIMENSION_WEIGHTS.mockTests, hasData: false, reason: 'No mock tests taken yet.' };
  }
  const accuracy = computeAggregateAccuracy(attempts);
  const confidence = Math.min(1, totalAttempted / MIN_MOCK_QUESTIONS_FOR_SIGNAL);
  return {
    dimension: 'mockTests',
    label: 'Mock Test Performance',
    score: clampScore(accuracy * confidence),
    weight: DIMENSION_WEIGHTS.mockTests,
    hasData: true,
    reason: `Mock test accuracy is ${round1(accuracy)}% across ${attempts.length} test${attempts.length === 1 ? '' : 's'}.`,
  };
}

// --- Dimension 4: Study Plan execution/pacing -----------------------------------------------------
// Reuses lib/studyPlanProgress's computeStudyPlanProgress verbatim (which itself reuses Stage 1-8's
// own plan/task data) — never a second execution calculation. No plan at all scores 0 (conservative
// "no data"), matching every other dimension's convention.
const EXECUTION_STATE_POINTS: Record<ExecutionState, number> = {
  ahead: 100,
  on_track: 85,
  behind: 40,
  inactive: 0,
};

const EXECUTION_STATE_REASON: Record<ExecutionState, string> = {
  ahead: 'Study plan execution is ahead of the elapsed plan period.',
  on_track: 'Study plan execution is on track with the elapsed plan period.',
  behind: 'Study plan execution is behind the elapsed plan period.',
  inactive: 'No study activity has been recorded during the current plan period.',
};

function scoreStudyPlan(input: ExamReadinessInput): DimensionScore {
  const progress = computeStudyPlanProgress({
    plan: input.studyPlan,
    personalTasks: input.personalTasks,
    sessions: input.sessions,
    currentDate: input.currentDate,
  });
  if (progress.status === 'no_plan') {
    return { dimension: 'studyPlanExecution', label: 'Study Plan Execution', score: 0, weight: DIMENSION_WEIGHTS.studyPlanExecution, hasData: false, reason: 'No study plan has been generated yet.' };
  }
  return {
    dimension: 'studyPlanExecution',
    label: 'Study Plan Execution',
    score: clampScore(EXECUTION_STATE_POINTS[progress.executionState]),
    weight: DIMENSION_WEIGHTS.studyPlanExecution,
    hasData: true,
    reason: EXECUTION_STATE_REASON[progress.executionState],
  };
}

// --- Dimension 5: revision mastery ------------------------------------------------------------------
// Reuses lib/pyqFilters' computeEligibleRevisionIds and lib/revisionQueue's getQueueCounts verbatim
// — never a second eligibility/scheduling calculation. Zero eligible items is genuinely ambiguous
// (it could mean "nothing wrong yet" or "barely any PYQs attempted") and is conservatively scored 0,
// consistent with every other "no data" case here rather than assumed to mean mastery.
function scoreRevisionMastery(input: ExamReadinessInput): DimensionScore {
  const statusMap = computeRevisionStatusMap(input.pyqBank, input.pyqAttempts);
  const eligibleIds = computeEligibleRevisionIds(input.pyqBank, statusMap, input.bookmarkedPyqIds);
  const counts = getQueueCounts(input.revisionQueue, eligibleIds, input.currentDate);
  if (counts.totalTracked === 0) {
    return { dimension: 'revisionMastery', label: 'Revision Mastery', score: 0, weight: DIMENSION_WEIGHTS.revisionMastery, hasData: false, reason: 'No PYQs are eligible for revision yet.' };
  }
  const score = (counts.masteredCount / counts.totalTracked) * 100;
  return {
    dimension: 'revisionMastery',
    label: 'Revision Mastery',
    score: clampScore(score),
    weight: DIMENSION_WEIGHTS.revisionMastery,
    hasData: true,
    reason: `${counts.masteredCount} of ${counts.totalTracked} eligible PYQs are fully mastered.`,
  };
}

// --- Report -------------------------------------------------------------------------------------
export interface ExamReadinessReport {
  overallScore: number; // 0-100
  verdict: ExamReadinessVerdict;
  /** Fixed, documented order: syllabus, pyqAccuracy, mockTests, studyPlanExecution, revisionMastery. */
  dimensions: DimensionScore[];
  weakestDimension: DimensionScore;
}

/**
 * Computes the exam-readiness composite from five already-existing signals. Never mutates any
 * input, never persists anything, and is fully deterministic given the same inputs.
 */
export function computeExamReadiness(input: ExamReadinessInput): ExamReadinessReport {
  const statuses = computeUnifiedTopicStatus(input.syllabus, input.completedTopics, input.pyqPerf);

  const dimensions: DimensionScore[] = [
    scoreSyllabus(statuses),
    scorePyqAccuracy(input.pyqPerf),
    scoreMockTests(input.mockTestAttempts),
    scoreStudyPlan(input),
    scoreRevisionMastery(input),
  ];

  const overallScore = clampScore(dimensions.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0));
  const verdict = deriveVerdict(overallScore);

  // First occurrence of the minimum wins ties, in the fixed `dimensions` order above — deterministic.
  const weakestDimension = dimensions.reduce((weakest, d) => (d.score < weakest.score ? d : weakest), dimensions[0]);

  return { overallScore, verdict, dimensions, weakestDimension };
}
