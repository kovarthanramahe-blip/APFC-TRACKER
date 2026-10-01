import type { ImportedContent } from './contentImport';

// PhD Research Intelligence (Phase 7) — reading/review progression for research material
// (bibliography sources and research_document chapters). Inspection of the existing PhD workspace
// (lib/phdKnowledgeTree.ts's Author -> Source -> Chapters grouping, lib/microTarget.ts's
// pending/in_progress/completed TASK status, lib/phdAnalytics.ts/phdDashboard.ts) found no
// equivalent signal for the MATERIAL itself: a MicroTarget tracks a user-authored todo, not whether
// a given source has actually been read — the two are independent (a source can be fully read with
// no micro-target ever created for it, or a micro-target can be completed/deleted without that
// telling you anything about the source's own reading state). This module fills exactly that gap,
// reusing the EXISTING ImportedContent.metadata mechanism (see contentImport.ts's own
// ImportedContentMetadata.readingStatus doc comment) rather than a new entity or relationship type —
// the same pattern topicAreaId/apfcTopicId/syllabusNodeId already established for "one more optional
// classification on an existing content item".
//
// Four stages, chosen to mirror the real literature-review workflow (not a generic done/not-done
// boolean): unread -> reading -> read -> reviewed (synthesised/cited, not just finished). Never a
// progress PERCENTAGE — only an honest, user-set stage per item.

export const READING_STATUSES = ['unread', 'reading', 'read', 'reviewed'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  read: 'Read',
  reviewed: 'Reviewed',
};

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return typeof value === 'string' && (READING_STATUSES as readonly string[]).includes(value);
}

/** `item.metadata?.readingStatus`, defaulting to 'unread' for any item with no status set yet
 * (every pre-existing record, before this field existed) — never a special-cased empty state. */
export function getReadingStatus(item: ImportedContent): ReadingStatus {
  const raw = item.metadata?.readingStatus;
  return isReadingStatus(raw) ? raw : 'unread';
}

export interface ReadingStatusCounts {
  unread: number;
  reading: number;
  read: number;
  reviewed: number;
}

/** Deterministic counts over any ImportedContent collection — used to show "X of Y read" without
 * a second pass over the items at render time. An item with no status counts as 'unread', matching
 * getReadingStatus's own default exactly. */
export function countByReadingStatus(items: readonly ImportedContent[]): ReadingStatusCounts {
  const counts: ReadingStatusCounts = { unread: 0, reading: 0, read: 0, reviewed: 0 };
  for (const item of items) counts[getReadingStatus(item)] += 1;
  return counts;
}
