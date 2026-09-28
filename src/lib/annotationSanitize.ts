// Premium Study Reader — Annotation Sanitisation (Phase A). Validates and, where reasonably
// possible, repairs a raw persisted annotation record before it ever reaches the reader — a
// corrupted localStorage blob, a future format change, or a hand-edited backup must degrade to
// "that one annotation is skipped" rather than crash the whole reader. Every check here is
// defensive and additive: it never fabricates content (a repaired record always uses only data
// that was actually present, clamped/defaulted to a safe value — never invented text or geometry).
import {
  clampPoint,
  clampThickness,
  clampOpacity,
  MIN_POINTS_PER_STROKE,
  DEFAULT_INK_OPACITY,
  DEFAULT_HIGHLIGHTER_OPACITY,
  ALL_STUDY_TAGS,
  type Annotation,
  type NormalizedPoint,
  type RenderMode,
  type StudyTag,
  type PenStyle,
  type ShapeKind,
} from './annotations';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sanitizeRenderMode(value: unknown): RenderMode {
  return value === 'preview' ? 'preview' : 'raw'; // any other/missing value defaults to 'raw'
}

function sanitizeTimestamp(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : new Date().toISOString();
}

function sanitizeStudyTags(value: unknown): StudyTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is StudyTag => (ALL_STUDY_TAGS as readonly string[]).includes(t as string));
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Filters a raw points array down to well-formed, clamped NormalizedPoints — a point missing a
 * finite x/y is dropped individually rather than invalidating the whole list. */
function sanitizePoints(value: unknown): NormalizedPoint[] {
  if (!Array.isArray(value)) return [];
  const points: NormalizedPoint[] = [];
  for (const p of value) {
    if (!isPlainObject(p)) continue;
    if (typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.y !== 'number' || !Number.isFinite(p.y)) continue;
    points.push(clampPoint({ x: p.x, y: p.y, pressure: typeof p.pressure === 'number' && Number.isFinite(p.pressure) ? p.pressure : undefined }));
  }
  return points;
}

function isValidAnchorShape(anchor: unknown): anchor is { quote: string; prefix: string; suffix: string; start: number; end: number } {
  if (!isPlainObject(anchor)) return false;
  return (
    isNonEmptyString(anchor.quote) &&
    typeof anchor.prefix === 'string' &&
    typeof anchor.suffix === 'string' &&
    typeof anchor.start === 'number' &&
    typeof anchor.end === 'number' &&
    anchor.end > anchor.start
  );
}

/** Sanitises ONE raw record. Returns null when the record cannot be reasonably repaired (unknown
 * type, or missing the one piece of data that gives the annotation meaning at all — e.g. a
 * text-anchored annotation with no valid anchor, or an ink stroke with no usable geometry left
 * after filtering). Every other missing/invalid field is defaulted or clamped rather than
 * discarding the whole record. */
export function sanitizeAnnotation(raw: unknown): Annotation | null {
  if (!isPlainObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.documentId) || !isNonEmptyString(raw.type)) return null;

  const base = {
    id: raw.id,
    documentId: raw.documentId,
    renderMode: sanitizeRenderMode(raw.renderMode),
    pageNumber: typeof raw.pageNumber === 'number' && Number.isFinite(raw.pageNumber) ? raw.pageNumber : 1,
    createdAt: sanitizeTimestamp(raw.createdAt),
    updatedAt: sanitizeTimestamp(raw.updatedAt),
    studyTags: sanitizeStudyTags(raw.studyTags),
  };

  switch (raw.type) {
    case 'textHighlight':
    case 'underline':
    case 'strikethrough': {
      if (!isValidAnchorShape(raw.anchor)) return null; // nothing meaningful survives without an anchor
      return { ...base, type: raw.type, anchor: raw.anchor, color: sanitizeColor(raw.color, '#facc15') } as Annotation;
    }
    case 'textNote': {
      if (!isValidAnchorShape(raw.anchor)) return null;
      return { ...base, type: 'textNote', anchor: raw.anchor, color: sanitizeColor(raw.color, '#facc15'), text: typeof raw.text === 'string' ? raw.text : '' } as Annotation;
    }
    case 'ink': {
      const points = sanitizePoints(raw.points);
      if (points.length < MIN_POINTS_PER_STROKE) return null; // no usable geometry left
      const penStyle: PenStyle = raw.penStyle === 'pencil' || raw.penStyle === 'fountain' ? raw.penStyle : 'pen';
      return {
        ...base,
        type: 'ink',
        penStyle,
        color: sanitizeColor(raw.color, '#1e293b'),
        thickness: clampThickness(typeof raw.thickness === 'number' ? raw.thickness : 2.5),
        opacity: clampOpacity(typeof raw.opacity === 'number' ? raw.opacity : DEFAULT_INK_OPACITY),
        points,
      } as Annotation;
    }
    case 'highlighterInk': {
      const points = sanitizePoints(raw.points);
      if (points.length < MIN_POINTS_PER_STROKE) return null;
      return {
        ...base,
        type: 'highlighterInk',
        color: sanitizeColor(raw.color, '#fde047'),
        thickness: clampThickness(typeof raw.thickness === 'number' ? raw.thickness : 14),
        opacity: clampOpacity(typeof raw.opacity === 'number' ? raw.opacity : DEFAULT_HIGHLIGHTER_OPACITY),
        points,
      } as Annotation;
    }
    case 'shape':
    case 'arrow': {
      const points = sanitizePoints(raw.points).slice(0, 2);
      if (points.length < 2) return null; // a shape/arrow with fewer than 2 points has no geometry
      const common = { ...base, color: sanitizeColor(raw.color, '#1e293b'), thickness: clampThickness(typeof raw.thickness === 'number' ? raw.thickness : 2), opacity: clampOpacity(typeof raw.opacity === 'number' ? raw.opacity : 1), points: points as [NormalizedPoint, NormalizedPoint] };
      if (raw.type === 'arrow') return { ...common, type: 'arrow' } as Annotation;
      const shapeKind: ShapeKind = raw.shapeKind === 'ellipse' || raw.shapeKind === 'line' ? raw.shapeKind : 'rectangle';
      return { ...common, type: 'shape', shapeKind } as Annotation;
    }
    case 'stickyNote': {
      const noteKind = raw.noteKind === 'freehand' ? 'freehand' : 'text';
      return {
        ...base,
        type: 'stickyNote',
        color: sanitizeColor(raw.color, '#fde047'),
        noteKind,
        text: typeof raw.text === 'string' ? raw.text : '',
        inkPoints: noteKind === 'freehand' ? sanitizePoints(raw.inkPoints) : undefined,
      } as Annotation;
    }
    case 'bookmark':
      return { ...base, type: 'bookmark' } as Annotation;
    default:
      return null; // unrecognised type — cannot be repaired
  }
}

/** Sanitises a whole persisted array. Never throws: a non-array input becomes []; each element is
 * sanitised independently, so one corrupt record never takes down the rest. */
export function sanitizeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const result: Annotation[] = [];
  for (const item of raw) {
    const sanitized = sanitizeAnnotation(item);
    if (sanitized) result.push(sanitized);
  }
  return result;
}
