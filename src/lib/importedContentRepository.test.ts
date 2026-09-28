import { describe, it, expect } from 'vitest';
import type { ImportedContent } from './contentImport';
import {
  searchImportedContent,
  filterImportedContentByTags,
  filterImportedContentByCategory,
  filterImportedContentUncategorized,
  filterImportedContentByFolder,
  filterImportedContentPinned,
  filterImportedContentByArchived,
  sortImportedContent,
  queryImportedContent,
  collectImportedContentTags,
  collectImportedContentCategories,
  getContentTags,
  getContentCategory,
  getContentDescription,
  getContentUpdatedAt,
  getContentFolderId,
  isContentPinned,
  isContentArchived,
  applyImportedContentOrganizationPatch,
  parseTagsInput,
} from './importedContentRepository';

function item(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'i1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Untitled',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { sourceFilename: 'file.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
    metadata: overrides.metadata,
    updatedAt: overrides.updatedAt,
  };
}

describe('getContentTags / getContentCategory — missing metadata handling', () => {
  it('returns an empty tag list for an item with no metadata at all', () => {
    expect(getContentTags(item({ metadata: undefined }))).toEqual([]);
  });

  it('returns undefined category for an item with no metadata at all', () => {
    expect(getContentCategory(item({ metadata: undefined }))).toBeUndefined();
  });

  it('returns an empty tag list for an item with metadata but no tags field', () => {
    expect(getContentTags(item({ metadata: { category: 'Notes' } }))).toEqual([]);
  });

  it('getContentDescription returns undefined for an item with no metadata/description', () => {
    expect(getContentDescription(item({ metadata: undefined }))).toBeUndefined();
    expect(getContentDescription(item({ metadata: { category: 'Notes' } }))).toBeUndefined();
  });

  it('getContentDescription returns the set description', () => {
    expect(getContentDescription(item({ metadata: { description: 'A short summary' } }))).toBe('A short summary');
  });
});

describe('getContentUpdatedAt — fallback for items that predate the field', () => {
  it('returns updatedAt when present', () => {
    const withUpdatedAt = item({ updatedAt: '2026-02-01T00:00:00.000Z', provenance: { importedAt: '2026-01-01T00:00:00.000Z' } });
    expect(getContentUpdatedAt(withUpdatedAt)).toBe('2026-02-01T00:00:00.000Z');
  });

  it('falls back to provenance.importedAt when updatedAt is missing', () => {
    const legacyItem = item({ updatedAt: undefined, provenance: { importedAt: '2026-01-01T00:00:00.000Z' } });
    expect(getContentUpdatedAt(legacyItem)).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('searchImportedContent', () => {
  const items = [
    item({ id: 'a', title: 'Chapter One Draft', rawContent: 'Introduction to the field', provenance: { sourceFilename: 'ch1.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
    item({ id: 'b', title: 'Fieldwork Notes', rawContent: 'Observations from the site visit', provenance: { sourceFilename: 'fieldnotes.md', originalFormat: 'markdown', importedAt: '2026-01-02T00:00:00.000Z' } }),
    item({ id: 'c', title: 'Bibliography Draft', rawContent: 'A list of sources', provenance: { sourceFilename: 'refs.docx', originalFormat: 'docx', importedAt: '2026-01-03T00:00:00.000Z' } }),
  ];

  it('matches by title', () => {
    expect(searchImportedContent(items, 'Fieldwork').map((i) => i.id)).toEqual(['b']);
  });

  it('matches by rawContent', () => {
    expect(searchImportedContent(items, 'site visit').map((i) => i.id)).toEqual(['b']);
  });

  it('matches by source filename', () => {
    expect(searchImportedContent(items, 'refs.docx').map((i) => i.id)).toEqual(['c']);
  });

  it('is case-insensitive', () => {
    expect(searchImportedContent(items, 'FIELDWORK').map((i) => i.id)).toEqual(['b']);
    expect(searchImportedContent(items, 'chapter one').map((i) => i.id)).toEqual(['a']);
  });

  it('an empty or whitespace-only query matches everything', () => {
    expect(searchImportedContent(items, '')).toHaveLength(3);
    expect(searchImportedContent(items, '   ')).toHaveLength(3);
  });

  it('matches across multiple items sharing a substring', () => {
    expect(searchImportedContent(items, 'draft').map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('no match returns an empty array', () => {
    expect(searchImportedContent(items, 'nonexistent-xyz')).toEqual([]);
  });

  it('matches by description', () => {
    const withDescription = [...items, item({ id: 'd', title: 'Untitled scan', rawContent: '', metadata: { description: 'Scanned lecture handout' } })];
    expect(searchImportedContent(withDescription, 'lecture handout').map((i) => i.id)).toEqual(['d']);
  });

  it('an item with no description never matches a description-only search term', () => {
    expect(searchImportedContent(items, 'lecture handout')).toEqual([]);
  });
});

describe('filterImportedContentByTags', () => {
  const items = [
    item({ id: 'a', metadata: { tags: ['Fieldwork', 'Chapter-1'] } }),
    item({ id: 'b', metadata: { tags: ['Bibliography'] } }),
    item({ id: 'c', metadata: undefined }),
  ];

  it('keeps items that have ANY of the requested tags', () => {
    expect(filterImportedContentByTags(items, ['bibliography']).map((i) => i.id)).toEqual(['b']);
  });

  it('is case-insensitive', () => {
    expect(filterImportedContentByTags(items, ['FIELDWORK']).map((i) => i.id)).toEqual(['a']);
  });

  it('matches an item that has any of several requested tags', () => {
    expect(filterImportedContentByTags(items, ['chapter-1', 'bibliography']).map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('an empty tag list is a no-op (returns everything)', () => {
    expect(filterImportedContentByTags(items, [])).toHaveLength(3);
  });

  it('an item with no metadata never matches a tag filter', () => {
    expect(filterImportedContentByTags(items, ['fieldwork', 'bibliography']).some((i) => i.id === 'c')).toBe(false);
  });
});

describe('filterImportedContentByCategory / filterImportedContentUncategorized', () => {
  const items = [
    item({ id: 'a', metadata: { category: 'Literature Review' } }),
    item({ id: 'b', metadata: { category: 'Fieldwork' } }),
    item({ id: 'c', metadata: undefined }),
  ];

  it('keeps items with an exact (case-insensitive) category match', () => {
    expect(filterImportedContentByCategory(items, 'fieldwork').map((i) => i.id)).toEqual(['b']);
    expect(filterImportedContentByCategory(items, 'FIELDWORK').map((i) => i.id)).toEqual(['b']);
  });

  it('an undefined/empty category is a no-op (returns everything)', () => {
    expect(filterImportedContentByCategory(items, undefined)).toHaveLength(3);
    expect(filterImportedContentByCategory(items, '')).toHaveLength(3);
  });

  it('filterImportedContentUncategorized keeps only items with no category', () => {
    expect(filterImportedContentUncategorized(items).map((i) => i.id)).toEqual(['c']);
  });
});

describe('sortImportedContent — deterministic', () => {
  it('sorts newest first by default', () => {
    const items = [
      item({ id: 'a', provenance: { sourceFilename: 'a.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'b', provenance: { sourceFilename: 'b.md', originalFormat: 'markdown', importedAt: '2026-01-03T00:00:00.000Z' } }),
      item({ id: 'c', provenance: { sourceFilename: 'c.md', originalFormat: 'markdown', importedAt: '2026-01-02T00:00:00.000Z' } }),
    ];
    expect(sortImportedContent(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts oldest first when requested', () => {
    const items = [
      item({ id: 'a', provenance: { sourceFilename: 'a.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'b', provenance: { sourceFilename: 'b.md', originalFormat: 'markdown', importedAt: '2026-01-03T00:00:00.000Z' } }),
    ];
    expect(sortImportedContent(items, 'oldest').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('sorts by title (case-insensitive) when requested', () => {
    const items = [item({ id: 'a', title: 'zebra' }), item({ id: 'b', title: 'Apple' })];
    expect(sortImportedContent(items, 'title').map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('breaks ties on identical importedAt deterministically by id, every time', () => {
    const items = [
      item({ id: 'z', provenance: { sourceFilename: 'z.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'a', provenance: { sourceFilename: 'a.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'm', provenance: { sourceFilename: 'm.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } }),
    ];
    const first = sortImportedContent(items).map((i) => i.id);
    const second = sortImportedContent([...items].reverse()).map((i) => i.id);
    expect(first).toEqual(['a', 'm', 'z']);
    expect(second).toEqual(first);
  });

  it('does not mutate the input array', () => {
    const items = [item({ id: 'b' }), item({ id: 'a' })];
    const original = [...items];
    sortImportedContent(items, 'title');
    expect(items).toEqual(original);
  });

  it('sorts by updatedAt (most recently touched first) when requested', () => {
    const items = [
      item({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', provenance: { importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'b', updatedAt: '2026-01-05T00:00:00.000Z', provenance: { importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'c', updatedAt: '2026-01-03T00:00:00.000Z', provenance: { importedAt: '2026-01-01T00:00:00.000Z' } }),
    ];
    expect(sortImportedContent(items, 'updated').map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('an item with no updatedAt sorts by its provenance.importedAt fallback under the "updated" order', () => {
    const items = [
      item({ id: 'old-edit', updatedAt: undefined, provenance: { importedAt: '2026-01-01T00:00:00.000Z' } }),
      item({ id: 'recent-import-no-edit', updatedAt: undefined, provenance: { importedAt: '2026-01-05T00:00:00.000Z' } }),
    ];
    expect(sortImportedContent(items, 'updated').map((i) => i.id)).toEqual(['recent-import-no-edit', 'old-edit']);
  });
});

describe('queryImportedContent — combined search + filters + deterministic sort', () => {
  const items = [
    item({
      id: 'a',
      title: 'Chapter One Draft',
      rawContent: 'Introduction',
      metadata: { tags: ['chapter-1'], category: 'Literature Review' },
      provenance: { sourceFilename: 'ch1.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
    }),
    item({
      id: 'b',
      title: 'Fieldwork Notes',
      rawContent: 'Observations from the field',
      metadata: { tags: ['fieldwork'], category: 'Fieldwork' },
      provenance: { sourceFilename: 'field.md', originalFormat: 'markdown', importedAt: '2026-01-03T00:00:00.000Z' },
    }),
    item({
      id: 'c',
      title: 'Fieldwork Interview Transcript',
      rawContent: 'Interview transcript',
      metadata: { tags: ['fieldwork', 'interview'], category: 'Fieldwork' },
      provenance: { sourceFilename: 'interview.md', originalFormat: 'markdown', importedAt: '2026-01-02T00:00:00.000Z' },
    }),
  ];

  it('applies search alone', () => {
    expect(queryImportedContent(items, { search: 'fieldwork' }).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('applies tag filter alone', () => {
    expect(queryImportedContent(items, { tags: ['interview'] }).map((i) => i.id)).toEqual(['c']);
  });

  it('applies category filter alone', () => {
    expect(queryImportedContent(items, { category: 'Fieldwork' }).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('combines search + tag + category filters (AND across dimensions)', () => {
    const result = queryImportedContent(items, { search: 'transcript', tags: ['fieldwork'], category: 'Fieldwork' });
    expect(result.map((i) => i.id)).toEqual(['c']);
  });

  it('a combination matching nothing returns an empty array', () => {
    expect(queryImportedContent(items, { search: 'transcript', category: 'Literature Review' })).toEqual([]);
  });

  it('results are deterministically sorted (newest first by default)', () => {
    expect(queryImportedContent(items, { category: 'Fieldwork' }).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('an empty query object returns every item, sorted', () => {
    expect(queryImportedContent(items, {}).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('collectImportedContentTags / collectImportedContentCategories', () => {
  const items = [
    item({ id: 'a', metadata: { tags: ['Fieldwork', 'chapter-1'], category: 'Literature Review' } }),
    item({ id: 'b', metadata: { tags: ['fieldwork'], category: 'Fieldwork' } }),
    item({ id: 'c', metadata: undefined }),
  ];

  it('collects unique tags, case-insensitively de-duplicated, alphabetically sorted', () => {
    expect(collectImportedContentTags(items)).toEqual(['chapter-1', 'Fieldwork']);
  });

  it('collects unique categories, alphabetically sorted', () => {
    expect(collectImportedContentCategories(items)).toEqual(['Fieldwork', 'Literature Review']);
  });

  it('an item with no metadata contributes nothing and never throws', () => {
    expect(() => collectImportedContentTags(items)).not.toThrow();
    expect(() => collectImportedContentCategories(items)).not.toThrow();
  });
});

describe('parseTagsInput', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseTagsInput(' fieldwork ,  chapter-1,interview ')).toEqual(['fieldwork', 'chapter-1', 'interview']);
  });

  it('drops empty entries from stray/trailing commas', () => {
    expect(parseTagsInput('fieldwork,,  ,interview,')).toEqual(['fieldwork', 'interview']);
  });

  it('de-duplicates case-insensitively, keeping first-seen casing', () => {
    expect(parseTagsInput('Fieldwork, fieldwork, FIELDWORK')).toEqual(['Fieldwork']);
  });

  it('an empty string produces an empty array', () => {
    expect(parseTagsInput('')).toEqual([]);
    expect(parseTagsInput('   ')).toEqual([]);
  });
});

// Premium Note Organisation, Phase 3B — folder/pin/archive accessors, filters, and the
// bulk-organisation patch. All additive to the existing metadata shape (see contentImport.ts's
// ImportedContentMetadata) — nothing above this point in the file is touched by these additions.
describe('getContentFolderId / isContentPinned / isContentArchived — missing metadata handling', () => {
  it('defaults to unfiled/root, not pinned, not archived for an item with no metadata at all', () => {
    const i = item({ metadata: undefined });
    expect(getContentFolderId(i)).toBeNull();
    expect(isContentPinned(i)).toBe(false);
    expect(isContentArchived(i)).toBe(false);
  });

  it('reads whatever is actually set', () => {
    const i = item({ metadata: { folderId: 'f1', isPinned: true, isArchived: true } });
    expect(getContentFolderId(i)).toBe('f1');
    expect(isContentPinned(i)).toBe(true);
    expect(isContentArchived(i)).toBe(true);
  });
});

describe('filterImportedContentByFolder / filterImportedContentPinned / filterImportedContentByArchived', () => {
  it('filterImportedContentByFolder matches exactly one folder, including null (root)', () => {
    const a = item({ id: 'a', metadata: { folderId: 'f1' } });
    const b = item({ id: 'b', metadata: { folderId: 'f2' } });
    const c = item({ id: 'c', metadata: undefined });
    expect(filterImportedContentByFolder([a, b, c], 'f1')).toEqual([a]);
    expect(filterImportedContentByFolder([a, b, c], null)).toEqual([c]);
  });

  it('filterImportedContentPinned returns only pinned items', () => {
    const a = item({ id: 'a', metadata: { isPinned: true } });
    const b = item({ id: 'b', metadata: { isPinned: false } });
    expect(filterImportedContentPinned([a, b])).toEqual([a]);
  });

  it('filterImportedContentByArchived(false) excludes archived; (true) returns only archived', () => {
    const a = item({ id: 'a', metadata: { isArchived: true } });
    const b = item({ id: 'b', metadata: { isArchived: false } });
    const c = item({ id: 'c', metadata: undefined });
    expect(filterImportedContentByArchived([a, b, c], false)).toEqual([b, c]);
    expect(filterImportedContentByArchived([a, b, c], true)).toEqual([a]);
  });
});

describe('queryImportedContent — archive/folder/pin integration', () => {
  it('excludes archived items by default, unaffected by any other filter', () => {
    const active = item({ id: 'active', title: 'Active' });
    const archived = item({ id: 'archived', title: 'Archived', metadata: { isArchived: true } });
    expect(queryImportedContent([active, archived], {})).toEqual([active]);
  });

  it('archived: true returns only archived items', () => {
    const active = item({ id: 'active' });
    const archived = item({ id: 'archived', metadata: { isArchived: true } });
    expect(queryImportedContent([active, archived], { archived: true })).toEqual([archived]);
  });

  it('folderId filters to exactly one folder', () => {
    const inFolder = item({ id: 'a', metadata: { folderId: 'f1' } });
    const elsewhere = item({ id: 'b', metadata: { folderId: 'f2' } });
    expect(queryImportedContent([inFolder, elsewhere], { folderId: 'f1' })).toEqual([inFolder]);
  });

  it('pinnedOnly filters to pinned items', () => {
    const pinned = item({ id: 'a', metadata: { isPinned: true } });
    const unpinned = item({ id: 'b' });
    expect(queryImportedContent([pinned, unpinned], { pinnedOnly: true })).toEqual([pinned]);
  });

  it('existing callers passing no archive/folder/pin options are completely unaffected — nothing new is silently applied beyond archive exclusion (a no-op for pre-existing data)', () => {
    const a = item({ id: 'a', title: 'B Title' });
    const b = item({ id: 'b', title: 'A Title' });
    expect(queryImportedContent([a, b], { sort: 'title' }).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('applyImportedContentOrganizationPatch', () => {
  it('sets folderId, leaving everything else untouched', () => {
    const i = item({ metadata: { tags: ['existing'] } });
    const patched = applyImportedContentOrganizationPatch(i, { folderId: 'f1' }, '2026-02-01T00:00:00.000Z');
    expect(patched.metadata?.folderId).toBe('f1');
    expect(patched.metadata?.tags).toEqual(['existing']);
    expect(patched.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('folderId: null explicitly moves to root, distinct from omitting folderId entirely', () => {
    const i = item({ metadata: { folderId: 'f1' } });
    const patched = applyImportedContentOrganizationPatch(i, { folderId: null });
    expect(patched.metadata?.folderId).toBeNull();

    const untouched = applyImportedContentOrganizationPatch(i, { isPinned: true });
    expect(untouched.metadata?.folderId).toBe('f1'); // omitted — unchanged
  });

  it('toggles isPinned/isArchived independently', () => {
    const i = item({});
    expect(applyImportedContentOrganizationPatch(i, { isPinned: true }).metadata?.isPinned).toBe(true);
    expect(applyImportedContentOrganizationPatch(i, { isArchived: true }).metadata?.isArchived).toBe(true);
  });

  it('addTags merges, deduplicated case-insensitively, keeping first-seen casing', () => {
    const i = item({ metadata: { tags: ['Revision'] } });
    const patched = applyImportedContentOrganizationPatch(i, { addTags: ['revision', 'Important'] });
    expect(patched.metadata?.tags).toEqual(['Revision', 'Important']);
  });

  it('removeTags removes case-insensitively', () => {
    const i = item({ metadata: { tags: ['Revision', 'Important'] } });
    const patched = applyImportedContentOrganizationPatch(i, { removeTags: ['REVISION'] });
    expect(patched.metadata?.tags).toEqual(['Important']);
  });

  it('never touches rawContent or provenance — organisation is metadata-only', () => {
    const i = item({ rawContent: 'Original body', provenance: { sourceFilename: 'a.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' } });
    const patched = applyImportedContentOrganizationPatch(i, { isArchived: true, folderId: 'f1', addTags: ['x'] });
    expect(patched.rawContent).toBe('Original body');
    expect(patched.provenance).toEqual(i.provenance);
    expect(patched.id).toBe(i.id);
  });

  it('never mutates the input item', () => {
    const i = item({ metadata: { tags: ['a'] } });
    const snapshot = JSON.parse(JSON.stringify(i));
    applyImportedContentOrganizationPatch(i, { isPinned: true, addTags: ['b'] });
    expect(i).toEqual(snapshot);
  });
});
