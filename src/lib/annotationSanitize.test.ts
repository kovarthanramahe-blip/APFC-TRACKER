import { describe, it, expect } from 'vitest';
import { sanitizeAnnotation, sanitizeAnnotations } from './annotationSanitize';
import { MAX_THICKNESS } from './annotations';

const VALID_ANCHOR = { quote: 'hello world', prefix: 'say ', suffix: ' now', start: 4, end: 15 };

describe('sanitizeAnnotation — well-formed records pass through with every field intact', () => {
  it('a well-formed ink annotation is returned unchanged', () => {
    const raw = {
      id: 'a1',
      documentId: 'note:d1',
      renderMode: 'raw',
      pageNumber: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      studyTags: ['revision'],
      type: 'ink',
      penStyle: 'pencil',
      color: '#123456',
      thickness: 3,
      opacity: 0.9,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
    };
    expect(sanitizeAnnotation(raw)).toEqual(raw);
  });

  it('a well-formed textHighlight is returned unchanged', () => {
    const raw = {
      id: 'h1',
      documentId: 'note:d1',
      renderMode: 'preview',
      pageNumber: 1,
      createdAt: 't',
      updatedAt: 't',
      studyTags: [],
      type: 'textHighlight',
      anchor: VALID_ANCHOR,
      color: '#facc15',
    };
    expect(sanitizeAnnotation(raw)).toEqual(raw);
  });

  it('a well-formed bookmark is returned unchanged', () => {
    const raw = { id: 'b1', documentId: 'note:d1', renderMode: 'raw', pageNumber: 1, createdAt: 't', updatedAt: 't', studyTags: [], type: 'bookmark' };
    expect(sanitizeAnnotation(raw)).toEqual(raw);
  });
});

describe('sanitizeAnnotation — missing/invalid top-level identity is unrepairable', () => {
  it('returns null for a non-object', () => {
    expect(sanitizeAnnotation(null)).toBeNull();
    expect(sanitizeAnnotation(undefined)).toBeNull();
    expect(sanitizeAnnotation('a string')).toBeNull();
    expect(sanitizeAnnotation(42)).toBeNull();
    expect(sanitizeAnnotation([])).toBeNull();
  });

  it('returns null for a missing/empty id or documentId', () => {
    const base = { renderMode: 'raw', createdAt: 't', updatedAt: 't', type: 'bookmark' };
    expect(sanitizeAnnotation({ ...base, id: '', documentId: 'd1' })).toBeNull();
    expect(sanitizeAnnotation({ ...base, id: 'a1', documentId: '' })).toBeNull();
    expect(sanitizeAnnotation({ ...base, documentId: 'd1' })).toBeNull(); // id missing entirely
  });

  it('returns null for an unrecognised/missing type — cannot be repaired', () => {
    const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't' };
    expect(sanitizeAnnotation({ ...base, type: 'someFutureType' })).toBeNull();
    expect(sanitizeAnnotation({ ...base })).toBeNull(); // no type at all
    // Also covers the OLD, pre-redesign shape from an earlier uncommitted pass ('stroke'/'note'/
    // 'highlight') — those type strings are no longer recognised and are correctly dropped rather
    // than crashing.
    expect(sanitizeAnnotation({ ...base, type: 'stroke' })).toBeNull();
    expect(sanitizeAnnotation({ ...base, type: 'note' })).toBeNull();
  });
});

describe('sanitizeAnnotation — missing/invalid base fields are repaired with safe defaults', () => {
  it('defaults renderMode to "raw" for anything other than "preview"', () => {
    const base = { id: 'a1', documentId: 'd1', type: 'bookmark' };
    expect(sanitizeAnnotation({ ...base })?.renderMode).toBe('raw');
    expect(sanitizeAnnotation({ ...base, renderMode: 'garbage' })?.renderMode).toBe('raw');
    expect(sanitizeAnnotation({ ...base, renderMode: 'preview' })?.renderMode).toBe('preview');
  });

  it('defaults pageNumber to 1 when missing/invalid', () => {
    const base = { id: 'a1', documentId: 'd1', type: 'bookmark' };
    expect(sanitizeAnnotation({ ...base, pageNumber: 'two' })?.pageNumber).toBe(1);
    expect(sanitizeAnnotation({ ...base })?.pageNumber).toBe(1);
  });

  it('defaults missing/invalid createdAt/updatedAt to a real (non-empty) timestamp rather than dropping the record', () => {
    const base = { id: 'a1', documentId: 'd1', type: 'bookmark' };
    const sanitized = sanitizeAnnotation({ ...base })!;
    expect(typeof sanitized.createdAt).toBe('string');
    expect(sanitized.createdAt.length).toBeGreaterThan(0);
  });

  it('filters studyTags down to only recognised values, defaulting to []', () => {
    const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't', type: 'bookmark' };
    expect(sanitizeAnnotation({ ...base, studyTags: ['revision', 'not-a-real-tag', 'doubt'] })?.studyTags).toEqual(['revision', 'doubt']);
    expect(sanitizeAnnotation({ ...base, studyTags: 'not-an-array' })?.studyTags).toEqual([]);
    expect(sanitizeAnnotation({ ...base })?.studyTags).toEqual([]);
  });
});

describe('sanitizeAnnotation — text-anchored types require a valid anchor, unrepairable without one', () => {
  const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't' };

  it('drops a textHighlight/underline/strikethrough/textNote with a missing or malformed anchor', () => {
    for (const type of ['textHighlight', 'underline', 'strikethrough', 'textNote']) {
      expect(sanitizeAnnotation({ ...base, type })).toBeNull();
      expect(sanitizeAnnotation({ ...base, type, anchor: { quote: '', prefix: '', suffix: '', start: 0, end: 5 } })).toBeNull(); // empty quote
      expect(sanitizeAnnotation({ ...base, type, anchor: { quote: 'x', prefix: '', suffix: '', start: 5, end: 2 } })).toBeNull(); // end < start
    }
  });

  it('defaults a missing/invalid colour rather than dropping the record', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'underline', anchor: VALID_ANCHOR, color: 123 })!;
    expect(typeof (sanitized as { color: string }).color).toBe('string');
  });

  it('defaults textNote\'s text to "" when missing/invalid', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'textNote', anchor: VALID_ANCHOR, text: 42 })!;
    expect((sanitized as { text: string }).text).toBe('');
  });
});

describe('sanitizeAnnotation — ink/highlighterInk require usable geometry after filtering', () => {
  const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't' };

  it('drops an ink/highlighterInk annotation with no points at all', () => {
    expect(sanitizeAnnotation({ ...base, type: 'ink' })).toBeNull();
    expect(sanitizeAnnotation({ ...base, type: 'highlighterInk', points: [] })).toBeNull();
  });

  it('drops individual malformed points but keeps the record when enough valid ones remain', () => {
    const sanitized = sanitizeAnnotation({
      ...base,
      type: 'ink',
      color: '#000',
      points: [{ x: 0.1, y: 0.2 }, { x: 'not a number', y: 0.5 }, { x: 0.3, y: 0.4 }, null, 'garbage'],
    })!;
    expect((sanitized as { points: unknown[] }).points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
  });

  it('drops the record entirely when fewer than 2 valid points survive filtering', () => {
    expect(sanitizeAnnotation({ ...base, type: 'ink', points: [{ x: 0.1, y: 0.2 }, { x: 'bad', y: 0.5 }] })).toBeNull();
  });

  it('clamps out-of-range thickness/opacity rather than rejecting the record', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'ink', thickness: 9999, opacity: -5, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })!;
    expect((sanitized as { thickness: number }).thickness).toBe(MAX_THICKNESS);
    expect((sanitized as { opacity: number }).opacity).toBeGreaterThanOrEqual(0);
  });

  it('defaults an invalid penStyle to "pen"', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'ink', penStyle: 'crayon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })!;
    expect((sanitized as { penStyle: string }).penStyle).toBe('pen');
  });
});

describe('sanitizeAnnotation — shape/arrow require exactly usable 2-point geometry', () => {
  const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't' };

  it('drops a shape/arrow with fewer than 2 valid points', () => {
    expect(sanitizeAnnotation({ ...base, type: 'shape', points: [{ x: 0.1, y: 0.1 }] })).toBeNull();
    expect(sanitizeAnnotation({ ...base, type: 'arrow', points: [] })).toBeNull();
  });

  it('truncates a shape/arrow with MORE than 2 points down to 2', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'arrow', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }] })!;
    expect((sanitized as { points: unknown[] }).points).toHaveLength(2);
  });

  it('defaults an invalid shapeKind to "rectangle"', () => {
    const sanitized = sanitizeAnnotation({ ...base, type: 'shape', shapeKind: 'triangle', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })!;
    expect((sanitized as { shapeKind: string }).shapeKind).toBe('rectangle');
  });
});

describe('sanitizeAnnotation — stickyNote is repaired rather than dropped even with bad geometry', () => {
  const base = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't', type: 'stickyNote' };

  it('a text sticky note with missing text defaults to ""', () => {
    const sanitized = sanitizeAnnotation({ ...base })!;
    expect((sanitized as { text: string }).text).toBe('');
    expect((sanitized as { noteKind: string }).noteKind).toBe('text');
  });

  it('a freehand sticky note with corrupt inkPoints keeps the record with an empty points array, never dropped', () => {
    const sanitized = sanitizeAnnotation({ ...base, noteKind: 'freehand', inkPoints: 'not an array' })!;
    expect((sanitized as { inkPoints: unknown[] }).inkPoints).toEqual([]);
  });
});

describe('sanitizeAnnotations — whole-array handling', () => {
  it('returns [] for a non-array input', () => {
    expect(sanitizeAnnotations(null)).toEqual([]);
    expect(sanitizeAnnotations(undefined)).toEqual([]);
    expect(sanitizeAnnotations('not an array')).toEqual([]);
    expect(sanitizeAnnotations({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(sanitizeAnnotations([])).toEqual([]);
  });

  it('one corrupt record never takes down the rest of the array', () => {
    const good1 = { id: 'a1', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't', studyTags: [], type: 'bookmark' };
    const corrupt = { id: 'a2', documentId: 'd1', type: 'not-a-real-type' };
    const good2 = { id: 'a3', documentId: 'd1', renderMode: 'raw', createdAt: 't', updatedAt: 't', studyTags: [], type: 'bookmark' };
    const result = sanitizeAnnotations([good1, corrupt, good2, null, 'garbage', 42]);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('never throws on a deeply malformed array', () => {
    expect(() => sanitizeAnnotations([null, undefined, 42, 'x', [], {}, { type: 'ink' }])).not.toThrow();
  });
});

describe('sanitizeAnnotation — never fabricates content', () => {
  it('a repaired record uses only data that was actually present, never invents new text or geometry', () => {
    const raw = { id: 'a1', documentId: 'd1', type: 'textNote', anchor: VALID_ANCHOR }; // no text at all
    const sanitized = sanitizeAnnotation(raw)!;
    expect((sanitized as { text: string }).text).toBe(''); // never invented text
    expect((sanitized as { anchor: unknown }).anchor).toEqual(VALID_ANCHOR); // real data preserved exactly
  });
});
