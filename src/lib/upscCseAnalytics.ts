import { computeCoverageSummary, type UpscCseCoverageSummary, type UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import { expandToLeafCoverageIds, type UpscCseGranularNode } from './upscCseGranularSyllabus';
import type { UpscCseSyllabusTree, UpscCseExamStage } from './upscCseSyllabus';
import { getSubjectsForPaper, getMicrosyllabusForSubject } from './upscCseSyllabus';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import {
  computeUpscCsePrelimsPerformance,
  topMicrosyllabusByMistakes,
  topUpscCsePrelimsSubjectsByMistakes,
  computeUpscCsePrelimsRecentVsPreviousTrend,
  type UpscCsePrelimsPerformanceSnapshot,
  type UpscCsePrelimsMicrosyllabusPerformance,
  type UpscCsePrelimsSubjectPerformance,
  type UpscCsePrelimsPerformanceTrend,
} from './upscCsePrelimsPyqPerformance';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './upscCsePrelimsPyqFilters';
import { getQueueCounts, type RevisionQueueCounts, type RevisionQueue } from './revisionQueue';
import { countStudyTasksByStatus, overdueStudyTasks, type UpscCseStudyTask, type UpscCseStudyTaskCounts } from './upscCseStudyTask';

// UPSC CSE Analytics — pure aggregation only, exactly like lib/upscCseDashboard.ts's own
// discipline: every number here is composed from an already-existing, already-tested engine
// (computeCoverageSummary, computeUpscCsePrelimsPerformance, getQueueCounts,
// countStudyTasksByStatus) — nothing here recomputes coverage, PYQ correctness, or revision
// scheduling itself. This module's only job is assembling those into ONE analytics snapshot plus a
// few genuinely new, honestly-labelled aggregates (subject-level coverage breakdown, study-task
// planned-minutes totals) — never a fabricated metric. In particular: "plannedMinutesCompleted" is
// the sum of `targetMinutes` on tasks the user has actually marked completed — a real number about
// what was PLANNED for completed work, explicitly never claimed as measured/actual study time,
// since this app has no real time-tracking signal for that.

export interface SubjectCoverageEntry {
  subjectId: string;
  title: string;
  stage: UpscCseExamStage;
  summary: UpscCseCoverageSummary;
}

export interface UpscCseStudyTaskAnalytics {
  counts: UpscCseStudyTaskCounts;
  totalPlannedMinutes: number;
  /** Sum of targetMinutes across COMPLETED tasks only — planned minutes for work actually marked
   * done, never presented as measured/actual time spent (see this module's own header). */
  plannedMinutesCompleted: number;
  overdueCount: number;
  /** 0-100; 0 when there are no tasks at all (never divides by zero). */
  completionRatePct: number;
}

/** PYQ Weak Spots (Phase 6 Step 2) — re-sorts performance's own subjects[]/microsyllabus[] by raw
 * mistake volume (never a second attempt scan) plus the one genuinely new calculation this stage
 * adds, a recent-vs-previous accuracy trend. See lib/upscCsePrelimsPyqPerformance.ts's own header
 * for the full design rationale, including how the "Needs Review / Unmapped" bucket is preserved. */
export interface UpscCsePrelimsWeakSpots {
  repeatedMistakeMicrosyllabus: UpscCsePrelimsMicrosyllabusPerformance[];
  repeatedMistakeSubjects: UpscCsePrelimsSubjectPerformance[];
  trend: UpscCsePrelimsPerformanceTrend;
}

export interface UpscCseAnalyticsSnapshot {
  overallCoverage: UpscCseCoverageSummary;
  prelimsCoverage: UpscCseCoverageSummary;
  mainsCoverage: UpscCseCoverageSummary;
  subjectCoverage: SubjectCoverageEntry[];
  performance: UpscCsePrelimsPerformanceSnapshot | null;
  weakSpots: UpscCsePrelimsWeakSpots;
  totalQuestions: number;
  unattemptedCount: number;
  revision: RevisionQueueCounts;
  studyTasks: UpscCseStudyTaskAnalytics;
}

export interface ComputeUpscCseAnalyticsInput {
  coverage: UpscCseSyllabusCoverage;
  prelimsTree: UpscCseSyllabusTree;
  mainsTree: UpscCseSyllabusTree;
  granularNodes: readonly UpscCseGranularNode[];
  pyqBank: readonly UpscCsePrelimsBatchPyq[];
  attempts: readonly UpscCsePrelimsPyqAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
  studyTasks: readonly UpscCseStudyTask[];
  /** yyyy-mm-dd, local date — supplied by the caller, never computed internally. */
  today: string;
}

function subjectCoverageForTree(tree: UpscCseSyllabusTree, coverage: UpscCseSyllabusCoverage, granularNodes: readonly UpscCseGranularNode[]): SubjectCoverageEntry[] {
  const entries: SubjectCoverageEntry[] = [];
  for (const paper of tree.papers) {
    for (const subject of getSubjectsForPaper(tree, paper.id)) {
      const microsyllabusIds = getMicrosyllabusForSubject(tree, subject.id).map((m) => m.id);
      const leafIds = expandToLeafCoverageIds(microsyllabusIds, granularNodes);
      entries.push({ subjectId: subject.id, title: subject.title, stage: tree.stage, summary: computeCoverageSummary(leafIds, coverage) });
    }
  }
  return entries;
}

export function computeUpscCseAnalytics(input: ComputeUpscCseAnalyticsInput): UpscCseAnalyticsSnapshot {
  const prelimsIds = expandToLeafCoverageIds(input.prelimsTree.microsyllabus.map((m) => m.id), input.granularNodes);
  const mainsIds = expandToLeafCoverageIds(input.mainsTree.microsyllabus.map((m) => m.id), input.granularNodes);

  const prelimsCoverage = computeCoverageSummary(prelimsIds, input.coverage);
  const mainsCoverage = computeCoverageSummary(mainsIds, input.coverage);
  const overallCoverage = computeCoverageSummary([...prelimsIds, ...mainsIds], input.coverage);

  const subjectCoverage = [...subjectCoverageForTree(input.prelimsTree, input.coverage, input.granularNodes), ...subjectCoverageForTree(input.mainsTree, input.coverage, input.granularNodes)];

  const performance = computeUpscCsePrelimsPerformance(input.pyqBank, input.attempts, input.prelimsTree);
  const totalQuestions = input.pyqBank.length;
  const unattemptedCount = performance ? performance.unattemptedCount : totalQuestions;

  const weakSpots: UpscCsePrelimsWeakSpots = {
    repeatedMistakeMicrosyllabus: performance ? topMicrosyllabusByMistakes(performance.microsyllabus) : [],
    repeatedMistakeSubjects: performance ? topUpscCsePrelimsSubjectsByMistakes(performance.subjects) : [],
    trend: computeUpscCsePrelimsRecentVsPreviousTrend(input.attempts),
  };

  const revisionStatusMap = computeRevisionStatusMap(input.pyqBank, input.attempts);
  const eligibleRevisionIds = computeEligibleRevisionIds(input.pyqBank, revisionStatusMap, input.bookmarkedPyqIds);
  const revision = getQueueCounts(input.revisionQueue, eligibleRevisionIds, input.today);

  const counts = countStudyTasksByStatus(input.studyTasks);
  const totalPlannedMinutes = input.studyTasks.reduce((sum, t) => sum + (t.targetMinutes ?? 0), 0);
  const plannedMinutesCompleted = input.studyTasks.filter((t) => t.status === 'completed').reduce((sum, t) => sum + (t.targetMinutes ?? 0), 0);
  const overdueCount = overdueStudyTasks(input.studyTasks, input.today).length;
  const totalTasks = counts.pending + counts.in_progress + counts.completed;
  const completionRatePct = totalTasks > 0 ? Math.round((counts.completed / totalTasks) * 100) : 0;

  return {
    overallCoverage,
    prelimsCoverage,
    mainsCoverage,
    subjectCoverage,
    performance,
    weakSpots,
    totalQuestions,
    unattemptedCount,
    revision,
    studyTasks: { counts, totalPlannedMinutes, plannedMinutesCompleted, overdueCount, completionRatePct },
  };
}
