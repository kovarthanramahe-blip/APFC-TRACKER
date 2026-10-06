// JARVIS Phase 2 — Application Intelligence Tools.
//
// These are JARVIS's first real tools (layer 2 — see index.ts's architecture doc). Every one of
// them is a READ-ONLY view onto an already-existing, already-tested engine from this codebase's
// own lib/* — exactly the same engines the app's own pages/commandCentre.ts already call. Nothing
// in this file recomputes a due date, a weak-topic threshold, a reading-status stage, or an
// overdue calculation; it only SELECTS from what those engines already produced and packages the
// result as a small, stable DTO. If a tool's summary looks wrong, the bug is in the engine it
// calls, not here — this file has no calculation logic of its own to be wrong.
//
// No tool here mutates anything: every `run` is `async` only to satisfy JarvisTool's contract
// (future tools may need to await a real I/O call); none of these five ever do.

import type { JarvisTool, JarvisToolResult, JarvisWorkspace } from './types';
import { getWorkspaceMeta, type WorkspaceKind } from '../workspace';
import type { ApfcCommandCentreData, UpscCseCommandCentreData, PhdCommandCentreData } from '../commandCentre';
import { PYQ_BANK } from '../../data/pyq';
import { SYLLABUS } from '../../data/syllabus';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from '../pyqFilters';
import { getQueueCounts, getDueItems, type RevisionQueue } from '../revisionQueue';
import { computePyqPerformance } from '../pyqPerformance';
import { computeUnifiedTopicStatus } from '../topicStatus';
import { selectWeakTopics } from '../weakTopicPractice';
import { generateTodaysStudyItems, type UpscCseTodaysStudyItemKind } from '../upscCseTodaysStudy';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../../data/pyqUpscCsePrelims';
import type { ImportedContent } from '../contentImport';
import { computePhdDashboardSnapshot } from '../phdDashboard';
import { computePhdAnalytics } from '../phdAnalytics';
import { computeResearchDuration } from '../phdResearch';
import { countByReadingStatus, type ReadingStatusCounts } from '../phdReadingStatus';

// ================================================================================================
// Workspace identifier boundary
// ================================================================================================
//
// Phase 1 defined JarvisWorkspace ('apfc' | 'upsc' | 'phd' | 'global') as deliberately distinct
// from the application's own WorkspaceKind ('apfc' | 'upsc_cse' | 'phd_research' — lib/workspace.ts
// — no 'global'). This is the ONE place that conversion happens: every application tool below
// takes application-shaped input and is scoped to a fixed JarvisWorkspace in its own `workspaces`
// field, so no tool body ever needs to convert an id itself. `global.workspace_state` (the one tool
// that reports an arbitrary WorkspaceKind back) calls this function explicitly instead of
// duplicating the mapping.
export function toJarvisWorkspace(workspace: WorkspaceKind): JarvisWorkspace {
  switch (workspace) {
    case 'apfc':
      return 'apfc';
    case 'upsc_cse':
      return 'upsc';
    case 'phd_research':
      return 'phd';
  }
}

function okResult<TData>(summary: string, data: TData): JarvisToolResult<TData> {
  return { status: 'ok', summary, data };
}

function errorResult(summary: string, error: string): JarvisToolResult<never> {
  return { status: 'error', summary, error };
}

function safeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

// ================================================================================================
// 1. apfc.study_state
// ================================================================================================

export type ApfcStudyStateInput = ApfcCommandCentreData & {
  /** yyyy-mm-dd — supplied by the caller, matching every engine this tool reads from. */
  today: string;
};

export interface ApfcStudyStateData {
  dueRevisionCount: number;
  weakTopicCount: number;
  /** Lowest known PYQ accuracy among the weak topics — null when no weak topic has a measured
   * accuracy yet (mirrors lib/commandCentre.ts's own "Lowest recent accuracy" context). */
  lowestWeakTopicAccuracyPct: number | null;
}

function buildApfcStudyState(input: ApfcStudyStateInput): ApfcStudyStateData {
  const statusMap = computeRevisionStatusMap(PYQ_BANK, [...input.pyqAttempts]);
  const eligibleIds = computeEligibleRevisionIds(PYQ_BANK, statusMap, [...input.bookmarkedPyqIds]);
  const dueRevisionCount = getQueueCounts(input.revisionQueue, eligibleIds, input.today).dueCount;

  const pyqPerf = computePyqPerformance(PYQ_BANK, [...input.pyqAttempts]);
  const topicStatuses = computeUnifiedTopicStatus(SYLLABUS, input.completedTopics, pyqPerf);
  const weakTopics = selectWeakTopics(topicStatuses);
  const knownAccuracies = weakTopics.map((t) => t.pyqAccuracy).filter((a): a is number => a !== null);

  return {
    dueRevisionCount,
    weakTopicCount: weakTopics.length,
    lowestWeakTopicAccuracyPct: knownAccuracies.length > 0 ? Math.round(Math.min(...knownAccuracies)) : null,
  };
}

/** No APFC "today's study" item list is included: unlike UPSC CSE (generateTodaysStudyItems) or
 * PhD Research (computePhdDashboardSnapshot), APFC has no existing engine that selects a short,
 * actionable "today" list — only lib/studyPlan.ts's much heavier capacity-aware scheduler, which
 * is a different concept (a full multi-day plan, not a short "what's due right now" snapshot) and
 * is out of scope for this tool per the data-integrity rule: this tool only surfaces what an
 * existing engine already computes in that shape. */
export const apfcStudyStateTool: JarvisTool<ApfcStudyStateInput, ApfcStudyStateData> = {
  id: 'apfc.study_state',
  name: 'APFC Study State',
  description: 'Due revision count and weak-topic count for the APFC workspace, from the existing revision queue and weak-topic engines.',
  workspaces: ['apfc'],
  access: 'read',
  run: async (input) => {
    try {
      const data = buildApfcStudyState(input);
      return okResult(`${data.dueRevisionCount} PYQ${data.dueRevisionCount === 1 ? '' : 's'} due for revision; ${data.weakTopicCount} weak topic${data.weakTopicCount === 1 ? '' : 's'}.`, data);
    } catch (err) {
      return errorResult('Failed to read APFC study state.', safeErrorMessage(err));
    }
  },
};

// ================================================================================================
// 2. upsc.study_state
// ================================================================================================

export type UpscStudyStateInput = UpscCseCommandCentreData & {
  today: string;
};

export interface UpscStudyStateItem {
  id: string;
  kind: UpscCseTodaysStudyItemKind;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export interface UpscStudyStateData {
  items: UpscStudyStateItem[];
  currentAffairsDueCount: number;
}

function buildUpscStudyState(input: UpscStudyStateInput): UpscStudyStateData {
  // Exactly pages/UpscCseDashboard.tsx's / lib/commandCentre.ts's own currentAffairsRevisionIds
  // derivation — ids already tracked in the revision queue, never every Current Affairs item.
  const currentAffairsRevisionIds = input.importedContent
    .filter((item) => item.contentType === 'current_affairs' && input.revisionQueue[item.id])
    .map((item) => item.id);

  const items = generateTodaysStudyItems({
    coverage: input.coverage,
    prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
    mainsTree: UPSC_CSE_MAINS_SYLLABUS,
    granularNodes: UPSC_CSE_GRANULAR_NODES,
    pyqBank: UPSC_CSE_PRELIMS_PYQ_BANK,
    attempts: input.attempts,
    bookmarkedPyqIds: input.bookmarkedPyqIds,
    revisionQueue: input.revisionQueue,
    currentAffairsRevisionIds,
    today: input.today,
  });

  return {
    items,
    currentAffairsDueCount: items.filter((item) => item.kind === 'current_affairs_revision').length,
  };
}

export const upscStudyStateTool: JarvisTool<UpscStudyStateInput, UpscStudyStateData> = {
  id: 'upsc.study_state',
  name: 'UPSC CSE Study State',
  description: "Today's Study items for the UPSC CSE workspace, exactly as generateTodaysStudyItems already computes them.",
  workspaces: ['upsc'],
  access: 'read',
  run: async (input) => {
    try {
      const data = buildUpscStudyState(input);
      return okResult(`${data.items.length} Today's Study item${data.items.length === 1 ? '' : 's'}, ${data.currentAffairsDueCount} Current Affairs due for revision.`, data);
    } catch (err) {
      return errorResult('Failed to read UPSC CSE study state.', safeErrorMessage(err));
    }
  },
};

// ================================================================================================
// 3. upsc.current_affairs_revision
// ================================================================================================

export interface UpscCurrentAffairsRevisionInput {
  importedContent: readonly ImportedContent[];
  revisionQueue: RevisionQueue;
  today: string;
}

export interface UpscCurrentAffairsDueItem {
  id: string;
  title: string;
  /** yyyy-mm-dd — only present when the user supplied one on import; never fabricated. */
  eventDate?: string;
  /** yyyy-mm-dd — this item's own due date in the revision queue (always <= today, since this is
   * the DUE list). */
  dueDate: string;
  /** Not resolved in this phase: Current Affairs items carry no syllabus-link metadata field today
   * (unlike PhD's metadata.topicAreaId) — see lib/contentImport.ts's ImportedContentMetadata.
   * Left undefined rather than guessed at; a future phase can populate this once such a field
   * exists. */
  syllabusLabel?: string;
}

export interface UpscCurrentAffairsRevisionData {
  dueItems: UpscCurrentAffairsDueItem[];
}

function buildUpscCurrentAffairsRevision(input: UpscCurrentAffairsRevisionInput): UpscCurrentAffairsRevisionData {
  const currentAffairsItems = input.importedContent.filter((item) => item.contentType === 'current_affairs');

  // Only ids already tracked in the revision queue are eligible — an id with no queue entry would
  // otherwise be synthesised as "due today" by getDueItems/getOrCreateItem, which would surface a
  // Current Affairs item the user never asked to revise (see lib/upscCseTodaysStudy.ts's own
  // documented rule for currentAffairsRevisionIds, reused here unchanged).
  const trackedIds = currentAffairsItems.filter((item) => Boolean(input.revisionQueue[item.id])).map((item) => item.id);
  const dueRevisionItems = getDueItems(input.revisionQueue, trackedIds, input.today);

  const contentById = new Map(currentAffairsItems.map((item) => [item.id, item]));
  const dueItems: UpscCurrentAffairsDueItem[] = dueRevisionItems
    .map((revisionItem): UpscCurrentAffairsDueItem | null => {
      const content = contentById.get(revisionItem.pyqId);
      if (!content) return null;
      return {
        id: content.id,
        title: content.title,
        eventDate: content.metadata?.eventDate,
        dueDate: revisionItem.dueDate,
      };
    })
    .filter((item): item is UpscCurrentAffairsDueItem => item !== null);

  return { dueItems };
}

export const upscCurrentAffairsRevisionTool: JarvisTool<UpscCurrentAffairsRevisionInput, UpscCurrentAffairsRevisionData> = {
  id: 'upsc.current_affairs_revision',
  name: 'UPSC CSE Current Affairs Due for Revision',
  description: 'The actual Current Affairs items currently due for revision, from the existing revision queue — never a bare count of all Current Affairs content.',
  workspaces: ['upsc'],
  access: 'read',
  run: async (input) => {
    try {
      const data = buildUpscCurrentAffairsRevision(input);
      return okResult(`${data.dueItems.length} Current Affairs item${data.dueItems.length === 1 ? '' : 's'} due for revision.`, data);
    } catch (err) {
      return errorResult('Failed to read Current Affairs revision state.', safeErrorMessage(err));
    }
  },
};

// ================================================================================================
// 4. phd.research_state
// ================================================================================================

export type PhdResearchStateInput = PhdCommandCentreData & {
  today: string;
};

export interface PhdResearchStateData {
  overdueMicroTargetCount: number;
  /** Days overdue for the single most-overdue target — null when nothing is overdue. */
  mostOverdueDays: number | null;
  researchDocumentReadingCounts: ReadingStatusCounts;
  bibliographyReadingCounts: ReadingStatusCounts;
  /** unread + reading, per lib/phdAnalytics.ts's own computePhdAnalytics — "still has something
   * left to do", not a re-derivation of that rule. */
  researchDocumentsToContinueCount: number;
  bibliographyToContinueCount: number;
}

function buildPhdResearchState(input: PhdResearchStateInput): PhdResearchStateData {
  const dashboard = computePhdDashboardSnapshot({
    researchStartDate: input.researchStartDate,
    topicAreas: input.topicAreas,
    microTargets: input.microTargets,
    importedContent: input.importedContent,
    today: input.today,
  });

  const analytics = computePhdAnalytics({
    researchStartDate: input.researchStartDate,
    topicAreas: input.topicAreas,
    microTargets: input.microTargets,
    importedContent: input.importedContent,
    notesCount: input.notesCount,
    today: input.today,
  });

  // overdueMicroTargets only ever returns targets that DO have a targetDate (see lib/microTarget.ts
  // — "a target with no date is never treated as overdue"), so this non-null assertion matches the
  // one lib/commandCentre.ts's own buildPhdItems already makes for the identical computation.
  const overdueDays = dashboard.overdueTargets.map((t) => computeResearchDuration(t.targetDate!, input.today).totalDays);

  return {
    overdueMicroTargetCount: dashboard.overdueTargets.length,
    mostOverdueDays: overdueDays.length > 0 ? Math.max(...overdueDays) : null,
    researchDocumentReadingCounts: countByReadingStatus(input.importedContent.filter((c) => c.contentType === 'research_document')),
    bibliographyReadingCounts: countByReadingStatus(input.importedContent.filter((c) => c.contentType === 'bibliography')),
    researchDocumentsToContinueCount: analytics.researchDocumentsToContinueCount,
    bibliographyToContinueCount: analytics.bibliographyToContinueCount,
  };
}

export const phdResearchStateTool: JarvisTool<PhdResearchStateInput, PhdResearchStateData> = {
  id: 'phd.research_state',
  name: 'PhD Research State',
  description: 'Overdue micro-targets and reading-status counts for the PhD Research workspace, from the existing dashboard/analytics engines.',
  workspaces: ['phd'],
  access: 'read',
  run: async (input) => {
    try {
      const data = buildPhdResearchState(input);
      return okResult(`${data.overdueMicroTargetCount} overdue micro-target${data.overdueMicroTargetCount === 1 ? '' : 's'}.`, data);
    } catch (err) {
      return errorResult('Failed to read PhD research state.', safeErrorMessage(err));
    }
  },
};

// ================================================================================================
// 5. global.workspace_state
// ================================================================================================

export interface GlobalWorkspaceStateInput {
  activeWorkspaceId: WorkspaceKind;
}

export interface GlobalWorkspaceStateData {
  workspace: JarvisWorkspace;
  /** From lib/workspace.ts's own WorkspaceMeta — never a second, parallel label. */
  label: string;
}

export const globalWorkspaceStateTool: JarvisTool<GlobalWorkspaceStateInput, GlobalWorkspaceStateData> = {
  id: 'global.workspace_state',
  name: 'Active Workspace State',
  description: 'The currently active workspace, from the existing workspace registry.',
  workspaces: ['global'],
  access: 'read',
  run: async (input) => {
    try {
      const meta = getWorkspaceMeta(input.activeWorkspaceId);
      const data: GlobalWorkspaceStateData = { workspace: toJarvisWorkspace(input.activeWorkspaceId), label: meta.label };
      return okResult(`Active workspace: ${data.label}.`, data);
    } catch (err) {
      return errorResult('Failed to read active workspace state.', safeErrorMessage(err));
    }
  },
};

// ================================================================================================
// Registry helper
// ================================================================================================

/** Every built-in application tool this phase defines, in a fixed order — callers register these
 * into a Phase 1 JarvisToolRegistry themselves (see toolRegistry.ts's createToolRegistry); this
 * file never touches a registry directly, so it stays trivial to unit test standalone. */
export function createApplicationTools(): JarvisTool[] {
  return [apfcStudyStateTool, upscStudyStateTool, upscCurrentAffairsRevisionTool, phdResearchStateTool, globalWorkspaceStateTool];
}
