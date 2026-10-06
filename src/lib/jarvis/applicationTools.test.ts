import { describe, it, expect } from 'vitest';
import {
  createApplicationTools,
  toJarvisWorkspace,
  apfcStudyStateTool,
  upscStudyStateTool,
  upscCurrentAffairsRevisionTool,
  phdResearchStateTool,
  globalWorkspaceStateTool,
  type ApfcStudyStateInput,
  type UpscStudyStateInput,
  type UpscCurrentAffairsRevisionInput,
  type PhdResearchStateInput,
} from './applicationTools';
import { PYQ_BANK } from '../../data/pyq';
import type { ImportedContent } from '../contentImport';
import type { RevisionQueue } from '../revisionQueue';
import type { MicroTarget } from '../microTarget';

// Real fixtures only use stable, already-committed constants (PYQ_BANK, a real syllabus topic
// id) or fully synthetic data the tools' own inputs are typed to accept — never the browser's
// real localStorage/session, so these tests never depend on what a real user has done.

const emptyApfcInput: ApfcStudyStateInput = {
  completedTopics: {},
  pyqAttempts: [],
  bookmarkedPyqIds: [],
  revisionQueue: {},
  today: '2026-10-03',
};

const emptyUpscInput: UpscStudyStateInput = {
  coverage: {},
  attempts: [],
  bookmarkedPyqIds: [],
  revisionQueue: {},
  importedContent: [],
  today: '2026-10-03',
};

function makeCurrentAffairsItem(id: string, title: string, eventDate?: string): ImportedContent {
  return {
    id,
    workspaceId: 'upsc_cse',
    contentType: 'current_affairs',
    title,
    rawContent: '',
    provenance: { importedAt: '2026-09-01T00:00:00.000Z' },
    metadata: eventDate ? { eventDate } : undefined,
  };
}

function makeMicroTarget(overrides: Partial<MicroTarget> = {}): MicroTarget {
  return {
    id: 'mt-1',
    title: 'Read chapter 3',
    status: 'pending',
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePhdContentItem(id: string, contentType: 'research_document' | 'bibliography', readingStatus?: string): ImportedContent {
  return {
    id,
    workspaceId: 'phd_research',
    contentType,
    title: `Item ${id}`,
    rawContent: '',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    metadata: readingStatus ? { readingStatus } : undefined,
  };
}

describe('createApplicationTools', () => {
  it('creates all five application tools', () => {
    expect(createApplicationTools()).toHaveLength(5);
  });

  it('gives every tool a unique id', () => {
    const ids = createApplicationTools().map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every application tool read-only', () => {
    for (const tool of createApplicationTools()) {
      expect(tool.access).toBe('read');
    }
  });

  it('scopes every tool to exactly one workspace, matching its id prefix', () => {
    expect(apfcStudyStateTool.workspaces).toEqual(['apfc']);
    expect(upscStudyStateTool.workspaces).toEqual(['upsc']);
    expect(upscCurrentAffairsRevisionTool.workspaces).toEqual(['upsc']);
    expect(phdResearchStateTool.workspaces).toEqual(['phd']);
    expect(globalWorkspaceStateTool.workspaces).toEqual(['global']);
  });
});

describe('toJarvisWorkspace', () => {
  it('maps every application WorkspaceKind to its JarvisWorkspace', () => {
    expect(toJarvisWorkspace('apfc')).toBe('apfc');
    expect(toJarvisWorkspace('upsc_cse')).toBe('upsc');
    expect(toJarvisWorkspace('phd_research')).toBe('phd');
  });
});

describe('apfc.study_state', () => {
  it('uses the Phase 1 success contract and reflects an empty due/weak state honestly', async () => {
    const result = await apfcStudyStateTool.run(emptyApfcInput, { workspace: 'apfc', timestamp: emptyApfcInput.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.dueRevisionCount).toBe(0);
      expect(result.data.weakTopicCount).toBe(0);
      expect(result.summary.length).toBeGreaterThan(0);
    }
  });

  it('reports a bookmarked, unseen PYQ as due — the same authoritative revision-queue rule the Dashboard uses', async () => {
    const bookmarkedId = PYQ_BANK[0].id;
    const input: ApfcStudyStateInput = { ...emptyApfcInput, bookmarkedPyqIds: [bookmarkedId] };
    const result = await apfcStudyStateTool.run(input, { workspace: 'apfc', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.dueRevisionCount).toBe(1);
  });

  it('counts a covered-but-undertested topic as weak, via the real selectWeakTopics engine', async () => {
    const input: ApfcStudyStateInput = { ...emptyApfcInput, completedTopics: { 'en-1': true } };
    const result = await apfcStudyStateTool.run(input, { workspace: 'apfc', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.weakTopicCount).toBeGreaterThanOrEqual(1);
      // No PYQ attempted on it yet, so there is no accuracy to report — never fabricated as 0.
      expect(result.data.lowestWeakTopicAccuracyPct).toBeNull();
    }
  });
});

describe('upsc.study_state', () => {
  it('uses the Phase 1 success contract and delegates to generateTodaysStudyItems', async () => {
    const result = await upscStudyStateTool.run(emptyUpscInput, { workspace: 'upsc', timestamp: emptyUpscInput.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(result.data.currentAffairsDueCount).toBe(0);
    }
  });

  it('counts only current_affairs_revision items toward currentAffairsDueCount', async () => {
    const dueItem = makeCurrentAffairsItem('ca-1', 'Due Event', '2026-09-01');
    const revisionQueue: RevisionQueue = { 'ca-1': { pyqId: 'ca-1', box: 1, dueDate: '2026-10-01', lastReviewedDate: null, reviewCount: 0 } };
    const input: UpscStudyStateInput = { ...emptyUpscInput, importedContent: [dueItem], revisionQueue };
    const result = await upscStudyStateTool.run(input, { workspace: 'upsc', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.currentAffairsDueCount).toBe(1);
  });
});

describe('upsc.current_affairs_revision', () => {
  it('returns only items both tracked in the revision queue AND actually due today', async () => {
    const due = makeCurrentAffairsItem('ca-due', 'Due Event', '2026-09-01');
    const notYetDue = makeCurrentAffairsItem('ca-future', 'Future Event');
    const untracked = makeCurrentAffairsItem('ca-untracked', 'Never added to revision');
    const revisionQueue: RevisionQueue = {
      'ca-due': { pyqId: 'ca-due', box: 1, dueDate: '2026-10-01', lastReviewedDate: null, reviewCount: 0 },
      'ca-future': { pyqId: 'ca-future', box: 1, dueDate: '2026-12-01', lastReviewedDate: null, reviewCount: 0 },
    };
    const input: UpscCurrentAffairsRevisionInput = {
      importedContent: [due, notYetDue, untracked],
      revisionQueue,
      today: '2026-10-03',
    };

    const result = await upscCurrentAffairsRevisionTool.run(input, { workspace: 'upsc', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.dueItems).toHaveLength(1);
      expect(result.data.dueItems[0]).toMatchObject({ id: 'ca-due', title: 'Due Event', eventDate: '2026-09-01', dueDate: '2026-10-01' });
    }
  });

  it('never treats an untracked current-affairs item as due, even though getDueItems would synthesise one', async () => {
    const untracked = makeCurrentAffairsItem('ca-untracked', 'Never added to revision');
    const input: UpscCurrentAffairsRevisionInput = { importedContent: [untracked], revisionQueue: {}, today: '2026-10-03' };
    const result = await upscCurrentAffairsRevisionTool.run(input, { workspace: 'upsc', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.dueItems).toHaveLength(0);
  });
});

describe('phd.research_state', () => {
  const baseInput: PhdResearchStateInput = {
    researchStartDate: '2024-01-01',
    topicAreas: [],
    microTargets: [],
    importedContent: [],
    notesCount: 0,
    today: '2026-10-03',
  };

  it('reflects zero overdue targets and zero reading-status activity honestly when there is none', async () => {
    const result = await phdResearchStateTool.run(baseInput, { workspace: 'phd', timestamp: baseInput.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.overdueMicroTargetCount).toBe(0);
      expect(result.data.mostOverdueDays).toBeNull();
    }
  });

  it('reports overdue micro-targets and how many days, via the existing dashboard/research-duration engines', async () => {
    const input: PhdResearchStateInput = { ...baseInput, microTargets: [makeMicroTarget({ targetDate: '2026-09-01' })] };
    const result = await phdResearchStateTool.run(input, { workspace: 'phd', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.overdueMicroTargetCount).toBe(1);
      expect(result.data.mostOverdueDays).toBeGreaterThan(0);
    }
  });

  it('reports research-document and bibliography reading-status counts separately, via the existing engine', async () => {
    const input: PhdResearchStateInput = {
      ...baseInput,
      importedContent: [makePhdContentItem('doc-1', 'research_document', 'unread'), makePhdContentItem('bib-1', 'bibliography', 'read')],
    };
    const result = await phdResearchStateTool.run(input, { workspace: 'phd', timestamp: input.today });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.researchDocumentReadingCounts).toEqual({ unread: 1, reading: 0, read: 0, reviewed: 0 });
      expect(result.data.bibliographyReadingCounts).toEqual({ unread: 0, reading: 0, read: 1, reviewed: 0 });
      expect(result.data.researchDocumentsToContinueCount).toBe(1);
      expect(result.data.bibliographyToContinueCount).toBe(0);
    }
  });
});

describe('global.workspace_state', () => {
  it('reports the active workspace through the existing workspace registry', async () => {
    const result = await globalWorkspaceStateTool.run({ activeWorkspaceId: 'upsc_cse' }, { workspace: 'global', timestamp: '2026-10-03' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.workspace).toBe('upsc');
      expect(result.data.label.length).toBeGreaterThan(0);
    }
  });
});

describe('tool read-only behaviour', () => {
  it('never mutates its input (APFC tool)', async () => {
    const input: ApfcStudyStateInput = { ...emptyApfcInput, revisionQueue: { 'pyq-1': { pyqId: 'pyq-1', box: 1, dueDate: '2026-10-03', lastReviewedDate: null, reviewCount: 0 } } };
    const snapshot = JSON.parse(JSON.stringify(input));
    await apfcStudyStateTool.run(input, { workspace: 'apfc', timestamp: input.today });
    expect(input).toEqual(snapshot);
  });

  it('never mutates its input (PhD tool)', async () => {
    const input: PhdResearchStateInput = {
      researchStartDate: '2024-01-01',
      topicAreas: [],
      microTargets: [makeMicroTarget({ targetDate: '2026-09-01' })],
      importedContent: [makePhdContentItem('doc-1', 'research_document', 'unread')],
      notesCount: 0,
      today: '2026-10-03',
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    await phdResearchStateTool.run(input, { workspace: 'phd', timestamp: input.today });
    expect(input).toEqual(snapshot);
  });
});
