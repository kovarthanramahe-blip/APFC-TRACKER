import { describe, it, expect } from 'vitest';
import type { ImportedContent } from './contentImport';
import {
  searchImportedContent,
  filterImportedContentByTags,
  filterImportedContentByCategory,
  filterImportedContentUncategorized,
  sortImportedContent,
  queryImportedContent,
  collectImportedContentTags,
  collectImportedContentCategories,
  getContentTags,
  getContentCategory,
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
