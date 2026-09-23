import { describe, it, expect } from 'vitest';
import { computePhdDashboardSnapshot, type ComputePhdDashboardSnapshotInput } from './phdDashboard';
import type { PhdTopicArea } from './phdTopicArea';
import type { MicroTarget } from './microTarget';
import type { ImportedContent } from './contentImport';

function baseInput(overrides: Partial<ComputePhdDashboardSnapshotInput> = {}): ComputePhdDashboardSnapshotInput {
  return {
    researchStartDate: '2023-12-21',
    topicAreas: [],
    microTargets: [],
    importedContent: [],
    today: '2026-09-22',
    ...overrides,
  };
}

describe('computePhdDashboardSnapshot', () => {
  it('computes the research duration from the real start date', () => {
    const snapshot = computePhdDashboardSnapshot(baseInput());
    expect(snapshot.duration).toEqual({ totalDays: 1006, years: 2, months: 9, days: 1 });
    expect(snapshot.researchStartDate).toBe('2023-12-21');
  });

  it('topicAreaCount mirrors the real Topic Area list, never fabricated', () => {
    const topicAreas: PhdTopicArea[] = [{ id: 'a1', title: 'A', createdAt: 'x', updatedAt: 'x' }];
    expect(computePhdDashboardSnapshot(baseInput({ topicAreas })).topicAreaCount).toBe(1);
    expect(computePhdDashboardSnapshot(baseInput()).topicAreaCount).toBe(0);
  });

  it('splits micro-targets into active/overdue/upcoming/recently-completed correctly', () => {
    const microTargets: MicroTarget[] = [
      { id: 'overdue', title: 'Overdue', status: 'pending', priority: 'medium', createdAt: 'x', targetDate: '2026-09-01' },
      { id: 'upcoming', title: 'Upcoming', status: 'pending', priority: 'medium', createdAt: 'x', targetDate: '2026-10-01' },
      { id: 'done', title: 'Done', status: 'completed', priority: 'medium', createdAt: 'x', completedAt: '2026-09-20T00:00:00.000Z' },
    ];
    const snapshot = computePhdDashboardSnapshot(baseInput({ microTargets }));
    expect(snapshot.overdueTargets.map((t) => t.id)).toEqual(['overdue']);
    expect(snapshot.activeTargets.map((t) => t.id).sort()).toEqual(['overdue', 'upcoming']);
    expect(snapshot.upcomingTargets.map((t) => t.id)).toEqual(['upcoming']);
    expect(snapshot.recentlyCompletedTargets.map((t) => t.id)).toEqual(['done']);
  });

  it('recentlyImportedContent includes only research_document/bibliography items, most recent first', () => {
    const importedContent: ImportedContent[] = [
      { id: 'c1', workspaceId: 'phd_research', contentType: 'research_document', title: 'Old Doc', rawContent: '', provenance: { importedAt: '2026-09-01T00:00:00.000Z' } },
      { id: 'c2', workspaceId: 'phd_research', contentType: 'bibliography', title: 'New Source', rawContent: '', provenance: { importedAt: '2026-09-20T00:00:00.000Z' } },
      { id: 'c3', workspaceId: 'phd_research', contentType: 'note', title: 'Not counted', rawContent: '', provenance: { importedAt: '2026-09-21T00:00:00.000Z' } },
    ];
    const snapshot = computePhdDashboardSnapshot(baseInput({ importedContent }));
    expect(snapshot.recentlyImportedContent.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('returns a fully honest empty-state snapshot when nothing exists yet', () => {
    const snapshot = computePhdDashboardSnapshot(baseInput());
    expect(snapshot.topicAreaCount).toBe(0);
    expect(snapshot.activeTargets).toEqual([]);
    expect(snapshot.overdueTargets).toEqual([]);
    expect(snapshot.upcomingTargets).toEqual([]);
    expect(snapshot.recentlyCompletedTargets).toEqual([]);
    expect(snapshot.recentlyImportedContent).toEqual([]);
  });
});
