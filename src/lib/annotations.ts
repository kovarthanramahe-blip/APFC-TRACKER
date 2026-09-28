// Premium Study Reader — Annotation Domain Model (Phase A). Pure, framework-free. Extends the
// EXISTING Repository content-viewing surface (pages/RepositoryDetail.tsx's ContentView) rather
// than building a second document/storage system: annotations persist as one more workspace-owned
// array in lib/store.ts, exactly like notes/importedContent/bookmarkedPyqIds already do. The
// SOURCE document (a Note's `content` / an ImportedContent's `rawContent`) is never read from or
// written to by anything in this module — an annotation only ever references it by id + anchor.
//
// Two independent annotation families, matching how the reading surface actually works:
//
//   TEXT-ANCHORED (textHighlight, underline, strikethrough, textNote) — anchored to a quote of the
//   SOURCE TEXT itself (see lib/textAnchor.ts for how a TextAnchor is created/resolved), never to
//   raw pixel coordinates. Durable across scroll, zoom, and reload; degrades gracefully (never
//   silently misattaches) if the underlying text has changed since the annotation was made.
//
//   GEOMETRY-ANCHORED (ink, highlighterInk, shape, arrow) — anchored to normalized (0-1) points
//   relative to the reading container's own content box at draw time, exactly as before. Pure
//   scrolling and a uniform CSS zoom (scale transform) of the container never move these away from
//   what they were drawn next to.
//
// PAGE-LEVEL (stickyNote, bookmark) — attached to the document as a whole, not to any specific
// spot in it.
//
// Every annotation also carries `renderMode` ('raw' | 'preview'): Raw and Preview render the SAME
// underlying text completely differently (monospace block vs. flowed Markdown), so a text quote's
// offsets and an ink stroke's pixel layout are only meaningful within the mode they were captured
// in — this field scopes an annotation to that mode rather than fragmenting `documentId` itself
// (documentId always stays the real, stable Repository entity key).
//
// `pageNumber` is carried on every annotation for forward compatibility with a future real
// paginated/PDF-page renderer (see this module's own PR notes) — always DEFAULT_PAGE_NUMBER today,
// since the current reading surface has no true page boundaries. This is a deliberately honest
// limitation, not a fake "page-stable" claim.
import { uuid } from './utils';
import type { TextAnchor } from './textAnchor';

export type RenderMode = 'raw' | 'preview';

export type AnnotationType = 'textHighlight' | 'underline' | 'strikethrough' | 'textNote' | 'ink' | 'highlighterInk' | 'shape' | 'arrow' | 'stickyNote' | 'bookmark';

/** The tool the toolbar currently has selected — distinct from AnnotationType, since e.g. 'pen'/
 * 'pencil'/'fountain' are all the SAME stored type ('ink') with a different `penStyle`. The four
 * shape tools ('rectangle'/'ellipse'/'line'/'arrow') each map to exactly one drawn ShapeAnnotation/
 * ArrowAnnotation — see components/annotations/AnnotationLayer.tsx's own drag-to-draw handling. */
export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'rectangle' | 'ellipse' | 'line' | 'arrow';

export type PenStyle = 'pen' | 'pencil' | 'fountain';
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';

export function shapeKindForTool(tool: AnnotationTool): ShapeKind | null {
  return tool === 'rectangle' || tool === 'ellipse' || tool === 'line' ? tool : null;
}

/** A study-workflow tag — deliberately NOT a second scheduling/flashcard system: see this
 * project's own Phase 7 architecture notes for why these are plain metadata on the annotation,
 * surfaced later by the Annotation Index, rather than new revisionQueue/flashcard infrastructure. */
export type StudyTag = 'revision' | 'flashcard' | 'important' | 'doubt';

/** x/y are fractions (0-1) of the reading container's own bounding box at draw time — never raw
 * viewport pixels. `pressure` (0-1) is optional: present for a real stylus sample, absent (treated
 * as a fixed default at render time) for mouse/finger or an older/legacy record. */
export interface NormalizedPoint {
  x: number;
  y: number;
  pressure?: number;
}

interface AnnotationBase {
  id: string;
  /** `${entityType}:${entityId}` — the same compound key pages/RepositoryDetail.tsx already uses
   * to identify one repository entry (a Note or an ImportedContent item). Never suffixed with the
   * render mode — see this module's own header. */
  documentId: string;
  renderMode: RenderMode;
  /** Always DEFAULT_PAGE_NUMBER today — reserved for a future paginated renderer (see header). */
  pageNumber: number;
  createdAt: string;
  updatedAt: string;
  studyTags: StudyTag[];
}

// ---- Text-anchored annotations --------------------------------------------------------------

interface TextAnchoredBase extends AnnotationBase {
  anchor: TextAnchor;
}

export interface TextHighlightAnnotation extends TextAnchoredBase {
  type: 'textHighlight';
  color: string;
}

export interface UnderlineAnnotation extends TextAnchoredBase {
  type: 'underline';
  color: string;
}

export interface StrikethroughAnnotation extends TextAnchoredBase {
  type: 'strikethrough';
  color: string;
}

export interface TextNoteAnnotation extends TextAnchoredBase {
  type: 'textNote';
  color: string;
  text: string;
}

// ---- Geometry-anchored annotations -----------------------------------------------------------

interface GeometryAnnotationBase extends AnnotationBase {
  color: string;
  thickness: number;
  /** 0-1. Highlighter ink defaults much lower than pen ink (a translucent marker, not solid ink). */
  opacity: number;
  points: NormalizedPoint[];
}

export interface InkAnnotation extends GeometryAnnotationBase {
  type: 'ink';
  penStyle: PenStyle;
}

export interface HighlighterInkAnnotation extends GeometryAnnotationBase {
  type: 'highlighterInk';
}

/** `points` is exactly 2 entries: the shape's defining corners (rectangle/ellipse bounding box, or
 * a line's two endpoints). */
export interface ShapeAnnotation extends GeometryAnnotationBase {
  type: 'shape';
  shapeKind: ShapeKind;
}

/** `points` is exactly 2 entries: [start, end]. */
export interface ArrowAnnotation extends GeometryAnnotationBase {
  type: 'arrow';
}

// ---- Page-level annotations ------------------------------------------------------------------

export interface StickyNoteAnnotation extends AnnotationBase {
  type: 'stickyNote';
  color: string;
  /** 'text' = typed note (`text` holds the words); 'freehand' = a small handwritten doodle
   * (`inkPoints` holds its geometry, in the note's OWN small self-contained 0-1 coordinate space —
   * never page coordinates, since a freehand note is a fixed-size attachment, not page-anchored
   * ink). */
  noteKind: 'text' | 'freehand';
  text: string;
  inkPoints?: NormalizedPoint[];
}

export interface BookmarkAnnotation extends AnnotationBase {
  type: 'bookmark';
}

export type TextAnchoredAnnotation = TextHighlightAnnotation | UnderlineAnnotation | StrikethroughAnnotation | TextNoteAnnotation;
export type GeometryAnnotation = InkAnnotation | HighlighterInkAnnotation | ShapeAnnotation | ArrowAnnotation;

export type Annotation = TextAnchoredAnnotation | GeometryAnnotation | StickyNoteAnnotation | BookmarkAnnotation;

// ---- Constants ---------------------------------------------------------------------------------

export const DEFAULT_PAGE_NUMBER = 1;

// A small, fixed palette rather than a full colour picker — every swatch is a large touch target.
export const INK_COLORS: readonly string[] = ['#1e293b', '#dc2626', '#2563eb', '#16a34a', '#7c3aed'];
export const HIGHLIGHTER_COLORS: readonly string[] = ['#fde047', '#86efac', '#93c5fd', '#fca5a5', '#f5d0fe'];
export const TEXT_MARKUP_COLORS: readonly string[] = ['#facc15', '#f97316', '#ef4444', '#22c55e', '#3b82f6'];

export const DEFAULT_PEN_THICKNESS = 2.5;
export const DEFAULT_HIGHLIGHTER_THICKNESS = 14;
export const DEFAULT_SHAPE_THICKNESS = 2;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 24;

export const DEFAULT_INK_OPACITY = 1;
export const DEFAULT_HIGHLIGHTER_OPACITY = 0.35;
export const MIN_OPACITY = 0.05;
export const MAX_OPACITY = 1;

// A stroke's point list is capped defensively — a very long, slow drag still produces a compact,
// boundedly-sized record rather than growing without limit.
export const MAX_POINTS_PER_STROKE = 2000;

// A stroke shorter than this (too few points, effectively a tap) is discarded rather than saved as
// a near-invisible zero-length annotation.
export const MIN_POINTS_PER_STROKE = 2;

export const ALL_ANNOTATION_TYPES: readonly AnnotationType[] = [
  'textHighlight',
  'underline',
  'strikethrough',
  'textNote',
  'ink',
  'highlighterInk',
  'shape',
  'arrow',
  'stickyNote',
  'bookmark',
];

export const ALL_STUDY_TAGS: readonly StudyTag[] = ['revision', 'flashcard', 'important', 'doubt'];

// ---- Geometry helpers ---------------------------------------------------------------------------

export function clampThickness(value: number): number {
  return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, value));
}

export function clampOpacity(value: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/** Clamps a point's fractional coordinates into the valid 0-1 range (pressure, if present, into
 * 0-1 too) — a pointer that drifts slightly outside the content box never produces geometry that
 * would render outside the page's own bounds. */
export function clampPoint(point: NormalizedPoint): NormalizedPoint {
  const clamped: NormalizedPoint = { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) };
  if (point.pressure !== undefined) clamped.pressure = Math.min(1, Math.max(0, point.pressure));
  return clamped;
}

/** Converts a pointer event's viewport (clientX/clientY) coordinates into a document-relative
 * fractional point, given the content container's current bounding rect. This is the ONLY place
 * viewport pixels enter the annotation system — everything downstream of this is relative. */
export function relativePointFromClient(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  pressure?: number,
): NormalizedPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return clampPoint({ x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height, pressure });
}

/** A stroke is worth keeping only once it has real, drawn length — never a single-tap "stroke". */
export function isMeaningfulStroke(points: readonly NormalizedPoint[]): boolean {
  return points.length >= MIN_POINTS_PER_STROKE;
}

/** A shape/arrow's two corners are worth keeping only once they're a real, deliberately dragged
 * distance apart — never a bare tap that happened to register as a 1px drag. 0.01 is 1% of the
 * content box's own width/height, in the same normalized 0-1 space every geometry annotation uses. */
export function isMeaningfulShape(a: NormalizedPoint, b: NormalizedPoint): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy > 0.0001;
}

// ---- Creators -------------------------------------------------------------------------------
// Every creator stamps a fresh id + createdAt/updatedAt, clamps its own geometry/style values, and
// defaults studyTags to []. None of them read or write the source document.

interface CommonCreateInput {
  documentId: string;
  renderMode: RenderMode;
  pageNumber?: number;
  studyTags?: StudyTag[];
  now?: string;
}

function baseFields(input: CommonCreateInput): AnnotationBase {
  const now = input.now ?? new Date().toISOString();
  return {
    id: uuid(),
    documentId: input.documentId,
    renderMode: input.renderMode,
    pageNumber: input.pageNumber ?? DEFAULT_PAGE_NUMBER,
    createdAt: now,
    updatedAt: now,
    studyTags: input.studyTags ?? [],
  };
}

export function createTextHighlight(input: CommonCreateInput & { anchor: TextAnchor; color: string }): TextHighlightAnnotation {
  return { ...baseFields(input), type: 'textHighlight', anchor: input.anchor, color: input.color };
}

export function createUnderline(input: CommonCreateInput & { anchor: TextAnchor; color: string }): UnderlineAnnotation {
  return { ...baseFields(input), type: 'underline', anchor: input.anchor, color: input.color };
}

export function createStrikethrough(input: CommonCreateInput & { anchor: TextAnchor; color: string }): StrikethroughAnnotation {
  return { ...baseFields(input), type: 'strikethrough', anchor: input.anchor, color: input.color };
}

export function createTextNote(input: CommonCreateInput & { anchor: TextAnchor; color: string; text: string }): TextNoteAnnotation {
  return { ...baseFields(input), type: 'textNote', anchor: input.anchor, color: input.color, text: input.text };
}

export function createInkAnnotation(
  input: CommonCreateInput & { penStyle?: PenStyle; color: string; thickness: number; opacity?: number; points: NormalizedPoint[] },
): InkAnnotation {
  return {
    ...baseFields(input),
    type: 'ink',
    penStyle: input.penStyle ?? 'pen',
    color: input.color,
    thickness: clampThickness(input.thickness),
    opacity: clampOpacity(input.opacity ?? DEFAULT_INK_OPACITY),
    points: input.points.slice(0, MAX_POINTS_PER_STROKE).map(clampPoint),
  };
}

export function createHighlighterInkAnnotation(input: CommonCreateInput & { color: string; thickness: number; opacity?: number; points: NormalizedPoint[] }): HighlighterInkAnnotation {
  return {
    ...baseFields(input),
    type: 'highlighterInk',
    color: input.color,
    thickness: clampThickness(input.thickness),
    opacity: clampOpacity(input.opacity ?? DEFAULT_HIGHLIGHTER_OPACITY),
    points: input.points.slice(0, MAX_POINTS_PER_STROKE).map(clampPoint),
  };
}

export function createShapeAnnotation(
  input: CommonCreateInput & { shapeKind: ShapeKind; color: string; thickness?: number; opacity?: number; points: [NormalizedPoint, NormalizedPoint] },
): ShapeAnnotation {
  return {
    ...baseFields(input),
    type: 'shape',
    shapeKind: input.shapeKind,
    color: input.color,
    thickness: clampThickness(input.thickness ?? DEFAULT_SHAPE_THICKNESS),
    opacity: clampOpacity(input.opacity ?? DEFAULT_INK_OPACITY),
    points: input.points.map(clampPoint),
  };
}

export function createArrowAnnotation(input: CommonCreateInput & { color: string; thickness?: number; opacity?: number; points: [NormalizedPoint, NormalizedPoint] }): ArrowAnnotation {
  return {
    ...baseFields(input),
    type: 'arrow',
    color: input.color,
    thickness: clampThickness(input.thickness ?? DEFAULT_SHAPE_THICKNESS),
    opacity: clampOpacity(input.opacity ?? DEFAULT_INK_OPACITY),
    points: input.points.map(clampPoint),
  };
}

export function createStickyNote(
  input: CommonCreateInput & { color: string; noteKind?: 'text' | 'freehand'; text?: string; inkPoints?: NormalizedPoint[] },
): StickyNoteAnnotation {
  const noteKind = input.noteKind ?? 'text';
  return {
    ...baseFields(input),
    type: 'stickyNote',
    color: input.color,
    noteKind,
    text: input.text ?? '',
    inkPoints: noteKind === 'freehand' ? (input.inkPoints ?? []).slice(0, MAX_POINTS_PER_STROKE).map(clampPoint) : undefined,
  };
}

export function createBookmark(input: CommonCreateInput): BookmarkAnnotation {
  return { ...baseFields(input), type: 'bookmark' };
}

// ---- Type guards ----------------------------------------------------------------------------

export function isTextAnchored(a: Annotation): a is TextAnchoredAnnotation {
  return a.type === 'textHighlight' || a.type === 'underline' || a.type === 'strikethrough' || a.type === 'textNote';
}

export function isGeometryAnnotation(a: Annotation): a is GeometryAnnotation {
  return a.type === 'ink' || a.type === 'highlighterInk' || a.type === 'shape' || a.type === 'arrow';
}

export function isInkLike(a: Annotation): a is InkAnnotation | HighlighterInkAnnotation {
  return a.type === 'ink' || a.type === 'highlighterInk';
}

// ---- Queries ----------------------------------------------------------------------------------
// Every query below reads only its OWN document's/mode's annotations — the one guarantee that
// keeps two documents' (or a document's two render modes') annotations from ever bleeding together.

export function annotationsFor(annotations: readonly Annotation[], documentId: string, renderMode: RenderMode): Annotation[] {
  return annotations.filter((a) => a.documentId === documentId && a.renderMode === renderMode);
}

/** Every annotation belonging to one document, BOTH render modes, insertion order preserved — used
 * by document-level (not mode-specific) concerns like the bookmark toggle and the Annotation Index. */
export function annotationsForDocument(annotations: readonly Annotation[], documentId: string): Annotation[] {
  return annotations.filter((a) => a.documentId === documentId);
}

export function inkAnnotationsFor(annotations: readonly Annotation[], documentId: string, renderMode: RenderMode): (InkAnnotation | HighlighterInkAnnotation)[] {
  return annotationsFor(annotations, documentId, renderMode).filter(isInkLike);
}

/** Every geometry-anchored annotation (ink, highlighter ink, shape, arrow) for this document +
 * render mode — the superset AnnotationLayer draws on its committed canvas and hit-tests the
 * eraser/lasso against, vs. `inkAnnotationsFor`'s ink-only subset (still used where only freehand
 * strokes are relevant, e.g. the pen-style preview). */
export function geometryAnnotationsFor(annotations: readonly Annotation[], documentId: string, renderMode: RenderMode): GeometryAnnotation[] {
  return annotationsFor(annotations, documentId, renderMode).filter(isGeometryAnnotation);
}

export function textAnchoredAnnotationsFor(annotations: readonly Annotation[], documentId: string, renderMode: RenderMode): TextAnchoredAnnotation[] {
  return annotationsFor(annotations, documentId, renderMode).filter(isTextAnchored);
}

export function stickyNotesForDocument(annotations: readonly Annotation[], documentId: string): StickyNoteAnnotation[] {
  return annotationsForDocument(annotations, documentId).filter((a): a is StickyNoteAnnotation => a.type === 'stickyNote');
}

export function bookmarkForDocument(annotations: readonly Annotation[], documentId: string): BookmarkAnnotation | undefined {
  return annotationsForDocument(annotations, documentId).find((a): a is BookmarkAnnotation => a.type === 'bookmark');
}

export function isDocumentBookmarked(annotations: readonly Annotation[], documentId: string): boolean {
  return bookmarkForDocument(annotations, documentId) !== undefined;
}

/** Squared distance from `point` to the nearest point of `geometry` — used for eraser/lasso hit-
 * testing. Works for any geometry-anchored annotation (ink, highlighter ink, shape, arrow — every
 * one of them is just a list of normalized points), not only ink. Squared (never sqrt'd) since only
 * relative comparison against a squared threshold is needed. */
function minSquaredDistanceToInk(point: NormalizedPoint, geometry: GeometryAnnotation): number {
  let min = Infinity;
  for (const p of geometry.points) {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const d = dx * dx + dy * dy;
    if (d < min) min = d;
  }
  return min;
}

/** The nearest geometry-anchored annotation (ink/highlighter/shape/arrow) within `radius` of
 * `point` (both in the same 0-1 fractional space), or undefined if nothing is close enough. Erasing
 * removes the whole annotation, never a partial segment — a deliberately simple model. */
export function findInkNear(strokes: readonly GeometryAnnotation[], point: NormalizedPoint, radius: number): GeometryAnnotation | undefined {
  const radiusSq = radius * radius;
  let closest: GeometryAnnotation | undefined;
  let closestDistSq = Infinity;
  for (const stroke of strokes) {
    const distSq = minSquaredDistanceToInk(point, stroke);
    if (distSq <= radiusSq && distSq < closestDistSq) {
      closest = stroke;
      closestDistSq = distSq;
    }
  }
  return closest;
}

// ---- Lasso select / move (Phase F) -----------------------------------------------------------
// Geometry-only, exactly like the eraser above — a lasso is drawn in the same normalized 0-1 space
// every annotation's own points already live in, so selecting "what's inside the lasso" is pure
// point-in-polygon math against those SAME stored points. No separate hit-testing DOM/geometry
// layer, and no per-point DOM node: the lasso's own drag path is drawn on the existing canvas the
// same way an in-progress stroke's preview already is.

/** Standard ray-casting point-in-polygon test, in the same normalized 0-1 space as every
 * annotation's own points. `polygon` is an open path (no need to repeat the first point at the
 * end) with at least 3 points. */
export function pointInPolygon(point: NormalizedPoint, polygon: readonly NormalizedPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Every geometry annotation with at least HALF its own points inside the drawn lasso polygon —
 * "roughly enclosed", not "every single point strictly inside" (a real freehand lasso drawn by
 * hand around a stroke rarely encloses every jitter of that stroke perfectly). Returns [] for a
 * degenerate lasso (fewer than 3 points — not a real enclosed region). */
export function findGeometryInLasso(annotations: readonly GeometryAnnotation[], lassoPolygon: readonly NormalizedPoint[]): GeometryAnnotation[] {
  if (lassoPolygon.length < 3) return [];
  return annotations.filter((a) => {
    if (a.points.length === 0) return false;
    const insideCount = a.points.filter((p) => pointInPolygon(p, lassoPolygon)).length;
    return insideCount / a.points.length >= 0.5;
  });
}

/** Translates every point of a geometry annotation by a fixed (dx, dy) offset, clamping each
 * resulting point back into the valid 0-1 range — used by the lasso tool's "move selection"
 * action. Pressure (if present) passes through untouched. */
export function translatePoints(points: readonly NormalizedPoint[], deltaX: number, deltaY: number): NormalizedPoint[] {
  return points.map((p) => clampPoint({ x: p.x + deltaX, y: p.y + deltaY, pressure: p.pressure }));
}
