import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import type { PYQAttempt } from './types';
import type { ImportedContent } from './contentImport';
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
// Scope — computeRevisionOSSnapshot (APFC PYQ revision) stays APFC-only, same precedent as
// pages/Dashboard.tsx: PYQ_BANK is explicitly APFC-only data (confirmed in lib/revisionOS.test.ts
// and throughout this codebase's own prior sessions). This file is untouched for APFC by the P1.5
// addition below.
//
// Wave 4A acceptance audit (approved, 2nd round) — annotation-derived Revision Queue entries
// (lib/annotationRevisionBridge.ts's `annotation:<id>` keys) are now ALSO surfaced in
// computeRevisionOSSnapshot, as a clearly SEPARATE, explicitly-discriminated item kind
// (RevisionOSItem's own `source` field) — never merged into or confused with a PYQ item. An
// annotation never has a curated PYQ_BANK record, so it is never looked up there; its own real
// fields (documentId, renderMode, page number, a preview of its own real text via
// lib/annotationIndex.ts's existing previewTextFor) are used instead, never a fabricated
// subject/topic. This is additive only: `annotations` is a new, OPTIONAL parameter on
// computeRevisionOSSnapshot (defaults to `[]`) — every existing call site with the original 4
// positional arguments is byte-for-byte unaffected (see this file's own test suite for the proof),
// and the PYQ item shape/ids/ordering are completely untouched.
//
// P1.5 — UPSC CSE's own Current Affairs revision (lib/revisionQueue.ts is reused there too, over
// ImportedContent ids rather than PYQ ids — see RepositoryDetail.tsx's own "Add to Revision"
// button, the only existing writer) now has its OWN parallel content-resolution path,
// computeCseCurrentAffairsRevisionSnapshot below: it resolves eligible ids against ImportedContent
// (never PYQ_BANK), mirroring computeRevisionOSSnapshot's own bucket/sort/counts discipline exactly
// via the same shared classifyBucket/addDaysToDateString helpers, but with its own item shape (a
// current-affairs article has a title/source/eventDate, not a subject/topic). PhD research is
// deliberately NOT given an equivalent here — it has no syllabus/taxonomy to revise against (see
// lib/knowledgeClassification.ts's taxonomyForWorkspace), and this file does not invent one.

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
  /** P2.6 — see countReviewedToday's own header below. Scoped to this snapshot's own eligible ids
   * only (never a raw scan of `queue`), so it can never count an unrelated/ineligible entry. */
  reviewedTodayCount: number;
  /** P2.6 — see countNeedsAnotherLook's own header below. Same eligible-ids scoping as above. */
  needsAnotherLookCount: number;
}

// P1.5 — exported so computeCseCurrentAffairsRevisionSnapshot below (and any future non-APFC
// revision surface) can reuse the exact same bucketing rule rather than a second, possibly-drifting
// copy of it. Pure/workspace-agnostic — nothing here was ever APFC-specific.
export function addDaysToDateString(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

export function classifyBucket(dueDate: string, today: string, tomorrow: string, weekEnd: string): RevisionBucketKey {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate === tomorrow) return 'tomorrow';
  if (dueDate <= weekEnd) return 'thisWeek';
  return 'later';
}

// P2.6 — Daily Revision Progress Statistics. Both helpers below are pure, read-only counts over
// ALREADY-PERSISTED lib/revisionQueue.ts fields (RevisionItem.lastReviewedDate/box/reviewCount) —
// no new schema field, no new store action, no change to revisionQueue.ts itself or the Leitner
// transitions it implements. Each takes the CALLER's own already-computed `eligibleIds` (the exact
// same list `getQueueCounts` is already called with in computeRevisionOSSnapshot/
// computeCseCurrentAffairsRevisionSnapshot below), so a queue entry that isn't part of that
// workspace's own revision snapshot — a stale/orphaned id, or another workspace's own entry
// (structurally impossible anyway, since RevisionQueue is swapped per-workspace — see store.ts's
// setActiveWorkspaceId) — can never be counted here either. getOrCreateItem is reused rather than a
// raw `queue[id]` read, so an eligible id not yet present in `queue` resolves to its honest default
// (lastReviewedDate: null, box: 1, reviewCount: 0) instead of throwing.

/**
 * How many eligible items were reviewed TODAY specifically — distinct from reviewCount's all-time
 * total (see pages/Analytics.tsx's "Total Reviews"). `lastReviewedDate` is set to the caller's
 * `today` by BOTH recordCorrect and recordIncorrect (lib/revisionQueue.ts) and ONLY by those two —
 * never by creation/addItem (which leaves it null) — so this never fabricates a "reviewed" signal
 * for an item that was merely added to the queue, or last reviewed on an earlier day.
 */
export function countReviewedToday(queue: RevisionQueue, eligibleIds: readonly string[], today: string): number {
  return eligibleIds.filter((id) => getOrCreateItem(queue, id, today).lastReviewedDate === today).length;
}

/**
 * How many eligible items' MOST RECENT review was incorrect, under the current Leitner
 * transitions (lib/revisionQueue.ts): recordCorrect always advances to `box >= 2` (box 1 is the
 * floor, +1 at minimum), while recordIncorrect is the ONLY transition that ever leaves/resets an
 * item at `box === 1` after it has been reviewed at least once (`reviewCount > 0`). A brand-new,
 * never-reviewed item is also `box === 1` but `reviewCount === 0` — excluded here, since it was
 * never actually gotten wrong (see RevisionOSItem.isNew for that separate, already-existing
 * signal). This is a provable reading of the existing transitions, never a fabricated "last
 * outcome" flag.
 */
export function countNeedsAnotherLook(queue: RevisionQueue, eligibleIds: readonly string[], today: string): number {
  return eligibleIds.filter((id) => {
    const item = getOrCreateItem(queue, id, today);
    return item.box === 1 && item.reviewCount > 0;
  }).length;
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

  return {
    items,
    byBucket,
    counts: getQueueCounts(queue, eligibleIds, today),
    reviewedTodayCount: countReviewedToday(queue, eligibleIds, today),
    needsAnotherLookCount: countNeedsAnotherLook(queue, eligibleIds, today),
  };
}

// ================================================================================================
// P1.5 — UPSC CSE Current Affairs revision. A completely separate item shape from RevisionOSItem
// above (a current-affairs article has a title/source/eventDate, never a subject/topic — it is not
// forced into APFC's syllabus-shaped fields), but reuses the exact same scheduling/bucketing engine.
// ================================================================================================

export interface CurrentAffairsRevisionItem {
  /** The ImportedContent item's own id — see lib/revisionQueue.ts's own header for why
   * RevisionItem's id field is still named `pyqId` even when reused for a non-PYQ id. */
  id: string;
  title: string;
  /** lib/contentImport.ts's ImportedContentMetadata.source — freeform, user-supplied, often absent. */
  source?: string;
  /** ImportedContentMetadata.eventDate (yyyy-mm-dd) — the article's own date, never the import date. */
  eventDate?: string;
  dueDate: string;
  box: number;
  isNew: boolean;
  bucket: RevisionBucketKey;
}

export interface CurrentAffairsRevisionSnapshot {
  items: CurrentAffairsRevisionItem[];
  byBucket: Record<RevisionBucketKey, CurrentAffairsRevisionItem[]>;
  counts: RevisionQueueCounts;
  /** P2.6 — see countReviewedToday's own header above. Scoped to this snapshot's own eligible ids
   * (CSE Current Affairs items only) — never a raw scan of `queue`. */
  reviewedTodayCount: number;
  /** P2.6 — see countNeedsAnotherLook's own header above. Same eligible-ids scoping as above. */
  needsAnotherLookCount: number;
}

/**
 * Builds the CSE Current Affairs revision snapshot. Eligibility is NOT derived from
 * bookmarked/incorrect-attempt ids (there is no "attempt" for a Current Affairs article, unlike a
 * PYQ) — it is simply every id already present as a key in `queue`, i.e. every item the user has
 * explicitly added via RepositoryDetail.tsx's own "Add to Revision" button, the ONLY writer. An id
 * in `queue` whose ImportedContent no longer exists, or whose contentType is not 'current_affairs'
 * (defensive — mirrors RepositoryDetail.tsx's own `isCurrentAffairs` gate exactly, in case the
 * shared queue is ever reused for another content type later), is silently skipped rather than
 * rendered with fabricated context — the same "never fabricate" discipline
 * computeRevisionOSSnapshot already follows for a PYQ_BANK miss above. `importedContent` is the
 * CALLER's already workspace-scoped slice (the live store state while upsc_cse is active) — this
 * function does no workspace filtering of its own, matching every other pure function in this
 * codebase that trusts its caller to pass an already-scoped collection.
 */
export function computeCseCurrentAffairsRevisionSnapshot(
  importedContent: readonly ImportedContent[],
  queue: RevisionQueue,
  today: string,
): CurrentAffairsRevisionSnapshot {
  const tomorrow = addDaysToDateString(today, 1);
  const weekEnd = addDaysToDateString(today, 7);
  const byId = new Map(importedContent.map((item) => [item.id, item]));

  const items: CurrentAffairsRevisionItem[] = [];
  for (const id of Object.keys(queue)) {
    const content = byId.get(id);
    if (!content || content.contentType !== 'current_affairs') continue;
    const revisionItem = getOrCreateItem(queue, id, today);
    items.push({
      id,
      title: content.title,
      source: content.metadata?.source,
      eventDate: content.metadata?.eventDate,
      dueDate: revisionItem.dueDate,
      box: revisionItem.box,
      isNew: revisionItem.reviewCount === 0,
      bucket: classifyBucket(revisionItem.dueDate, today, tomorrow, weekEnd),
    });
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

  const byBucket: Record<RevisionBucketKey, CurrentAffairsRevisionItem[]> = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  for (const item of items) byBucket[item.bucket].push(item);

  const eligibleIds = items.map((item) => item.id);
  return {
    items,
    byBucket,
    counts: getQueueCounts(queue, eligibleIds, today),
    reviewedTodayCount: countReviewedToday(queue, eligibleIds, today),
    needsAnotherLookCount: countNeedsAnotherLook(queue, eligibleIds, today),
  };
}

/** Mastered items are capped at MAX_BOX — re-exported here so callers (pages/Revision.tsx) don't
 * need their own import from lib/revisionQueue.ts just for this one constant. */
export { MAX_BOX };
