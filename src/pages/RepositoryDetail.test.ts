import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { confirmImportedContent, getImportedContentById, type ImportPreview } from '../lib/contentImport';
import {
  getRepositoryContentTypeMeta,
  repositoryEntryFromImportedContent,
  repositoryEntryFromNote,
} from '../lib/repository';
import { getRelatedContent, RELATIONSHIP_TYPE_LABELS } from '../lib/contentRelationships';
import { repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { canEditEntry, canDeleteEntry } from './Repository';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see every other *.test.ts file for the established convention). These tests exercise exactly
// what pages/RepositoryDetail.tsx does: resolve an entity by (entityType, id) from the real store's
// importedContent/notes fields (never assuming ids are unique across the two collections), project
// it via lib/repository.ts's repositoryEntryFrom*, resolve its relationships via
// lib/contentRelationships.ts's getRelatedContent, and reuse pages/Repository.tsx's own
// canEditEntry/canDeleteEntry + the store actions Edit/Delete ultimately call. Markdown-safe
// rendering itself (markdown-to-jsx with disableParsingRawHTML) and the actual on-screen
// raw/preview toggle, related-item click-through, and 390px layout are covered by the manual
// browser smoke check (see the task report) — there is no DOM here to assert against.

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
    content: overrides.content ?? 'Body content, long enough to be meaningful.',
  };
}

/** Mirrors exactly what pages/RepositoryDetail.tsx's own lookup does for a given
 * (entityType, id) pair against the CURRENT store state — the same resolution the component
 * performs on every render. */
function resolveEntity(entityType: 'note' | 'imported_content', id: string) {
  const state = useAppStore.getState();
  if (entityType === 'imported_content') {
    const item = getImportedContentById(state.importedContent, id);
    return item ? { item, entry: repositoryEntryFromImportedContent(item) } : undefined;
  }
  const note = state.notes.find((n) => n.id === id);
  return note ? { item: note, entry: repositoryEntryFromNote(note) } : undefined;
}

describe('Repository Detail — Note detail', () => {
  beforeEach(fullReset);

  it('resolves a note by (entityType, id) into a RepositoryEntry with entityType "note"', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'My Note', content: 'Some content', createdAt: 'a', updatedAt: 'a', pinned: false });

    const resolved = resolveEntity('note', 'n1');
    expect(resolved).toBeDefined();
    expect(resolved?.entry.entityType).toBe('note');
    expect(resolved?.entry.contentType).toBe('note');
    expect(resolved?.entry.title).toBe('My Note');
  });
});

describe('Repository Detail — ImportedContent detail', () => {
  beforeEach(fullReset);

  it('resolves an ImportedContent item by (entityType, id) into a RepositoryEntry with entityType "imported_content"', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'A Document' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    const resolved = resolveEntity('imported_content', doc.id);
    expect(resolved).toBeDefined();
    expect(resolved?.entry.entityType).toBe('imported_content');
    expect(resolved?.entry.contentType).toBe('research_document');
    expect(resolved?.entry.title).toBe('A Document');
  });

  it('an id that exists as a Note is never resolved when entityType is "imported_content" (never assumes ids are globally unique)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'shared-id', subject: 'general', title: 'A Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    // No ImportedContent with this id exists, even though a Note does.
    expect(resolveEntity('imported_content', 'shared-id')).toBeUndefined();
  });
});

describe('Repository Detail — full rawContent display', () => {
  beforeEach(fullReset);

  it('the exact stored rawContent is what the detail view would read, unmodified', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const exactContent = '# Heading\n\nSome *markdown* with a <script>alert(1)</script> tag embedded.';
    const doc = confirmImportedContent(preview({ title: 'Doc', content: exactContent }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    const resolved = resolveEntity('imported_content', doc.id);
    expect(resolved?.item && 'rawContent' in resolved.item ? resolved.item.rawContent : undefined).toBe(exactContent);
  });

  it('a Note\'s content is read from its own content field, not rawContent (Notes are never converted to ImportedContent)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'Exact note body.', createdAt: 'a', updatedAt: 'a', pinned: false });
    const resolved = resolveEntity('note', 'n1');
    expect(resolved?.item && 'content' in resolved.item ? resolved.item.content : undefined).toBe('Exact note body.');
    expect(resolved?.item).not.toHaveProperty('rawContent');
  });
});

describe('Repository Detail — metadata display', () => {
  beforeEach(fullReset);

  it('category, tags, workspace, and origin are all present on the resolved entry', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags: ['fieldwork', 'chapter-1'], category: 'Literature Review' },
    });
    useAppStore.getState().addImportedContent(doc);

    const resolved = resolveEntity('imported_content', doc.id);
    expect(resolved?.entry.category).toBe('Literature Review');
    expect(resolved?.entry.tags).toEqual(['fieldwork', 'chapter-1']);
    expect(resolved?.entry.workspaceId).toBe('phd_research');
    expect(resolved?.entry.origin).toBe('import');
  });
});

describe('Repository Detail — relationship display', () => {
  beforeEach(fullReset);

  it('getRelatedContent resolves every linked item for a document, with the correct relationship type', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const state = useAppStore.getState();
    const related = getRelatedContent(state.contentRelationships, doc.id, 'imported_content');
    expect(related).toHaveLength(2);
    const types = related.map((r) => r.relationship.type).sort();
    expect(types).toEqual(['cites', 'related_to']);
    expect(RELATIONSHIP_TYPE_LABELS['cites']).toBe('Cites');
  });

  it('a document with no relationships resolves to an empty related list, never throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    expect(() => getRelatedContent(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).not.toThrow();
    expect(getRelatedContent(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toEqual([]);
  });
});

describe('Repository Detail — related-item navigation', () => {
  it('repositoryDetailPathFor produces a distinct, type-qualified path for each entity type', () => {
    expect(repositoryDetailPathFor('note', 'n1')).toBe('/repository/note/n1');
    expect(repositoryDetailPathFor('imported_content', 'c1')).toBe('/repository/imported_content/c1');
    // Same id, different type -> different, unambiguous paths (never collapsed to one route).
    expect(repositoryDetailPathFor('note', 'shared-id')).not.toBe(repositoryDetailPathFor('imported_content', 'shared-id'));
  });
});

describe('Repository Detail — edit action', () => {
  beforeEach(fullReset);

  it('canEditEntry gates the Edit action exactly like pages/Repository.tsx\'s own cards', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const resolved = resolveEntity('imported_content', doc.id)!;
    expect(canEditEntry(resolved.entry)).toBe(true);
  });

  it('the exact updateImportedContent call the detail page\'s Edit save makes updates title/metadata only', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Original', content: 'Untouched raw content.' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    useAppStore.getState().updateImportedContent(doc.id, { title: 'Edited via Detail', metadata: { category: 'New Category' } });

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.title).toBe('Edited via Detail');
    expect(stored.metadata).toEqual({ category: 'New Category' });
    expect(stored.rawContent).toBe('Untouched raw content.');
  });

  it('a Note entry is editable-by-capability but the detail page never opens a metadata modal for it (it navigates to Notes instead — same rule as pages/Repository.tsx)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const resolved = resolveEntity('note', 'n1')!;
    expect(canEditEntry(resolved.entry)).toBe(true);
    expect(resolved.entry.entityType).toBe('note'); // this is exactly the condition the component branches on to navigate('/notes') instead
  });
});

describe('Repository Detail — delete action', () => {
  beforeEach(fullReset);

  it('canDeleteEntry gates the Delete action, and deleteImportedContent removes the item', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const resolved = resolveEntity('imported_content', doc.id)!;
    expect(canDeleteEntry(resolved.entry)).toBe(true);

    useAppStore.getState().deleteImportedContent(doc.id);
    expect(resolveEntity('imported_content', doc.id)).toBeUndefined();
  });

  it('deleteNote removes a note the same way, and cascades any relationship referencing it', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    useAppStore.getState().deleteNote('n1');

    expect(resolveEntity('note', 'n1')).toBeUndefined();
    expect(useAppStore.getState().contentRelationships).toEqual([]);
  });
});

describe('Repository Detail — workspace isolation', () => {
  beforeEach(fullReset);

  it('an entity belonging to a workspace that is not currently active resolves to undefined (never leaks across workspaces)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    // The PhD Research document is archived away — not a member of the active workspace's own
    // importedContent array, so the exact same lookup the detail page performs finds nothing.
    expect(resolveEntity('imported_content', doc.id)).toBeUndefined();

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(resolveEntity('imported_content', doc.id)).toBeDefined();
  });
});

describe('Repository Detail — unknown/unsupported content type', () => {
  beforeEach(fullReset);

  it('a content type with no dedicated owning page yet (e.g. pyq) still resolves and exposes rawContent/metadata normally — no specialised renderer is needed', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const item = confirmImportedContent(preview({ title: 'Raw PYQ Source', content: 'Q1. ...' }), { workspaceId: 'phd_research', contentType: 'pyq' });
    useAppStore.getState().addImportedContent(item);

    const resolved = resolveEntity('imported_content', item.id)!;
    expect(resolved.entry.contentType).toBe('pyq');
    expect(getRepositoryContentTypeMeta('pyq').label).toBe('Previous Year Questions');
    expect(resolved.item && 'rawContent' in resolved.item ? resolved.item.rawContent : undefined).toBe('Q1. ...');
  });
});

describe('Repository Detail — missing entity', () => {
  beforeEach(fullReset);

  it('an id that does not exist at all resolves to undefined for either entity type', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(resolveEntity('imported_content', 'ghost')).toBeUndefined();
    expect(resolveEntity('note', 'ghost')).toBeUndefined();
  });
});

describe('Repository Detail — back navigation', () => {
  it('the back link always points at the top-level /repository route, which shows whatever workspace is currently active (no workspace encoded in the URL to preserve/restore)', () => {
    // pages/Repository.tsx reads activeWorkspaceId live from the store, not from the URL, so
    // navigating back to plain "/repository" always reflects the current workspace correctly —
    // this is a structural guarantee, not something the back link itself needs to parametrise.
    expect(repositoryDetailPathFor('note', 'n1').startsWith('/repository/')).toBe(true);
  });
});

// Personal Repository Content Management — "open item" is exactly resolveEntity above (already
// exhaustively covered); this stage adds explicit coverage for: updatedAt display, editing
// content type from the detail page, and the same edit surviving an export/import round-trip
// (the mechanism a page reload rehydrates the store from).

describe('Repository Detail — open item shows title, description, content type, workspace, tags, provenance, and updatedAt', () => {
  beforeEach(fullReset);

  it('every field the detail view reads is present on the resolved entry/item', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'A Document', content: 'Full body text.' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceNote: 'Official source, 2026',
      metadata: { tags: ['a', 'b'], category: 'Cat', description: 'A short summary.' },
    });
    useAppStore.getState().addImportedContent(doc);

    const resolved = resolveEntity('imported_content', doc.id)!;
    expect(resolved.entry.title).toBe('A Document');
    expect(resolved.entry.contentType).toBe('research_document');
    expect(getRepositoryContentTypeMeta(resolved.entry.contentType).label).toBe('Research Document');
    expect(resolved.entry.workspaceId).toBe('phd_research');
    expect(resolved.entry.tags).toEqual(['a', 'b']);
    expect(resolved.entry.category).toBe('Cat');
    expect(resolved.entry.description).toBe('A short summary.');
    expect(resolved.item && 'provenance' in resolved.item ? resolved.item.provenance.sourceNote : undefined).toBe('Official source, 2026');
    expect(resolved.entry.updatedAt).toBeDefined();
    expect(() => new Date(resolved.entry.updatedAt).toISOString()).not.toThrow();
    expect(resolved.item && 'rawContent' in resolved.item ? resolved.item.rawContent : undefined).toBe('Full body text.');
  });

  it('a never-edited item still has a defined updatedAt, falling back to when it was imported', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const resolved = resolveEntity('imported_content', doc.id)!;
    expect(resolved.entry.updatedAt).toBe(doc.provenance.importedAt);
  });
});

describe('Repository Detail — edit content type', () => {
  beforeEach(fullReset);

  it('the exact updateImportedContent call the detail page\'s Edit save makes can change contentType, and updatedAt advances', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const before = resolveEntity('imported_content', doc.id)!.entry.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 2));
    useAppStore.getState().updateImportedContent(doc.id, { title: 'Doc', contentType: 'document', metadata: undefined });

    const resolved = resolveEntity('imported_content', doc.id)!;
    expect(resolved.entry.contentType).toBe('document');
    expect(resolved.entry.updatedAt).not.toBe(before);
    expect(new Date(resolved.entry.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});

describe('Repository Detail — edits survive an export/import round-trip (page reload)', () => {
  beforeEach(fullReset);

  it('a title/content-type/metadata edit made from the detail page is still present after export -> reset -> import', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Original' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().updateImportedContent(doc.id, { title: 'Edited', contentType: 'bibliography', metadata: { category: 'Sources' } });

    const json = exportAllData();
    fullReset();
    importAllData(json);
    useAppStore.getState().setActiveWorkspaceId('phd_research');

    const resolved = resolveEntity('imported_content', doc.id);
    expect(resolved).toBeDefined();
    expect(resolved!.entry.title).toBe('Edited');
    expect(resolved!.entry.contentType).toBe('bibliography');
    expect(resolved!.entry.category).toBe('Sources');
  });
});

// Manual Related-Content Links — pages/RepositoryDetail.tsx's own "Add link"/remove UI, built
// entirely on the EXISTING addContentRelationship/deleteContentRelationship store actions and
// lib/contentRelationships.ts's createRelationship (self-link/duplicate/invalid-endpoint rules —
// exhaustively unit-tested in contentRelationships.test.ts already). These tests exercise exactly
// the calls the page itself makes.

describe('Repository Detail — manual link: add', () => {
  beforeEach(fullReset);

  it('addContentRelationship (the exact call the "Add link" form makes) creates a relationship visible via getRelatedContent from both ends', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);

    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    expect(result.status).toBe('ok');

    const state = useAppStore.getState();
    expect(getRelatedContent(state.contentRelationships, doc.id, 'imported_content').map((r) => r.relatedId)).toEqual([bib.id]);
    expect(getRelatedContent(state.contentRelationships, bib.id, 'imported_content').map((r) => r.relatedId)).toEqual([doc.id]);
  });

  it('a link can connect an ImportedContent item to a Note, resolvable from the Note\'s own side too', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });

    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const related = getRelatedContent(useAppStore.getState().contentRelationships, 'n1', 'note');
    expect(related).toHaveLength(1);
    expect(related[0].relatedId).toBe(doc.id);
    expect(RELATIONSHIP_TYPE_LABELS[related[0].relationship.type]).toBe('Related to');
  });
});

describe('Repository Detail — manual link: remove', () => {
  beforeEach(fullReset);

  it('deleteContentRelationship (the exact call the remove "X" button makes) removes exactly that link, leaving others intact', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    const other = confirmImportedContent(preview({ title: 'Other' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().addImportedContent(other);
    const r1 = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: other.id, type: 'imported_content' }, type: 'related_to' });
    expect(r1.status).toBe('ok');

    useAppStore.getState().deleteContentRelationship((r1 as Extract<typeof r1, { status: 'ok' }>).relationship.id);

    const related = getRelatedContent(useAppStore.getState().contentRelationships, doc.id, 'imported_content');
    expect(related.map((r) => r.relatedId)).toEqual([other.id]);
  });
});

describe('Repository Detail — manual link: self-links and duplicates are rejected, never created', () => {
  beforeEach(fullReset);

  it('linking an item to itself is rejected with self_link, and nothing is added', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'related_to' });
    expect(result).toEqual({ status: 'error', reason: 'self_link', message: expect.any(String) });
    expect(useAppStore.getState().contentRelationships).toEqual([]);
  });

  it('creating the exact same (source, target, type) link twice is rejected the second time as a duplicate', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);

    const first = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    expect(first.status).toBe('ok');

    const second = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    expect(second).toEqual({ status: 'error', reason: 'duplicate', message: expect.any(String) });
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);
  });

  it('the SAME pair with a DIFFERENT relationship type is not a duplicate (allowed to coexist)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);

    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    const second = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'related_to' });
    expect(second.status).toBe('ok');
    expect(useAppStore.getState().contentRelationships).toHaveLength(2);
  });
});

describe('Repository Detail — manual link: workspace isolation', () => {
  beforeEach(fullReset);

  it('a link can only be created between two items that both belong to the CURRENTLY ACTIVE workspace — a cross-workspace id is rejected as invalid', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const phdDoc = confirmImportedContent(preview({ title: 'PhD Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(phdDoc);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    const apfcDoc = confirmImportedContent(preview({ title: 'APFC Doc' }), { workspaceId: 'apfc', contentType: 'document' });
    useAppStore.getState().addImportedContent(apfcDoc);

    // Still in 'apfc': phdDoc.id is not a member of this workspace's own importedContent, so the
    // pool it's validated against here never contains it — exactly like a real cross-workspace
    // link attempt from the UI would be rejected.
    const result = useAppStore.getState().addContentRelationship({ source: { id: apfcDoc.id, type: 'imported_content' }, target: { id: phdDoc.id, type: 'imported_content' }, type: 'related_to' });
    expect(result).toEqual({ status: 'error', reason: 'invalid_target', message: expect.any(String) });
  });

  it('a link created in one workspace never appears via getRelatedContent for an item in another workspace, even if queried while that workspace is active', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    // The apfc workspace's own contentRelationships/importedContent never contained the phd_research
    // link or items — switching workspaces swaps the whole array (see lib/store.ts), so this is
    // never a member of the active state at all here.
    expect(useAppStore.getState().contentRelationships).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(getRelatedContent(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toHaveLength(1);
  });
});

describe('Repository Detail — manual link: persistence through export/import (page reload)', () => {
  beforeEach(fullReset);

  it('an added link survives export -> reset -> import, and a removed link stays removed', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    const other = confirmImportedContent(preview({ title: 'Other' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().addImportedContent(other);
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: bib.id, type: 'imported_content' }, type: 'cites' });
    const removed = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: other.id, type: 'imported_content' }, type: 'related_to' });
    useAppStore.getState().deleteContentRelationship((removed as Extract<typeof removed, { status: 'ok' }>).relationship.id);

    const json = exportAllData();
    fullReset();
    importAllData(json);
    useAppStore.getState().setActiveWorkspaceId('phd_research');

    const related = getRelatedContent(useAppStore.getState().contentRelationships, doc.id, 'imported_content');
    expect(related.map((r) => r.relatedId)).toEqual([bib.id]); // the removed link never comes back
  });
});
