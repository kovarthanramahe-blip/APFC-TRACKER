// Pure spaced-repetition scheduling for PYQ practice, keyed by PYQ id. Stores ONLY scheduling
// metadata (box/dueDate/lastReviewedDate/reviewCount) — never question content itself; PYQ_BANK
// (data/pyq.ts, untouched) remains the single source of truth for what a question actually is.
// Deterministic and side-effect free: no Date.now() anywhere in here — "today" is always supplied
// by the caller as a yyyy-mm-dd string, via the app's existing local-date convention (see
// lib/utils's getLocalDateString) — never UTC's toISOString().slice(0, 10). No store fields or UI
// are wired up yet; this is the pure engine only.
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

/** Keyed by pyqId. An id absent from the queue is treated as unseen (see getOrCreateItem) —
 * callers never need to pre-seed every known PYQ id up front. */
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
export function createInitialRevisionItem(pyqId: string, today: string): RevisionItem {
  return { pyqId, box: 1, dueDate: today, lastReviewedDate: null, reviewCount: 0 };
}

/** The item for `pyqId` if it's already tracked, or a fresh (immediately-due) one otherwise — never
 * mutates `queue`; a caller that wants the new item persisted must do so itself (e.g. via
 * recordCorrect/recordIncorrect, which both call this internally). */
export function getOrCreateItem(queue: RevisionQueue, pyqId: string, today: string): RevisionItem {
  return queue[pyqId] ?? createInitialRevisionItem(pyqId, today);
}

/** Every item among `pyqIds` that is due today or earlier — including ids not yet in `queue` at
 * all, since an unseen item is always immediately due. Does not mutate `queue`. */
export function getDueItems(queue: RevisionQueue, pyqIds: string[], today: string): RevisionItem[] {
  return pyqIds.map((id) => getOrCreateItem(queue, id, today)).filter((item) => item.dueDate <= today);
}

/** Correct -> advance one box (capped at MAX_BOX) and reschedule further out. Returns a NEW queue;
 * `queue` itself is never mutated. */
export function recordCorrect(queue: RevisionQueue, pyqId: string, today: string): RevisionQueue {
  const current = getOrCreateItem(queue, pyqId, today);
  const box = Math.min(current.box + 1, MAX_BOX);
  const updated: RevisionItem = { pyqId, box, dueDate: addDays(today, intervalForBox(box)), lastReviewedDate: today, reviewCount: current.reviewCount + 1 };
  return { ...queue, [pyqId]: updated };
}

/** Incorrect -> reset to box 1 and reschedule for the box-1 interval. Returns a NEW queue; `queue`
 * itself is never mutated. */
export function recordIncorrect(queue: RevisionQueue, pyqId: string, today: string): RevisionQueue {
  const current = getOrCreateItem(queue, pyqId, today);
  const updated: RevisionItem = { pyqId, box: 1, dueDate: addDays(today, intervalForBox(1)), lastReviewedDate: today, reviewCount: current.reviewCount + 1 };
  return { ...queue, [pyqId]: updated };
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
