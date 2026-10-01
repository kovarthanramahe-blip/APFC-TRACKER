// Pure spaced-repetition scheduling, originally built for PYQ practice and keyed by PYQ id, now
// reused as-is (Current Affairs Repository revision) for any string content id — ImportedContent
// ids included. Stores ONLY scheduling metadata (box/dueDate/lastReviewedDate/reviewCount) — never
// the reviewed content itself; the caller's own data (PYQ_BANK for a PYQ, lib/contentImport.ts's
// ImportedContent for a Current Affairs item) remains the single source of truth for what was
// actually reviewed. Deterministic and side-effect free: no Date.now() anywhere in here — "today"
// is always supplied by the caller as a yyyy-mm-dd string, via the app's existing local-date
// convention (see lib/utils's getLocalDateString) — never UTC's toISOString().slice(0, 10).
//
// The RevisionItem.pyqId field name (and the RevisionQueue's own id-keying) is kept as-is even
// though it is used for non-PYQ ids too — renaming it would change the shape of every persisted
// RevisionItem (localStorage + cloud sync), which is unnecessary just to use a different id space:
// nothing here ever reads `pyqId` as anything other than an opaque string id. Function PARAMETER
// names below use the more accurate `itemId`.
import { getLocalDateString } from './utils';

export interface RevisionItem {
  pyqId: string;
  /** 1-based Leitner box; higher = more confidently known. */
  box: number;
  /** yyyy-mm-dd — the next date this item should be reviewed. */
  dueDate: string;
  /** yyyy-mm-dd, or null if never reviewed. */
  lastReviewedDate: string | null;
  reviewCount: number;
}

/** Keyed by itemId (a PYQ id or any other content id, e.g. an ImportedContent id). An id absent
 * from the queue is treated as unseen (see getOrCreateItem) — callers never need to pre-seed every
 * known id up front. */
export type RevisionQueue = Record<string, RevisionItem>;

// Fixed, doubling per-box intervals in days — deterministic and documented rather than tunable.
// Box 1 (next-day) is the shortest/most frequent; each further box roughly doubles the gap, capping
// review load on well-known items while still resurfacing them occasionally.
export const BOX_INTERVALS_DAYS: readonly number[] = [1, 2, 4, 8, 16, 32];
export const MAX_BOX = BOX_INTERVALS_DAYS.length;

function intervalForBox(box: number): number {
  const clamped = Math.min(Math.max(box, 1), MAX_BOX);
  return BOX_INTERVALS_DAYS[clamped - 1];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/** An empty queue — the natural starting state before any PYQ has ever been scheduled. */
export function createRevisionQueue(): RevisionQueue {
  return {};
}

/** A brand-new item: unseen, due immediately (today), box 1, never reviewed. */
export function createInitialRevisionItem(itemId: string, today: string): RevisionItem {
  return { pyqId: itemId, box: 1, dueDate: today, lastReviewedDate: null, reviewCount: 0 };
}

/** The item for `itemId` if it's already tracked, or a fresh (immediately-due) one otherwise — never
 * mutates `queue`; a caller that wants the new item persisted must do so itself (e.g. via
 * recordCorrect/recordIncorrect/addItem, which all call this internally). */
export function getOrCreateItem(queue: RevisionQueue, itemId: string, today: string): RevisionItem {
  return queue[itemId] ?? createInitialRevisionItem(itemId, today);
}

/** Every item among `itemIds` that is due today or earlier — including ids not yet in `queue` at
 * all, since an unseen item is always immediately due. Does not mutate `queue`. */
export function getDueItems(queue: RevisionQueue, itemIds: string[], today: string): RevisionItem[] {
  return itemIds.map((id) => getOrCreateItem(queue, id, today)).filter((item) => item.dueDate <= today);
}

/** Correct -> advance one box (capped at MAX_BOX) and reschedule further out. Returns a NEW queue;
 * `queue` itself is never mutated. */
export function recordCorrect(queue: RevisionQueue, itemId: string, today: string): RevisionQueue {
  const current = getOrCreateItem(queue, itemId, today);
  const box = Math.min(current.box + 1, MAX_BOX);
  const updated: RevisionItem = { pyqId: itemId, box, dueDate: addDays(today, intervalForBox(box)), lastReviewedDate: today, reviewCount: current.reviewCount + 1 };
  return { ...queue, [itemId]: updated };
}

/** Incorrect -> reset to box 1 and reschedule for the box-1 interval. Returns a NEW queue; `queue`
 * itself is never mutated. */
export function recordIncorrect(queue: RevisionQueue, itemId: string, today: string): RevisionQueue {
  const current = getOrCreateItem(queue, itemId, today);
  const updated: RevisionItem = { pyqId: itemId, box: 1, dueDate: addDays(today, intervalForBox(1)), lastReviewedDate: today, reviewCount: current.reviewCount + 1 };
  return { ...queue, [itemId]: updated };
}

/**
 * Explicitly adds `itemId` to the queue as a fresh (immediately due, box 1, unreviewed) entry —
 * the one case recordCorrect/recordIncorrect don't cover: tracking an item BEFORE it has ever been
 * reviewed. PYQ eligibility is derived externally (bookmarked ids + incorrect-attempt ids — see
 * lib/pyqFilters.ts's computeEligibleRevisionIds) and a queue entry is only ever persisted once a
 * review happens, but content with no "attempt" of its own (e.g. a Current Affairs Repository
 * item, which is read, not answered) needs an explicit "add to revision" action instead. Idempotent:
 * an itemId already present in `queue` is returned completely unchanged (same reference) — adding
 * the same item twice never resets its progress or creates a duplicate record. Does not mutate
 * `queue`.
 */
export function addItem(queue: RevisionQueue, itemId: string, today: string): RevisionQueue {
  if (queue[itemId]) return queue;
  return { ...queue, [itemId]: createInitialRevisionItem(itemId, today) };
}

export interface RevisionQueueCounts {
  /** How many of the given pyqIds are being considered (tracked or not). */
  totalTracked: number;
  dueCount: number;
  /** Never reviewed (reviewCount === 0), among the given pyqIds — includes unseen/untracked ids. */
  newCount: number;
  /** At MAX_BOX — the most confidently known. */
  masteredCount: number;
}

/** Summary counts over `pyqIds` (e.g. a student's weak/bookmarked set) as of `today`. Does not
 * mutate `queue`. */
export function getQueueCounts(queue: RevisionQueue, pyqIds: string[], today: string): RevisionQueueCounts {
  const items = pyqIds.map((id) => getOrCreateItem(queue, id, today));
  return {
    totalTracked: items.length,
    dueCount: items.filter((i) => i.dueDate <= today).length,
    newCount: items.filter((i) => i.reviewCount === 0).length,
    masteredCount: items.filter((i) => i.box >= MAX_BOX).length,
  };
}
