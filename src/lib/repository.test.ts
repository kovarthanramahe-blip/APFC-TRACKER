import { describe, it, expect } from 'vitest';
import {
  REPOSITORY_CONTENT_TYPES,
  REPOSITORY_CONTENT_TYPE_REGISTRY,
  getRepositoryContentTypeMeta,
  repositoryContentTypeSupports,
  listImportedContentForWorkspace,
  listNotesForWorkspace,
  queryRepository,
  searchNotes,
  sortRepositoryEntries,
  listRepositoryEntries,
  repositoryEntryFromImportedContent,
  repositoryEntryFromNote,
  updateRepositoryContentMetadata,
  deleteRepositoryImportedContent,
  deleteRepositoryNote,
  computeRepositoryStatistics,
  buildRepositoryExportSnapshot,
  serializeRepositoryExportSnapshot,
  createRepositoryImportedContent,
  createManualRepositoryContent,
} from './repository';
import { IMPORTED_CONTENT_TYPES, type ImportedContent, type ImportPreview } from './contentImport';
import type { Note } from './types';
import type { ContentRelationship } from './contentRelationships';

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Item',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' },
    metadata: overrides.metadata,
    updatedAt: overrides.updatedAt,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: overrides.subject ?? 'general',
    title: overrides.title ?? 'Note',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    pinned: overrides.pinned ?? false,
    workspaceId: overrides.workspaceId,
    topicId: overrides.topicId,
  };
}

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'a',
    sourceType: overrides.sourceType ?? 'imported_content',
    targetId: overrides.targetId ?? 'b',
    targetType: overrides.targetType ?? 'imported_content',
    type: overrides.type ?? 'cites',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('repository registry — completeness', () => {
  it('registers exactly the required initial content types', () => {
    const required = ['note', 'document', 'study_material', 'research_document', 'bibliography', 'question_bank', 'descriptive_questions', 'pyq', 'other'];
    expect(REPOSITORY_CONTENT_TYPES.slice().sort()).toEqual(required.slice().sort());
  });

  it('has exactly one registry entry per content type, with no duplicates and no gaps', () => {
    expect(REPOSITORY_CONTENT_TYPE_REGISTRY).toHaveLength(REPOSITORY_CONTENT_TYPES.length);
    const seen = new Set(REPOSITORY_CONTENT_TYPE_REGISTRY.map((m) => m.type));
    expect(seen.size).toBe(REPOSITORY_CONTENT_TYPE_REGISTRY.length);
    for (const type of IMPORTED_CONTENT_TYPES) {
      expect(seen.has(type)).toBe(true);
    }
  });

  it('getRepositoryContentTypeMeta resolves every registered type and throws for an unknown one', () => {
    for (const type of REPOSITORY_CONTENT_TYPES) {
      expect(getRepositoryContentTypeMeta(type).type).toBe(type);
    }
    // @ts-expect-error — deliberately invalid at the type level, to prove the runtime check too
    expect(() => getRepositoryContentTypeMeta('not_a_real_type')).toThrow();
  });

  it('the registry carries only metadata/capabilities, never actual content fields', () => {
    for (const meta of REPOSITORY_CONTENT_TYPE_REGISTRY) {
      expect(meta).not.toHaveProperty('title');
      expect(meta).not.toHaveProperty('rawContent');
      expect(meta).not.toHaveProperty('items');
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('repository registry — capability definitions', () => {
  it('note is never taggable or categorisable (Note has no tags/category field)', () => {
    expect(repositoryContentTypeSupports('note', 'taggable')).toBe(false);
    expect(repositoryContentTypeSupports('note', 'categorisable')).toBe(false);
  });

  it('research_document and bibliography are taggable, categorisable, and linkable', () => {
    for (const type of ['research_document', 'bibliography'] as const) {
      expect(repositoryContentTypeSupports(type, 'taggable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'categorisable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'linkable')).toBe(true);
    }
  });

  it('note is linkable (Notes participate in contentRelationships.ts today)', () => {
    expect(repositoryContentTypeSupports('note', 'linkable')).toBe(true);
  });

  it('question_bank, descriptive_questions, pyq, other, document, and study_material are not linkable (no linking UI wired to them yet)', () => {
    for (const type of ['question_bank', 'descriptive_questions', 'pyq', 'other', 'document', 'study_material'] as const) {
      expect(repositoryContentTypeSupports(type, 'linkable')).toBe(false);
    }
  });

  it('document and study_material are taggable and categorisable like every non-note type', () => {
    for (const type of ['document', 'study_material'] as const) {
      expect(repositoryContentTypeSupports(type, 'taggable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'categorisable')).toBe(true);
    }
  });

  it('document and study_material have real, distinct, non-empty labels', () => {
    expect(getRepositoryContentTypeMeta('document').label).toBe('Document');
    expect(getRepositoryContentTypeMeta('study_material').label).toBe('Study Material');
  });

  it('every content type is importable, searchable, editable, and deletable', () => {
    for (const type of REPOSITORY_CONTENT_TYPES) {
      expect(repositoryContentTypeSupports(type, 'importable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'searchable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'editable')).toBe(true);
      expect(repositoryContentTypeSupports(type, 'deletable')).toBe(true);
    }
  });

  it('not every content type supports every capability (taggable is not universal)', () => {
    const taggableCount = REPOSITORY_CONTENT_TYPES.filter((t) => repositoryContentTypeSupports(t, 'taggable')).length;
    expect(taggableCount).toBeLessThan(REPOSITORY_CONTENT_TYPES.length);
  });
});

describe('repository — imported-content discovery', () => {
  it('repositoryEntryFromImportedContent projects id, type, title, workspace, origin, tags, category', () => {
    const item = content({
      id: 'doc1',
      contentType: 'research_document',
      title: 'Fieldwork Notes',
      workspaceId: 'phd_research',
      metadata: { tags: ['fieldwork', 'chapter-1'], category: 'Literature Review' },
    });
    const entry = repositoryEntryFromImportedContent(item);
    expect(entry).toEqual({
      entityId: 'doc1',
      entityType: 'imported_content',
      contentType: 'research_document',
      title: 'Fieldwork Notes',
      workspaceId: 'phd_research',
      origin: 'import',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['fieldwork', 'chapter-1'],
      category: 'Literature Review',
      description: undefined,
    });
  });

  it('defaults origin to "import" for an item with no provenance.origin at all (pre-origin-field items)', () => {
    const item = content({ provenance: { importedAt: '2026-01-01T00:00:00.000Z' } });
    expect(repositoryEntryFromImportedContent(item).origin).toBe('import');
  });

  it('a manually-created record (provenance.origin "manual") is projected as "manual"', () => {
    const item = content({ provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'manual' } });
    expect(repositoryEntryFromImportedContent(item).origin).toBe('manual');
  });

  it('an item with no metadata at all projects to empty tags and undefined category, never throwing', () => {
    const item = content({ metadata: undefined });
    expect(() => repositoryEntryFromImportedContent(item)).not.toThrow();
    const entry = repositoryEntryFromImportedContent(item);
    expect(entry.tags).toEqual([]);
    expect(entry.category).toBeUndefined();
  });

  it('projects metadata.description onto the entry', () => {
    const item = content({ metadata: { description: 'A short summary' } });
    expect(repositoryEntryFromImportedContent(item).description).toBe('A short summary');
  });

  it('projects updatedAt when present, falling back to provenance.importedAt when absent', () => {
    const withUpdatedAt = content({ updatedAt: '2026-03-01T00:00:00.000Z', provenance: { importedAt: '2026-01-01T00:00:00.000Z' } });
    expect(repositoryEntryFromImportedContent(withUpdatedAt).updatedAt).toBe('2026-03-01T00:00:00.000Z');

    const legacyItem = content({ updatedAt: undefined, provenance: { importedAt: '2026-01-01T00:00:00.000Z' } });
    expect(repositoryEntryFromImportedContent(legacyItem).updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('repository — Notes discovery', () => {
  it('repositoryEntryFromNote projects a Note as contentType "note", entityType "note", origin "created"', () => {
    const n = note({ id: 'n1', title: 'Reading Note', workspaceId: 'phd_research', createdAt: '2026-02-01T00:00:00.000Z' });
    expect(repositoryEntryFromNote(n)).toEqual({
      entityId: 'n1',
      entityType: 'note',
      contentType: 'note',
      title: 'Reading Note',
      workspaceId: 'phd_research',
      origin: 'created',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      category: undefined,
      description: undefined,
    });
  });

  it('a note with no workspaceId falls back to DEFAULT_WORKSPACE_ID (apfc), same as lib/store.ts migration', () => {
    const n = note({ workspaceId: undefined });
    expect(repositoryEntryFromNote(n).workspaceId).toBe('apfc');
  });

  it('a Note is never converted into an ImportedContent — the projection carries no rawContent/provenance field', () => {
    const entry = repositoryEntryFromNote(note());
    expect(entry).not.toHaveProperty('rawContent');
    expect(entry).not.toHaveProperty('provenance');
  });

  it('listRepositoryEntries combines both collections without mutating either input array', () => {
    const items = [content({ id: 'c1' })];
    const notes = [note({ id: 'n1' })];
    const itemsCopy = [...items];
    const notesCopy = [...notes];
    const entries = listRepositoryEntries(items, notes);
    expect(entries).toHaveLength(2);
    expect(items).toEqual(itemsCopy);
    expect(notes).toEqual(notesCopy);
  });
});

describe('repository — workspace isolation / no cross-workspace leakage', () => {
  it('listImportedContentForWorkspace returns only the requested workspace\'s items', () => {
    const items = [content({ id: 'c1', workspaceId: 'phd_research' }), content({ id: 'c2', workspaceId: 'apfc' })];
    expect(listImportedContentForWorkspace(items, 'phd_research').map((i) => i.id)).toEqual(['c1']);
    expect(listImportedContentForWorkspace(items, 'apfc').map((i) => i.id)).toEqual(['c2']);
    expect(listImportedContentForWorkspace(items, 'upsc_cse')).toEqual([]);
  });

  it('listNotesForWorkspace isolates notes the same way, including undefined-workspaceId notes defaulting to apfc', () => {
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' }), note({ id: 'n2', workspaceId: undefined }), note({ id: 'n3', workspaceId: 'apfc' })];
    expect(listNotesForWorkspace(notes, 'phd_research').map((n) => n.id)).toEqual(['n1']);
    expect(listNotesForWorkspace(notes, 'apfc').map((n) => n.id).sort()).toEqual(['n2', 'n3']);
  });

  it('queryRepository never returns an entry from a different workspace than requested, even when both collections mix workspaces', () => {
    const items = [content({ id: 'c1', workspaceId: 'phd_research' }), content({ id: 'c2', workspaceId: 'apfc' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' }), note({ id: 'n2', workspaceId: 'apfc' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['c1', 'n1']);
    expect(results.every((r) => r.workspaceId === 'phd_research')).toBe(true);
  });
});

describe('repository — search', () => {
  it('queryRepository search matches ImportedContent title/content and Note title/content together', () => {
    const items = [content({ id: 'c1', title: 'Fieldwork Notes', rawContent: 'irrelevant' })];
    const notes = [note({ id: 'n1', title: 'Something else', content: 'mentions fieldwork here', workspaceId: 'phd_research' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research', search: 'fieldwork' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['c1', 'n1']);
  });

  it('an empty search matches everything in the workspace', () => {
    const items = [content({ id: 'c1' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' })];
    expect(queryRepository(items, notes, { workspaceId: 'phd_research', search: '' })).toHaveLength(2);
  });

  it('searchNotes is case-insensitive and matches title or content', () => {
    const notes = [note({ id: 'n1', title: 'Literature Review' }), note({ id: 'n2', content: 'a LITERATURE survey' }), note({ id: 'n3', title: 'unrelated' })];
    expect(searchNotes(notes, 'literature').map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });
});

describe('repository — content-type filtering', () => {
  it('filtering by a non-note content type returns only matching ImportedContent, no notes', () => {
    const items = [content({ id: 'c1', contentType: 'research_document' }), content({ id: 'c2', contentType: 'bibliography' })];
    const notes = [note({ id: 'n1' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research', contentType: 'research_document' });
    expect(results.map((r) => r.entityId)).toEqual(['c1']);
  });

  it('filtering by "note" returns every domain Note plus any ImportedContent item whose own contentType is "note"', () => {
    const items = [content({ id: 'c1', contentType: 'research_document' }), content({ id: 'c2', contentType: 'note' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research', contentType: 'note' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['c2', 'n1']);
  });

  it('no content-type filter returns items of every type plus every note', () => {
    const items = [content({ id: 'c1', contentType: 'research_document' }), content({ id: 'c2', contentType: 'bibliography' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['c1', 'c2', 'n1']);
  });
});

describe('repository — tag/category filtering', () => {
  it('a tags filter matches ImportedContent by tag and excludes every note (notes have no tags)', () => {
    const items = [
      content({ id: 'c1', metadata: { tags: ['fieldwork'] } }),
      content({ id: 'c2', metadata: { tags: ['other'] } }),
    ];
    const notes = [note({ id: 'n1' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research', tags: ['fieldwork'] });
    expect(results.map((r) => r.entityId)).toEqual(['c1']);
  });

  it('a category filter matches ImportedContent by category and excludes every note', () => {
    const items = [
      content({ id: 'c1', metadata: { category: 'Literature Review' } }),
      content({ id: 'c2', metadata: { category: 'Fieldwork' } }),
    ];
    const notes = [note({ id: 'n1' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research', category: 'Literature Review' });
    expect(results.map((r) => r.entityId)).toEqual(['c1']);
  });

  it('no tags/category filter leaves notes eligible again', () => {
    const items = [content({ id: 'c1' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' })];
    const results = queryRepository(items, notes, { workspaceId: 'phd_research' });
    expect(results.map((r) => r.entityId).sort()).toEqual(['c1', 'n1']);
  });
});

describe('repository — deterministic sorting', () => {
  it('sorts newest-first by default, breaking ties by entityId ascending', () => {
    const entries = [
      repositoryEntryFromImportedContent(content({ id: 'b', provenance: { importedAt: '2026-01-02T00:00:00.000Z', origin: 'import' } })),
      repositoryEntryFromImportedContent(content({ id: 'a', provenance: { importedAt: '2026-01-02T00:00:00.000Z', origin: 'import' } })),
      repositoryEntryFromImportedContent(content({ id: 'c', provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' } })),
    ];
    const sorted = sortRepositoryEntries(entries, 'newest');
    expect(sorted.map((e) => e.entityId)).toEqual(['a', 'b', 'c']);
  });

  it('sorts oldest-first when requested', () => {
    const entries = [
      repositoryEntryFromImportedContent(content({ id: 'a', provenance: { importedAt: '2026-01-02T00:00:00.000Z', origin: 'import' } })),
      repositoryEntryFromImportedContent(content({ id: 'b', provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' } })),
    ];
    expect(sortRepositoryEntries(entries, 'oldest').map((e) => e.entityId)).toEqual(['b', 'a']);
  });

  it('sorts by title case-insensitively when requested', () => {
    const entries = [
      repositoryEntryFromImportedContent(content({ id: 'a', title: 'Zebra' })),
      repositoryEntryFromImportedContent(content({ id: 'b', title: 'apple' })),
    ];
    expect(sortRepositoryEntries(entries, 'title').map((e) => e.entityId)).toEqual(['b', 'a']);
  });

  it('is stable/repeatable: calling it twice on the same data yields the same order', () => {
    const entries = [
      repositoryEntryFromImportedContent(content({ id: 'x' })),
      repositoryEntryFromNote(note({ id: 'y' })),
      repositoryEntryFromImportedContent(content({ id: 'z' })),
    ];
    const first = sortRepositoryEntries(entries).map((e) => e.entityId);
    const second = sortRepositoryEntries([...entries].reverse()).map((e) => e.entityId);
    expect(first).toEqual(second);
  });

  it('sorts by updatedAt (most recently touched first) when requested, mixing both collections', () => {
    const entries = [
      repositoryEntryFromImportedContent(content({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })),
      repositoryEntryFromNote(note({ id: 'b', updatedAt: '2026-01-05T00:00:00.000Z' })),
      repositoryEntryFromImportedContent(content({ id: 'c', updatedAt: '2026-01-03T00:00:00.000Z' })),
    ];
    expect(sortRepositoryEntries(entries, 'updated').map((e) => e.entityId)).toEqual(['b', 'c', 'a']);
  });
});

describe('repository — statistics', () => {
  it('computes total items, counts by content type, workspace, and category', () => {
    const entries = listRepositoryEntries(
      [
        content({ id: 'c1', contentType: 'research_document', workspaceId: 'phd_research', metadata: { category: 'Fieldwork' } }),
        content({ id: 'c2', contentType: 'bibliography', workspaceId: 'phd_research', metadata: { category: 'Fieldwork' } }),
        content({ id: 'c3', contentType: 'research_document', workspaceId: 'apfc' }),
      ],
      [note({ id: 'n1', workspaceId: 'phd_research' })],
    );
    const stats = computeRepositoryStatistics(entries);
    expect(stats.totalItems).toBe(4);
    expect(stats.countsByContentType).toEqual({ research_document: 2, bibliography: 1, note: 1 });
    expect(stats.countsByWorkspace).toEqual({ phd_research: 3, apfc: 1 });
    expect(stats.countsByCategory).toEqual({ Fieldwork: 2 });
    expect(stats.uncategorizedCount).toBe(2); // c3 (no category) + n1 (notes are never categorised)
  });

  it('an empty collection produces all-zero statistics, never throwing', () => {
    expect(() => computeRepositoryStatistics([])).not.toThrow();
    const stats = computeRepositoryStatistics([]);
    expect(stats).toEqual({ totalItems: 0, countsByContentType: {}, countsByWorkspace: {}, countsByCategory: {}, uncategorizedCount: 0 });
  });

  it('is a pure calculation — never mutates the entries it is given', () => {
    const entries = listRepositoryEntries([content({ id: 'c1' })], []);
    const copy = JSON.parse(JSON.stringify(entries));
    computeRepositoryStatistics(entries);
    expect(entries).toEqual(copy);
  });
});

describe('repository — export serialisation', () => {
  it('buildRepositoryExportSnapshot scopes every array to the requested workspace', () => {
    const items = [content({ id: 'c1', workspaceId: 'phd_research' }), content({ id: 'c2', workspaceId: 'apfc' })];
    const notes = [note({ id: 'n1', workspaceId: 'phd_research' }), note({ id: 'n2', workspaceId: 'apfc' })];
    const relationships = [relationship({ id: 'r1', workspaceId: 'phd_research' }), relationship({ id: 'r2', workspaceId: 'apfc' })];

    const snapshot = buildRepositoryExportSnapshot(items, notes, relationships, 'phd_research', '2026-03-01T00:00:00.000Z');
    expect(snapshot.workspaceId).toBe('phd_research');
    expect(snapshot.exportedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(snapshot.importedContent.map((i) => i.id)).toEqual(['c1']);
    expect(snapshot.notes.map((n) => n.id)).toEqual(['n1']);
    expect(snapshot.relationships.map((r) => r.id)).toEqual(['r1']);
  });

  it('is deterministic: array order never depends on the input arrays\' original order', () => {
    const itemsA = [content({ id: 'b' }), content({ id: 'a' })];
    const itemsB = [content({ id: 'a' }), content({ id: 'b' })];
    const snapA = buildRepositoryExportSnapshot(itemsA, [], [], 'phd_research', 'T');
    const snapB = buildRepositoryExportSnapshot(itemsB, [], [], 'phd_research', 'T');
    expect(snapA).toEqual(snapB);
    expect(snapA.importedContent.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('serializeRepositoryExportSnapshot produces identical JSON for identical snapshots', () => {
    const snapshot = buildRepositoryExportSnapshot([content({ id: 'c1' })], [note({ id: 'n1' })], [], 'phd_research', 'T');
    expect(serializeRepositoryExportSnapshot(snapshot)).toBe(serializeRepositoryExportSnapshot({ ...snapshot }));
    expect(() => JSON.parse(serializeRepositoryExportSnapshot(snapshot))).not.toThrow();
  });

  it('never touches lib/store.ts\'s existing exportAllData/importAllData format — produces its own separate shape', () => {
    const snapshot = buildRepositoryExportSnapshot([], [], [], 'phd_research', 'T');
    expect(Object.keys(snapshot).sort()).toEqual(['exportedAt', 'importedContent', 'kind', 'notes', 'relationships', 'schemaVersion', 'workspaceId'].sort());
  });

  it('carries a stable kind marker and schema version — the smallest backwards-compatible addition needed for the Repository Import/Restore stage to validate a backup before trusting it', () => {
    const snapshot = buildRepositoryExportSnapshot([], [], [], 'phd_research', 'T');
    expect(snapshot.kind).toBe('repository-export');
    expect(snapshot.schemaVersion).toBe(1);
  });
});

describe('repository — relationship preservation', () => {
  it('deleteRepositoryImportedContent cascades relationships referencing it, type-checked against note-id collisions', () => {
    const items = [content({ id: 'shared-id' })];
    const relationships = [
      relationship({ id: 'r1', sourceId: 'shared-id', sourceType: 'imported_content', targetId: 'other', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'shared-id', sourceType: 'note', targetId: 'other2', type: 'cites' }),
    ];
    const result = deleteRepositoryImportedContent(items, relationships, 'shared-id');
    expect(result.items).toEqual([]);
    // r1 (imported_content endpoint) is cascaded away; r2 (a NOTE with a colliding id) survives.
    expect(result.relationships.map((r) => r.id)).toEqual(['r2']);
  });

  it('deleteRepositoryNote cascades relationships referencing it, type-checked the same way', () => {
    const notes = [note({ id: 'shared-id' })];
    const relationships = [
      relationship({ id: 'r1', sourceId: 'shared-id', sourceType: 'note', targetId: 'other', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'shared-id', sourceType: 'imported_content', targetId: 'other2', type: 'cites' }),
    ];
    const result = deleteRepositoryNote(notes, relationships, 'shared-id');
    expect(result.notes).toEqual([]);
    expect(result.relationships.map((r) => r.id)).toEqual(['r2']);
  });

  it('relationships untouched by a delete are preserved exactly (not just left non-empty)', () => {
    const items = [content({ id: 'c1' }), content({ id: 'c2' })];
    const relationships = [relationship({ id: 'r1', sourceId: 'c2', targetId: 'other', type: 'supports' })];
    const result = deleteRepositoryImportedContent(items, relationships, 'c1');
    expect(result.relationships).toEqual(relationships);
  });

  it('updateRepositoryContentMetadata never touches id/workspaceId, even if asked to', () => {
    const items = [content({ id: 'c1', workspaceId: 'phd_research', metadata: { tags: ['old'] } })];
    const updated = updateRepositoryContentMetadata(items, 'c1', { tags: ['new'] });
    expect(updated[0].id).toBe('c1');
    expect(updated[0].workspaceId).toBe('phd_research');
    expect(updated[0].metadata).toEqual({ tags: ['new'] });
    // original array is untouched (pure)
    expect(items[0].metadata).toEqual({ tags: ['old'] });
  });

  it('updating an unknown id is a no-op that changes nothing', () => {
    const items = [content({ id: 'c1' })];
    expect(updateRepositoryContentMetadata(items, 'ghost', { tags: ['x'] })).toEqual(items);
  });
});

describe('repository — create/import operations reuse contentImport.ts\'s existing pure builders', () => {
  it('createRepositoryImportedContent is exactly contentImport.ts\'s confirmImportedContent', () => {
    const preview: ImportPreview = { sourceFilename: 'a.md', originalFormat: 'markdown', suggestedContentType: 'note', title: 'T', content: 'C' };
    const result = createRepositoryImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document' });
    expect(result.title).toBe('T');
    expect(result.contentType).toBe('research_document');
    expect(result.workspaceId).toBe('phd_research');
  });

  it('createManualRepositoryContent is exactly contentImport.ts\'s createManualImportedContent', () => {
    const result = createManualRepositoryContent({ workspaceId: 'phd_research', contentType: 'bibliography', title: 'Manual Source' });
    expect(result.title).toBe('Manual Source');
    expect(result.provenance.origin).toBe('manual');
  });
});

describe('repository — existing PhD Research functionality regression', () => {
  it('a realistic PhD Research repository (documents, bibliography, notes, relationships) queries and projects correctly end-to-end', () => {
    const items = [
      content({ id: 'doc1', contentType: 'research_document', title: 'Chapter 1', workspaceId: 'phd_research', metadata: { tags: ['chapter-1'], category: 'Draft' } }),
      content({ id: 'bib1', contentType: 'bibliography', title: 'Key Source', workspaceId: 'phd_research' }),
    ];
    const notes = [note({ id: 'note1', title: 'Reading Note', workspaceId: 'phd_research' })];
    const relationships = [relationship({ id: 'r1', workspaceId: 'phd_research', sourceId: 'bib1', targetId: 'doc1', type: 'cites' })];

    const results = queryRepository(items, notes, { workspaceId: 'phd_research', search: 'chapter' });
    expect(results.map((r) => r.entityId)).toEqual(['doc1']);

    const stats = computeRepositoryStatistics(listRepositoryEntries(items, notes));
    expect(stats.totalItems).toBe(3);

    const snapshot = buildRepositoryExportSnapshot(items, notes, relationships, 'phd_research', 'T');
    expect(snapshot.relationships).toHaveLength(1);
  });
});

describe('repository — existing APFC functionality regression', () => {
  it('APFC notes (no research_document/bibliography content types ever exist there) are discoverable and isolated from PhD Research', () => {
    const items = [content({ id: 'doc1', workspaceId: 'phd_research' })];
    const notes = [note({ id: 'apfc-n1', title: 'APFC Note', workspaceId: 'apfc' }), note({ id: 'phd-n1', workspaceId: 'phd_research' })];

    const apfcResults = queryRepository(items, notes, { workspaceId: 'apfc' });
    expect(apfcResults.map((r) => r.entityId)).toEqual(['apfc-n1']);
    expect(apfcResults[0].contentType).toBe('note');

    const stats = computeRepositoryStatistics(listRepositoryEntries(listImportedContentForWorkspace(items, 'apfc'), listNotesForWorkspace(notes, 'apfc')));
    expect(stats.countsByWorkspace).toEqual({ apfc: 1 });
  });

  it('an APFC note with no workspaceId at all (pre-Multi-Workspace-OS data) is still discovered under apfc', () => {
    const notes = [note({ id: 'legacy-n1', workspaceId: undefined })];
    const results = queryRepository([], notes, { workspaceId: 'apfc' });
    expect(results.map((r) => r.entityId)).toEqual(['legacy-n1']);
  });
});
