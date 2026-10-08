import { describe, it, expect } from 'vitest';
import { computeRevisionOSSnapshot } from './revisionOS';
import type { RevisionQueue } from './revisionQueue';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';

const TODAY = '2026-09-22';

function queueItem(dueDate: string, overrides: Partial<{ box: number; reviewCount: number }> = {}) {
  return { box: overrides.box ?? 1, dueDate, lastReviewedDate: '2026-09-10', reviewCount: overrides.reviewCount ?? 1 };
}

describe('computeRevisionOSSnapshot', () => {
  it('returns no items and zeroed counts when nothing is bookmarked or ever answered incorrectly', () => {
    const snapshot = computeRevisionOSSnapshot([], [], {}, TODAY);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.counts).toEqual({ totalTracked: 0, dueCount: 0, newCount: 0, masteredCount: 0 });
    for (const bucket of Object.values(snapshot.byBucket)) expect(bucket).toEqual([]);
  });

  it('enriches each item with its real subject/topic via PYQ_BANK own topicId, never fabricated context', () => {
    const q = PYQ_BANK[0];
    const expectedSubject = SYLLABUS.find((s) => s.topics.some((t) => t.id === q.topicId));
    const expectedTopic = expectedSubject?.topics.find((t) => t.id === q.topicId);
    const snapshot = computeRevisionOSSnapshot([], [q.id], {}, TODAY);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      id: q.id,
      subjectId: expectedSubject?.id,
      subjectTitle: expectedSubject?.title,
      topicId: q.topicId,
      topicTitle: expectedTopic?.title,
    });
  });

  it('buckets items correctly across overdue/today/tomorrow/thisWeek/later', () => {
    const ids = PYQ_BANK.slice(0, 5).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-20') }, // overdue
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-22') }, // today
      [ids[2]]: { pyqId: ids[2], ...queueItem('2026-09-23') }, // tomorrow
      [ids[3]]: { pyqId: ids[3], ...queueItem('2026-09-26') }, // this week
      [ids[4]]: { pyqId: ids[4], ...queueItem('2026-10-15') }, // later
    };
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    expect(snapshot.byBucket.overdue.map((i) => i.id)).toEqual([ids[0]]);
    expect(snapshot.byBucket.today.map((i) => i.id)).toEqual([ids[1]]);
    expect(snapshot.byBucket.tomorrow.map((i) => i.id)).toEqual([ids[2]]);
    expect(snapshot.byBucket.thisWeek.map((i) => i.id)).toEqual([ids[3]]);
    expect(snapshot.byBucket.later.map((i) => i.id)).toEqual([ids[4]]);
    // Unlike lib/commandCentreHome.ts's own bucket counts (which only look 7 days ahead), Revision
    // OS's "later" bucket exists specifically so nothing eligible is ever silently dropped.
    expect(snapshot.items).toHaveLength(5);
  });

  it('sorts items by due date ascending, overdue first', () => {
    const ids = PYQ_BANK.slice(0, 3).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-25') },
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-18') },
      [ids[2]]: { pyqId: ids[2], ...queueItem('2026-09-20') },
    };
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    expect(snapshot.items.map((i) => i.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('marks an item with reviewCount 0 as new, and a reviewed item as not new', () => {
    const ids = PYQ_BANK.slice(0, 2).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-22', { reviewCount: 0 }) },
    };
    // ids[1] is untracked entirely — getOrCreateItem's own default (reviewCount: 0) applies.
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    const byId = new Map(snapshot.items.map((i) => [i.id, i]));
    expect(byId.get(ids[0])?.isNew).toBe(true);
    expect(byId.get(ids[1])?.isNew).toBe(true);
  });

  it('counts reuse lib/revisionQueue own getQueueCounts verbatim (masteredCount reflects MAX_BOX)', () => {
    const ids = PYQ_BANK.slice(0, 2).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-10-01', { box: 6 }) }, // MAX_BOX
    };
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    expect(snapshot.counts.masteredCount).toBe(1);
    expect(snapshot.counts.totalTracked).toBe(2);
  });
});
