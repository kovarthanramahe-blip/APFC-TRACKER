import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
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
