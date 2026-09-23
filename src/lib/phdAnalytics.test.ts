import { describe, it, expect } from 'vitest';
import { computePhdAnalytics, type ComputePhdAnalyticsInput } from './phdAnalytics';
import type { PhdTopicArea } from './phdTopicArea';
import type { MicroTarget } from './microTarget';
import type { ImportedContent } from './contentImport';

function topicArea(overrides: Partial<PhdTopicArea> = {}): PhdTopicArea {
  return { id: 'area-1', title: 'Colonial Land Policy', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function target(overrides: Partial<MicroTarget> = {}): MicroTarget {
  return { id: 't1', title: 'Read source', status: 'pending', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: 'c1',
    workspaceId: 'phd_research',
    contentType: 'research_document',
    title: 'A document',
    rawContent: 'x',
    provenance: { sourceFilename: 'x.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

function baseInput(overrides: Partial<ComputePhdAnalyticsInput> = {}): ComputePhdAnalyticsInput {
  return {
    researchStartDate: '2023-12-21',
    topicAreas: [],
    microTargets: [],
    importedContent: [],
    notesCount: 0,
    today: '2026-09-22',
    ...overrides,
  };
}

describe('computePhdAnalytics — research duration', () => {
  it('computes duration from the real, fixed research start date (21 Dec 2023)', () => {
    const snapshot = computePhdAnalytics(baseInput());
    expect(snapshot.researchStartDate).toBe('2023-12-21');
    expect(snapshot.duration.totalDays).toBeGreaterThan(0);
  });

  it('never reports a negative duration when today is before the start date', () => {
    const snapshot = computePhdAnalytics(baseInput({ today: '2020-01-01' }));
    expect(snapshot.duration).toEqual({ totalDays: 0, years: 0, months: 0, days: 0 });
  });
});

describe('computePhdAnalytics — Topic Area analytics', () => {
  it('counts linked content, active/completed/overdue targets per Topic Area from real data', () => {
    const topicAreas = [topicArea({ id: 'area-1' }), topicArea({ id: 'area-2', title: 'Famine Policy' })];
    const microTargets = [
      target({ id: 't1', contextId: 'area-1', status: 'pending', targetDate: '2026-09-01' }), // overdue
      target({ id: 't2', contextId: 'area-1', status: 'completed', completedAt: '2026-09-10T00:00:00.000Z' }),
      target({ id: 't3', contextId: 'area-2', status: 'in_progress' }),
    ];
    const importedContent = [
      content({ id: 'c1', metadata: { topicAreaId: 'area-1' } }),
      content({ id: 'c2', contentType: 'bibliography', metadata: { topicAreaId: 'area-1' } }),
      content({ id: 'c3' }), // unlinked to any Topic Area
    ];
    const snapshot = computePhdAnalytics(baseInput({ topicAreas, microTargets, importedContent, today: '2026-09-22' }));

    expect(snapshot.topicAreaCount).toBe(2);
    const area1 = snapshot.topicAreas.find((t) => t.topicArea.id === 'area-1')!;
    expect(area1.linkedContentCount).toBe(2);
    expect(area1.activeTargetCount).toBe(1);
    expect(area1.completedTargetCount).toBe(1);
    expect(area1.overdueTargetCount).toBe(1);

    const area2 = snapshot.topicAreas.find((t) => t.topicArea.id === 'area-2')!;
    expect(area2.linkedContentCount).toBe(0);
    expect(area2.activeTargetCount).toBe(1);
  });
});

describe('computePhdAnalytics — research material counts', () => {
  it('classifies imported content by real contentType, never miscounting', () => {
    const importedContent = [
      content({ id: 'c1', contentType: 'research_document' }),
      content({ id: 'c2', contentType: 'bibliography' }),
      content({ id: 'c3', contentType: 'other' }),
    ];
    const snapshot = computePhdAnalytics(baseInput({ importedContent, notesCount: 4 }));
    expect(snapshot.materialCounts).toEqual({ researchDocuments: 1, bibliographyRecords: 1, notes: 4, otherImportedContent: 1 });
  });

  it('never double-counts notes inside otherImportedContent (notes are supplied separately, via notesCount)', () => {
    const importedContent = [content({ id: 'c1', contentType: 'note' })];
    const snapshot = computePhdAnalytics(baseInput({ importedContent, notesCount: 1 }));
    expect(snapshot.materialCounts.otherImportedContent).toBe(0);
  });
});

describe('computePhdAnalytics — micro-target analytics', () => {
  it('counts by status and computes a real completion rate, never fabricated', () => {
    const microTargets = [
      target({ id: 't1', status: 'pending' }),
      target({ id: 't2', status: 'in_progress' }),
      target({ id: 't3', status: 'completed', completedAt: 'x' }),
      target({ id: 't4', status: 'completed', completedAt: 'x' }),
    ];
    const snapshot = computePhdAnalytics(baseInput({ microTargets }));
    expect(snapshot.microTargetCounts).toEqual({ pending: 1, in_progress: 1, completed: 2 });
    expect(snapshot.completionRatePct).toBe(50);
  });

  it('completionRatePct is 0, never NaN, when there are no targets at all', () => {
    const snapshot = computePhdAnalytics(baseInput({ microTargets: [] }));
    expect(snapshot.completionRatePct).toBe(0);
  });

  it('overdue/upcoming target counts reuse the existing microTarget module logic', () => {
    const microTargets = [
      target({ id: 'past', status: 'pending', targetDate: '2026-09-01' }),
      target({ id: 'future', status: 'pending', targetDate: '2026-10-01' }),
    ];
    const snapshot = computePhdAnalytics(baseInput({ microTargets, today: '2026-09-22' }));
    expect(snapshot.overdueTargetCount).toBe(1);
    expect(snapshot.upcomingTargetCount).toBe(1);
  });
});

describe('computePhdAnalytics — activity from real timestamps only', () => {
  it('groups completed-target and imported-content activity by real calendar day', () => {
    const microTargets = [target({ id: 't1', status: 'completed', completedAt: '2026-09-20T10:00:00.000Z' })];
    const importedContent = [content({ id: 'c1', provenance: { sourceFilename: 'x', originalFormat: 'markdown', importedAt: '2026-09-20T08:00:00.000Z' } })];
    const snapshot = computePhdAnalytics(baseInput({ microTargets, importedContent }));
    const day = snapshot.activityByDate.find((d) => d.date === '2026-09-20')!;
    expect(day.completedTargets).toBe(1);
    expect(day.importedContent).toBe(1);
  });

  it('a pending/in_progress target never contributes to activityByDate (no completedAt to group by)', () => {
    const microTargets = [target({ id: 't1', status: 'in_progress' })];
    const snapshot = computePhdAnalytics(baseInput({ microTargets }));
    expect(snapshot.activityByDate).toEqual([]);
  });

  it('activityByDate is sorted most-recent-first', () => {
    const microTargets = [
      target({ id: 't1', status: 'completed', completedAt: '2026-09-01T00:00:00.000Z' }),
      target({ id: 't2', status: 'completed', completedAt: '2026-09-15T00:00:00.000Z' }),
    ];
    const snapshot = computePhdAnalytics(baseInput({ microTargets }));
    expect(snapshot.activityByDate.map((d) => d.date)).toEqual(['2026-09-15', '2026-09-01']);
  });

  it('never fabricates hours worked, pages read, papers completed, a productivity score, or a research-progress percentage — none of those fields exist on the snapshot', () => {
    const snapshot = computePhdAnalytics(baseInput());
    expect(snapshot).not.toHaveProperty('hoursWorked');
    expect(snapshot).not.toHaveProperty('pagesRead');
    expect(snapshot).not.toHaveProperty('papersCompleted');
    expect(snapshot).not.toHaveProperty('productivityScore');
    expect(snapshot).not.toHaveProperty('researchProgressPct');
  });
});
