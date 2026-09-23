import { describe, it, expect } from 'vitest';
import {
  isValidMicroTargetTitle,
  createMicroTarget,
  updateMicroTarget,
  setMicroTargetStatus,
  deleteMicroTarget,
  activeMicroTargets,
  overdueMicroTargets,
  upcomingMicroTargets,
  recentlyCompletedMicroTargets,
  countMicroTargetsByStatus,
  microTargetsForContext,
  type MicroTarget,
} from './microTarget';

describe('isValidMicroTargetTitle', () => {
  it('accepts a non-blank title and rejects blank/whitespace', () => {
    expect(isValidMicroTargetTitle('Draft chapter 2')).toBe(true);
    expect(isValidMicroTargetTitle('')).toBe(false);
    expect(isValidMicroTargetTitle('   ')).toBe(false);
  });
});

describe('createMicroTarget', () => {
  it('builds a new target in pending status, defaulting priority to medium', () => {
    const target = createMicroTarget({ title: '  Read source X  ', contextId: 'area-1', targetDate: '2026-10-01', estimatedMinutes: 45 }, 't1', '2026-09-22T00:00:00.000Z');
    expect(target).toEqual<MicroTarget>({
      id: 't1',
      title: 'Read source X',
      description: undefined,
      contextId: 'area-1',
      targetDate: '2026-10-01',
      estimatedMinutes: 45,
      status: 'pending',
      priority: 'medium',
      createdAt: '2026-09-22T00:00:00.000Z',
    });
  });

  it('respects an explicit priority', () => {
    const target = createMicroTarget({ title: 'Urgent thing', priority: 'high' }, 't2', '2026-09-22T00:00:00.000Z');
    expect(target.priority).toBe('high');
  });

  it('trims notes and carries linkedContentId when supplied', () => {
    const target = createMicroTarget({ title: 'Read source', notes: '  bring a highlighter  ', linkedContentId: 'ic-1' }, 't3', '2026-09-22T00:00:00.000Z');
    expect(target.notes).toBe('bring a highlighter');
    expect(target.linkedContentId).toBe('ic-1');
  });

  it('trims notes down to undefined when blank', () => {
    const target = createMicroTarget({ title: 'X', notes: '   ' }, 't4', '2026-09-22T00:00:00.000Z');
    expect(target.notes).toBeUndefined();
  });
});

describe('updateMicroTarget', () => {
  const base: MicroTarget = { id: 't1', title: 'Original', status: 'pending', priority: 'low', createdAt: '2026-09-22T00:00:00.000Z' };

  it('updates editable fields, trimming the title', () => {
    const [updated] = updateMicroTarget([base], 't1', { title: '  New Title  ', priority: 'high' });
    expect(updated.title).toBe('New Title');
    expect(updated.priority).toBe('high');
  });

  it('ignores a blank title update, keeping the existing title', () => {
    const [updated] = updateMicroTarget([base], 't1', { title: '   ' });
    expect(updated.title).toBe('Original');
  });

  it('is a no-op for an unknown id and never mutates the input array', () => {
    const targets = [base];
    const result = updateMicroTarget(targets, 'missing', { title: 'X' });
    expect(result).toEqual(targets);
    expect(targets[0].title).toBe('Original');
  });

  it('updates notes and linkedContentId, trimming notes', () => {
    const [updated] = updateMicroTarget([base], 't1', { notes: '  revised note  ', linkedContentId: 'ic-2' });
    expect(updated.notes).toBe('revised note');
    expect(updated.linkedContentId).toBe('ic-2');
  });

  it('trims notes down to undefined when updated to blank', () => {
    const withNotes: MicroTarget = { ...base, notes: 'old note' };
    const [updated] = updateMicroTarget([withNotes], 't1', { notes: '   ' });
    expect(updated.notes).toBeUndefined();
  });
});

describe('setMicroTargetStatus', () => {
  const base: MicroTarget = { id: 't1', title: 'T', status: 'pending', priority: 'medium', createdAt: '2026-09-22T00:00:00.000Z' };

  it('stamps completedAt when moving to completed and clears it when reverted', () => {
    const [completed] = setMicroTargetStatus([base], 't1', 'completed', '2026-09-23T09:00:00.000Z');
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe('2026-09-23T09:00:00.000Z');
    const [reverted] = setMicroTargetStatus([completed], 't1', 'in_progress', '2026-09-24T09:00:00.000Z');
    expect(reverted.completedAt).toBeUndefined();
  });
});

describe('deleteMicroTarget', () => {
  it('removes only the matching target', () => {
    const targets: MicroTarget[] = [
      { id: 't1', title: 'A', status: 'pending', priority: 'medium', createdAt: '2026-09-22T00:00:00.000Z' },
      { id: 't2', title: 'B', status: 'pending', priority: 'medium', createdAt: '2026-09-22T00:00:00.000Z' },
    ];
    expect(deleteMicroTarget(targets, 't1')).toEqual([targets[1]]);
  });
});

describe('activeMicroTargets / overdueMicroTargets / upcomingMicroTargets', () => {
  const targets: MicroTarget[] = [
    { id: 'past-due', title: 'Overdue', status: 'pending', priority: 'medium', createdAt: 'a', targetDate: '2026-09-01' },
    { id: 'future', title: 'Upcoming', status: 'pending', priority: 'medium', createdAt: 'a', targetDate: '2026-10-01' },
    { id: 'no-date', title: 'No date', status: 'in_progress', priority: 'medium', createdAt: 'a' },
    { id: 'done', title: 'Done', status: 'completed', priority: 'medium', createdAt: 'a', targetDate: '2026-09-01', completedAt: 'b' },
  ];
  const today = '2026-09-22';

  it('activeMicroTargets excludes completed targets only', () => {
    expect(activeMicroTargets(targets).map((t) => t.id).sort()).toEqual(['future', 'no-date', 'past-due']);
  });

  it('overdueMicroTargets includes only active targets with a past targetDate', () => {
    expect(overdueMicroTargets(targets, today).map((t) => t.id)).toEqual(['past-due']);
  });

  it('a target with no targetDate is never overdue and never upcoming', () => {
    expect(overdueMicroTargets(targets, today).some((t) => t.id === 'no-date')).toBe(false);
    expect(upcomingMicroTargets(targets, today).some((t) => t.id === 'no-date')).toBe(false);
  });

  it('upcomingMicroTargets includes active targets due today or later, soonest first', () => {
    const upcoming = upcomingMicroTargets(targets, today);
    expect(upcoming.map((t) => t.id)).toEqual(['future']);
  });

  it('upcomingMicroTargets respects a limit', () => {
    const many: MicroTarget[] = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i}`,
      title: `U${i}`,
      status: 'pending',
      priority: 'medium',
      createdAt: 'a',
      targetDate: `2026-10-0${i + 1}`,
    }));
    expect(upcomingMicroTargets(many, today, 2)).toHaveLength(2);
  });
});

describe('recentlyCompletedMicroTargets', () => {
  it('returns completed targets most-recently-completed first, excluding never-completed ones', () => {
    const targets: MicroTarget[] = [
      { id: 'old', title: 'Old', status: 'completed', priority: 'medium', createdAt: 'a', completedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'new', title: 'New', status: 'completed', priority: 'medium', createdAt: 'a', completedAt: '2026-09-20T00:00:00.000Z' },
      { id: 'pending', title: 'Pending', status: 'pending', priority: 'medium', createdAt: 'a' },
    ];
    expect(recentlyCompletedMicroTargets(targets).map((t) => t.id)).toEqual(['new', 'old']);
  });
});

describe('countMicroTargetsByStatus / microTargetsForContext', () => {
  it('counts each status bucket', () => {
    const targets: MicroTarget[] = [
      { id: '1', title: 'A', status: 'pending', priority: 'medium', createdAt: 'a' },
      { id: '2', title: 'B', status: 'in_progress', priority: 'medium', createdAt: 'a' },
      { id: '3', title: 'C', status: 'completed', priority: 'medium', createdAt: 'a', completedAt: 'x' },
    ];
    expect(countMicroTargetsByStatus(targets)).toEqual({ pending: 1, in_progress: 1, completed: 1 });
  });

  it('filters targets by contextId', () => {
    const targets: MicroTarget[] = [
      { id: '1', title: 'A', status: 'pending', priority: 'medium', createdAt: 'a', contextId: 'area-1' },
      { id: '2', title: 'B', status: 'pending', priority: 'medium', createdAt: 'a', contextId: 'area-2' },
    ];
    expect(microTargetsForContext(targets, 'area-1').map((t) => t.id)).toEqual(['1']);
  });
});
