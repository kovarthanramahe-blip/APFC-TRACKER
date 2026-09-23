import { computeResearchDuration, type ResearchDuration } from './phdResearch';
import type { PhdTopicArea } from './phdTopicArea';
import { countMicroTargetsByStatus, overdueMicroTargets, upcomingMicroTargets, type MicroTarget, type MicroTargetCounts } from './microTarget';
import type { ImportedContent, ImportedContentType } from './contentImport';

// PhD Research Analytics — pure aggregation only, same discipline as lib/phdDashboard.ts: every
// number here is composed from an already-existing, already-tested engine (computeResearchDuration,
// countMicroTargetsByStatus, overdue/upcomingMicroTargets) or a direct, honest count of real
// records. Nothing here fabricates hours worked, pages read, papers completed, a productivity
// score, or a research-progress percentage — there is no real signal in this app for any of those,
// so none of them appear anywhere in this snapshot.

export interface TopicAreaAnalytics {
  topicArea: PhdTopicArea;
  linkedContentCount: number;
  activeTargetCount: number;
  completedTargetCount: number;
  overdueTargetCount: number;
}

export interface MaterialCounts {
  researchDocuments: number;
  bibliographyRecords: number;
  notes: number;
  otherImportedContent: number;
}

export interface ActivityDay {
  /** yyyy-mm-dd */
  date: string;
  completedTargets: number;
  importedContent: number;
}

export interface PhdAnalyticsSnapshot {
  researchStartDate: string;
  duration: ResearchDuration;
  topicAreaCount: number;
  topicAreas: TopicAreaAnalytics[];
  materialCounts: MaterialCounts;
  microTargetCounts: MicroTargetCounts;
  overdueTargetCount: number;
  upcomingTargetCount: number;
  /** 0-100; 0 when there are no targets at all (never divides by zero). */
  completionRatePct: number;
  /** Real activity grouped by calendar day, from actual completedAt/provenance.importedAt
   * timestamps only — sorted most-recent-first. */
  activityByDate: ActivityDay[];
}

export interface ComputePhdAnalyticsInput {
  researchStartDate: string;
  topicAreas: readonly PhdTopicArea[];
  microTargets: readonly MicroTarget[];
  importedContent: readonly ImportedContent[];
  notesCount: number;
  /** yyyy-mm-dd, local date — supplied by the caller, never computed internally. */
  today: string;
}

const RESEARCH_CONTENT_TYPES: ReadonlySet<ImportedContentType> = new Set(['research_document', 'bibliography']);

export function computePhdAnalytics(input: ComputePhdAnalyticsInput): PhdAnalyticsSnapshot {
  const topicAreas: TopicAreaAnalytics[] = input.topicAreas.map((area) => {
    const linkedContentCount = input.importedContent.filter((c) => c.metadata?.topicAreaId === area.id).length;
    const areaTargets = input.microTargets.filter((t) => t.contextId === area.id);
    return {
      topicArea: area,
      linkedContentCount,
      activeTargetCount: areaTargets.filter((t) => t.status !== 'completed').length,
      completedTargetCount: areaTargets.filter((t) => t.status === 'completed').length,
      overdueTargetCount: overdueMicroTargets(areaTargets, input.today).length,
    };
  });

  const researchDocuments = input.importedContent.filter((c) => c.contentType === 'research_document').length;
  const bibliographyRecords = input.importedContent.filter((c) => c.contentType === 'bibliography').length;
  const otherImportedContent = input.importedContent.filter((c) => !RESEARCH_CONTENT_TYPES.has(c.contentType) && c.contentType !== 'note').length;

  const microTargetCounts = countMicroTargetsByStatus(input.microTargets);
  const totalTargets = microTargetCounts.pending + microTargetCounts.in_progress + microTargetCounts.completed;
  const completionRatePct = totalTargets > 0 ? Math.round((microTargetCounts.completed / totalTargets) * 100) : 0;

  const activityMap = new Map<string, ActivityDay>();
  function bump(date: string, field: 'completedTargets' | 'importedContent') {
    const entry = activityMap.get(date) ?? { date, completedTargets: 0, importedContent: 0 };
    entry[field] += 1;
    activityMap.set(date, entry);
  }
  for (const t of input.microTargets) {
    if (t.status === 'completed' && t.completedAt) bump(t.completedAt.slice(0, 10), 'completedTargets');
  }
  for (const c of input.importedContent) {
    bump(c.provenance.importedAt.slice(0, 10), 'importedContent');
  }
  const activityByDate = [...activityMap.values()].sort((a, b) => b.date.localeCompare(a.date));

  return {
    researchStartDate: input.researchStartDate,
    duration: computeResearchDuration(input.researchStartDate, input.today),
    topicAreaCount: input.topicAreas.length,
    topicAreas,
    materialCounts: { researchDocuments, bibliographyRecords, notes: input.notesCount, otherImportedContent },
    microTargetCounts,
    overdueTargetCount: overdueMicroTargets(input.microTargets, input.today).length,
    upcomingTargetCount: upcomingMicroTargets(input.microTargets, input.today).length,
    completionRatePct,
    activityByDate,
  };
}
