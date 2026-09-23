import { computeResearchDuration, type ResearchDuration } from './phdResearch';
import type { PhdTopicArea } from './phdTopicArea';
import { activeMicroTargets, overdueMicroTargets, upcomingMicroTargets, recentlyCompletedMicroTargets, type MicroTarget } from './microTarget';
import type { ImportedContent } from './contentImport';

// PhD Research Dashboard — pure aggregation only, exactly like lib/upscCseDashboard.ts's own
// discipline: every field here is composed from an already-tested engine (lib/phdResearch.ts's
// computeResearchDuration, lib/microTarget.ts's active/overdue/upcoming/recently-completed
// selectors) — nothing here recomputes duration math or target status itself. "Recent activity" is
// built ONLY from genuinely timestamped records (a micro-target's real completedAt, an imported
// document's real provenance.importedAt) — never a fabricated activity feed.

export interface PhdDashboardSnapshot {
  researchStartDate: string;
  duration: ResearchDuration;
  topicAreaCount: number;
  activeTargets: MicroTarget[];
  overdueTargets: MicroTarget[];
  upcomingTargets: MicroTarget[];
  recentlyCompletedTargets: MicroTarget[];
  recentlyImportedContent: ImportedContent[];
}

export interface ComputePhdDashboardSnapshotInput {
  researchStartDate: string;
  topicAreas: readonly PhdTopicArea[];
  microTargets: readonly MicroTarget[];
  importedContent: readonly ImportedContent[];
  /** yyyy-mm-dd, local date — supplied by the caller, never computed internally. */
  today: string;
  /** How many upcoming/recently-completed/recently-imported items to surface — default 5. */
  recentLimit?: number;
}

export function computePhdDashboardSnapshot(input: ComputePhdDashboardSnapshotInput): PhdDashboardSnapshot {
  const recentLimit = input.recentLimit ?? 5;

  const recentlyImportedContent = [...input.importedContent]
    .filter((c) => c.contentType === 'research_document' || c.contentType === 'bibliography')
    .sort((a, b) => new Date(b.provenance.importedAt).getTime() - new Date(a.provenance.importedAt).getTime())
    .slice(0, recentLimit);

  return {
    researchStartDate: input.researchStartDate,
    duration: computeResearchDuration(input.researchStartDate, input.today),
    topicAreaCount: input.topicAreas.length,
    activeTargets: activeMicroTargets(input.microTargets),
    overdueTargets: overdueMicroTargets(input.microTargets, input.today),
    upcomingTargets: upcomingMicroTargets(input.microTargets, input.today, recentLimit),
    recentlyCompletedTargets: recentlyCompletedMicroTargets(input.microTargets, recentLimit),
    recentlyImportedContent,
  };
}
