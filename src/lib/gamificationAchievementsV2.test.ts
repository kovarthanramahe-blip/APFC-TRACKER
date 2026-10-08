import { describe, it, expect } from 'vitest';
import { getAchievementsV2Snapshot, ACHIEVEMENTS_V2 } from './gamificationAchievementsV2';

describe('getAchievementsV2Snapshot', () => {
  it('locks everything for a brand-new user with zero of everything', () => {
    const snapshot = getAchievementsV2Snapshot({ masteredRevisionCount: 0, totalTasksCompleted: 0 });
    expect(snapshot.earned).toEqual([]);
    expect(snapshot.locked).toHaveLength(ACHIEVEMENTS_V2.length);
    expect(snapshot.locked.every((a) => a.progressPct === 0)).toBe(true);
  });

  it('earns Revision Master exactly at the threshold, never one short', () => {
    const below = getAchievementsV2Snapshot({ masteredRevisionCount: 9, totalTasksCompleted: 0 });
    expect(below.earned.find((a) => a.id === 'v2-revision-master')).toBeUndefined();

    const atThreshold = getAchievementsV2Snapshot({ masteredRevisionCount: 10, totalTasksCompleted: 0 });
    expect(atThreshold.earned.find((a) => a.id === 'v2-revision-master')).toBeDefined();
  });

  it('earns Planner Pro exactly at the threshold', () => {
    const atThreshold = getAchievementsV2Snapshot({ masteredRevisionCount: 0, totalTasksCompleted: 20 });
    const planner = atThreshold.earned.find((a) => a.id === 'v2-planner-pro');
    expect(planner).toBeDefined();
    expect(planner?.progressPct).toBe(100);
  });

  it('caps progressPct at 100 even when value exceeds threshold', () => {
    const snapshot = getAchievementsV2Snapshot({ masteredRevisionCount: 50, totalTasksCompleted: 0 });
    const revision = snapshot.earned.find((a) => a.id === 'v2-revision-master');
    expect(revision?.progressPct).toBe(100);
  });

  it('computes a proportional progressPct below threshold', () => {
    const snapshot = getAchievementsV2Snapshot({ masteredRevisionCount: 5, totalTasksCompleted: 0 });
    const revision = snapshot.locked.find((a) => a.id === 'v2-revision-master');
    expect(revision?.progressPct).toBe(50);
  });

  it('tags each achievement with its real category, never mixing revision and planning', () => {
    const snapshot = getAchievementsV2Snapshot({ masteredRevisionCount: 10, totalTasksCompleted: 20 });
    expect(snapshot.earned.find((a) => a.id === 'v2-revision-master')?.category).toBe('revision');
    expect(snapshot.earned.find((a) => a.id === 'v2-planner-pro')?.category).toBe('planning');
  });

  it('partitions earned/locked covering exactly every defined achievement, no duplicates or drops', () => {
    const snapshot = getAchievementsV2Snapshot({ masteredRevisionCount: 10, totalTasksCompleted: 0 });
    expect(snapshot.earned.length + snapshot.locked.length).toBe(ACHIEVEMENTS_V2.length);
    const ids = new Set([...snapshot.earned, ...snapshot.locked].map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS_V2.length);
  });
});
