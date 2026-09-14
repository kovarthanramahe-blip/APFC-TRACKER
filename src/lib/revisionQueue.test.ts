import { describe, it, expect } from 'vitest';
import {
  createRevisionQueue,
  createInitialRevisionItem,
  getOrCreateItem,
  getDueItems,
  recordCorrect,
  recordIncorrect,
  getQueueCounts,
  BOX_INTERVALS_DAYS,
  MAX_BOX,
  type RevisionQueue,
} from './revisionQueue';

const TODAY = '2026-01-08';

// --- new/unseen items -----------------------------------------------------------------------
describe('new items', () => {
  it('createRevisionQueue starts empty', () => {
    expect(createRevisionQueue()).toEqual({});
  });

  it('a brand-new item is box 1, due today, never reviewed', () => {
    const item = createInitialRevisionItem('q1', TODAY);
    expect(item).toEqual({ pyqId: 'q1', box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 });
  });

  it('getOrCreateItem synthesizes an unseen item for an id not yet in the queue', () => {
    const item = getOrCreateItem({}, 'q1', TODAY);
    expect(item.box).toBe(1);
    expect(item.dueDate).toBe(TODAY);
    expect(item.reviewCount).toBe(0);
  });

  it('getOrCreateItem does not mutate the queue it reads from', () => {
    const queue: RevisionQueue = {};
    getOrCreateItem(queue, 'q1', TODAY);
    expect(queue).toEqual({});
  });
});

// --- due filtering ---------------------------------------------------------------------------
describe('getDueItems', () => {
  it('an unseen id is always due immediately', () => {
    const due = getDueItems({}, ['q1'], TODAY);
    expect(due.map((i) => i.pyqId)).toEqual(['q1']);
  });

  it('excludes an item whose dueDate is in the future', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 2, dueDate: '2026-01-20', lastReviewedDate: TODAY, reviewCount: 1 } };
    expect(getDueItems(queue, ['q1'], TODAY)).toEqual([]);
  });

  it('includes an item whose dueDate is exactly today (date boundary, inclusive)', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 2, dueDate: TODAY, lastReviewedDate: '2026-01-06', reviewCount: 1 } };
    expect(getDueItems(queue, ['q1'], TODAY).map((i) => i.pyqId)).toEqual(['q1']);
  });

  it('includes an item whose dueDate is in the past (overdue)', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 2, dueDate: '2026-01-01', lastReviewedDate: '2025-12-30', reviewCount: 1 } };
    expect(getDueItems(queue, ['q1'], TODAY).map((i) => i.pyqId)).toEqual(['q1']);
  });

  it('only considers the ids passed in, mixing due/not-due/unseen correctly', () => {
    const queue: RevisionQueue = {
      due: { pyqId: 'due', box: 1, dueDate: '2026-01-05', lastReviewedDate: '2026-01-04', reviewCount: 1 },
      notDue: { pyqId: 'notDue', box: 3, dueDate: '2026-02-01', lastReviewedDate: TODAY, reviewCount: 3 },
    };
    const due = getDueItems(queue, ['due', 'notDue', 'unseen'], TODAY);
    expect(due.map((i) => i.pyqId).sort()).toEqual(['due', 'unseen']);
  });
});

// --- correct progression ----------------------------------------------------------------------
describe('recordCorrect', () => {
  it('advances an unseen item from box 1 to box 2 and reschedules per the box-2 interval', () => {
    const queue = recordCorrect({}, 'q1', TODAY);
    const item = queue.q1;
    expect(item.box).toBe(2);
    expect(item.reviewCount).toBe(1);
    expect(item.lastReviewedDate).toBe(TODAY);
    expect(item.dueDate).toBe('2026-01-10'); // TODAY + BOX_INTERVALS_DAYS[1] (2 days)
  });

  it('advances box by exactly one on each consecutive correct answer', () => {
    let queue = createRevisionQueue();
    queue = recordCorrect(queue, 'q1', '2026-01-01');
    expect(queue.q1.box).toBe(2);
    queue = recordCorrect(queue, 'q1', '2026-01-05');
    expect(queue.q1.box).toBe(3);
    queue = recordCorrect(queue, 'q1', '2026-01-10');
    expect(queue.q1.box).toBe(4);
  });

  it('caps at MAX_BOX and never exceeds it', () => {
    let queue: RevisionQueue = { q1: { pyqId: 'q1', box: MAX_BOX, dueDate: TODAY, lastReviewedDate: TODAY, reviewCount: 10 } };
    queue = recordCorrect(queue, 'q1', TODAY);
    expect(queue.q1.box).toBe(MAX_BOX);
    expect(queue.q1.dueDate).toBe('2026-02-09'); // TODAY + BOX_INTERVALS_DAYS[MAX_BOX - 1] (32 days)
  });

  it('increments reviewCount every time, regardless of box', () => {
    let queue = recordCorrect({}, 'q1', TODAY);
    expect(queue.q1.reviewCount).toBe(1);
    queue = recordCorrect(queue, 'q1', '2026-01-12');
    expect(queue.q1.reviewCount).toBe(2);
  });
});

// --- incorrect reset --------------------------------------------------------------------------
describe('recordIncorrect', () => {
  it('resets a higher box back to box 1', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 4, dueDate: TODAY, lastReviewedDate: '2026-01-01', reviewCount: 5 } };
    const next = recordIncorrect(queue, 'q1', TODAY);
    expect(next.q1.box).toBe(1);
    expect(next.q1.dueDate).toBe('2026-01-09'); // TODAY + BOX_INTERVALS_DAYS[0] (1 day)
  });

  it('keeps an already-box-1 item at box 1', () => {
    const queue = recordIncorrect({}, 'q1', TODAY);
    expect(queue.q1.box).toBe(1);
  });

  it('still increments reviewCount on an incorrect answer', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 3, dueDate: TODAY, lastReviewedDate: TODAY, reviewCount: 2 } };
    const next = recordIncorrect(queue, 'q1', TODAY);
    expect(next.q1.reviewCount).toBe(3);
  });
});

// --- date boundaries (month/year rollover) ------------------------------------------------------
describe('date boundaries', () => {
  it('correctly rolls a due date over a month boundary', () => {
    const queue = recordCorrect({}, 'q1', '2026-01-30'); // +2 days (box 2)
    expect(queue.q1.dueDate).toBe('2026-02-01');
  });

  it('correctly rolls a due date over a year boundary', () => {
    const queue = recordCorrect({}, 'q1', '2025-12-30'); // +2 days (box 2)
    expect(queue.q1.dueDate).toBe('2026-01-01');
  });

  it('each box-advance uses the declared interval for the RESULTING box, via local (not UTC) day arithmetic', () => {
    const base = '2026-03-01'; // March has 31 days — the box-6 (+32 day) case also crosses into April.
    for (let startBox = 1; startBox <= MAX_BOX; startBox++) {
      const queue: RevisionQueue = startBox === 1 ? {} : { q1: { pyqId: 'q1', box: startBox, dueDate: base, lastReviewedDate: base, reviewCount: startBox } };
      const next = recordCorrect(queue, 'q1', base);
      const resultBox = Math.min(startBox + 1, MAX_BOX);
      const expectedDate = new Date(base + 'T00:00:00');
      expectedDate.setDate(expectedDate.getDate() + BOX_INTERVALS_DAYS[resultBox - 1]);
      const expected = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
      expect(next.q1.box).toBe(resultBox);
      expect(next.q1.dueDate).toBe(expected);
    }
  });
});

// --- immutability ----------------------------------------------------------------------------
describe('immutability', () => {
  it('recordCorrect never mutates the input queue', () => {
    const original: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 } };
    const snapshot = JSON.parse(JSON.stringify(original));
    recordCorrect(original, 'q1', TODAY);
    expect(original).toEqual(snapshot);
  });

  it('recordIncorrect never mutates the input queue', () => {
    const original: RevisionQueue = { q1: { pyqId: 'q1', box: 3, dueDate: TODAY, lastReviewedDate: TODAY, reviewCount: 2 } };
    const snapshot = JSON.parse(JSON.stringify(original));
    recordIncorrect(original, 'q1', TODAY);
    expect(original).toEqual(snapshot);
  });

  it('unrelated items in the queue are untouched by an update to one item', () => {
    const queue: RevisionQueue = {
      q1: { pyqId: 'q1', box: 1, dueDate: TODAY, lastReviewedDate: null, reviewCount: 0 },
      q2: { pyqId: 'q2', box: 3, dueDate: '2026-02-01', lastReviewedDate: '2026-01-01', reviewCount: 4 },
    };
    const next = recordCorrect(queue, 'q1', TODAY);
    expect(next.q2).toEqual(queue.q2);
  });
});

// --- determinism -------------------------------------------------------------------------------
describe('determinism', () => {
  it('identical inputs always produce identical output', () => {
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 2, dueDate: TODAY, lastReviewedDate: '2026-01-04', reviewCount: 1 } };
    expect(recordCorrect(queue, 'q1', TODAY)).toEqual(recordCorrect(queue, 'q1', TODAY));
    expect(recordIncorrect(queue, 'q1', TODAY)).toEqual(recordIncorrect(queue, 'q1', TODAY));
    expect(getDueItems(queue, ['q1'], TODAY)).toEqual(getDueItems(queue, ['q1'], TODAY));
  });

  it('getQueueCounts is deterministic and internally consistent', () => {
    const queue: RevisionQueue = {
      a: { pyqId: 'a', box: MAX_BOX, dueDate: '2026-02-01', lastReviewedDate: TODAY, reviewCount: 6 },
      b: { pyqId: 'b', box: 1, dueDate: TODAY, lastReviewedDate: TODAY, reviewCount: 1 },
    };
    const ids = ['a', 'b', 'c']; // c is unseen
    const counts1 = getQueueCounts(queue, ids, TODAY);
    const counts2 = getQueueCounts(queue, ids, TODAY);
    expect(counts1).toEqual(counts2);
    expect(counts1).toEqual({ totalTracked: 3, dueCount: 2, newCount: 1, masteredCount: 1 }); // b + c due; c new; a mastered
  });
});
