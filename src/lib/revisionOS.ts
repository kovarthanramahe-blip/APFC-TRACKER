import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import type { PYQAttempt } from './types';
import type { RevisionQueue } from './revisionQueue';
import { getOrCreateItem, getQueueCounts, MAX_BOX, type RevisionQueueCounts } from './revisionQueue';
import { computeRevisionStatusMap, computeEligibleRevisionIds } from './pyqFilters';
import { getLocalDateString } from './utils';
import type { Annotation, RenderMode } from './annotations';
import { previewTextFor } from './annotationIndex';
import { canBridgeAnnotationToRevision, revisionQueueKeyForAnnotation } from './annotationRevisionBridge';

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
//
// Wave 4A acceptance audit (approved, 2nd round) — annotation-derived Revision Queue entries
// (lib/annotationRevisionBridge.ts's `annotation:<id>` keys) are now ALSO surfaced here, as a
// clearly SEPARATE, explicitly-discriminated item kind (RevisionOSItem's own `source` field) —
// never merged into or confused with a PYQ item. An annotation never has a curated PYQ_BANK
// record, so it is never looked up there; its own real fields (documentId, renderMode, page
// number, a preview of its own real text via lib/annotationIndex.ts's existing previewTextFor)
// are used instead, never a fabricated subject/topic. This is additive only: `annotations` is a
// new, OPTIONAL parameter on computeRevisionOSSnapshot (defaults to `[]`) — every existing call
// site with the original 4 positional arguments is byte-for-byte unaffected (see this file's own
// test suite for the proof), and the PYQ item shape/ids/ordering are completely untouched.

export type RevisionBucketKey = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later';

export const REVISION_BUCKET_ORDER: readonly RevisionBucketKey[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later'];

export const REVISION_BUCKET_LABEL: Record<RevisionBucketKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  later: 'Later',
};

interface RevisionOSItemCommon {
  /** yyyy-mm-dd — this item's next scheduled review date. */
  dueDate: string;
  /** 1-based Leitner box — see lib/revisionQueue.ts's own BOX_INTERVALS_DAYS. */
  box: number;
  /** Never reviewed yet (reviewCount === 0) — mirrors lib/revisionQueue.ts's own getQueueCounts
   * newCount definition exactly. */
  isNew: boolean;
  bucket: RevisionBucketKey;
  /** Internal sort tiebreaker only (subject title for a PYQ, preview text for an annotation) —
   * never rendered on its own. */
  sortLabel: string;
}

export interface PyqRevisionOSItem extends RevisionOSItemCommon {
  source: 'pyq';
  /** The PYQ's own id — see lib/revisionQueue.ts's own header for why the field is still named
   * `pyqId` on RevisionItem even when reused for non-PYQ content. */
  id: string;
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
}

export interface AnnotationRevisionOSItem extends RevisionOSItemCommon {
  source: 'annotation';
  /** The REAL, namespaced RevisionQueue key (lib/annotationRevisionBridge.ts's own
   * `annotation:<id>` scheme) — preserved exactly as the bridge created it, never stripped or
   * reinterpreted; this is what review actions (Mark Reviewed) must key off. */
  id: string;
  /** The underlying annotation's own id (same as `id` with its "annotation:" prefix removed) —
   * kept explicit so a caller never has to re-parse `id` itself to recover it. */
  annotationId: string;
  /** The real source document's compound key (`${entityType}:${entityId}` — see
   * lib/annotations.ts's own AnnotationBase.documentId) — lets a caller navigate back to the
   * actual Repository entry, never a fabricated reference. */
  documentId: string;
  renderMode: RenderMode;
  /** Always DEFAULT_PAGE_NUMBER today — the SAME honest, pre-existing limitation
   * lib/annotations.ts's own AnnotationBase.pageNumber already discloses (no real page concept in
   * the current reading surface); never presented as a real page boundary. */
  pageNumber: number;
  /** A short preview of the annotation's own real text — lib/annotationIndex.ts's existing,
   * already-tested previewTextFor, reused verbatim rather than a new text-derivation heuristic. */
  preview: string;
}

export type RevisionOSItem = PyqRevisionOSItem | AnnotationRevisionOSItem;

export interface RevisionOSSnapshot {
  /** Every eligible PYQ item PLUS every bridged annotation item, sorted by due date ascending
   * (overdue-first), then `sortLabel` — deterministic, never randomised. Discriminate on
   * `item.source` ('pyq' | 'annotation') before reading any kind-specific field. */
  items: RevisionOSItem[];
  byBucket: Record<RevisionBucketKey, RevisionOSItem[]>;
  /** Reuses lib/revisionQueue.ts's own getQueueCounts verbatim, scoped to PYQ ids only (unchanged
   * meaning from before this phase) — the SAME counts pages/Dashboard.tsx's own revisionCounts and
   * lib/commandCentreHome.ts already compute, never a second tally. Annotation items are counted
   * in `items`/`byBucket` (so the bucket-based stat cards already reflect them) but deliberately
   * left out of this PYQ-specific tally, which pages/Revision.tsx's own "Mastered" stat card reads
   * as a statement about curated PYQ mastery specifically. */
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
 *
 * `annotations` (optional, defaults to `[]`) additionally surfaces every annotation that is BOTH
 * tagged 'revision' AND has already been explicitly bridged into `queue` (lib/
 * annotationRevisionBridge.ts's own addAnnotationToRevisionQueue — tagging alone is never enough;
 * this mirrors that module's own "explicit, not automatic" rule). Driven by the REAL `annotations`
 * array, never by pattern-matching `queue`'s own keys — an annotation whose source record has
 * since been deleted (or was never actually bridged, just tagged) is therefore never rendered,
 * never crashes, and never fabricates a stand-in for missing content, exactly like the existing
 * PYQ "no matching PYQ_BANK entry" case above.
 */
export function computeRevisionOSSnapshot(
  pyqAttempts: readonly PYQAttempt[],
  bookmarkedPyqIds: readonly string[],
  queue: RevisionQueue,
  today: string,
  annotations: readonly Annotation[] = [],
): RevisionOSSnapshot {
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
      source: 'pyq',
      id,
      subjectId: topic.subjectId,
      subjectTitle: topic.subjectTitle,
      topicId: pyq.topicId,
      topicTitle: topic.topicTitle,
      dueDate: revisionItem.dueDate,
      box: revisionItem.box,
      isNew: revisionItem.reviewCount === 0,
      bucket: classifyBucket(revisionItem.dueDate, today, tomorrow, weekEnd),
      sortLabel: topic.subjectTitle,
    });
  }

  for (const annotation of annotations) {
    if (!canBridgeAnnotationToRevision(annotation)) continue;
    const key = revisionQueueKeyForAnnotation(annotation.id);
    const revisionItem = queue[key];
    if (!revisionItem) continue; // tagged but never explicitly bridged — not a queue entry yet
    const preview = previewTextFor(annotation);
    items.push({
      source: 'annotation',
      id: key,
      annotationId: annotation.id,
      documentId: annotation.documentId,
      renderMode: annotation.renderMode,
      pageNumber: annotation.pageNumber,
      preview,
      dueDate: revisionItem.dueDate,
      box: revisionItem.box,
      isNew: revisionItem.reviewCount === 0,
      bucket: classifyBucket(revisionItem.dueDate, today, tomorrow, weekEnd),
      sortLabel: preview,
    });
  }

  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sortLabel.localeCompare(b.sortLabel));

  const byBucket: Record<RevisionBucketKey, RevisionOSItem[]> = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  for (const item of items) byBucket[item.bucket].push(item);

  return { items, byBucket, counts: getQueueCounts(queue, eligibleIds, today) };
}

/** Mastered items are capped at MAX_BOX — re-exported here so callers (pages/Revision.tsx) don't
 * need their own import from lib/revisionQueue.ts just for this one constant. */
export { MAX_BOX };
