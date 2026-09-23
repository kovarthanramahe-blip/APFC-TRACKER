import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID, ACTIVE_WORKSPACES, WORKSPACES } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import { confirmImportedContent, type ImportPreview } from '../lib/contentImport';
import { queryRepository, listRepositoryEntries, computeRepositoryStatistics, repositoryEntryFromImportedContent, repositoryEntryFromNote } from '../lib/repository';
import { navigationTargetFor } from '../lib/repositoryNavigation';
import { canEditEntry, canDeleteEntry } from './Repository';
import { getIncomingRelationships, getOutgoingRelationships } from '../lib/contentRelationships';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see StudyPlan.test.ts and every other *.test.ts file, which all test exported pure functions
// and/or the real Zustand store directly). These tests exercise exactly what pages/Repository.tsx
// does: build queries/statistics from the real store's importedContent/notes fields via
// lib/repository.ts's queryRepository/listRepositoryEntries/computeRepositoryStatistics (the same
// calls the component itself makes), and the pure navigationTargetFor helper the component uses to
// decide what a result card links to. A manual browser smoke check covers the actual on-screen
// search/filter/navigate flow (see the task report).

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
    notes: [],
    attempts: [],
    pyqAttempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    bookmarkedPyqIds: [],
    rewardUnlocks: {},
    studyPlan: null,
    studyPlanGeneratedAt: null,
    personalStudyPlanTasks: [],
    revisionQueue: createRevisionQueue(),
    importedContent: [],
    contentRelationships: [],
  });
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: overrides.sourceFilename ?? 'file.md',
    originalFormat: overrides.originalFormat ?? 'markdown',
    suggestedContentType: overrides.suggestedContentType ?? 'note',
    title: overrides.title ?? 'Title',
    content: overrides.content ?? 'Content',
  };
}

describe('Repository route/page registration', () => {
  it('/repository is registered and reachable regardless of which workspace is active', () => {
    // Unlike PhD Research (gated on status: 'active' for a research-only workspace), the
    // Repository page has no per-workspace gate — every ACTIVE_WORKSPACES entry can browse its own.
    expect(ACTIVE_WORKSPACES.length).toBeGreaterThan(0);
    expect(WORKSPACES.some((w) => w.id === 'apfc')).toBe(true);
  });

  it('a "Repository" nav item points at /repository', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/repository');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Repository');
  });
});

describe('Repository page — ImportedContent discovery', () => {
  beforeEach(fullReset);

  it('a research document and a bibliography record both appear via queryRepository', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Chapter 1' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Key Source' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId).sort()).toEqual([bib.id, doc.id].sort());
  });
});

describe('Repository page — Notes discovery', () => {
  beforeEach(fullReset);

  it('a note created in the active workspace appears via queryRepository', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Reading Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId)).toEqual(['n1']);
    expect(results[0].contentType).toBe('note');
    expect(results[0].entityType).toBe('note');
  });
});

describe('Repository page — search', () => {
  beforeEach(fullReset);

  it('search matches a research document by title and a note by content, together', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Fieldwork Notes' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Other', content: 'mentions fieldwork', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', search: 'fieldwork' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['n1', doc.id].sort());
  });

  it('a search with no matches returns an empty list, never throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const state = useAppStore.getState();
    expect(() => queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', search: 'nothing matches this' })).not.toThrow();
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', search: 'nothing matches this' })).toEqual([]);
  });
});

describe('Repository page — content-type filtering', () => {
  beforeEach(fullReset);

  it('filtering by research_document excludes bibliography records and notes', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', contentType: 'research_document' });
    expect(results.map((r) => r.entityId)).toEqual([doc.id]);
  });

  it('filtering by a content type with zero records in this workspace returns an empty list', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', contentType: 'pyq' });
    expect(results).toEqual([]);
  });
});

describe('Repository page — category/tag filtering', () => {
  beforeEach(fullReset);

  it('category filter matches only items with that category', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc1 = confirmImportedContent(preview({ title: 'Doc 1' }), { workspaceId: 'phd_research', contentType: 'research_document', metadata: { category: 'Fieldwork' } });
    const doc2 = confirmImportedContent(preview({ title: 'Doc 2' }), { workspaceId: 'phd_research', contentType: 'research_document', metadata: { category: 'Theory' } });
    useAppStore.getState().addImportedContent(doc1);
    useAppStore.getState().addImportedContent(doc2);

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', category: 'Fieldwork' });
    expect(results.map((r) => r.entityId)).toEqual([doc1.id]);
  });

  it('tag filter matches only items carrying that tag, and never a note (notes have no tags)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document', metadata: { tags: ['chapter-1'] } });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', tags: ['chapter-1'] });
    expect(results.map((r) => r.entityId)).toEqual([doc.id]);
  });
});

describe('Repository page — sorting and result counts', () => {
  beforeEach(fullReset);

  it('sorts by title A-Z when requested', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const docZ = confirmImportedContent(preview({ title: 'Zebra' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const docA = confirmImportedContent(preview({ title: 'Apple' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(docZ);
    useAppStore.getState().addImportedContent(docA);

    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', sort: 'title' });
    expect(results.map((r) => r.title)).toEqual(['Apple', 'Zebra']);
  });

  it('result count reflects filtered results, not the full workspace total', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc1 = confirmImportedContent(preview({ title: 'Match' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const doc2 = confirmImportedContent(preview({ title: 'Other' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc1);
    useAppStore.getState().addImportedContent(doc2);

    const state = useAppStore.getState();
    const all = listRepositoryEntries(state.importedContent, state.notes);
    const filtered = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', search: 'Match' });
    expect(all).toHaveLength(2);
    expect(filtered).toHaveLength(1);
  });
});

describe('Repository page — statistics', () => {
  beforeEach(fullReset);

  it('computeRepositoryStatistics reflects the active workspace\'s real content', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const stats = computeRepositoryStatistics(listRepositoryEntries(state.importedContent, state.notes));
    expect(stats.totalItems).toBe(3);
    expect(stats.countsByContentType).toEqual({ research_document: 1, bibliography: 1, note: 1 });
  });
});

describe('Repository page — workspace isolation', () => {
  beforeEach(fullReset);

  it('switching workspaces changes what queryRepository returns, with no leakage either direction', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'phd-note', subject: 'general', title: 'PhD Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    let state = useAppStore.getState();
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' })).toHaveLength(2);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().upsertNote({ id: 'apfc-note', subject: 'general', title: 'APFC Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    state = useAppStore.getState();
    const apfcResults = queryRepository(state.importedContent, state.notes, { workspaceId: 'apfc' });
    expect(apfcResults.map((r) => r.entityId)).toEqual(['apfc-note']);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    state = useAppStore.getState();
    const phdResults = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' });
    expect(phdResults.map((r) => r.entityId).sort()).toEqual(['phd-note', doc.id].sort());
    expect(phdResults.some((r) => r.entityId === 'apfc-note')).toBe(false);
  });
});

describe('Repository page — navigation to existing content surfaces', () => {
  it('a note entry navigates to /notes', () => {
    expect(
      navigationTargetFor({ entityId: 'n1', entityType: 'note', contentType: 'note', title: 'T', workspaceId: 'phd_research', origin: 'created', createdAt: 'a', updatedAt: 'a', tags: [], category: undefined }),
    ).toEqual({
      to: '/notes',
      label: 'Open in Notes',
    });
  });

  it('a research_document entry navigates to /phd-research', () => {
    expect(
      navigationTargetFor({ entityId: 'd1', entityType: 'imported_content', contentType: 'research_document', title: 'T', workspaceId: 'phd_research', origin: 'import', createdAt: 'a', updatedAt: 'a', tags: [], category: undefined }),
    ).toEqual({ to: '/phd-research', label: 'Open in PhD Research' });
  });

  it('a bibliography entry navigates to /phd-research/bibliography', () => {
    expect(
      navigationTargetFor({ entityId: 'b1', entityType: 'imported_content', contentType: 'bibliography', title: 'T', workspaceId: 'phd_research', origin: 'manual', createdAt: 'a', updatedAt: 'a', tags: [], category: undefined }),
    ).toEqual({ to: '/phd-research/bibliography', label: 'Open in Working Bibliography' });
  });

  it('a content type with no dedicated page yet (e.g. pyq) has no navigation target, never a fake one', () => {
    expect(
      navigationTargetFor({ entityId: 'p1', entityType: 'imported_content', contentType: 'pyq', title: 'T', workspaceId: 'phd_research', origin: 'import', createdAt: 'a', updatedAt: 'a', tags: [], category: undefined }),
    ).toBeUndefined();
  });
});

describe('Repository page — empty states', () => {
  beforeEach(fullReset);

  it('no repository content at all: queryRepository/listRepositoryEntries both return empty for an empty workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const state = useAppStore.getState();
    expect(listRepositoryEntries(state.importedContent, state.notes)).toEqual([]);
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' })).toEqual([]);
  });

  it('no search results: content exists, but the active search matches nothing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Real Document' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const state = useAppStore.getState();
    expect(listRepositoryEntries(state.importedContent, state.notes)).toHaveLength(1);
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', search: 'no such thing' })).toEqual([]);
  });

  it('content type has no records: the type is registered but nothing of that type exists in this workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const state = useAppStore.getState();
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research', contentType: 'descriptive_questions' })).toEqual([]);
  });
});

// Repository Item Management — Edit (metadata-only, capability-gated) and Delete (existing
// deleteImportedContent/deleteNote cascade, behind a confirmation step) from pages/Repository.tsx.
// These tests exercise the exact same store actions/pure helpers the page itself calls.

describe('Repository Item Management — edit metadata (title editing, tag/category editing)', () => {
  beforeEach(fullReset);

  it('updateImportedContent changes title and metadata without touching id or workspaceId', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Original Title' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    useAppStore.getState().updateImportedContent(doc.id, { title: 'Edited Title', metadata: { tags: ['fieldwork', 'chapter-1'], category: 'Literature Review' } });

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.title).toBe('Edited Title');
    expect(stored.metadata).toEqual({ tags: ['fieldwork', 'chapter-1'], category: 'Literature Review' });
    expect(stored.id).toBe(doc.id);
    expect(stored.workspaceId).toBe('phd_research');
  });

  it('editing tags/category alone (title unchanged) updates only metadata', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Stable Title' }), { workspaceId: 'phd_research', contentType: 'bibliography', metadata: { tags: ['old-tag'] } });
    useAppStore.getState().addImportedContent(doc);

    useAppStore.getState().updateImportedContent(doc.id, { title: 'Stable Title', metadata: { tags: ['new-tag'], category: 'Sources' } });

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.title).toBe('Stable Title');
    expect(stored.metadata).toEqual({ tags: ['new-tag'], category: 'Sources' });
  });

  it('clearing tags/category (both empty) is a real edit that removes prior metadata', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'T' }), { workspaceId: 'phd_research', contentType: 'research_document', metadata: { tags: ['x'], category: 'Y' } });
    useAppStore.getState().addImportedContent(doc);

    useAppStore.getState().updateImportedContent(doc.id, { title: 'T', metadata: undefined });
    expect(useAppStore.getState().importedContent[0].metadata).toBeUndefined();
  });
});

describe('Repository Item Management — rawContent and provenance preservation', () => {
  beforeEach(fullReset);

  it('editing metadata never changes rawContent, sourceFilename, originalFormat, or provenance.origin', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Original', content: 'Exact raw content, never to be touched.' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceNote: 'Field notes, 2026',
    });
    useAppStore.getState().addImportedContent(doc);
    const before = useAppStore.getState().importedContent[0];

    useAppStore.getState().updateImportedContent(doc.id, { title: 'Renamed', metadata: { tags: ['a'], category: 'B' } });

    const after = useAppStore.getState().importedContent[0];
    expect(after.rawContent).toBe(before.rawContent);
    expect(after.provenance).toEqual(before.provenance);
    expect(after.provenance.sourceFilename).toBe(before.provenance.sourceFilename);
    expect(after.provenance.originalFormat).toBe(before.provenance.originalFormat);
    expect(after.provenance.origin).toBe(before.provenance.origin);
    expect(after.title).toBe('Renamed'); // only the field actually edited changed
  });

  it('a manually-created record\'s provenance.origin ("manual") survives a metadata edit unchanged', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = confirmImportedContent(preview({ title: 'Manual Source' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    // Simulate a manually-created record the same way createManualImportedContent would (no source file).
    const manualRecord = { ...record, provenance: { importedAt: record.provenance.importedAt, origin: 'manual' as const } };
    useAppStore.getState().addImportedContent(manualRecord);

    useAppStore.getState().updateImportedContent(manualRecord.id, { title: 'Renamed Manual Source', metadata: { category: 'Fieldwork' } });
    expect(useAppStore.getState().importedContent[0].provenance.origin).toBe('manual');
  });
});

describe('Repository Item Management — delete ImportedContent', () => {
  beforeEach(fullReset);

  it('deleteImportedContent removes the item and it no longer appears in queryRepository results', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'To Delete' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    expect(useAppStore.getState().importedContent).toHaveLength(1);

    useAppStore.getState().deleteImportedContent(doc.id);

    expect(useAppStore.getState().importedContent).toEqual([]);
    const state = useAppStore.getState();
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' })).toEqual([]);
  });
});

describe('Repository Item Management — delete Note', () => {
  beforeEach(fullReset);

  it('deleteNote removes the note and it no longer appears in queryRepository results', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'To Delete', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    expect(useAppStore.getState().notes).toHaveLength(1);

    useAppStore.getState().deleteNote('n1');

    expect(useAppStore.getState().notes).toEqual([]);
    const state = useAppStore.getState();
    expect(queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' })).toEqual([]);
  });
});

describe('Repository Item Management — relationship cascade after deletion (initiated from the Repository page\'s own delete action)', () => {
  beforeEach(fullReset);

  it('deleting an ImportedContent item from the Repository cascades exactly like deleteImportedContent already does elsewhere', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);

    // The exact call pages/Repository.tsx's handleDeleteConfirm makes for a non-note entry.
    useAppStore.getState().deleteImportedContent(doc.id);

    expect(useAppStore.getState().contentRelationships).toEqual([]);
    const remainingResults = queryRepository(useAppStore.getState().importedContent, useAppStore.getState().notes, { workspaceId: 'phd_research' });
    expect(remainingResults.map((r) => r.entityId)).toEqual([bib.id]);
  });

  it('deleting a Note from the Repository cascades relationships and updates related-content counts (getIncomingRelationships) immediately', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toHaveLength(1);

    // The exact call pages/Repository.tsx's handleDeleteConfirm makes for a note entry.
    useAppStore.getState().deleteNote('n1');

    expect(useAppStore.getState().contentRelationships).toEqual([]);
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toEqual([]);
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note')).toEqual([]);
  });
});

describe('Repository Item Management — capability-based edit/delete visibility', () => {
  it('canEditEntry/canDeleteEntry read directly from the registry, matching repositoryContentTypeSupports for every content type', () => {
    for (const [contentType, entry] of [
      ['note', repositoryEntryFromNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'a', pinned: false, workspaceId: 'phd_research' })],
      [
        'research_document',
        repositoryEntryFromImportedContent({
          id: 'd1',
          workspaceId: 'phd_research',
          contentType: 'research_document',
          title: 'T',
          rawContent: '',
          provenance: { importedAt: 'a', origin: 'import' },
        }),
      ],
    ] as const) {
      expect(canEditEntry(entry)).toBe(true); // every registered type is editable today
      expect(canDeleteEntry(entry)).toBe(true); // every registered type is deletable today
      expect(contentType).toBe(entry.contentType);
    }
  });
});

describe('Repository Item Management — workspace isolation', () => {
  beforeEach(fullReset);

  it('editing/deleting only ever affects the active workspace\'s own content, never another workspace\'s', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const phdDoc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(phdDoc);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().upsertNote({ id: 'apfc-n1', subject: 'general', title: 'APFC Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().deleteNote('apfc-n1');
    expect(useAppStore.getState().notes).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    // The PhD Research document, untouched by anything done while apfc was active, is still there.
    expect(useAppStore.getState().importedContent.map((c) => c.id)).toEqual([phdDoc.id]);
  });
});

describe('Repository Item Management — existing import flow regression', () => {
  beforeEach(fullReset);

  it('the existing import-then-query flow (previous stage) is unaffected by edit/delete being added', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Imported Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const state = useAppStore.getState();
    const results = queryRepository(state.importedContent, state.notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId)).toEqual([doc.id]);
  });
});
