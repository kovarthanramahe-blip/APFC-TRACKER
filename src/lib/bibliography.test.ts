import { describe, it, expect } from 'vitest';
import type { ImportedContent } from './contentImport';
import {
  normalizePublicationType,
  parseAuthorsInput,
  parseBibliographyRecords,
  formatBibliographyRecordAsText,
  buildBibliographyMetadata,
  getBibliographyFields,
  isManuallyCreated,
  filterBibliographyByAuthor,
  filterBibliographyByYear,
  filterBibliographyByPublicationType,
  collectBibliographyAuthors,
  collectBibliographyYears,
  collectBibliographyPublicationTypes,
  queryBibliography,
  type BibliographyFields,
} from './bibliography';

function item(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'b1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'bibliography',
    title: overrides.title ?? 'Untitled',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' },
    metadata: overrides.metadata,
  };
}

describe('normalizePublicationType', () => {
  it('returns undefined for an absent/empty label (never invents a type)', () => {
    expect(normalizePublicationType(undefined)).toBeUndefined();
    expect(normalizePublicationType('')).toBeUndefined();
    expect(normalizePublicationType('   ')).toBeUndefined();
  });

  it('recognises an exact canonical value', () => {
    expect(normalizePublicationType('journal-article')).toBe('journal-article');
  });

  it('maps common free-text labels to the right canonical type', () => {
    expect(normalizePublicationType('Journal Article')).toBe('journal-article');
    expect(normalizePublicationType('Book')).toBe('book');
    expect(normalizePublicationType('Book Chapter')).toBe('book-chapter');
    expect(normalizePublicationType('Conference Paper')).toBe('conference-paper');
    expect(normalizePublicationType('PhD Thesis')).toBe('thesis');
    expect(normalizePublicationType('Working Paper')).toBe('report');
    expect(normalizePublicationType('Website')).toBe('website');
  });

  it('falls back to "other" for a non-empty but unrecognised label, never undefined', () => {
    expect(normalizePublicationType('Podcast Episode')).toBe('other');
  });
});

describe('parseAuthorsInput', () => {
  it('splits on commas and semicolons, trimming whitespace', () => {
    expect(parseAuthorsInput('Jane Smith, John Doe; A. Author')).toEqual(['Jane Smith', 'John Doe', 'A. Author']);
  });

  it('drops empty entries', () => {
    expect(parseAuthorsInput('Jane Smith,, ,John Doe,')).toEqual(['Jane Smith', 'John Doe']);
  });

  it('does not de-duplicate (two different people can share a name)', () => {
    expect(parseAuthorsInput('A. Smith, A. Smith')).toEqual(['A. Smith', 'A. Smith']);
  });
});

describe('parseBibliographyRecords — structured import format', () => {
  it('parses a single record with every recognised field', () => {
    const text = `Title: A Study of Something
Authors: Jane Smith, John Doe
Year: 2020
Type: Journal Article
Journal: Journal of Examples
Volume: 12
Issue: 3
Pages: 45-67
DOI: 10.1000/xyz123
ISBN: 978-0-00-000000-0
URL: https://example.com/paper
Citation Key: Smith2020
Tags: fieldwork, chapter-1
Category: Literature Review
Notes: Key paper on the topic.`;
    const result = parseBibliographyRecords(text);
    expect(result.records).toHaveLength(1);
    expect(result.skippedBlockCount).toBe(0);
    const [record] = result.records;
    expect(record.title).toBe('A Study of Something');
    expect(record.fields).toEqual({
      authors: ['Jane Smith', 'John Doe'],
      year: '2020',
      publicationType: 'journal-article',
      containerTitle: 'Journal of Examples',
      volume: '12',
      issue: '3',
      pages: '45-67',
      doi: '10.1000/xyz123',
      isbn: '978-0-00-000000-0',
      url: 'https://example.com/paper',
      citationKey: 'Smith2020',
      notes: 'Key paper on the topic.',
    });
    expect(record.tags).toEqual(['fieldwork', 'chapter-1']);
    expect(record.category).toBe('Literature Review');
  });

  it('parses multiple records separated by a "---" line', () => {
    const text = `Title: First Paper
Year: 2019

---

Title: Second Paper
Year: 2021`;
    const result = parseBibliographyRecords(text);
    expect(result.records.map((r) => r.title)).toEqual(['First Paper', 'Second Paper']);
    expect(result.records.map((r) => r.fields.year)).toEqual(['2019', '2021']);
  });

  it('a block with no recognised "Title:" line is skipped, not fabricated into a record', () => {
    const text = `Title: Valid Record
Year: 2020

---

Some random notes with no title line at all.
Author: Someone`;
    const result = parseBibliographyRecords(text);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].title).toBe('Valid Record');
    expect(result.skippedBlockCount).toBe(1);
  });

  it('a file with no records at all reports every block as skipped', () => {
    const result = parseBibliographyRecords('Just some prose with no structure.');
    expect(result.records).toEqual([]);
    expect(result.skippedBlockCount).toBe(1);
  });

  it('unknown keys are ignored, never fabricated into a field', () => {
    const text = `Title: Some Record
Editor: Someone Irrelevant
Random Field: xyz`;
    const result = parseBibliographyRecords(text);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].fields).toEqual({});
  });

  it('a field with an empty value is left unset, never an empty string', () => {
    const text = `Title: Some Record
Year:
DOI:`;
    const result = parseBibliographyRecords(text);
    expect(result.records[0].fields.year).toBeUndefined();
    expect(result.records[0].fields.doi).toBeUndefined();
  });

  it('preserves the original raw block text verbatim (not rebuilt from parsed fields)', () => {
    const text = `Title:   A Paper With   Odd Spacing
Year: 2020`;
    const result = parseBibliographyRecords(text);
    expect(result.records[0].rawBlock).toBe(text.trim());
  });

  it('a record with only a title and nothing else is still valid (every other field optional)', () => {
    const result = parseBibliographyRecords('Title: Just A Title');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].fields).toEqual({});
  });
});

describe('formatBibliographyRecordAsText — round trip with the parser', () => {
  it('formats fields into the documented format and parses back to the same fields', () => {
    const fields: BibliographyFields = {
      authors: ['Jane Smith', 'John Doe'],
      year: '2020',
      publicationType: 'book-chapter',
      containerTitle: 'Edited Volume',
      volume: '2',
      doi: '10.1/x',
      notes: 'Some notes.',
    };
    const text = formatBibliographyRecordAsText({ title: 'A Chapter', fields, tags: ['x', 'y'], category: 'Cat' });
    const result = parseBibliographyRecords(text);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].title).toBe('A Chapter');
    expect(result.records[0].fields).toEqual(fields);
    expect(result.records[0].tags).toEqual(['x', 'y']);
    expect(result.records[0].category).toBe('Cat');
  });

  it('omits lines for unset fields', () => {
    const text = formatBibliographyRecordAsText({ title: 'Bare Record', fields: {} });
    expect(text).toBe('Title: Bare Record');
  });
});

describe('buildBibliographyMetadata', () => {
  it('returns undefined when there are no fields, tags or category (matches a legacy item exactly)', () => {
    expect(buildBibliographyMetadata({})).toBeUndefined();
    expect(buildBibliographyMetadata({ fields: {} })).toBeUndefined();
  });

  it('includes bibliography fields when any are set', () => {
    const metadata = buildBibliographyMetadata({ fields: { year: '2020' } });
    expect(metadata?.bibliography).toEqual({ year: '2020' });
  });

  it('includes tags/category alongside bibliography fields', () => {
    const metadata = buildBibliographyMetadata({ fields: { year: '2020' }, tags: ['a'], category: 'Cat' });
    expect(metadata).toEqual({ bibliography: { year: '2020' }, tags: ['a'], category: 'Cat' });
  });

  it('an authors array with zero entries does not count as "has fields"', () => {
    expect(buildBibliographyMetadata({ fields: { authors: [] } })).toBeUndefined();
  });
});

describe('getBibliographyFields / isManuallyCreated — missing metadata handling', () => {
  it('returns {} for an item with no metadata at all', () => {
    expect(getBibliographyFields(item({ metadata: undefined }))).toEqual({});
  });

  it('returns {} for an item with metadata but no bibliography key (e.g. a research_document)', () => {
    expect(getBibliographyFields(item({ metadata: { tags: ['x'] } }))).toEqual({});
  });

  it('isManuallyCreated is false for an item with no provenance.origin at all (legacy import)', () => {
    expect(isManuallyCreated(item({ provenance: { importedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(false);
  });

  it('isManuallyCreated is true only when origin is explicitly "manual"', () => {
    expect(isManuallyCreated(item({ provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'manual' } }))).toBe(true);
    expect(isManuallyCreated(item({ provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' } }))).toBe(false);
  });
});

describe('bibliography filters', () => {
  const items = [
    item({ id: 'a', title: 'Paper A', metadata: { bibliography: { authors: ['Jane Smith'], year: '2020', publicationType: 'journal-article' } } }),
    item({ id: 'b', title: 'Paper B', metadata: { bibliography: { authors: ['John Doe', 'Jane Smith'], year: '2018', publicationType: 'book' } } }),
    item({ id: 'c', title: 'Paper C', metadata: undefined }),
  ];

  it('filterBibliographyByAuthor keeps items with a matching author (case-insensitive)', () => {
    expect(filterBibliographyByAuthor(items, 'jane smith').map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(filterBibliographyByAuthor(items, 'John Doe').map((i) => i.id)).toEqual(['b']);
  });

  it('an item with no metadata never matches an author filter', () => {
    expect(filterBibliographyByAuthor(items, 'jane smith').some((i) => i.id === 'c')).toBe(false);
  });

  it('filterBibliographyByYear keeps only exact matches', () => {
    expect(filterBibliographyByYear(items, '2020').map((i) => i.id)).toEqual(['a']);
  });

  it('filterBibliographyByPublicationType keeps only exact matches', () => {
    expect(filterBibliographyByPublicationType(items, 'book').map((i) => i.id)).toEqual(['b']);
  });

  it('collectBibliographyAuthors returns unique, alphabetically sorted authors', () => {
    expect(collectBibliographyAuthors(items)).toEqual(['Jane Smith', 'John Doe']);
  });

  it('collectBibliographyYears returns unique years, newest first', () => {
    expect(collectBibliographyYears(items)).toEqual(['2020', '2018']);
  });

  it('collectBibliographyPublicationTypes returns only the types actually present, in canonical order', () => {
    expect(collectBibliographyPublicationTypes(items)).toEqual(['journal-article', 'book']);
  });

  it('an item with no bibliography metadata contributes nothing to any collector and never throws', () => {
    expect(() => collectBibliographyAuthors(items)).not.toThrow();
    expect(() => collectBibliographyYears(items)).not.toThrow();
    expect(() => collectBibliographyPublicationTypes(items)).not.toThrow();
  });
});

describe('collectBibliographyYears — non-numeric years', () => {
  it('sorts numeric years before non-numeric ones, and non-numeric ones lexically', () => {
    const items = [
      item({ id: 'a', metadata: { bibliography: { year: '2020' } } }),
      item({ id: 'b', metadata: { bibliography: { year: 'n.d.' } } }),
      item({ id: 'c', metadata: { bibliography: { year: '2018' } } }),
    ];
    expect(collectBibliographyYears(items)).toEqual(['2020', '2018', 'n.d.']);
  });
});

describe('queryBibliography — combined search + author/year/type + tag/category, reusing queryImportedContent', () => {
  const items = [
    item({
      id: 'a',
      title: 'Fieldwork Study',
      rawContent: 'Title: Fieldwork Study\nAuthors: Jane Smith\nYear: 2020',
      metadata: { bibliography: { authors: ['Jane Smith'], year: '2020', publicationType: 'journal-article' }, tags: ['fieldwork'], category: 'Fieldwork' },
    }),
    item({
      id: 'b',
      title: 'Literature Survey',
      rawContent: 'Title: Literature Survey\nAuthors: John Doe\nYear: 2018',
      metadata: { bibliography: { authors: ['John Doe'], year: '2018', publicationType: 'book' }, tags: ['literature'], category: 'Literature Review' },
    }),
  ];

  it('applies a free-text search (reusing searchImportedContent under the hood)', () => {
    expect(queryBibliography(items, { search: 'fieldwork' }).map((i) => i.id)).toEqual(['a']);
  });

  it('applies an author filter', () => {
    expect(queryBibliography(items, { author: 'John Doe' }).map((i) => i.id)).toEqual(['b']);
  });

  it('applies a year filter', () => {
    expect(queryBibliography(items, { year: '2020' }).map((i) => i.id)).toEqual(['a']);
  });

  it('applies a publication-type filter', () => {
    expect(queryBibliography(items, { publicationType: 'book' }).map((i) => i.id)).toEqual(['b']);
  });

  it('applies tag/category filters via the shared generic query', () => {
    expect(queryBibliography(items, { tags: ['literature'] }).map((i) => i.id)).toEqual(['b']);
    expect(queryBibliography(items, { category: 'Fieldwork' }).map((i) => i.id)).toEqual(['a']);
  });

  it('combines multiple filters (AND across dimensions)', () => {
    expect(queryBibliography(items, { author: 'Jane Smith', year: '2020', publicationType: 'journal-article' }).map((i) => i.id)).toEqual(['a']);
    expect(queryBibliography(items, { author: 'Jane Smith', year: '2018' })).toEqual([]);
  });

  it('an empty query returns every item, deterministically sorted', () => {
    expect(queryBibliography(items, {})).toHaveLength(2);
  });
});
