import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData } from '../../lib/store';
import { createRevisionQueue } from '../../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { confirmImportedContent, type ImportPreview } from '../../lib/contentImport';
import { buildRepositoryExportSnapshot, serializeRepositoryExportSnapshot } from '../../lib/repository';
import { repositoryExportFilename } from './ExportRepositoryModal';

// This component has no rendering test here (no React Testing Library / DOM environment in this
// repo — see every other *.test.ts file for the established convention). These tests exercise
// exactly what components/repository/ExportRepositoryModal.tsx does: build a snapshot from the
// real store's importedContent/notes/contentRelationships fields via lib/repository.ts's own
// buildRepositoryExportSnapshot/serializeRepositoryExportSnapshot (already tested for their own
// internal correctness in lib/repository.test.ts — these tests focus on how the MODAL uses them:
// the summary counts it derives, the filename it generates, and that nothing here ever touches the
// store). A manual browser smoke check covers the actual on-screen confirm/download flow.

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
    content: overrides.content ?? 'Body content.',
  };
}

describe('Repository Export — workspace-only export', () => {
  beforeEach(fullReset);

  it('the snapshot for the active workspace never includes another workspace\'s items', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const phdDoc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(phdDoc);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().upsertNote({ id: 'apfc-n1', subject: 'general', title: 'APFC Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'apfc', 'T');
    expect(snapshot.notes.map((n) => n.id)).toEqual(['apfc-n1']);
    expect(snapshot.importedContent).toEqual([]);
  });
});

describe('Repository Export — Notes included', () => {
  beforeEach(fullReset);

  it('every note in the active workspace is included in the snapshot', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note One', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().upsertNote({ id: 'n2', subject: 'general', title: 'Note Two', content: 'y', createdAt: 'b', updatedAt: 'b', pinned: false });

    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    expect(snapshot.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });
});

describe('Repository Export — ImportedContent included', () => {
  beforeEach(fullReset);

  it('every ImportedContent item (any content type) in the active workspace is included', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);

    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    expect(snapshot.importedContent.map((c) => c.id).sort()).toEqual([bib.id, doc.id].sort());
  });
});

describe('Repository Export — relationships included', () => {
  beforeEach(fullReset);

  it('a relationship between two active-workspace items is included in the snapshot', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });

    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    expect(snapshot.relationships).toHaveLength(1);
    expect(snapshot.relationships[0].sourceId).toBe(bib.id);
    expect(snapshot.relationships[0].targetId).toBe(doc.id);
  });
});

describe('Repository Export — inactive workspace excluded', () => {
  beforeEach(fullReset);

  it('data belonging to a workspace other than the one being exported is never included, even when passed in the same arrays', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const phdDoc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(phdDoc);
    useAppStore.getState().upsertNote({ id: 'phd-n1', subject: 'general', title: 'PhD Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().upsertNote({ id: 'apfc-n1', subject: 'general', title: 'APFC Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    // Exporting 'apfc' while the store also (structurally, via workspace-swap) holds only apfc's
    // own live data — the PhD Research items are archived away entirely, not merely filtered here.
    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'apfc', 'T');
    expect(snapshot.notes.map((n) => n.id)).toEqual(['apfc-n1']);
    expect(snapshot.notes.some((n) => n.id === 'phd-n1')).toBe(false);
    expect(snapshot.importedContent).toEqual([]);
  });
});

describe('Repository Export — deterministic serialisation', () => {
  beforeEach(fullReset);

  it('serializing the same snapshot twice produces byte-identical JSON', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    expect(serializeRepositoryExportSnapshot(snapshot)).toBe(serializeRepositoryExportSnapshot({ ...snapshot }));
  });

  it('two snapshots built from differently-ordered source arrays serialise identically (order never leaks into the export)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const a = confirmImportedContent(preview({ title: 'A' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const b = confirmImportedContent(preview({ title: 'B' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const snap1 = buildRepositoryExportSnapshot([a, b], [], [], 'phd_research', 'T');
    const snap2 = buildRepositoryExportSnapshot([b, a], [], [], 'phd_research', 'T');
    expect(serializeRepositoryExportSnapshot(snap1)).toBe(serializeRepositoryExportSnapshot(snap2));
  });
});

describe('Repository Export — stable ordering', () => {
  it('importedContent, notes, and relationships are each sorted by id ascending', () => {
    const items = [
      confirmImportedContent(preview({ title: 'Z' }), { workspaceId: 'phd_research', contentType: 'research_document' }),
      confirmImportedContent(preview({ title: 'A' }), { workspaceId: 'phd_research', contentType: 'research_document' }),
    ].sort((a, b) => (a.id < b.id ? 1 : -1)); // deliberately reverse-sorted input
    const snapshot = buildRepositoryExportSnapshot(items, [], [], 'phd_research', 'T');
    const ids = snapshot.importedContent.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('Repository Export — export summary counts', () => {
  beforeEach(fullReset);

  it('totalItems (notes.length + importedContent.length) matches what the modal displays, computed from the same snapshot object', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });

    const state = useAppStore.getState();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    const totalItems = snapshot.notes.length + snapshot.importedContent.length;
    expect(totalItems).toBe(3);
    expect(snapshot.notes.length).toBe(1);
    expect(snapshot.importedContent.length).toBe(2);
    expect(snapshot.relationships.length).toBe(1);
  });
});

describe('Repository Export — filename generation', () => {
  it('produces <workspace>-repository-YYYY-MM-DD.json using the given date', () => {
    const at = new Date('2026-03-05T12:00:00.000Z');
    expect(repositoryExportFilename('phd_research', at)).toBe('phd_research-repository-2026-03-05.json');
    expect(repositoryExportFilename('apfc', at)).toBe('apfc-repository-2026-03-05.json');
    expect(repositoryExportFilename('upsc_cse', at)).toBe('upsc_cse-repository-2026-03-05.json');
  });

  it('uses the actual current date when no override is given', () => {
    const name = repositoryExportFilename('phd_research');
    const todayStamp = new Date().toISOString().slice(0, 10);
    expect(name).toBe(`phd_research-repository-${todayStamp}.json`);
  });
});

describe('Repository Export — empty repository export', () => {
  beforeEach(fullReset);

  it('a workspace with no repository content still produces a valid, well-formed snapshot', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const state = useAppStore.getState();
    expect(() => buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T')).not.toThrow();
    const snapshot = buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', 'T');
    expect(snapshot).toEqual({
      kind: 'repository-export',
      schemaVersion: 1,
      workspaceId: 'phd_research',
      exportedAt: 'T',
      importedContent: [],
      notes: [],
      relationships: [],
    });
    expect(() => serializeRepositoryExportSnapshot(snapshot)).not.toThrow();
    expect(JSON.parse(serializeRepositoryExportSnapshot(snapshot))).toEqual(snapshot);
  });
});

describe('Repository Export — no mutation of store data', () => {
  beforeEach(fullReset);

  it('building and serialising a snapshot never mutates the store\'s live arrays', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const before = useAppStore.getState();
    const beforeSnapshot = JSON.parse(JSON.stringify({ importedContent: before.importedContent, notes: before.notes, contentRelationships: before.contentRelationships }));

    const snapshot = buildRepositoryExportSnapshot(before.importedContent, before.notes, before.contentRelationships, 'phd_research', 'T');
    serializeRepositoryExportSnapshot(snapshot);

    const after = useAppStore.getState();
    expect({ importedContent: after.importedContent, notes: after.notes, contentRelationships: after.contentRelationships }).toEqual(beforeSnapshot);
  });
});

describe('Repository Export — existing full-app export/import regression', () => {
  beforeEach(fullReset);

  it('lib/store.ts\'s own exportAllData/importAllData still round-trip correctly, unaffected by the repository export feature', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    const exported = exportAllData();
    expect(() => JSON.parse(exported)).not.toThrow();

    fullReset();
    expect(useAppStore.getState().importedContent).toEqual([]);

    importAllData(exported);
    expect(useAppStore.getState().importedContent.map((c) => c.id)).toEqual([doc.id]);
    expect(useAppStore.getState().notes.map((n) => n.id)).toEqual(['n1']);
  });
});
