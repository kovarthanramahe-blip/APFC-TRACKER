import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import type { PYQAttempt } from './types';
import type { RevisionQueue } from './revisionQueue';
import { getOrCreateItem, getQueueCounts, MAX_BOX, type RevisionQueueCounts } from './revisionQueue';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './pyqFilters';
import { getLocalDateString } from './utils';

// Revision OS (Phase 17) — a thin, pure AGGREGATION layer over the EXISTING revision engine, the
// same discipline lib/commandCentre.ts and lib/commandCentreHome.ts already established: every
// number here comes from lib/revisionQueue.ts (scheduling) + lib/pyqFilters.ts (eligibility) —
// nothing here recomputes scheduling or invents a second eligibility rule. Subject/topic context
// is resolved from PYQ_BANK's own `topicId` (a real foreign key — see lib/types.ts's
// PracticeQuestion) against SYLLABUS, the same lookup pages/Syllabus.tsx already performs for its
// own topic-level display — never a new content model. No store access: the caller (pages/
// Revision.tsx, lib/commandCentreHome.ts) resolves live-or-archived data exactly like every other
// Command Centre-era module already does.
//
// Scope — APFC only, same precedent as pages/Dashboard.tsx: PYQ_BANK is explicitly APFC-only data
// (confirmed in lib/revisionOS.test.ts and throughout this codebase's own prior sessions). UPSC
// CSE's own Current Affairs revision (lib/revisionQueue.ts is reused there too, over
// ImportedContent ids rather than PYQ ids) is NOT folded into this first Revision OS build — doing
// so honestly would need a parallel content-resolution path (ImportedContent, not PYQ_BANK) that
// has not been inspected/tested here; left out rather than guessed at.

export type RevisionBucketKey = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later';

export const REVISION_BUCKET_ORDER: readonly RevisionBucketKey[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later'];

export const REVISION_BUCKET_LABEL: Record<RevisionBucketKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  later: 'Later',
};

export interface RevisionOSItem {
  /** The PYQ's own id — see lib/revisionQueue.ts's own header for why the field is still named
   * `pyqId` on RevisionItem even when reused for non-PYQ content; this module is PYQ-only (see
   * this file's own header), so `id` here is always a real PYQ_BANK id. */
  id: string;
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
  /** yyyy-mm-dd — this item's next scheduled review date. */
  dueDate: string;
  /** 1-based Leitner box — see lib/revisionQueue.ts's own BOX_INTERVALS_DAYS. */
  box: number;
  /** Never reviewed yet (reviewCount === 0) — mirrors lib/revisionQueue.ts's own getQueueCounts
   * newCount definition exactly. */
  isNew: boolean;
  bucket: RevisionBucketKey;
}

export interface RevisionOSSnapshot {
  /** Every eligible item, sorted by due date ascending (overdue-first), then subject title —
   * deterministic, never randomised. */
  items: RevisionOSItem[];
  byBucket: Record<RevisionBucketKey, RevisionOSItem[]>;
  /** Reuses lib/revisionQueue.ts's own getQueueCounts verbatim — the SAME counts
   * pages/Dashboard.tsx's own revisionCounts and lib/commandCentreHome.ts already compute, never a
   * second tally. */
  counts: RevisionQueueCounts;
}

function addDaysToDateString(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

function classifyBucket(dueDate: string, today: string, tomorrow: string, weekEnd: string): RevisionBucketKey {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate === tomorrow) return 'tomorrow';
  if (dueDate <= weekEnd) return 'thisWeek';
  return 'later';
}

let topicLookupCache: Map<string, { subjectId: string; subjectTitle: string; topicTitle: string }> | null = null;
function topicLookup(): Map<string, { subjectId: string; subjectTitle: string; topicTitle: string }> {
  if (topicLookupCache) return topicLookupCache;
  const map = new Map<string, { subjectId: string; subjectTitle: string; topicTitle: string }>();
  for (const subject of SYLLABUS) {
    for (const topic of subject.topics) {
      map.set(topic.id, { subjectId: subject.id, subjectTitle: subject.title, topicTitle: topic.title });
    }
  }
  topicLookupCache = map;
  return map;
}

let pyqLookupCache: Map<string, (typeof PYQ_BANK)[number]> | null = null;
function pyqLookup(): Map<string, (typeof PYQ_BANK)[number]> {
  if (pyqLookupCache) return pyqLookupCache;
  pyqLookupCache = new Map(PYQ_BANK.map((q) => [q.id, q]));
  return pyqLookupCache;
}

/**
 * Builds Revision OS's full snapshot: every APFC PYQ currently eligible for revision (bookmarked
 * or ever answered incorrectly — lib/pyqFilters's computeEligibleRevisionIds, the SAME rule
 * pages/Dashboard.tsx's own "Due for Revision" card and lib/commandCentre.ts's "Up Next" item
 * already use), each enriched with its real subject/topic (via PYQ_BANK's own topicId) and
 * bucketed by due date. An eligible id with no matching PYQ_BANK entry (should not happen with
 * real data) is silently skipped rather than rendered with fabricated context.
 */
export function computeRevisionOSSnapshot(pyqAttempts: readonly PYQAttempt[], bookmarkedPyqIds: readonly string[], queue: RevisionQueue, today: string): RevisionOSSnapshot {
  const statusMap = computeRevisionStatusMap(PYQ_BANK, [...pyqAttempts]);
  const eligibleIds = computeEligibleRevisionIds(PYQ_BANK, statusMap, [...bookmarkedPyqIds]);
  const tomorrow = addDaysToDateString(today, 1);
  const weekEnd = addDaysToDateString(today, 7);
  const topics = topicLookup();
  const pyqs = pyqLookup();

  const items: RevisionOSItem[] = [];
  for (const id of eligibleIds) {
    const pyq = pyqs.get(id);
    const topic = pyq ? topics.get(pyq.topicId) : undefined;
    if (!pyq || !topic) continue;
    const revisionItem = getOrCreateItem(queue, id, today);
    items.push({
      id,
      subjectId: topic.subjectId,
      subjectTitle: topic.subjectTitle,
      topicId: pyq.topicId,
      topicTitle: topic.topicTitle,
      dueDate: revisionItem.dueDate,
      box: revisionItem.box,
      isNew: revisionItem.reviewCount === 0,
      bucket: classifyBucket(revisionItem.dueDate, today, tomorrow, weekEnd),
    });
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.subjectTitle.localeCompare(b.subjectTitle));

  const byBucket: Record<RevisionBucketKey, RevisionOSItem[]> = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  for (const item of items) byBucket[item.bucket].push(item);

  return { items, byBucket, counts: getQueueCounts(queue, eligibleIds, today) };
}

/** Mastered items are capped at MAX_BOX — re-exported here so callers (pages/Revision.tsx) don't
 * need their own import from lib/revisionQueue.ts just for this one constant. */
export { MAX_BOX };
