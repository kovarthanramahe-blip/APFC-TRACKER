import { describe, it, expect } from 'vitest';
import { categoriesForAnnotation, groupAnnotationsByCategory, filterAnnotationIndex, searchableTextFor, previewTextFor, truncatePreview, formatAnnotationTimestamp, ALL_INDEX_CATEGORIES } from './annotationIndex';
import { createTextHighlight, createUnderline, createStrikethrough, createTextNote, createStickyNote, createBookmark, createInkAnnotation, createHighlighterInkAnnotation, createShapeAnnotation, createArrowAnnotation, type Annotation } from './annotations';
import type { TextAnchor } from './textAnchor';

const DOC = 'imported_content:doc-a';
const ANCHOR: TextAnchor = { quote: 'the quick fox', prefix: 'Once upon a time ', suffix: ' jumped over.', start: 18, end: 31 };

function withTime(a: Annotation, iso: string): Annotation {
  return { ...a, createdAt: iso, updatedAt: iso } as Annotation;
}

describe('categoriesForAnnotation — annotation index categorisation', () => {
  it('a plain textHighlight (no study tags) is categorised under Highlights only', () => {
    const h = createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' });
    expect(categoriesForAnnotation(h)).toEqual(['highlights']);
  });

  it('underline and strikethrough are also categorised under Highlights', () => {
    const u = createUnderline({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#3b82f6' });
    const s = createStrikethrough({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#ef4444' });
    expect(categoriesForAnnotation(u)).toEqual(['highlights']);
    expect(categoriesForAnnotation(s)).toEqual(['highlights']);
  });

  it('a textNote and a stickyNote are both categorised under Notes', () => {
    const tn = createTextNote({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15', text: 'note' });
    const sn = createStickyNote({ documentId: DOC, renderMode: 'raw', color: '#fde047', text: 'sticky' });
    expect(categoriesForAnnotation(tn)).toEqual(['notes']);
    expect(categoriesForAnnotation(sn)).toEqual(['notes']);
  });

  it('a bookmark is categorised under Bookmarks', () => {
    const b = createBookmark({ documentId: DOC, renderMode: 'raw' });
    expect(categoriesForAnnotation(b)).toEqual(['bookmarks']);
  });

  it('ink, highlighter ink, shape, and arrow are all categorised under Handwriting', () => {
    const ink = createInkAnnotation({ documentId: DOC, renderMode: 'raw', color: '#1e293b', thickness: 2, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const hi = createHighlighterInkAnnotation({ documentId: DOC, renderMode: 'raw', color: '#fde047', thickness: 14, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const shape = createShapeAnnotation({ documentId: DOC, renderMode: 'raw', shapeKind: 'rectangle', color: '#1e293b', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const arrow = createArrowAnnotation({ documentId: DOC, renderMode: 'raw', color: '#1e293b', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    for (const a of [ink, hi, shape, arrow]) expect(categoriesForAnnotation(a)).toEqual(['handwriting']);
  });

  it('a study-tagged highlight appears under BOTH Highlights and its tag category (additive membership)', () => {
    const h = createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: ['revision'] });
    expect(categoriesForAnnotation(h)).toEqual(['highlights', 'revision']);
  });

  it('an annotation with multiple study tags appears under every tag category', () => {
    const h = createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: ['important', 'doubt'] });
    expect(categoriesForAnnotation(h)).toEqual(['highlights', 'important', 'doubt']);
  });
});

describe('groupAnnotationsByCategory', () => {
  it('places each annotation into every category it belongs to, and every declared category key is present even when empty', () => {
    const h = createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: ['flashcard'] });
    const groups = groupAnnotationsByCategory([h]);
    expect(Object.keys(groups).sort()).toEqual([...ALL_INDEX_CATEGORIES].sort());
    expect(groups.highlights).toEqual([h]);
    expect(groups.flashcard).toEqual([h]);
    expect(groups.notes).toEqual([]);
    expect(groups.bookmarks).toEqual([]);
  });
});

describe('filterAnnotationIndex — category + search filtering', () => {
  const highlight = withTime(createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' }), '2026-01-01T10:00:00.000Z');
  const note = withTime(createStickyNote({ documentId: DOC, renderMode: 'raw', color: '#fde047', text: 'Revisit this before the mock test' }), '2026-01-02T10:00:00.000Z');
  const bookmark = withTime(createBookmark({ documentId: DOC, renderMode: 'raw' }), '2026-01-03T10:00:00.000Z');
  const all = [highlight, note, bookmark];

  it("category 'all' with an empty query returns every annotation, newest first", () => {
    expect(filterAnnotationIndex(all, 'all', '')).toEqual([bookmark, note, highlight]);
  });

  it('a specific category returns only that category\'s annotations', () => {
    expect(filterAnnotationIndex(all, 'notes', '')).toEqual([note]);
    expect(filterAnnotationIndex(all, 'bookmarks', '')).toEqual([bookmark]);
  });

  it('a search query matches case-insensitively against the annotation\'s searchable text', () => {
    expect(filterAnnotationIndex(all, 'all', 'revisit')).toEqual([note]);
    expect(filterAnnotationIndex(all, 'all', 'QUICK FOX')).toEqual([highlight]);
  });

  it('combines category AND search — a query that matches a DIFFERENT category\'s item returns nothing', () => {
    expect(filterAnnotationIndex(all, 'bookmarks', 'revisit')).toEqual([]);
  });

  it("returns [] for a category with nothing in it (drives that category's empty state)", () => {
    expect(filterAnnotationIndex(all, 'handwriting', '')).toEqual([]);
    expect(filterAnnotationIndex(all, 'revision', '')).toEqual([]);
  });

  it('returns [] for an empty annotation list entirely (drives the whole-panel empty state)', () => {
    expect(filterAnnotationIndex([], 'all', '')).toEqual([]);
  });

  it('a query matching nothing returns []', () => {
    expect(filterAnnotationIndex(all, 'all', 'nonexistent phrase xyz')).toEqual([]);
  });
});

describe('searchableTextFor / previewTextFor', () => {
  it('a text-anchored annotation is searched/previewed by its quote', () => {
    const h = createTextHighlight({ documentId: DOC, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' });
    expect(searchableTextFor(h)).toBe('the quick fox');
    expect(previewTextFor(h)).toBe('the quick fox');
  });

  it('a stickyNote with no text previews as "Untitled note" rather than a blank line', () => {
    const n = createStickyNote({ documentId: DOC, renderMode: 'raw', color: '#fde047' });
    expect(previewTextFor(n)).toBe('Untitled note');
  });

  it('a freehand stickyNote with no text previews as "Handwritten note"', () => {
    const n = createStickyNote({ documentId: DOC, renderMode: 'raw', color: '#fde047', noteKind: 'freehand', inkPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(previewTextFor(n)).toBe('Handwritten note');
  });

  it('truncatePreview shortens long text with an ellipsis and leaves short text untouched', () => {
    expect(truncatePreview('short')).toBe('short');
    const long = 'x'.repeat(200);
    const truncated = truncatePreview(long);
    expect(truncated.length).toBeLessThan(long.length);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

describe('formatAnnotationTimestamp', () => {
  it('formats a real ISO instant into a readable date+time string', () => {
    const formatted = formatAnnotationTimestamp('2026-03-15T09:30:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toMatch(/2026/);
  });

  it('returns "" for an invalid/unparseable timestamp rather than "Invalid Date"', () => {
    expect(formatAnnotationTimestamp('not-a-date')).toBe('');
  });
});
