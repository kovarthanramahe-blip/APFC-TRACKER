import { describe, it, expect } from 'vitest';
import { createTextHighlight } from './annotations';
import { createTextAnchor } from './textAnchor';
import { createRevisionQueue, addItem } from './revisionQueue';
import { addAnnotationToRevisionQueue, canBridgeAnnotationToRevision, isAnnotationInRevisionQueue, revisionQueueKeyForAnnotation } from './annotationRevisionBridge';
import { PYQ_BANK } from '../data/pyq';
import { uuid } from './utils';

const SOURCE_TEXT = 'Merchant capitalism preceded industrial capital formation.';
const ANCHOR = createTextAnchor(SOURCE_TEXT, 0, 18)!; // "Merchant capitalism"

function taggedHighlight(tags: ('revision' | 'flashcard' | 'important' | 'doubt')[] = ['revision']) {
  return createTextHighlight({ documentId: 'note:n1', renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: tags, now: '2026-01-01T00:00:00.000Z' });
}

describe('revisionQueueKeyForAnnotation', () => {
  it('namespaces the key so it can never collide with a bare PYQ/ImportedContent id', () => {
    expect(revisionQueueKeyForAnnotation('abc-123')).toBe('annotation:abc-123');
  });
});

describe('canBridgeAnnotationToRevision', () => {
  it('is true for an annotation tagged revision', () => {
    expect(canBridgeAnnotationToRevision(taggedHighlight(['revision']))).toBe(true);
  });

  it('is false for an annotation with no revision tag', () => {
    expect(canBridgeAnnotationToRevision(taggedHighlight(['flashcard']))).toBe(false);
    expect(canBridgeAnnotationToRevision(taggedHighlight([]))).toBe(false);
  });
});

describe('addAnnotationToRevisionQueue', () => {
  it('adds a revision-tagged annotation as a fresh, due-today item', () => {
    const annotation = taggedHighlight(['revision']);
    const result = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, '2026-01-02');
    expect(result.status).toBe('added');
    const key = revisionQueueKeyForAnnotation(annotation.id);
    expect(result.queue[key]).toEqual({ pyqId: key, box: 1, dueDate: '2026-01-02', lastReviewedDate: null, reviewCount: 0 });
  });

  it('refuses an annotation without the revision tag, with a human-readable reason, never throwing', () => {
    const annotation = taggedHighlight(['important']);
    const before = createRevisionQueue();
    const result = addAnnotationToRevisionQueue(before, annotation, '2026-01-02');
    expect(result.status).toBe('cannot_add');
    expect(result.reason).toBeTruthy();
    expect(result.queue).toBe(before); // unchanged, same reference
  });

  it('is idempotent: a second call for the same annotation reports already_exists and never resets progress', () => {
    const annotation = taggedHighlight(['revision']);
    const first = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, '2026-01-02');
    const key = revisionQueueKeyForAnnotation(annotation.id);
    // Simulate the item having since been reviewed (progress exists).
    const reviewed = { ...first.queue, [key]: { ...first.queue[key], box: 3, reviewCount: 2 } };
    const second = addAnnotationToRevisionQueue(reviewed, annotation, '2026-01-10');
    expect(second.status).toBe('already_exists');
    expect(second.queue).toBe(reviewed); // untouched — never rewritten
    expect(second.queue[key].box).toBe(3);
    expect(second.queue[key].reviewCount).toBe(2);
  });

  it('never mutates the queue passed in', () => {
    const annotation = taggedHighlight(['revision']);
    const before = createRevisionQueue();
    const snapshot = { ...before };
    addAnnotationToRevisionQueue(before, annotation, '2026-01-02');
    expect(before).toEqual(snapshot);
  });

  it('bridging two different annotations never collides, even with ids that happen to be identical strings to a PYQ id', () => {
    const a1 = taggedHighlight(['revision']);
    const a2 = taggedHighlight(['revision']);
    let queue = createRevisionQueue();
    // A pre-existing PYQ-style entry sharing the bare annotation id would collide WITHOUT namespacing.
    queue = addItem(queue, a1.id, '2026-01-01');
    const result = addAnnotationToRevisionQueue(queue, a1, '2026-01-02');
    expect(result.status).toBe('added'); // namespaced key, so the bare-id PYQ entry above never collides
    expect(result.queue[a1.id]).toBeDefined(); // the original bare-id entry is untouched
    expect(result.queue[revisionQueueKeyForAnnotation(a1.id)]).toBeDefined();
    expect(result.queue[a1.id]).not.toBe(result.queue[revisionQueueKeyForAnnotation(a2.id)]);
  });
});

describe('collision safety against the REAL id formats this codebase actually uses', () => {
  it('a namespaced annotation key can never equal a real PYQ_BANK id (PYQ ids are plain "pyq-N" literals, never containing ":")', () => {
    for (const pyq of PYQ_BANK.slice(0, 10)) {
      expect(pyq.id).not.toContain(':');
      expect(revisionQueueKeyForAnnotation(pyq.id)).not.toBe(pyq.id);
    }
  });

  it('a namespaced annotation key can never equal a real ImportedContent/annotation id (lib/utils.ts uuid() — crypto.randomUUID() — never contains ":")', () => {
    for (let i = 0; i < 20; i++) {
      const id = uuid();
      expect(id).not.toContain(':');
      expect(revisionQueueKeyForAnnotation(id)).not.toBe(id);
    }
  });

  it('adding a PYQ id and an annotation sharing that same id to the same queue never collides (end-to-end, using the real addItem both id spaces already share)', () => {
    const sharedId = uuid();
    const annotation = createTextHighlight({ documentId: 'note:n1', renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: ['revision'] });
    // Force a (contrived, worst-case) collision: a real content id in the PYQ/ImportedContent id
    // space happens to equal the annotation's own raw id.
    let queue = addItem(createRevisionQueue(), sharedId, '2026-01-01');
    const result = addAnnotationToRevisionQueue(queue, { ...annotation, id: sharedId }, '2026-01-02');
    expect(result.status).toBe('added');
    expect(result.queue[sharedId]).toBeDefined(); // the original, unrelated content entry — untouched
    expect(result.queue[revisionQueueKeyForAnnotation(sharedId)]).toBeDefined(); // the new annotation entry — distinct key
    expect(result.queue[sharedId]).not.toEqual(result.queue[revisionQueueKeyForAnnotation(sharedId)]);
  });
});

describe('isAnnotationInRevisionQueue', () => {
  it('reflects whether the namespaced key is present', () => {
    const annotation = taggedHighlight(['revision']);
    expect(isAnnotationInRevisionQueue(createRevisionQueue(), annotation)).toBe(false);
    const { queue } = addAnnotationToRevisionQueue(createRevisionQueue(), annotation, '2026-01-02');
    expect(isAnnotationInRevisionQueue(queue, annotation)).toBe(true);
  });
});
