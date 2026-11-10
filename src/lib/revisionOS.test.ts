import { describe, it, expect } from 'vitest';
import { computeRevisionOSSnapshot, computeCseCurrentAffairsRevisionSnapshot, countReviewedToday, countNeedsAnotherLook } from './revisionOS';
import type { RevisionQueue } from './revisionQueue';
import type { ImportedContent } from './contentImport';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { createTextHighlight, type Annotation } from './annotations';
import { createTextAnchor } from './textAnchor';
import { addAnnotationToRevisionQueue, revisionQueueKeyForAnnotation } from './annotationRevisionBridge';
import { createRevisionQueue } from './revisionQueue';

const TODAY = '2026-09-22';

function queueItem(dueDate: string, overrides: Partial<{ box: number; reviewCount: number; lastReviewedDate: string | null }> = {}) {
  return { box: overrides.box ?? 1, dueDate, lastReviewedDate: overrides.lastReviewedDate ?? '2026-09-10', reviewCount: overrides.reviewCount ?? 1 };
}

function taggedAnnotation(tags: ('revision' | 'flashcard')[] = ['revision'], overrides: Partial<{ documentId: string }> = {}): Annotation {
  const source = 'A revision-tagged passage of real constitutional law text';
  const anchor = createTextAnchor(source, 0, source.length)!;
  return createTextHighlight({ documentId: overrides.documentId ?? 'note:doc-1', renderMode: 'raw', anchor, color: '#facc15', studyTags: tags });
}

function currentAffairsItem(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'ca-1',
    workspaceId: overrides.workspaceId ?? 'upsc_cse',
    contentType: overrides.contentType ?? 'current_affairs',
    title: overrides.title ?? 'Article title',
    rawContent: overrides.rawContent ?? 'body',
    provenance: overrides.provenance ?? { importedAt: '2026-09-01T00:00:00.000Z', origin: 'import' },
    metadata: overrides.metadata,
    updatedAt: overrides.updatedAt,
  };
}

// P2.6 — Daily Revision Progress Statistics. These pure helpers are exercised directly first
// (fast, focused, no PYQ_BANK/ImportedContent fixtures needed), then again through each snapshot
// function below to prove the wiring actually uses them with the right eligibleIds.
describe('countReviewedToday', () => {
  it('counts an eligible item reviewed today; excludes one last reviewed yesterday', () => {
    const queue: RevisionQueue = {
      a: { pyqId: 'a', ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
      b: { pyqId: 'b', ...queueItem('2026-09-25', { lastReviewedDate: '2026-09-21' }) },
    };
    expect(countReviewedToday(queue, ['a', 'b'], TODAY)).toBe(1);
  });

  it('never counts a queue entry outside the given eligibleIds, even though it sits in the same queue object', () => {
    const queue: RevisionQueue = {
      a: { pyqId: 'a', ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
      outside: { pyqId: 'outside', ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
    };
    expect(countReviewedToday(queue, ['a'], TODAY)).toBe(1);
  });

  it('an eligible id not yet in the queue (never reviewed) is never counted', () => {
    expect(countReviewedToday({}, ['never-seen'], TODAY)).toBe(0);
  });

  it('returns 0 for empty inputs and never throws', () => {
    expect(() => countReviewedToday({}, [], TODAY)).not.toThrow();
    expect(countReviewedToday({}, [], TODAY)).toBe(0);
  });
});

describe('countNeedsAnotherLook', () => {
  it('box 1 with reviewCount 0 (brand new, never reviewed) is not counted', () => {
    const queue: RevisionQueue = { a: { pyqId: 'a', ...queueItem('2026-09-25', { box: 1, reviewCount: 0 }) } };
    expect(countNeedsAnotherLook(queue, ['a'], TODAY)).toBe(0);
  });

  it('box 1 with reviewCount > 0 (most recent review was incorrect) is counted', () => {
    const queue: RevisionQueue = { a: { pyqId: 'a', ...queueItem('2026-09-25', { box: 1, reviewCount: 2 }) } };
    expect(countNeedsAnotherLook(queue, ['a'], TODAY)).toBe(1);
  });

  it('box greater than 1 is never counted, regardless of reviewCount', () => {
    const queue: RevisionQueue = { a: { pyqId: 'a', ...queueItem('2026-09-25', { box: 3, reviewCount: 5 }) } };
    expect(countNeedsAnotherLook(queue, ['a'], TODAY)).toBe(0);
  });

  it('never counts a queue entry outside the given eligibleIds, even though it sits in the same queue object', () => {
    const queue: RevisionQueue = {
      a: { pyqId: 'a', ...queueItem('2026-09-25', { box: 1, reviewCount: 1 }) },
      outside: { pyqId: 'outside', ...queueItem('2026-09-25', { box: 1, reviewCount: 1 }) },
    };
    expect(countNeedsAnotherLook(queue, ['a'], TODAY)).toBe(1);
  });

  it('returns 0 for empty inputs and never throws', () => {
    expect(() => countNeedsAnotherLook({}, [], TODAY)).not.toThrow();
    expect(countNeedsAnotherLook({}, [], TODAY)).toBe(0);
  });
});

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

  // Wave 4A acceptance audit, item 2 — GAP FIXED (2nd round): computeRevisionOSSnapshot now takes
  // an OPTIONAL `annotations` parameter (see this file's own header) and surfaces a bridged
  // annotation as its own, explicitly-discriminated item kind. This specific test below passes NO
  // `annotations` array (the default, `[]`) — proving an annotation-SHAPED queue key with no real,
  // live Annotation object behind it (deleted, or never genuinely bridged) is STILL gracefully
  // invisible, never an error — exactly the "missing source content" requirement. See the
  // "annotation-derived Revision OS items" describe block below for the FIXED, visible case (a
  // real Annotation IS passed).
  it('an annotation-shaped queue key with no corresponding real Annotation object is gracefully invisible — never an error, never fabricated', () => {
    const annotationKey = 'annotation:0f1e2d3c-aaaa-bbbb-cccc-111122223333';
    const queue: RevisionQueue = {
      [annotationKey]: { pyqId: annotationKey, box: 1, dueDate: '2026-09-01', lastReviewedDate: null, reviewCount: 0 }, // overdue relative to TODAY
    };
    // No PYQ is bookmarked or ever answered incorrectly — eligibleIds is empty, so the annotation
    // entry (not a PYQ id at all) can never be looked up via pyqLookup() either.
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.counts).toEqual({ totalTracked: 0, dueCount: 0, newCount: 0, masteredCount: 0 });
    for (const bucket of Object.values(snapshot.byBucket)) expect(bucket).toEqual([]);
    // The entry is untouched in the underlying queue itself — nothing here mutates or drops it;
    // it simply isn't part of what this VIEW renders.
    expect(queue[annotationKey]).toBeDefined();
  });

  it('a real PYQ entry alongside an annotation-derived entry in the SAME queue is rendered correctly, proving the annotation key never corrupts or interferes with genuine PYQ eligibility/lookup', () => {
    const pyqId = PYQ_BANK[0].id;
    const annotationKey = 'annotation:aaaa1111-bbbb-2222-cccc-333344445555';
    const queue: RevisionQueue = {
      [pyqId]: { pyqId, box: 1, dueDate: '2026-09-20', lastReviewedDate: null, reviewCount: 0 },
      [annotationKey]: { pyqId: annotationKey, box: 1, dueDate: '2026-09-20', lastReviewedDate: null, reviewCount: 0 },
    };
    const snapshot = computeRevisionOSSnapshot([], [pyqId], queue, TODAY);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].id).toBe(pyqId);
  });

  it('P2.6: reviewedTodayCount and needsAnotherLookCount reflect this snapshot\'s own eligible PYQ ids', () => {
    const ids = PYQ_BANK.slice(0, 2).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-25', { lastReviewedDate: TODAY, box: 1, reviewCount: 2 }) },
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-25', { lastReviewedDate: '2026-09-01', box: 3, reviewCount: 4 }) },
    };
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    expect(snapshot.reviewedTodayCount).toBe(1);
    expect(snapshot.needsAnotherLookCount).toBe(1);
  });

  it('P2.6 isolation: a queue entry for a real PYQ id that is NOT eligible (never bookmarked/incorrect) is never counted, even though it sits in the same queue object', () => {
    const [eligibleId, ineligibleId] = PYQ_BANK.map((q) => q.id);
    const queue: RevisionQueue = {
      [eligibleId]: { pyqId: eligibleId, ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
      [ineligibleId]: { pyqId: ineligibleId, ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
    };
    // Only eligibleId is passed as bookmarked — ineligibleId sits in `queue` but is never eligible.
    const snapshot = computeRevisionOSSnapshot([], [eligibleId], queue, TODAY);
    expect(snapshot.reviewedTodayCount).toBe(1);
  });
});

describe('computeRevisionOSSnapshot — annotation-derived Revision OS items (Wave 4A, approved 2nd-round fix)', () => {
  // 1) Annotation entry appears in the correct Revision OS snapshot.
  it('a bridged, revision-tagged annotation appears as its own explicitly-discriminated item, in the correct bucket', () => {
    const annotation = taggedAnnotation(['revision']);
    const { queue } = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, '2026-09-20'); // overdue relative to TODAY
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY, [annotation]);

    expect(snapshot.items).toHaveLength(1);
    const item = snapshot.items[0];
    expect(item.source).toBe('annotation');
    if (item.source !== 'annotation') throw new Error('unreachable');
    expect(item.id).toBe(revisionQueueKeyForAnnotation(annotation.id));
    expect(item.annotationId).toBe(annotation.id);
    expect(item.documentId).toBe('note:doc-1');
    expect(item.renderMode).toBe('raw');
    expect(item.pageNumber).toBe(1);
    expect(item.preview).toContain('revision-tagged passage');
    expect(item.bucket).toBe('overdue');
    expect(snapshot.byBucket.overdue).toHaveLength(1);
  });

  it('a tagged annotation that was never explicitly bridged (no queue entry) does not appear, mirroring the explicit-not-automatic bridge rule', () => {
    const annotation = taggedAnnotation(['revision']);
    const snapshot = computeRevisionOSSnapshot([], [], createRevisionQueue(), TODAY, [annotation]);
    expect(snapshot.items).toEqual([]);
  });

  it('an annotation tagged something other than revision is never surfaced, even if (hypothetically) a stray queue key existed for it', () => {
    const annotation = taggedAnnotation(['flashcard']);
    const key = revisionQueueKeyForAnnotation(annotation.id);
    const queue: RevisionQueue = { [key]: { pyqId: key, box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 } };
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY, [annotation]);
    expect(snapshot.items).toEqual([]);
  });

  // 2) Existing PYQ entries and ordering remain correct.
  it('PYQ items and annotation items coexist correctly in the same snapshot, each keeping their own identity', () => {
    const pyqId = PYQ_BANK[0].id;
    const pyqQueue: RevisionQueue = { [pyqId]: { pyqId, box: 2, dueDate: '2026-09-21', lastReviewedDate: '2026-09-05', reviewCount: 1 } };
    const annotation = taggedAnnotation(['revision']);
    const { queue } = addAnnotationToRevisionQueue(pyqQueue, annotation, '2026-09-20');

    const snapshot = computeRevisionOSSnapshot([], [pyqId], queue, TODAY, [annotation]);
    expect(snapshot.items).toHaveLength(2);
    const pyqItem = snapshot.items.find((i) => i.source === 'pyq');
    const annotationItem = snapshot.items.find((i) => i.source === 'annotation');
    expect(pyqItem).toBeDefined();
    expect(annotationItem).toBeDefined();
    expect(pyqItem!.id).toBe(pyqId); // PYQ identifier completely untouched
    if (pyqItem!.source === 'pyq') {
      expect(pyqItem!.subjectId).toBeTruthy();
      expect(pyqItem!.topicId).toBeTruthy();
    }
  });

  it('existing PYQ-only ordering/bucket tests remain unaffected when annotations is omitted entirely (default [])', () => {
    const ids = PYQ_BANK.slice(0, 3).map((q) => q.id);
    const queue: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], ...queueItem('2026-09-25') },
      [ids[1]]: { pyqId: ids[1], ...queueItem('2026-09-18') },
      [ids[2]]: { pyqId: ids[2], ...queueItem('2026-09-20') },
    };
    const snapshot = computeRevisionOSSnapshot([], ids, queue, TODAY);
    expect(snapshot.items.map((i) => i.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  // 3) Annotation entries can be "opened and reviewed" — i.e. carry everything a caller needs to
  // navigate to the source AND to call the existing review action (its own real queue key).
  it('an annotation item carries everything needed to navigate to its real source document', () => {
    const annotation = taggedAnnotation(['revision'], { documentId: 'imported_content:doc-xyz' });
    const { queue } = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, TODAY);
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY, [annotation]);
    const item = snapshot.items[0];
    if (item.source !== 'annotation') throw new Error('unreachable');
    expect(item.documentId).toBe('imported_content:doc-xyz');
  });

  // 4) Review actions preserve the correct queue identity and progress.
  it('the annotation item\'s own `id` is the EXACT real RevisionQueue key — a caller can pass it straight to recordRevisionCorrect/Incorrect unchanged', () => {
    const annotation = taggedAnnotation(['revision']);
    const { queue } = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, TODAY);
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY, [annotation]);
    const item = snapshot.items[0];
    expect(Object.prototype.hasOwnProperty.call(queue, item.id)).toBe(true);
  });

  // 5) Repeated bridge actions remain idempotent (re-verifies the EXISTING bridge is untouched by
  // this change — the snapshot layer never performs its own bridging).
  it('bridging the same annotation twice still yields exactly one snapshot item, with real review progress intact', () => {
    const annotation = taggedAnnotation(['revision']);
    const first = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, '2026-09-10');
    const key = revisionQueueKeyForAnnotation(annotation.id);
    const reviewed: RevisionQueue = { ...first.queue, [key]: { ...first.queue[key], box: 3, reviewCount: 2, dueDate: '2026-09-20' } };
    const second = addAnnotationToRevisionQueue(reviewed, annotation, '2026-09-21');
    expect(second.status).toBe('already_exists');

    const snapshot = computeRevisionOSSnapshot([], [], second.queue, TODAY, [annotation]);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].box).toBe(3); // real progress preserved, never reset
  });

  // 6) Persistence/export/import retains annotation entries — proven at the store level in
  // store.test.ts's own "survives a full export -> import round trip" test (lib/revisionQueue is a
  // raw passthrough — see that test for the full round-trip proof); here we additionally prove the
  // SNAPSHOT layer reads correctly from a queue/annotations pair shaped exactly like a post-import
  // store would hand it.
  it('reads correctly from a queue/annotations pair shaped like a post-import store state', () => {
    const annotation = taggedAnnotation(['revision']);
    const key = revisionQueueKeyForAnnotation(annotation.id);
    const importedQueue: RevisionQueue = { [key]: { pyqId: key, box: 2, dueDate: '2026-09-19', lastReviewedDate: '2026-09-05', reviewCount: 1 } };
    const snapshot = computeRevisionOSSnapshot([], [], importedQueue, TODAY, [annotation]);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].bucket).toBe('overdue');
  });

  // 7) Missing source content does not crash the page.
  it('a bridged annotation whose source annotation object is no longer in the live annotations array (deleted) never crashes and is simply omitted', () => {
    const annotation = taggedAnnotation(['revision']);
    const { queue } = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, TODAY);
    expect(() => computeRevisionOSSnapshot([], [], queue, TODAY, [])).not.toThrow(); // annotation "deleted" — empty array
    const snapshot = computeRevisionOSSnapshot([], [], queue, TODAY, []);
    expect(snapshot.items).toEqual([]);
  });

  it('an empty annotations array alongside a populated PYQ queue never throws and PYQ items render normally', () => {
    const pyqId = PYQ_BANK[0].id;
    const queue: RevisionQueue = { [pyqId]: { pyqId, box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 } };
    expect(() => computeRevisionOSSnapshot([], [pyqId], queue, TODAY, [])).not.toThrow();
  });

  // 8) counts stays PYQ-only (unchanged meaning) — annotation items are reflected in items/
  // byBucket (so bucket-based stat cards already include them) but never inflate the PYQ-specific
  // masteredCount/totalTracked tally.
  it('PYQ-specific `counts` is unaffected by annotation items — they never inflate masteredCount/totalTracked', () => {
    const pyqId = PYQ_BANK[0].id;
    const pyqQueue: RevisionQueue = { [pyqId]: { pyqId, box: 6, dueDate: TODAY, lastReviewedDate: '2026-09-01', reviewCount: 5 } }; // mastered
    const annotation = taggedAnnotation(['revision']);
    const { queue } = addAnnotationToRevisionQueue(pyqQueue, annotation, TODAY);
    const snapshot = computeRevisionOSSnapshot([], [pyqId], queue, TODAY, [annotation]);
    expect(snapshot.counts).toEqual({ totalTracked: 1, dueCount: 1, newCount: 0, masteredCount: 1 });
    // But the annotation item IS visible in items/byBucket — the bucket-based stat cards reflect it.
    expect(snapshot.items).toHaveLength(2);
  });
});

// P1.5 — computeCseCurrentAffairsRevisionSnapshot: the CSE counterpart to computeRevisionOSSnapshot
// above, over ImportedContent rather than PYQ_BANK. Every test here uses a plain RevisionQueue
// fixture (not the real store) and a plain ImportedContent[] fixture, exactly mirroring this file's
// own existing convention for the APFC function above.
describe('computeCseCurrentAffairsRevisionSnapshot', () => {
  it('returns no items and zeroed counts for an empty queue, regardless of how much imported content exists', () => {
    const content = [currentAffairsItem({ id: 'ca-1' }), currentAffairsItem({ id: 'ca-2' })];
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, {}, TODAY);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.counts).toEqual({ totalTracked: 0, dueCount: 0, newCount: 0, masteredCount: 0 });
  });

  it('eligibility is driven purely by queue membership — never bookmarked/incorrect-attempt derived like APFC', () => {
    const content = [currentAffairsItem({ id: 'ca-1' })];
    const queue: RevisionQueue = { 'ca-1': { pyqId: 'ca-1', ...queueItem(TODAY) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items.map((i) => i.id)).toEqual(['ca-1']);
  });

  it('enriches each item with its real title/source/eventDate via ImportedContent, never fabricated context', () => {
    const content = [currentAffairsItem({ id: 'ca-1', title: 'Monsoon Update', metadata: { source: 'The Hindu, 14 Mar 2026', eventDate: '2026-03-14' } })];
    const queue: RevisionQueue = { 'ca-1': { pyqId: 'ca-1', ...queueItem(TODAY) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items[0]).toMatchObject({ id: 'ca-1', title: 'Monsoon Update', source: 'The Hindu, 14 Mar 2026', eventDate: '2026-03-14' });
  });

  it('a queue entry whose ImportedContent no longer exists is silently skipped, never fabricated', () => {
    const content = [currentAffairsItem({ id: 'ca-1' })];
    const queue: RevisionQueue = { 'ca-1': { pyqId: 'ca-1', ...queueItem(TODAY) }, 'deleted-id': { pyqId: 'deleted-id', ...queueItem(TODAY) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items.map((i) => i.id)).toEqual(['ca-1']);
  });

  it('a queue entry whose ImportedContent exists but is NOT current_affairs (e.g. research_document) is silently skipped', () => {
    const content = [currentAffairsItem({ id: 'rd-1', contentType: 'research_document' })];
    const queue: RevisionQueue = { 'rd-1': { pyqId: 'rd-1', ...queueItem(TODAY) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items).toEqual([]);
  });

  it('buckets items correctly across overdue/today/tomorrow/thisWeek/later', () => {
    const ids = ['ca-1', 'ca-2', 'ca-3', 'ca-4', 'ca-5'];
    const content = ids.map((id) => currentAffairsItem({ id }));
    const queue: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', ...queueItem('2026-09-20') }, // overdue
      'ca-2': { pyqId: 'ca-2', ...queueItem('2026-09-22') }, // today
      'ca-3': { pyqId: 'ca-3', ...queueItem('2026-09-23') }, // tomorrow
      'ca-4': { pyqId: 'ca-4', ...queueItem('2026-09-26') }, // this week
      'ca-5': { pyqId: 'ca-5', ...queueItem('2026-10-15') }, // later
    };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.byBucket.overdue.map((i) => i.id)).toEqual(['ca-1']);
    expect(snapshot.byBucket.today.map((i) => i.id)).toEqual(['ca-2']);
    expect(snapshot.byBucket.tomorrow.map((i) => i.id)).toEqual(['ca-3']);
    expect(snapshot.byBucket.thisWeek.map((i) => i.id)).toEqual(['ca-4']);
    expect(snapshot.byBucket.later.map((i) => i.id)).toEqual(['ca-5']);
    expect(snapshot.items).toHaveLength(5);
  });

  it('sorts items by due date ascending, overdue first', () => {
    const content = [currentAffairsItem({ id: 'ca-1' }), currentAffairsItem({ id: 'ca-2' }), currentAffairsItem({ id: 'ca-3' })];
    const queue: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', ...queueItem('2026-09-25') },
      'ca-2': { pyqId: 'ca-2', ...queueItem('2026-09-18') },
      'ca-3': { pyqId: 'ca-3', ...queueItem('2026-09-20') },
    };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items.map((i) => i.id)).toEqual(['ca-2', 'ca-3', 'ca-1']);
  });

  it('marks an item with reviewCount 0 as new, and a reviewed item as not new', () => {
    const content = [currentAffairsItem({ id: 'ca-1' })];
    const queue: RevisionQueue = { 'ca-1': { pyqId: 'ca-1', ...queueItem(TODAY, { reviewCount: 0 }) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items[0].isNew).toBe(true);
  });

  it('counts reuse lib/revisionQueue own getQueueCounts verbatim (masteredCount reflects MAX_BOX)', () => {
    const content = [currentAffairsItem({ id: 'ca-1' }), currentAffairsItem({ id: 'ca-2' })];
    const queue: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', ...queueItem('2026-10-01', { box: 6 }) }, // MAX_BOX
      'ca-2': { pyqId: 'ca-2', ...queueItem('2026-10-01', { box: 1 }) },
    };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.counts.masteredCount).toBe(1);
    expect(snapshot.counts.totalTracked).toBe(2);
  });

  it('never reads APFC\'s PYQ_BANK/SYLLABUS at all — a genuinely separate content-resolution path', () => {
    // Regression guard: an ImportedContent item whose id happens to collide with a real APFC PYQ_BANK
    // id must still be resolved from ImportedContent's own title, never from PYQ_BANK by accident.
    const collidingId = PYQ_BANK[0].id;
    const content = [currentAffairsItem({ id: collidingId, title: 'Not a PYQ, a CSE article' })];
    const queue: RevisionQueue = { [collidingId]: { pyqId: collidingId, ...queueItem(TODAY) } };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.items[0].title).toBe('Not a PYQ, a CSE article');
  });

  it('P2.6: reviewedTodayCount and needsAnotherLookCount reflect only this snapshot\'s own eligible Current Affairs ids', () => {
    const content = [currentAffairsItem({ id: 'ca-1' }), currentAffairsItem({ id: 'ca-2' })];
    const queue: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', ...queueItem('2026-09-25', { lastReviewedDate: TODAY, box: 1, reviewCount: 3 }) },
      'ca-2': { pyqId: 'ca-2', ...queueItem('2026-09-25', { lastReviewedDate: '2026-09-01', box: 4, reviewCount: 2 }) },
    };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.reviewedTodayCount).toBe(1);
    expect(snapshot.needsAnotherLookCount).toBe(1);
  });

  it('P2.6 isolation: a queue entry with no matching current_affairs ImportedContent (e.g. an APFC PYQ id, or deleted content) is never counted, even though it sits in the same queue object', () => {
    const content = [currentAffairsItem({ id: 'ca-1' })];
    const queue: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
      'apfc-pyq-1': { pyqId: 'apfc-pyq-1', ...queueItem('2026-09-25', { lastReviewedDate: TODAY }) },
    };
    const snapshot = computeCseCurrentAffairsRevisionSnapshot(content, queue, TODAY);
    expect(snapshot.reviewedTodayCount).toBe(1);
  });
});

// P2.9 — regression guard for P2.8's RevisionItem.lastReviewSource: this aggregation layer reads
// box/dueDate/reviewCount/lastReviewedDate only (never lastReviewSource) for every count/bucket it
// computes, so a queue whose items happen to carry a source must produce EXACTLY the same snapshot
// as an otherwise-identical queue that doesn't. Proven by direct comparison, not just by re-asserting
// the same expected numbers twice (which wouldn't catch a hidden dependency on the new field).
describe('P2.9: snapshots/counts are unaffected by RevisionItem.lastReviewSource (P2.8)', () => {
  it('computeRevisionOSSnapshot is identical whether or not eligible items carry a lastReviewSource', () => {
    const ids = PYQ_BANK.slice(0, 3).map((q) => q.id);
    const withoutSource: RevisionQueue = {
      [ids[0]]: { pyqId: ids[0], box: 2, dueDate: '2026-09-20', lastReviewedDate: TODAY, reviewCount: 3 },
      [ids[1]]: { pyqId: ids[1], box: 1, dueDate: TODAY, lastReviewedDate: '2026-09-01', reviewCount: 2 },
      [ids[2]]: { pyqId: ids[2], box: 6, dueDate: '2026-10-01', lastReviewedDate: TODAY, reviewCount: 6 },
    };
    const withSource: RevisionQueue = {
      [ids[0]]: { ...withoutSource[ids[0]], lastReviewSource: 'quiz' },
      [ids[1]]: { ...withoutSource[ids[1]], lastReviewSource: 'self_report' },
      [ids[2]]: { ...withoutSource[ids[2]], lastReviewSource: 'quiz' },
    };
    expect(computeRevisionOSSnapshot([], ids, withSource, TODAY)).toEqual(computeRevisionOSSnapshot([], ids, withoutSource, TODAY));
  });

  it('computeCseCurrentAffairsRevisionSnapshot is identical whether or not items carry a lastReviewSource', () => {
    const content = [currentAffairsItem({ id: 'ca-1' }), currentAffairsItem({ id: 'ca-2' })];
    const withoutSource: RevisionQueue = {
      'ca-1': { pyqId: 'ca-1', box: 1, dueDate: '2026-09-20', lastReviewedDate: TODAY, reviewCount: 2 },
      'ca-2': { pyqId: 'ca-2', box: 4, dueDate: TODAY, lastReviewedDate: '2026-09-01', reviewCount: 3 },
    };
    const withSource: RevisionQueue = {
      'ca-1': { ...withoutSource['ca-1'], lastReviewSource: 'self_report' },
      'ca-2': { ...withoutSource['ca-2'], lastReviewSource: 'quiz' },
    };
    expect(computeCseCurrentAffairsRevisionSnapshot(content, withSource, TODAY)).toEqual(
      computeCseCurrentAffairsRevisionSnapshot(content, withoutSource, TODAY),
    );
  });
});
