import { describe, it, expect } from 'vitest';
import { overdueItems, upcomingItems, countByStatus, setStatusWithTimestamp, type PlannableItem } from './planSource';

// Shared Planning Utilities — these tests protect exactly the semantics verified against
// lib/upscCseStudyTask.ts and lib/microTarget.ts (see planSource.ts's own doc comments for the
// precise comparison). This module is new and unwired — no existing planner file was touched, so
// there is nothing here that could regress APFC/UPSC/PhD's own existing behaviour.

type Status = 'pending' | 'in_progress' | 'completed';

function item(overrides: Partial<PlannableItem<Status>> = {}): PlannableItem<Status> {
  return {
    id: 'item-1',
    status: 'pending',
    date: '2026-01-15',
    ...overrides,
  };
}

describe('overdueItems', () => {
  it('includes a not-completed item whose date is before today', () => {
    const items = [item({ id: 'a', date: '2026-01-01' })];
    expect(overdueItems(items, '2026-01-15')).toEqual(items);
  });

  it('excludes an item whose date is today or in the future', () => {
    const items = [item({ id: 'a', date: '2026-01-15' }), item({ id: 'b', date: '2026-02-01' })];
    expect(overdueItems(items, '2026-01-15')).toEqual([]);
  });

  it('excludes a completed item even if its date is in the past', () => {
    const items = [item({ id: 'a', date: '2026-01-01', status: 'completed' })];
    expect(overdueItems(items, '2026-01-15')).toEqual([]);
  });

  it('excludes an item with no date at all', () => {
    const items = [item({ id: 'a', date: undefined })];
    expect(overdueItems(items, '2026-01-15')).toEqual([]);
  });

  it('preserves the original array order (no sorting)', () => {
    const items = [
      item({ id: 'b', date: '2026-01-05' }),
      item({ id: 'a', date: '2026-01-01' }),
      item({ id: 'c', date: '2026-01-10' }),
    ];
    expect(overdueItems(items, '2026-01-15').map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const items = [item({ id: 'a', date: '2026-01-01' })];
    const snapshot = JSON.stringify(items);
    overdueItems(items, '2026-01-15');
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('returns an empty array for an empty input', () => {
    expect(overdueItems([], '2026-01-15')).toEqual([]);
  });
});

describe('upcomingItems', () => {
  it('includes a not-completed item dated exactly today (boundary)', () => {
    const items = [item({ id: 'a', date: '2026-01-15' })];
    expect(upcomingItems(items, '2026-01-15').map((i) => i.id)).toEqual(['a']);
  });

  it('includes a not-completed item dated in the future', () => {
    const items = [item({ id: 'a', date: '2026-02-01' })];
    expect(upcomingItems(items, '2026-01-15').map((i) => i.id)).toEqual(['a']);
  });

  it('excludes an item dated before today', () => {
    const items = [item({ id: 'a', date: '2026-01-01' })];
    expect(upcomingItems(items, '2026-01-15')).toEqual([]);
  });

  it('excludes a completed item even if its date is today or later', () => {
    const items = [item({ id: 'a', date: '2026-01-20', status: 'completed' })];
    expect(upcomingItems(items, '2026-01-15')).toEqual([]);
  });

  it('excludes an item with no date at all', () => {
    const items = [item({ id: 'a', date: undefined })];
    expect(upcomingItems(items, '2026-01-15')).toEqual([]);
  });

  it('sorts the result ascending by date, regardless of input order', () => {
    const items = [
      item({ id: 'c', date: '2026-03-01' }),
      item({ id: 'a', date: '2026-01-20' }),
      item({ id: 'b', date: '2026-02-01' }),
    ];
    expect(upcomingItems(items, '2026-01-15').map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies an optional limit after sorting', () => {
    const items = [
      item({ id: 'c', date: '2026-03-01' }),
      item({ id: 'a', date: '2026-01-20' }),
      item({ id: 'b', date: '2026-02-01' }),
    ];
    expect(upcomingItems(items, '2026-01-15', 2).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns every match when limit is omitted', () => {
    const items = [item({ id: 'a', date: '2026-01-20' }), item({ id: 'b', date: '2026-02-01' })];
    expect(upcomingItems(items, '2026-01-15').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const items = [item({ id: 'b', date: '2026-02-01' }), item({ id: 'a', date: '2026-01-20' })];
    const snapshot = JSON.stringify(items);
    upcomingItems(items, '2026-01-15');
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('returns an empty array for an empty input', () => {
    expect(upcomingItems([], '2026-01-15')).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('tallies each observed status', () => {
    const items = [item({ status: 'pending' }), item({ status: 'pending' }), item({ status: 'in_progress' }), item({ status: 'completed' })];
    expect(countByStatus(items)).toEqual({ pending: 2, in_progress: 1, completed: 1 });
  });

  it('only includes keys for statuses that actually occurred (no zero-fill)', () => {
    const items = [item({ status: 'pending' })];
    const result = countByStatus(items);
    expect(result).toEqual({ pending: 1 });
    expect(result.completed).toBeUndefined();
    expect(result.in_progress).toBeUndefined();
  });

  it('does not invent a status beyond what was observed', () => {
    const items = [item({ status: 'completed' })];
    expect(Object.keys(countByStatus(items))).toEqual(['completed']);
  });

  it('returns an empty object for an empty input', () => {
    expect(countByStatus([])).toEqual({});
  });

  it('works for a status union without an "in_progress" member (APFC-shaped)', () => {
    type ApfcStatus = 'pending' | 'completed' | 'skipped';
    const items: { status: ApfcStatus }[] = [{ status: 'pending' }, { status: 'skipped' }, { status: 'completed' }, { status: 'skipped' }];
    expect(countByStatus(items)).toEqual({ pending: 1, completed: 1, skipped: 2 });
  });
});

describe('setStatusWithTimestamp', () => {
  it('sets the status and stamps completedAt when moving to completed', () => {
    const items = [item({ id: 'a', status: 'pending', completedAt: undefined })];
    const result = setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'a', 'completed', '2026-01-15T10:00:00.000Z');
    expect(result[0].status).toBe('completed');
    expect(result[0].completedAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('sets the status and clears completedAt when reopening to a non-completed status', () => {
    const items = [item({ id: 'a', status: 'completed', completedAt: '2026-01-10T00:00:00.000Z' })];
    const result = setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'a', 'pending', '2026-01-15T10:00:00.000Z');
    expect(result[0].status).toBe('pending');
    expect(result[0].completedAt).toBeUndefined();
  });

  it('clears completedAt even when moving to a non-completed, non-pending status (in_progress)', () => {
    const items = [item({ id: 'a', status: 'completed', completedAt: '2026-01-10T00:00:00.000Z' })];
    const result = setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'a', 'in_progress', '2026-01-15T10:00:00.000Z');
    expect(result[0].status).toBe('in_progress');
    expect(result[0].completedAt).toBeUndefined();
  });

  it('only updates the matching id, leaving other items untouched', () => {
    const items = [item({ id: 'a', status: 'pending' }), item({ id: 'b', status: 'pending' })];
    const result = setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'a', 'completed', '2026-01-15T10:00:00.000Z');
    expect(result[0].status).toBe('completed');
    expect(result[1]).toEqual(items[1]);
  });

  it('is a silent no-op for an unknown id (matches lib/upscCseStudyTask.ts and lib/microTarget.ts)', () => {
    const items = [item({ id: 'a', status: 'pending' })];
    const result = setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'does-not-exist', 'completed', '2026-01-15T10:00:00.000Z');
    expect(result).toEqual(items);
    expect(result).not.toBe(items); // still a new array, per "never mutates"
  });

  it('does not mutate the original array or its items', () => {
    const items = [item({ id: 'a', status: 'pending', completedAt: undefined })];
    const snapshot = JSON.stringify(items);
    setStatusWithTimestamp<Status, PlannableItem<Status>>(items, 'a', 'completed', '2026-01-15T10:00:00.000Z');
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('returns an empty array for an empty input', () => {
    expect(setStatusWithTimestamp<Status, PlannableItem<Status>>([], 'a', 'completed', '2026-01-15T10:00:00.000Z')).toEqual([]);
  });
});
