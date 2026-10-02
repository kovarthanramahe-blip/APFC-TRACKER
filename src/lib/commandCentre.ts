import type { WorkspaceKind } from './workspace';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { computePyqPerformance } from './pyqPerformance';
import { computeUnifiedTopicStatus } from './topicStatus';
import { selectWeakTopics } from './weakTopicPractice';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './pyqFilters';
import { getQueueCounts, type RevisionQueue } from './revisionQueue';
import type { PYQAttempt } from './types';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { generateTodaysStudyItems } from './upscCseTodaysStudy';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { computePhdDashboardSnapshot } from './phdDashboard';
import { computePhdAnalytics } from './phdAnalytics';
import type { PhdTopicArea } from './phdTopicArea';
import type { MicroTarget } from './microTarget';
import type { ImportedContent } from './contentImport';

// Command Centre (Phase 14) — a thin, pure AGGREGATION layer only. Every number/item below is
// produced by an already-existing, already-tested engine from this workspace's own page
// (lib/pyqFilters.ts + lib/revisionQueue.ts + lib/weakTopicPractice.ts for APFC — see
// pages/Dashboard.tsx's own "Due for Revision"/"Needs Attention" cards; lib/upscCseTodaysStudy.ts's
// generateTodaysStudyItems verbatim for UPSC CSE — see pages/UpscCseDashboard.tsx;
// lib/phdDashboard.ts's computePhdDashboardSnapshot + lib/phdAnalytics.ts's computePhdAnalytics for
// PhD Research — see pages/PhdDashboard.tsx/PhdAnalytics.tsx). Nothing here recomputes scheduling,
// revision eligibility, weak-topic selection, or PhD analytics — it only SELECTS a short, already-
// prioritised slice from each and packages it as a navigable CommandCentreItem. No store access:
// every input is data the caller (pages/CommandCentre.tsx) already resolved — either the live
// active-workspace fields, or an inactive workspace's own archived slice (lib/store.ts's
// inactiveWorkspaceOwnedData) — this module has no opinion on which, and never mutates either.

export interface CommandCentreItem {
  id: string;
  workspaceId: WorkspaceKind;
  title: string;
  /** Short supporting detail — never required; omitted when a title is already self-explanatory
   * (e.g. UPSC CSE's own Today's Study items already carry a human-written description). */
  context?: string;
  actionLabel: string;
  /** The SAME actionHref/route an existing page already uses for this exact action — never a new
   * destination invented for this surface. */
  actionHref: string;
  /** Stable, deterministic ordering — the item's own index in the final combined list (workspace
   * order: APFC, UPSC CSE, PhD Research; within a workspace, that workspace's own existing
   * priority order). Never randomised, never recomputed per render in a way that could reorder an
   * unchanged list. */
  priority: number;
}

export interface ApfcCommandCentreData {
  completedTopics: Record<string, boolean>;
  pyqAttempts: readonly PYQAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
}

export interface UpscCseCommandCentreData {
  coverage: UpscCseSyllabusCoverage;
  attempts: readonly UpscCsePrelimsPyqAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
  /** Only used to derive currentAffairsRevisionIds (ids already tracked in revisionQueue) — the
   * exact same derivation pages/UpscCseDashboard.tsx's own Today's Study already performs. */
  importedContent: readonly ImportedContent[];
}

export interface PhdCommandCentreData {
  researchStartDate: string;
  topicAreas: readonly PhdTopicArea[];
  microTargets: readonly MicroTarget[];
  importedContent: readonly ImportedContent[];
  notesCount: number;
}

export interface GenerateUpNextItemsInput {
  /** yyyy-mm-dd, local date — supplied by the caller, never computed internally (same discipline
   * every engine this module reads from already follows). */
  today: string;
  apfc: ApfcCommandCentreData;
  upscCse: UpscCseCommandCentreData;
  phdResearch: PhdCommandCentreData;
  /** How many items to keep from EACH workspace — default 2. Keeps the list compact and "Up Next"-
   * shaped rather than a second full dashboard; a workspace with nothing due simply contributes 0. */
  maxPerWorkspace?: number;
}

function buildApfcItems(data: ApfcCommandCentreData, today: string, max: number): Omit<CommandCentreItem, 'priority'>[] {
  const items: Omit<CommandCentreItem, 'priority'>[] = [];

  // Due for Revision — exactly pages/Dashboard.tsx's own revisionCounts computation.
  const statusMap = computeRevisionStatusMap(PYQ_BANK, [...data.pyqAttempts]);
  const eligibleIds = computeEligibleRevisionIds(PYQ_BANK, statusMap, [...data.bookmarkedPyqIds]);
  const dueCount = getQueueCounts(data.revisionQueue, eligibleIds, today).dueCount;
  if (dueCount > 0) {
    items.push({
      id: 'apfc-revision-due',
      workspaceId: 'apfc',
      title: `${dueCount} PYQ${dueCount === 1 ? '' : 's'} due for revision`,
      actionLabel: 'Revise Now',
      actionHref: '/pyq-test',
    });
  }

  // Weak-Topic Practice — reuses lib/weakTopicPractice.ts's own selectWeakTopics (the real
  // UnifiedTopicStatus[], already in urgency order), NOT selectWeakTopicPracticeIds (which returns
  // PYQ QUESTION ids, capped at DEFAULT_WEAK_TOPIC_PRACTICE_CAP — a different, larger number than
  // the topic count, and the wrong thing to label "N weak topics"). The practice session itself
  // still lives entirely on /pyq-test?mode=weak_topics, which does its own PYQ selection — this
  // only needs the topic list for an honest count and each topic's own already-computed
  // pyqAccuracy, never a second accuracy calculation.
  const pyqPerf = computePyqPerformance(PYQ_BANK, [...data.pyqAttempts]);
  const topicStatuses = computeUnifiedTopicStatus(SYLLABUS, data.completedTopics, pyqPerf);
  const weakTopics = selectWeakTopics(topicStatuses);
  if (weakTopics.length > 0) {
    const knownAccuracies = weakTopics.map((t) => t.pyqAccuracy).filter((a): a is number => a !== null);
    const context = knownAccuracies.length > 0 ? `Lowest recent accuracy: ${Math.round(Math.min(...knownAccuracies))}%` : undefined;
    items.push({
      id: 'apfc-weak-topics',
      workspaceId: 'apfc',
      title: `${weakTopics.length} weak topic${weakTopics.length === 1 ? '' : 's'} to practice`,
      context,
      actionLabel: 'Practice Weak Topics',
      actionHref: '/pyq-test?mode=weak_topics',
    });
  }

  return items.slice(0, max);
}

function buildUpscCseItems(data: UpscCseCommandCentreData, today: string, max: number): Omit<CommandCentreItem, 'priority'>[] {
  // Exactly pages/UpscCseDashboard.tsx's own currentAffairsRevisionIds derivation.
  const currentAffairsRevisionIds = data.importedContent.filter((item) => item.contentType === 'current_affairs' && data.revisionQueue[item.id]).map((item) => item.id);

  const items = generateTodaysStudyItems({
    coverage: data.coverage,
    prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
    mainsTree: UPSC_CSE_MAINS_SYLLABUS,
    granularNodes: UPSC_CSE_GRANULAR_NODES,
    pyqBank: UPSC_CSE_PRELIMS_PYQ_BANK,
    attempts: data.attempts,
    bookmarkedPyqIds: data.bookmarkedPyqIds,
    revisionQueue: data.revisionQueue,
    currentAffairsRevisionIds,
    today,
  });

  return items.slice(0, max).map((item) => ({
    id: `upsc-cse-${item.id}`,
    workspaceId: 'upsc_cse' as const,
    title: item.title,
    context: item.description,
    actionLabel: item.actionLabel,
    actionHref: item.actionHref,
  }));
}

function buildPhdItems(data: PhdCommandCentreData, today: string, max: number): Omit<CommandCentreItem, 'priority'>[] {
  const items: Omit<CommandCentreItem, 'priority'>[] = [];

  const dashboardSnapshot = computePhdDashboardSnapshot({
    researchStartDate: data.researchStartDate,
    topicAreas: data.topicAreas,
    microTargets: data.microTargets,
    importedContent: data.importedContent,
    today,
  });
  if (dashboardSnapshot.overdueTargets.length > 0) {
    const n = dashboardSnapshot.overdueTargets.length;
    items.push({
      id: 'phd-overdue-targets',
      workspaceId: 'phd_research',
      title: `${n} overdue micro-target${n === 1 ? '' : 's'}`,
      actionLabel: 'Open Research Plan',
      actionHref: '/phd-plan',
    });
  }

  const analytics = computePhdAnalytics({
    researchStartDate: data.researchStartDate,
    topicAreas: data.topicAreas,
    microTargets: data.microTargets,
    importedContent: data.importedContent,
    notesCount: data.notesCount,
    today,
  });
  if (analytics.researchDocumentsToContinueCount > 0) {
    const n = analytics.researchDocumentsToContinueCount;
    items.push({
      id: 'phd-continue-documents',
      workspaceId: 'phd_research',
      title: `${n} research document${n === 1 ? '' : 's'} to continue`,
      actionLabel: 'Continue Research Documents',
      actionHref: '/phd-research',
    });
  }
  if (analytics.bibliographyToContinueCount > 0) {
    const n = analytics.bibliographyToContinueCount;
    items.push({
      id: 'phd-continue-bibliography',
      workspaceId: 'phd_research',
      title: `${n} bibliography record${n === 1 ? '' : 's'} to continue`,
      actionLabel: 'Continue Working Bibliography',
      actionHref: '/phd-research/bibliography',
    });
  }

  return items.slice(0, max);
}

/**
 * Builds the Command Centre's "Up Next" list — a short, flat, cross-workspace list of already-
 * computed actionable items, in stable (workspace, then that workspace's own existing priority)
 * order. Deterministic: the same input always produces the same list in the same order. Returns
 * `[]` when every workspace has nothing due/actionable — the caller renders an honest "all caught
 * up" state rather than this module padding the list with filler.
 */
export function generateUpNextItems(input: GenerateUpNextItemsInput): CommandCentreItem[] {
  const max = input.maxPerWorkspace ?? 2;
  const combined = [
    ...buildApfcItems(input.apfc, input.today, max),
    ...buildUpscCseItems(input.upscCse, input.today, max),
    ...buildPhdItems(input.phdResearch, input.today, max),
  ];
  return combined.map((item, index) => ({ ...item, priority: index }));
}
