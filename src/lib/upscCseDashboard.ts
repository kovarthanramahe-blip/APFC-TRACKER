// UPSC CSE Study Dashboard — pure aggregation only. Every number here is composed from an already
// existing, already-tested engine (lib/upscCseSyllabusCoverage.ts's computeCoverageSummary,
// lib/upscCsePrelimsPyqPerformance.ts's computeUpscCsePrelimsPerformance, lib/revisionQueue.ts's
// getDueItems, lib/upscCsePrelimsPyqFilters.ts's computeEligibleRevisionIds) — nothing here
// recomputes coverage, PYQ correctness, or revision scheduling itself. This module's only job is
// assembling those results into one snapshot the dashboard page renders, plus picking "recent
// activity" from real, timestamped records (PYQ attempts, completed study tasks) — never a
// fabricated activity feed.
import { computeCoverageSummary, type UpscCseCoverageSummary, type UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCseSyllabusTree } from './upscCseSyllabus';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { computeUpscCsePrelimsPerformance, type UpscCsePrelimsPerformanceSnapshot } from './upscCsePrelimsPyqPerformance';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './upscCsePrelimsPyqFilters';
import { getDueItems, type RevisionQueue } from './revisionQueue';
import { recentlyCompletedStudyTasks, type UpscCseStudyTask } from './upscCseStudyTask';

export interface UpscCseDashboardSnapshot {
  overallCoverage: UpscCseCoverageSummary;
  prelimsCoverage: UpscCseCoverageSummary;
  mainsCoverage: UpscCseCoverageSummary;
  /** null when no UPSC CSE PYQ attempt has ever been submitted — the honest "no data yet" state,
   * never a zeroed-out fake snapshot. */
  performance: UpscCsePrelimsPerformanceSnapshot | null;
  totalQuestions: number;
  /** Questions never answered by their most recent attempt — equals totalQuestions when there is
   * no performance data at all. */
  unattemptedCount: number;
  revisionDueCount: number;
  bookmarkedCount: number;
  recentAttempts: UpscCsePrelimsPyqAttempt[];
  recentCompletedTasks: UpscCseStudyTask[];
}

export interface ComputeUpscCseDashboardSnapshotInput {
  coverage: UpscCseSyllabusCoverage;
  prelimsTree: UpscCseSyllabusTree;
  mainsTree: UpscCseSyllabusTree;
  pyqBank: readonly UpscCsePrelimsBatchPyq[];
  attempts: readonly UpscCsePrelimsPyqAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
  studyTasks: readonly UpscCseStudyTask[];
  /** yyyy-mm-dd, local date — supplied by the caller, never computed internally. */
  today: string;
  /** How many recent attempts / completed tasks to surface — default 5. */
  recentLimit?: number;
}

export function computeUpscCseDashboardSnapshot(input: ComputeUpscCseDashboardSnapshotInput): UpscCseDashboardSnapshot {
  const recentLimit = input.recentLimit ?? 5;

  const prelimsIds = input.prelimsTree.microsyllabus.map((m) => m.id);
  const mainsIds = input.mainsTree.microsyllabus.map((m) => m.id);

  const prelimsCoverage = computeCoverageSummary(prelimsIds, input.coverage);
  const mainsCoverage = computeCoverageSummary(mainsIds, input.coverage);
  const overallCoverage = computeCoverageSummary([...prelimsIds, ...mainsIds], input.coverage);

  const performance = computeUpscCsePrelimsPerformance(input.pyqBank, input.attempts, input.prelimsTree);
  const totalQuestions = input.pyqBank.length;
  const unattemptedCount = performance ? performance.unattemptedCount : totalQuestions;

  const revisionStatusMap = computeRevisionStatusMap(input.pyqBank, input.attempts);
  const eligibleRevisionIds = computeEligibleRevisionIds(input.pyqBank, revisionStatusMap, input.bookmarkedPyqIds);
  const revisionDueCount = getDueItems(input.revisionQueue, eligibleRevisionIds, input.today).length;

  const recentAttempts = [...input.attempts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, recentLimit);
  const recentCompletedTasks = recentlyCompletedStudyTasks(input.studyTasks, recentLimit);

  return {
    overallCoverage,
    prelimsCoverage,
    mainsCoverage,
    performance,
    totalQuestions,
    unattemptedCount,
    revisionDueCount,
    bookmarkedCount: input.bookmarkedPyqIds.length,
    recentAttempts,
    recentCompletedTasks,
  };
}
