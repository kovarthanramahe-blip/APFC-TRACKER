import { describe, it, expect } from 'vitest';
import {
  isValidStudyTaskTitle,
  createUpscCseStudyTask,
  setUpscCseStudyTaskStatus,
  deleteUpscCseStudyTask,
  tasksForDate,
  countStudyTasksByStatus,
  recentlyCompletedStudyTasks,
  type UpscCseStudyTask,
} from './upscCseStudyTask';

describe('isValidStudyTaskTitle', () => {
  it('accepts a non-blank title', () => {
    expect(isValidStudyTaskTitle('Revise Ancient India')).toBe(true);
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(isValidStudyTaskTitle('')).toBe(false);
    expect(isValidStudyTaskTitle('   ')).toBe(false);
  });
});

describe('createUpscCseStudyTask', () => {
  it('builds a new task in pending status with the caller-supplied id/createdAt', () => {
    const task = createUpscCseStudyTask({ title: '  Read NCERT Geography  ', date: '2026-09-22', targetMinutes: 45 }, 'task-1', '2026-09-22T08:00:00.000Z');
    expect(task).toEqual<UpscCseStudyTask>({
      id: 'task-1',
      date: '2026-09-22',
      title: 'Read NCERT Geography',
      targetMinutes: 45,
      status: 'pending',
      createdAt: '2026-09-22T08:00:00.000Z',
    });
  });

  it('omits targetMinutes when not supplied', () => {
    const task = createUpscCseStudyTask({ title: 'Practice PYQs', date: '2026-09-22' }, 'task-2', '2026-09-22T08:00:00.000Z');
    expect(task.targetMinutes).toBeUndefined();
  });
});

describe('setUpscCseStudyTaskStatus', () => {
  const base: UpscCseStudyTask = { id: 't1', date: '2026-09-22', title: 'Test', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' };

  it('stamps completedAt with the supplied now when moving to completed', () => {
    const [updated] = setUpscCseStudyTaskStatus([base], 't1', 'completed', '2026-09-22T10:00:00.000Z');
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBe('2026-09-22T10:00:00.000Z');
  });

  it('clears completedAt when reverted to pending', () => {
    const completed: UpscCseStudyTask = { ...base, status: 'completed', completedAt: '2026-09-22T10:00:00.000Z' };
    const [reverted] = setUpscCseStudyTaskStatus([completed], 't1', 'pending', '2026-09-22T11:00:00.000Z');
    expect(reverted.status).toBe('pending');
    expect(reverted.completedAt).toBeUndefined();
  });

  it('is a no-op for an id that does not exist', () => {
    const result = setUpscCseStudyTaskStatus([base], 'missing', 'completed', '2026-09-22T10:00:00.000Z');
    expect(result).toEqual([base]);
  });

  it('does not mutate the original array', () => {
    const tasks = [base];
    setUpscCseStudyTaskStatus(tasks, 't1', 'completed', '2026-09-22T10:00:00.000Z');
    expect(tasks[0].status).toBe('pending');
  });
});

describe('deleteUpscCseStudyTask', () => {
  it('removes the matching task and leaves others untouched', () => {
    const tasks: UpscCseStudyTask[] = [
      { id: 't1', date: '2026-09-22', title: 'A', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
      { id: 't2', date: '2026-09-22', title: 'B', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
    ];
    expect(deleteUpscCseStudyTask(tasks, 't1')).toEqual([tasks[1]]);
  });
});

describe('tasksForDate', () => {
  it('filters tasks to the given date only', () => {
    const tasks: UpscCseStudyTask[] = [
      { id: 't1', date: '2026-09-22', title: 'A', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
      { id: 't2', date: '2026-09-21', title: 'B', status: 'pending', createdAt: '2026-09-21T00:00:00.000Z' },
    ];
    expect(tasksForDate(tasks, '2026-09-22')).toEqual([tasks[0]]);
  });
});

describe('countStudyTasksByStatus', () => {
  it('counts pending and completed separately', () => {
    const tasks: UpscCseStudyTask[] = [
      { id: 't1', date: '2026-09-22', title: 'A', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
      { id: 't2', date: '2026-09-22', title: 'B', status: 'completed', createdAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T09:00:00.000Z' },
      { id: 't3', date: '2026-09-22', title: 'C', status: 'completed', createdAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T09:30:00.000Z' },
    ];
    expect(countStudyTasksByStatus(tasks)).toEqual({ pending: 1, completed: 2 });
  });
});

describe('recentlyCompletedStudyTasks', () => {
  it('returns completed tasks most-recent-first, excluding never-completed ones', () => {
    const tasks: UpscCseStudyTask[] = [
      { id: 't1', date: '2026-09-20', title: 'Old', status: 'completed', createdAt: '2026-09-20T00:00:00.000Z', completedAt: '2026-09-20T09:00:00.000Z' },
      { id: 't2', date: '2026-09-22', title: 'New', status: 'completed', createdAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T09:00:00.000Z' },
      { id: 't3', date: '2026-09-22', title: 'Pending', status: 'pending', createdAt: '2026-09-22T00:00:00.000Z' },
    ];
    expect(recentlyCompletedStudyTasks(tasks, 5).map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('respects the limit', () => {
    const tasks: UpscCseStudyTask[] = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      date: '2026-09-22',
      title: `Task ${i}`,
      status: 'completed' as const,
      createdAt: '2026-09-22T00:00:00.000Z',
      completedAt: `2026-09-22T0${i}:00:00.000Z`,
    }));
    expect(recentlyCompletedStudyTasks(tasks, 2)).toHaveLength(2);
  });
});
