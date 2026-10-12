import { describe, it, expect } from 'vitest';
import {
  createInkAnnotation,
  createHighlighterInkAnnotation,
  createShapeAnnotation,
  createArrowAnnotation,
  createStickyNote,
  createBookmark,
  createTextHighlight,
  createUnderline,
  createStrikethrough,
  createTextNote,
  clampPoint,
  clampThickness,
  clampOpacity,
  relativePointFromClient,
  isMeaningfulStroke,
  isMeaningfulShape,
  shapeKindForTool,
  pointInPolygon,
  findGeometryInLasso,
  translatePoints,
  annotationsFor,
  annotationsForDocument,
  inkAnnotationsFor,
  geometryAnnotationsFor,
  textAnchoredAnnotationsFor,
  stickyNotesForDocument,
  bookmarkForDocument,
  isDocumentBookmarked,
  findInkNear,
  isTextAnchored,
  isGeometryAnnotation,
  isInkLike,
  MIN_THICKNESS,
  MAX_THICKNESS,
  MIN_OPACITY,
  MAX_OPACITY,
  MAX_POINTS_PER_STROKE,
  DEFAULT_PAGE_NUMBER,
  isNativeInkCapableTool,
  type Annotation,
  type InkAnnotation,
  type HighlighterInkAnnotation,
} from './annotations';
import type { TextAnchor } from './textAnchor';

const DOC_A = 'imported_content:doc-a';
const DOC_B = 'note:doc-b';

const ANCHOR: TextAnchor = { quote: 'the quick fox', prefix: 'Once upon a time ', suffix: ' jumped over.', start: 18, end: 31 };

describe('createInkAnnotation / createHighlighterInkAnnotation — create annotation', () => {
  it('produces a well-formed ink stroke with a real id, the given document/renderMode/colour/thickness/opacity, and clamped points', () => {
    const s = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#111', thickness: 3, opacity: 0.8, points: [{ x: 0.1, y: 0.2 }, { x: 1.5, y: -0.3 }] });
    expect(s.id).toBeTruthy();
    expect(s.documentId).toBe(DOC_A);
    expect(s.renderMode).toBe('raw');
    expect(s.pageNumber).toBe(DEFAULT_PAGE_NUMBER);
    expect(s.type).toBe('ink');
    expect(s.penStyle).toBe('fine');
    expect(s.color).toBe('#111');
    expect(s.thickness).toBe(3);
    expect(s.opacity).toBe(0.8);
    expect(s.points).toEqual([{ x: 0.1, y: 0.2 }, { x: 1, y: 0 }]); // clamped into 0-1
    expect(s.createdAt).toBe(s.updatedAt);
    expect(s.studyTags).toEqual([]);
  });

  it('a highlighter stroke defaults to a lower opacity than an ink stroke', () => {
    const highlighter = createHighlighterInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#fde047', thickness: 14, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    const ink = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(highlighter.opacity).toBeLessThan(ink.opacity);
  });

  it('caps the point list at MAX_POINTS_PER_STROKE — a compact representation, never unbounded', () => {
    const points = Array.from({ length: MAX_POINTS_PER_STROKE + 500 }, (_, i) => ({ x: i / 10000, y: 0 }));
    const s = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points });
    expect(s.points.length).toBe(MAX_POINTS_PER_STROKE);
  });

  it('two calls never produce the same id', () => {
    const a = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const b = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(a.id).not.toBe(b.id);
  });

  it('a pressure value on a point is preserved and clamped', () => {
    const s = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0, y: 0, pressure: 1.5 }, { x: 1, y: 1, pressure: 0.4 }] });
    expect(s.points[0].pressure).toBe(1);
    expect(s.points[1].pressure).toBe(0.4);
  });
});

describe('createShapeAnnotation / createArrowAnnotation', () => {
  it('a shape stores exactly its two defining points and a shapeKind', () => {
    const s = createShapeAnnotation({ documentId: DOC_A, renderMode: 'raw', shapeKind: 'ellipse', color: '#000', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] });
    expect(s.type).toBe('shape');
    expect(s.shapeKind).toBe('ellipse');
    expect(s.points).toHaveLength(2);
  });

  it('an arrow stores exactly a start and end point', () => {
    const a = createArrowAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(a.type).toBe('arrow');
    expect(a.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });
});

describe('createTextHighlight — text-anchored annotation creation', () => {
  it('stores the given TextAnchor verbatim, never a live Range', () => {
    const h = createTextHighlight({ documentId: DOC_A, renderMode: 'preview', anchor: ANCHOR, color: '#facc15' });
    expect(h.type).toBe('textHighlight');
    expect(h.anchor).toEqual(ANCHOR);
    expect(h.renderMode).toBe('preview');
  });

  it('a study-tagged highlight (Add to Revision / Create Flashcard / Important / Doubt) stores the tag as plain metadata, not a second scheduling record', () => {
    const h = createTextHighlight({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#facc15', studyTags: ['revision'] });
    expect(h.studyTags).toEqual(['revision']);
  });

  it('defaults studyTags to an empty array when not given', () => {
    const h = createTextHighlight({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' });
    expect(h.studyTags).toEqual([]);
  });
});

describe('createUnderline / createStrikethrough — the other text-markup annotation types', () => {
  it('createUnderline stores the anchor and type correctly', () => {
    const u = createUnderline({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#3b82f6' });
    expect(u.type).toBe('underline');
    expect(u.anchor).toEqual(ANCHOR);
    expect(u.color).toBe('#3b82f6');
  });

  it('createStrikethrough stores the anchor and type correctly', () => {
    const s = createStrikethrough({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#ef4444' });
    expect(s.type).toBe('strikethrough');
    expect(s.anchor).toEqual(ANCHOR);
    expect(s.color).toBe('#ef4444');
  });
});

describe('createTextNote — a note anchored to a text selection (distinct from a page-level StickyNoteAnnotation)', () => {
  it('stores the anchor and text together', () => {
    const n = createTextNote({ documentId: DOC_A, renderMode: 'preview', anchor: ANCHOR, color: '#facc15', text: 'Check this against the syllabus.' });
    expect(n.type).toBe('textNote');
    expect(n.anchor).toEqual(ANCHOR);
    expect(n.text).toBe('Check this against the syllabus.');
  });
});

describe('createStickyNote — note creation', () => {
  it('defaults to a text note', () => {
    const n = createStickyNote({ documentId: DOC_A, renderMode: 'raw', color: '#fde047', text: 'Remember this' });
    expect(n.noteKind).toBe('text');
    expect(n.text).toBe('Remember this');
    expect(n.inkPoints).toBeUndefined();
  });

  it('a freehand note stores clamped inkPoints and empty text', () => {
    const n = createStickyNote({ documentId: DOC_A, renderMode: 'raw', color: '#fde047', noteKind: 'freehand', inkPoints: [{ x: 0.1, y: 0.1 }, { x: 2, y: 2 }] });
    expect(n.noteKind).toBe('freehand');
    expect(n.text).toBe('');
    expect(n.inkPoints).toEqual([{ x: 0.1, y: 0.1 }, { x: 1, y: 1 }]);
  });
});

describe('createBookmark', () => {
  it('produces a bookmark with the given document id', () => {
    const b = createBookmark({ documentId: DOC_A, renderMode: 'raw' });
    expect(b.type).toBe('bookmark');
    expect(b.documentId).toBe(DOC_A);
  });
});

describe('clampPoint / clampThickness / clampOpacity — coordinate transformation stays stable', () => {
  it('clamps x/y independently into [0, 1]', () => {
    expect(clampPoint({ x: -0.5, y: 2 })).toEqual({ x: 0, y: 1 });
    expect(clampPoint({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps thickness into [MIN_THICKNESS, MAX_THICKNESS]', () => {
    expect(clampThickness(-5)).toBe(MIN_THICKNESS);
    expect(clampThickness(1000)).toBe(MAX_THICKNESS);
    expect(clampThickness(5)).toBe(5);
  });

  it('clamps opacity into [MIN_OPACITY, MAX_OPACITY]', () => {
    expect(clampOpacity(-1)).toBe(MIN_OPACITY);
    expect(clampOpacity(5)).toBe(MAX_OPACITY);
    expect(clampOpacity(0.5)).toBe(0.5);
  });
});

describe('relativePointFromClient — the ONLY place viewport pixels enter the annotation system', () => {
  it('maps a client point to the correct fraction of the given rect', () => {
    const rect = { left: 100, top: 200, width: 400, height: 800 };
    expect(relativePointFromClient(300, 600, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('scrolling (a more-negative rect.top, same client coordinates) does not change the relative point — the same physical spot on the page stays anchored regardless of scroll position', () => {
    const rectAtTop = { left: 0, top: 0, width: 400, height: 800 };
    const pointAtTop = relativePointFromClient(200, 400, rectAtTop);
    const rectAfterScroll = { left: 0, top: -300, width: 400, height: 800 };
    const pointAfterScroll = relativePointFromClient(200, 100, rectAfterScroll);
    expect(pointAfterScroll).toEqual(pointAtTop);
  });

  it('a uniform CSS zoom (rect scaled, same relative geometry) produces the same fractional point', () => {
    const rectNormal = { left: 0, top: 0, width: 400, height: 800 };
    const pointNormal = relativePointFromClient(100, 200, rectNormal);
    const rectZoomed = { left: 0, top: 0, width: 800, height: 1600 };
    const pointZoomed = relativePointFromClient(200, 400, rectZoomed);
    expect(pointZoomed).toEqual(pointNormal);
  });

  it('clamps out-of-bounds client coordinates into the valid 0-1 range', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(relativePointFromClient(-50, 500, rect)).toEqual({ x: 0, y: 1 });
  });

  it('returns {0,0} defensively for a degenerate (zero-size) rect rather than dividing by zero', () => {
    expect(relativePointFromClient(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('carries an optional pressure value through untouched (clamped 0-1)', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(relativePointFromClient(50, 50, rect, 0.7)).toEqual({ x: 0.5, y: 0.5, pressure: 0.7 });
  });
});

describe('isMeaningfulStroke', () => {
  it('rejects an empty or single-point stroke (a tap, not a drawn stroke)', () => {
    expect(isMeaningfulStroke([])).toBe(false);
    expect(isMeaningfulStroke([{ x: 0.5, y: 0.5 }])).toBe(false);
  });

  it('accepts a stroke with real, drawn length', () => {
    expect(isMeaningfulStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(true);
  });
});

function ink(id: string, documentId: string, renderMode: 'raw' | 'preview' = 'raw', points: { x: number; y: number }[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }]): InkAnnotation {
  return { id, documentId, renderMode, pageNumber: 1, studyTags: [], type: 'ink', penStyle: 'fine', color: '#000', thickness: 2, opacity: 1, points, createdAt: 't', updatedAt: 't' };
}

describe('type guards — isTextAnchored / isGeometryAnnotation / isInkLike', () => {
  it('classify each annotation family correctly', () => {
    const highlight = createTextHighlight({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' });
    const strokeAnn = ink('s1', DOC_A);
    const shapeAnn = createShapeAnnotation({ documentId: DOC_A, renderMode: 'raw', shapeKind: 'rectangle', color: '#000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const sticky = createStickyNote({ documentId: DOC_A, renderMode: 'raw', color: '#fde047', text: 'x' });
    const bookmark = createBookmark({ documentId: DOC_A, renderMode: 'raw' });

    expect(isTextAnchored(highlight)).toBe(true);
    expect(isTextAnchored(strokeAnn)).toBe(false);
    expect(isGeometryAnnotation(strokeAnn)).toBe(true);
    expect(isGeometryAnnotation(shapeAnn)).toBe(true);
    expect(isGeometryAnnotation(highlight)).toBe(false);
    expect(isInkLike(strokeAnn)).toBe(true);
    expect(isInkLike(shapeAnn)).toBe(false);
    expect(isTextAnchored(sticky)).toBe(false);
    expect(isTextAnchored(bookmark)).toBe(false);
  });
});

describe('annotationsFor / annotationsForDocument — correct document + render-mode association, multiple annotations, no cross-document bleed', () => {
  const mixed: Annotation[] = [
    ink('s1', DOC_A, 'raw'),
    ink('s2', DOC_A, 'preview'),
    createStickyNote({ documentId: DOC_A, renderMode: 'raw', color: '#fde047', text: 'note on A' }),
    createBookmark({ documentId: DOC_A, renderMode: 'raw' }),
    ink('s3', DOC_B, 'raw'),
    createStickyNote({ documentId: DOC_B, renderMode: 'raw', color: '#fde047', text: 'note on B' }),
  ];

  it('annotationsForDocument returns only the matching document\'s annotations, BOTH render modes, in insertion order', () => {
    const forA = annotationsForDocument(mixed, DOC_A);
    expect(forA).toHaveLength(4);
    expect(forA.every((a) => a.documentId === DOC_A)).toBe(true);
  });

  it('annotationsFor additionally scopes to ONE render mode', () => {
    const forARaw = annotationsFor(mixed, DOC_A, 'raw');
    expect(forARaw.map((a) => a.id)).toEqual(['s1', mixed[2].id, mixed[3].id]);
    const forAPreview = annotationsFor(mixed, DOC_A, 'preview');
    expect(forAPreview.map((a) => a.id)).toEqual(['s2']);
  });

  it('never includes another document\'s annotations, even with many mixed entries', () => {
    const forB = annotationsForDocument(mixed, DOC_B);
    expect(forB).toHaveLength(2);
    expect(forB.some((a) => a.documentId === DOC_A)).toBe(false);
  });

  it('inkAnnotationsFor / textAnchoredAnnotationsFor / stickyNotesForDocument filter by type', () => {
    expect(inkAnnotationsFor(mixed, DOC_A, 'raw').map((s) => s.id)).toEqual(['s1']);
    expect(textAnchoredAnnotationsFor(mixed, DOC_A, 'raw')).toEqual([]);
    expect(stickyNotesForDocument(mixed, DOC_A)).toHaveLength(1);
  });

  it('bookmarkForDocument / isDocumentBookmarked reflect only that document\'s own bookmark', () => {
    expect(bookmarkForDocument(mixed, DOC_A)).toBeDefined();
    expect(isDocumentBookmarked(mixed, DOC_A)).toBe(true);
    expect(bookmarkForDocument(mixed, DOC_B)).toBeUndefined();
    expect(isDocumentBookmarked(mixed, DOC_B)).toBe(false);
  });
});

describe('annotationsForDocument / bookmarkForDocument — empty annotation state', () => {
  it('returns [] / undefined / false for a document with no annotations at all', () => {
    expect(annotationsForDocument([], DOC_A)).toEqual([]);
    expect(annotationsFor([], DOC_A, 'raw')).toEqual([]);
    expect(inkAnnotationsFor([], DOC_A, 'raw')).toEqual([]);
    expect(stickyNotesForDocument([], DOC_A)).toEqual([]);
    expect(bookmarkForDocument([], DOC_A)).toBeUndefined();
    expect(isDocumentBookmarked([], DOC_A)).toBe(false);
  });

  it('returns [] for a real (non-empty) list that simply has nothing for this specific document', () => {
    const mixed: Annotation[] = [ink('s1', DOC_B)];
    expect(annotationsForDocument(mixed, DOC_A)).toEqual([]);
  });
});

describe('findInkNear — eraser hit-testing geometry', () => {
  const strokes: (InkAnnotation | HighlighterInkAnnotation)[] = [
    ink('near', DOC_A, 'raw', [{ x: 0.1, y: 0.1 }, { x: 0.15, y: 0.15 }]),
    ink('far', DOC_A, 'raw', [{ x: 0.9, y: 0.9 }, { x: 0.95, y: 0.95 }]),
  ];

  it('finds the stroke whose nearest point is within the given radius', () => {
    expect(findInkNear(strokes, { x: 0.1, y: 0.1 }, 0.02)?.id).toBe('near');
  });

  it('returns undefined when nothing is within radius', () => {
    expect(findInkNear(strokes, { x: 0.5, y: 0.5 }, 0.02)).toBeUndefined();
  });

  it('returns the CLOSEST stroke when more than one is within radius', () => {
    const overlapping = [ink('a', DOC_A, 'raw', [{ x: 0.5, y: 0.5 }]), ink('b', DOC_A, 'raw', [{ x: 0.501, y: 0.501 }])];
    expect(findInkNear(overlapping, { x: 0.5, y: 0.5 }, 0.1)?.id).toBe('a');
  });

  it('never mutates the strokes input', () => {
    const snapshot = JSON.stringify(strokes);
    findInkNear(strokes, { x: 0.1, y: 0.1 }, 0.02);
    expect(JSON.stringify(strokes)).toBe(snapshot);
  });
});

describe('shapeKindForTool', () => {
  it('maps each shape tool to its ShapeKind', () => {
    expect(shapeKindForTool('rectangle')).toBe('rectangle');
    expect(shapeKindForTool('ellipse')).toBe('ellipse');
    expect(shapeKindForTool('line')).toBe('line');
  });

  it('returns null for a non-shape tool (arrow included — it is its own AnnotationType, not a ShapeKind)', () => {
    expect(shapeKindForTool('arrow')).toBeNull();
    expect(shapeKindForTool('pen')).toBeNull();
    expect(shapeKindForTool('eraser')).toBeNull();
    expect(shapeKindForTool('lasso')).toBeNull();
  });
});

describe('isMeaningfulShape', () => {
  it('rejects two points that are effectively the same spot (a tap, not a dragged shape)', () => {
    expect(isMeaningfulShape({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBe(false);
    expect(isMeaningfulShape({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 })).toBe(false);
  });

  it('accepts two points with a real dragged distance between them', () => {
    expect(isMeaningfulShape({ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 })).toBe(true);
  });
});

describe('geometryAnnotationsFor — the superset AnnotationLayer draws/hit-tests against', () => {
  it('includes ink, highlighter ink, shape, AND arrow, but not text-anchored or page-level annotations', () => {
    const shape = createShapeAnnotation({ documentId: DOC_A, renderMode: 'raw', shapeKind: 'rectangle', color: '#000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const arrow = createArrowAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const mixed: Annotation[] = [
      ink('s1', DOC_A, 'raw'),
      shape,
      arrow,
      createTextHighlight({ documentId: DOC_A, renderMode: 'raw', anchor: ANCHOR, color: '#facc15' }),
      createStickyNote({ documentId: DOC_A, renderMode: 'raw', color: '#fde047' }),
      createBookmark({ documentId: DOC_A, renderMode: 'raw' }),
    ];
    const geometry = geometryAnnotationsFor(mixed, DOC_A, 'raw');
    expect(geometry.map((a) => a.type).sort()).toEqual(['arrow', 'ink', 'shape']);
  });
});

describe('findInkNear — also finds shapes and arrows, not only ink (eraser covers every geometry-anchored annotation)', () => {
  it('erases the nearest shape when it is within radius', () => {
    const shape = createShapeAnnotation({ documentId: DOC_A, renderMode: 'raw', shapeKind: 'ellipse', color: '#000', points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] });
    const arrow = createArrowAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', points: [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }] });
    expect(findInkNear([shape, arrow], { x: 0.2, y: 0.2 }, 0.02)?.id).toBe(shape.id);
    expect(findInkNear([shape, arrow], { x: 0.8, y: 0.8 }, 0.02)?.id).toBe(arrow.id);
  });
});

describe('pointInPolygon — lasso hit-testing geometry', () => {
  const square = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];

  it('a point inside the polygon is inside', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
  });

  it('a point outside the polygon is outside', () => {
    expect(pointInPolygon({ x: 0.05, y: 0.05 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0.95, y: 0.95 }, square)).toBe(false);
  });

  it('a non-convex (concave) polygon is handled correctly, not just a bounding box', () => {
    // A "C" shape: a bite taken out of the right side — a point in the bite is OUTSIDE even
    // though it sits within the shape's own bounding box.
    const cShape = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 }, { x: 0.4, y: 0.4 },
      { x: 0.4, y: 0.6 }, { x: 1, y: 0.6 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
    expect(pointInPolygon({ x: 0.7, y: 0.5 }, cShape)).toBe(false); // inside the bite
    expect(pointInPolygon({ x: 0.2, y: 0.5 }, cShape)).toBe(true); // inside the solid left bar
  });
});

describe('findGeometryInLasso', () => {
  const inside = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }] });
  const outside = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0.95, y: 0.95 }, { x: 0.97, y: 0.97 }] });
  const straddling = createInkAnnotation({ documentId: DOC_A, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0.5, y: 0.5 }, { x: 0.99, y: 0.99 }] }); // 1 of 2 points inside
  const square = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];

  it('selects an annotation whose points are (roughly) enclosed by the lasso', () => {
    const selected = findGeometryInLasso([inside, outside], square);
    expect(selected.map((a) => a.id)).toEqual([inside.id]);
  });

  it('selects an annotation with at least HALF its points inside (majority rule), not requiring every point', () => {
    const selected = findGeometryInLasso([straddling], square);
    expect(selected.map((a) => a.id)).toEqual([straddling.id]);
  });

  it('returns [] for a degenerate lasso (fewer than 3 points)', () => {
    expect(findGeometryInLasso([inside], [])).toEqual([]);
    expect(findGeometryInLasso([inside], [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }])).toEqual([]);
  });

  it('returns [] when nothing is enclosed', () => {
    expect(findGeometryInLasso([outside], square)).toEqual([]);
  });
});

describe('translatePoints', () => {
  it('shifts every point by the given delta', () => {
    const result = translatePoints([{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.5 }], 0.1, -0.1);
    expect(result[0].x).toBeCloseTo(0.3);
    expect(result[0].y).toBeCloseTo(0.2);
    expect(result[1]).toEqual({ x: 0.6, y: 0.4 });
  });

  it('clamps the result back into the valid 0-1 range rather than letting a moved annotation drift off-page', () => {
    const result = translatePoints([{ x: 0.95, y: 0.05 }], 0.2, -0.2);
    expect(result).toEqual([{ x: 1, y: 0 }]);
  });

  it('preserves pressure untouched', () => {
    const result = translatePoints([{ x: 0.5, y: 0.5, pressure: 0.7 }], 0.1, 0.1);
    expect(result[0].pressure).toBe(0.7);
  });

  it('never mutates the input points', () => {
    const points = [{ x: 0.5, y: 0.5 }];
    const snapshot = JSON.stringify(points);
    translatePoints(points, 0.1, 0.1);
    expect(JSON.stringify(points)).toBe(snapshot);
  });
});

describe('isNativeInkCapableTool — routing between the native Ink overlay and the JS annotation layer', () => {
  it('treats "pen" as native-capable (covers all five PenStyle variants: fine/ballpoint/pencil/brush/marker are sub-selections of this one tool)', () => {
    expect(isNativeInkCapableTool('pen')).toBe(true);
  });

  it('treats "highlighter" as native-capable', () => {
    expect(isNativeInkCapableTool('highlighter')).toBe(true);
  });

  it('treats every non-handwriting tool as JS-only', () => {
    expect(isNativeInkCapableTool('eraser')).toBe(false);
    expect(isNativeInkCapableTool('lasso')).toBe(false);
    expect(isNativeInkCapableTool('rectangle')).toBe(false);
    expect(isNativeInkCapableTool('ellipse')).toBe(false);
    expect(isNativeInkCapableTool('line')).toBe(false);
    expect(isNativeInkCapableTool('arrow')).toBe(false);
  });

  it('treats no tool armed (null) as JS-only — native ink should not intercept the stylus when nothing is selected', () => {
    expect(isNativeInkCapableTool(null)).toBe(false);
  });
});
