import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { StickyNote, Trash2 } from 'lucide-react';
import type { Annotation, AnnotationTool, ArrowAnnotation, GeometryAnnotation, HighlighterInkAnnotation, InkAnnotation, NormalizedPoint, PenStyle, RenderMode, ShapeAnnotation, ShapeKind, StickyNoteAnnotation, TextAnchoredAnnotation, TextNoteAnnotation } from '../../lib/annotations';
import { relativePointFromClient, findInkNear, findGeometryInLasso, translatePoints, isInkLike, isGeometryAnnotation, isMeaningfulStroke, isMeaningfulShape, shapeKindForTool, MAX_POINTS_PER_STROKE } from '../../lib/annotations';
import { strokeOutline, styleForPenStyle, HIGHLIGHTER_STROKE_OPTIONS } from '../../lib/strokeRendering';
import { resolveTextAnchor, rangeFromOffsets } from '../../lib/textAnchor';
import { cx } from '../../lib/utils';

// Premium Study Reader — the freehand drawing/erasing surface. Wraps the EXISTING reading content
// (children) with a relatively-positioned box and overlays two stacked canvases: one for already-
// COMMITTED ink (redrawn only when the annotation list or box size actually changes — a real
// React-driven update, never per pointer move) and one purely for the ACTIVE, in-progress stroke
// (drawn imperatively, outside React state, batched via requestAnimationFrame — see
// handlePointerMove/scheduleActiveDraw). A completed stroke is committed to the store exactly
// once, on pointerup — never per point, never per animation frame.
//
// Ink QUALITY (Phase C): both canvases render via lib/strokeRendering.ts's strokeOutline, which
// calls perfect-freehand to turn the same normalized points (unchanged storage format) into a
// tapered, pressure-aware FILLED outline — never a constant-width line connected by straight
// segments. Point capture uses PointerEvent.getCoalescedEvents() where the browser supports it, so
// a stroke is built from every sample the hardware actually reported for that animation frame, not
// just the last one — still buffered in a ref and only ever rendered via rAF, never a React state
// update per sample.
//
// Touch/stylus distinction: PointerEvent.pointerType is the only signal used to tell a real
// stylus/mouse from a resting palm or a finger — this is the standard browser-exposed signal for a
// real digitizer pen (S Pen, Mi Pad 6's stylus) and is NOT a hardware-level palm-rejection
// guarantee; a browser/device that reports a palm touch as pointerType 'touch' (the common case)
// is naturally excluded from drawing by the check below, but this makes no stronger claim than
// that. A finger touch is never intercepted for drawing — see the pointerType==='touch' early
// return in handlePointerDown — so normal one-finger scrolling and two-finger pinch-zoom keep
// working over the annotation layer via this element's own `touch-action` (see the wrapper div
// below), even while a drawing tool is selected. `touch-action` is a static value, deliberately: a
// Phase 8F attempt to switch it to 'none' dynamically for the duration of an active gesture was
// reverted (Phase 8G) after determining it cannot work — the browser/WebView locks in the allowed-
// gesture determination for a pointer sequence at/before that sequence's first event dispatch (this
// is the whole point of touch-action: it lets the compositor decide without waiting on a JS round-
// trip), so a value changed from INSIDE that same gesture's own pointerdown handler — let alone via
// an async React state commit — cannot retroactively apply to it. Preventing an armed pen/mouse
// gesture from being stolen as a page pan instead relies entirely on preventDefault() below, called
// synchronously inside pointerdown/pointermove for that gesture — the correctly-timed mechanism for
// cancelling a not-yet-committed gesture. While a pen/mouse IS actively drawing, pointermove also
// calls preventDefault() (pointer capture is already held by then) so no incidental browser gesture
// can interrupt the stroke — this never applies to a finger touch, which is excluded from the
// drawing path entirely before this point.

const ERASER_RADIUS = 0.02; // fraction of the content box's diagonal-normalized space

/** Phase 8B — explicitly releases pointer capture at gesture end, instead of relying solely on the
 * browser's implicit release-on-pointerup/cancel. Some Android WebView builds have been known to
 * mishandle implicit release across gesture boundaries, leaving a pointer's capture "stuck"; this
 * costs nothing on a browser that already releases correctly (hasPointerCapture is false by then,
 * so releasePointerCapture is simply skipped) and never throws on one that doesn't support the
 * capture-query API at all. */
function releaseCaptureSafely(target: Element, pointerId: number) {
  try {
    const el = target as Element & { hasPointerCapture?: (id: number) => boolean; releasePointerCapture: (id: number) => void };
    if (typeof el.hasPointerCapture !== 'function' || el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {
    // Never let a release failure interrupt gesture cleanup — the ref-based state reset around this
    // call already fully resets the gesture regardless of whether the browser cooperates here.
  }
}

function isStickyNote(a: Annotation): a is StickyNoteAnnotation {
  return a.type === 'stickyNote';
}

// Exported (alongside drawLivePreviewStroke below) solely so a test can verify, directly and without
// depending on a real Canvas 2D backend (not available in this project's test environment), which of
// the two renderers actually calls perfect-freehand — see DocumentAnnotator.selection.test.tsx's own
// Phase 8J describe block. Neither export changes this module's own runtime behaviour.
//
// `precomputedOutline` (optional, Task 2 — stroke outline cache) lets a caller that already has this
// stroke's outline (see getCachedOutline below) skip recomputing it via strokeOutline/getStroke.
// Every existing call site/test that omits it is completely unaffected: it still computes the
// outline fresh, exactly as before, so "calls getStroke exactly once" still holds for those.
export function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  stroke: InkAnnotation | HighlighterInkAnnotation,
  size: { width: number; height: number },
  precomputedOutline?: [number, number][],
) {
  const outline =
    precomputedOutline ?? strokeOutline(stroke.points, size.width, size.height, stroke.thickness, stroke.type === 'ink' ? styleForPenStyle(stroke.penStyle) : HIGHLIGHTER_STROKE_OPTIONS);
  if (outline.length === 0) return;
  ctx.save();
  ctx.fillStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Task 2 — per-stroke outline cache, replacing the earlier DIAGNOSTIC_SKIP_INK_REDRAW workaround
 * (which simply stopped painting committed ink at all). Keyed by the stroke's own stable `id`; a
 * cached entry also records the canvas pixel size and the annotation's own `updatedAt` it was
 * computed for, so either a resize/zoom (which changes every stroke's pixel-space outline) or an
 * edited stroke (e.g. lasso-moved — same id, new points/updatedAt) is detected and recomputed on its
 * next use. Committing ONE new stroke costs exactly one getStroke() call, for that stroke; every
 * other already-cached stroke is reused as-is — this is the whole fix for the O(n)-per-commit cost
 * this session's own diagnosis measured (see AnnotationLayer's committed-canvas effect below, and
 * this session's forensic report on Notes vs. Annotation handwriting). */
interface CachedStrokeOutline {
  updatedAt: string;
  width: number;
  height: number;
  outline: [number, number][];
}

function getCachedOutline(cache: Map<string, CachedStrokeOutline>, stroke: InkAnnotation | HighlighterInkAnnotation, size: { width: number; height: number }): [number, number][] {
  const existing = cache.get(stroke.id);
  if (existing && existing.updatedAt === stroke.updatedAt && existing.width === size.width && existing.height === size.height) {
    return existing.outline;
  }
  const style = stroke.type === 'ink' ? styleForPenStyle(stroke.penStyle) : HIGHLIGHTER_STROKE_OPTIONS;
  const outline = strokeOutline(stroke.points, size.width, size.height, stroke.thickness, style);
  cache.set(stroke.id, { updatedAt: stroke.updatedAt, width: size.width, height: size.height, outline });
  return outline;
}

/** Phase 8J — the LIVE, in-progress preview's renderer for ink/highlighter strokes: a plain single
 * stroked path (ctx.lineTo per point), the same cheap technique NoteEditorDialog.tsx's MiniInkCanvas
 * already uses and which is proven fast on real Android/Chromium WebView hardware. Deliberately never
 * calls perfect-freehand (see strokeRendering.ts's own header) — no tangent/normal/outline
 * computation, no tapering — just a round-capped/joined line whose width is derived once from the
 * stroke's latest pressure sample. This is ONLY the preview: the committed canvas (see the
 * strokes-driven effect below) still always renders the finished stroke via
 * drawStrokePath/strokeOutline for full tapered quality, from the complete, undecimated point array
 * finishStroke() commits — nothing about final quality or pressure fidelity changes, only what's
 * drawn WHILE the hand is still moving.
 *
 * Phase 8K — `fromIndex` (default 0, so every existing call site/test that omits it still draws the
 * whole stroke exactly as before) lets a caller draw only the TAIL segment starting at that point
 * index, connected seamlessly to it, instead of the entire stroke from its first point — see
 * drawActivePreview's own use of this for why: the Document canvas spans the whole scrollable
 * document (often far taller than the visible viewport), so redrawing the complete accumulated
 * stroke from scratch every animation frame means redoing ever-more work as a stroke grows, on a
 * canvas that can be many times larger than MiniInkCanvas's small, bounded one. Earlier points never
 * change once captured, so their already-painted pixels never need to be touched again. */
export function drawLivePreviewStroke(ctx: CanvasRenderingContext2D, stroke: InkAnnotation | HighlighterInkAnnotation, size: { width: number; height: number }, fromIndex = 0) {
  const pts = stroke.points;
  if (pts.length < 2 || fromIndex >= pts.length - 1) return;
  const start = Math.max(0, fromIndex);
  const lastPressure = pts[pts.length - 1].pressure ?? 0.5;
  const widthFactor = 0.4 + 0.6 * Math.min(1, Math.max(0, lastPressure));
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity;
  ctx.lineWidth = Math.max(1, stroke.thickness * widthFactor);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const p0 = toPx(pts[start], size);
  ctx.moveTo(p0.x, p0.y);
  for (let i = start + 1; i < pts.length; i++) {
    const p = toPx(pts[i], size);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function toPx(p: NormalizedPoint, size: { width: number; height: number }): { x: number; y: number } {
  return { x: p.x * size.width, y: p.y * size.height };
}

/** Rectangle/ellipse/line — a plain stroked outline from the shape's own two defining normalized
 * points (see lib/annotations.ts's ShapeAnnotation doc comment), never perfect-freehand geometry:
 * a drawn shape is meant to look like a deliberate geometric mark, not a tapered handwritten one. */
function drawShapeOutline(ctx: CanvasRenderingContext2D, shape: ShapeAnnotation, size: { width: number; height: number }) {
  const [p0, p1] = shape.points.map((p) => toPx(p, size));
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.globalAlpha = shape.opacity;
  ctx.lineWidth = shape.thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (shape.shapeKind === 'rectangle') {
    ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
  } else if (shape.shapeKind === 'ellipse') {
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    const rx = Math.max(Math.abs(p1.x - p0.x) / 2, 0.01);
    const ry = Math.max(Math.abs(p1.y - p0.y) / 2, 0.01);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowPath(ctx: CanvasRenderingContext2D, arrow: ArrowAnnotation, size: { width: number; height: number }) {
  const [p0, p1] = arrow.points.map((p) => toPx(p, size));
  ctx.save();
  ctx.strokeStyle = arrow.color;
  ctx.fillStyle = arrow.color;
  ctx.globalAlpha = arrow.opacity;
  ctx.lineWidth = arrow.thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const headLength = Math.max(8, arrow.thickness * 3);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x - headLength * Math.cos(angle - Math.PI / 6), p1.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(p1.x - headLength * Math.cos(angle + Math.PI / 6), p1.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface AnnotationLayerProps {
  annotations: Annotation[]; // pre-filtered to this document/renderMode by the caller
  /** Text-anchored (highlight/underline/strikethrough/textNote) annotations for this document +
   * render mode — resolved and drawn as real DOM-rect overlays (see the effect below), never as
   * canvas geometry, since their position is defined by the SOURCE TEXT, not by drawn pixels. */
  textAnnotations: TextAnchoredAnnotation[];
  renderMode: RenderMode;
  activeTool: AnnotationTool | null;
  color: string;
  thickness: number;
  opacity: number;
  annotationsVisible: boolean;
  /** Only meaningful while activeTool === 'pen' — ignored for 'highlighter' (always the flat
   * marker style) and irrelevant for 'eraser'/'lasso'. */
  penStyle: PenStyle;
  onCommitStroke: (points: NormalizedPoint[]) => void;
  /** rectangle/ellipse/line drag-to-draw commit — `shapeKind` comes from whichever shape tool was
   * active (see lib/annotations.ts's shapeKindForTool). */
  onCommitShape: (shapeKind: ShapeKind, points: [NormalizedPoint, NormalizedPoint]) => void;
  onCommitArrow: (points: [NormalizedPoint, NormalizedPoint]) => void;
  onEraseStroke: (annotation: GeometryAnnotation) => void;
  /** Lasso "move selection" — committed ONCE per drag, on release, never per pointer sample. */
  onMoveSelection: (ids: string[], deltaX: number, deltaY: number) => void;
  onDeleteSelection: (annotations: GeometryAnnotation[]) => void;
  onOpenNote: (note: StickyNoteAnnotation) => void;
  onOpenTextNote: (note: TextNoteAnnotation) => void;
  /** Tapping a plain highlight/underline/strikethrough mark selects it (a small delete button
   * appears above it); tapping Delete calls this. A textNote has its OWN click target
   * (onOpenTextNote, above) since it opens for editing rather than deleting outright. */
  onDeleteTextMarkup: (id: string) => void;
  /** Exposes this layer's own content wrapper to the caller (DocumentAnnotator), which needs the
   * SAME node both to listen for text selections and to resolve/scroll-to text anchors against —
   * resolution must always run against the exact container an anchor's offsets were computed from. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** The Annotation Index's "jump to source" (Phase E) briefly outlines whichever annotation was
   * navigated to — text-anchored (matched against `textRects`) or geometry (matched against its own
   * normalized points' bounding box) — so the reader can find it even in a long, dense document. */
  pulseAnnotationId?: string | null;
  children: React.ReactNode;
}

interface TextRectGroup {
  id: string;
  type: TextAnchoredAnnotation['type'];
  color: string;
  rects: { left: number; top: number; width: number; height: number }[];
  note?: TextNoteAnnotation;
}

function geometryBoundingBoxPx(annotation: GeometryAnnotation, size: { width: number; height: number }): { left: number; top: number; width: number; height: number } {
  const xs = annotation.points.map((p) => p.x * size.width);
  const ys = annotation.points.map((p) => p.y * size.height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function isShapeOrArrow(a: Annotation): a is ShapeAnnotation | ArrowAnnotation {
  return a.type === 'shape' || a.type === 'arrow';
}

export function AnnotationLayer({
  annotations,
  textAnnotations,
  renderMode,
  activeTool,
  color,
  thickness,
  opacity,
  penStyle,
  annotationsVisible,
  onCommitStroke,
  onCommitShape,
  onCommitArrow,
  onEraseStroke,
  onMoveSelection,
  onDeleteSelection,
  onOpenNote,
  onOpenTextNote,
  onDeleteTextMarkup,
  containerRef,
  pulseAnnotationId,
  children,
}: AnnotationLayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  // Task 2 — per-stroke outline cache (see getCachedOutline above). A fresh Map per mount is exactly
  // right: DocumentAnnotator remounts this whole layer via a key change whenever documentId/
  // renderMode changes (see its own header), so a genuine "reset" already gets a clean cache for
  // free, with no manual clearing needed.
  const strokeOutlineCacheRef = useRef<Map<string, CachedStrokeOutline>>(new Map());
  const activePointsRef = useRef<NormalizedPoint[]>([]);
  // Phase 8K — how many of activePointsRef.current's points have already been PAINTED onto
  // activeCanvasRef (see drawActivePreview/clearActiveCanvas below) — lets the live preview append
  // only the newest segment each frame instead of clearing and redrawing the entire accumulated
  // stroke from scratch every time. Reset to 0 whenever the canvas is actually blank (a fresh
  // gesture, or a resize that wiped the backing store).
  const activePaintedCountRef = useRef(0);
  const drawingPointerIdRef = useRef<number | null>(null);
  // Phase 8B — true only while the CURRENT gesture (tracked by drawingPointerIdRef above) was
  // started by a stylus's physical eraser tip (see handlePointerDown's own isStylusEraserTip
  // check), regardless of whichever tool is armed on the toolbar. Lets move/up/cancel treat that
  // one gesture as an erase without touching `activeTool` — flipping the pen back re-arms whatever
  // was already selected, exactly like every other note-taking app's "flip to erase" behaviour.
  const eraserOverrideRef = useRef(false);
  const erasedThisDragRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);
  // Lasso select/move (Phase F) — the in-progress lasso path and an active move-drag's live delta
  // are refs, not state: like every other active-gesture value in this component, they're read by
  // the imperative rAF-driven preview draw, never by React render directly, so updating them per
  // pointer sample never triggers a re-render. `selectedIds` IS real state (it's read by JSX to
  // render the selection outline/delete button), but it only ever changes once per completed
  // gesture (lasso release, or Delete tapped) — never per pointer sample.
  const lassoPointsRef = useRef<NormalizedPoint[]>([]);
  const moveStartRef = useRef<NormalizedPoint | null>(null);
  const moveDeltaRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [textRects, setTextRects] = useState<TextRectGroup[]>([]);
  // Tap-to-select a plain highlight/underline/strikethrough mark, showing a small delete button —
  // the ONLY way to remove one of these once made (a textNote instead opens for editing via
  // onOpenTextNote; geometry annotations have the eraser and the lasso's own delete button).
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);

  const shapeKind = shapeKindForTool(activeTool ?? 'pen');
  const isArrowTool = activeTool === 'arrow';
  const isShapeDragTool = shapeKind !== null || isArrowTool;

  const strokes = annotations.filter(isInkLike);
  const notes = annotations.filter(isStickyNote);
  const geometryAnnotations = annotations.filter(isGeometryAnnotation);
  const shapesAndArrows = annotations.filter(isShapeOrArrow);
  const selectedAnnotations = geometryAnnotations.filter((a) => selectedIds.has(a.id));

  // Clears the lasso selection the moment a different tool is chosen (or annotations are hidden) —
  // a selection only ever makes sense while the lasso tool itself is still active.
  useEffect(() => {
    if (activeTool !== 'lasso') setSelectedIds(new Set());
  }, [activeTool]);

  // Clears a selected text markup the moment a drawing tool is picked or annotations are hidden —
  // tap-to-select is a reading-mode-only interaction (see the `clickable` check in the render below).
  useEffect(() => {
    if (activeTool || !annotationsVisible) setSelectedMarkupId(null);
  }, [activeTool, annotationsVisible]);

  // Keeps canvas pixel size in sync with the wrapper's actual rendered size — covers zoom (a CSS
  // scale of an ancestor changes this element's own rendered box), content reflow, and orientation
  // changes, all without any scroll-position bookkeeping of our own (see relativePointFromClient's
  // own header: getBoundingClientRect already accounts for scroll position at read time).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Resolves each text-anchored annotation against this container's CURRENT text (see
  // lib/textAnchor.ts's own resolution-hierarchy doc) and converts the resolved DOM Range into
  // container-relative rects (never persisted — recomputed fresh every time this runs, exactly
  // like the ContextualSelectionToolbar's own transient positioning). Runs only on a real
  // annotation-set or layout change, never on scroll: position:absolute rects inside this
  // position:relative wrapper stay correctly placed as the wrapper itself scrolls, the same way
  // the drawing canvases already do.
  useEffect(() => {
    const container = wrapperRef.current;
    if (!container || size.width === 0 || size.height === 0) {
      setTextRects([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const fullText = container.textContent ?? '';
    const next: TextRectGroup[] = [];
    for (const a of textAnnotations) {
      const resolution = resolveTextAnchor(fullText, a.anchor);
      if (resolution.status === 'unresolved') continue;
      const range = rangeFromOffsets(container, resolution.start, resolution.end);
      if (!range) continue;
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length === 0) continue;
      next.push({
        id: a.id,
        type: a.type,
        color: a.color,
        rects: clientRects.map((r) => ({ left: r.left - containerRect.left, top: r.top - containerRect.top, width: r.width, height: r.height })),
        note: a.type === 'textNote' ? a : undefined,
      });
    }
    setTextRects(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textAnnotations.map((a) => `${a.id}:${a.anchor.start}:${a.anchor.end}:${a.updatedAt}`).join(','), size.width, size.height]);

  // Phase 8F fix — this used to unconditionally reassign canvas.width/height (and re-run
  // setTransform) on every call, including once per animation frame while a stroke is actively
  // being drawn (drawActivePreview calls this every frame — see scheduleActiveDraw). Reassigning a
  // canvas's width/height ALWAYS clears its entire backing store and resets 2D context state, per
  // the HTML Canvas spec, even when set to the exact same value — real, avoidable per-frame cost
  // that was being paid on every frame of every stroke regardless of whether the size had actually
  // changed (it almost never does mid-stroke; only a live container resize changes it). Skipping the
  // resize when the CSS pixel size hasn't changed removes that cost without affecting correctness:
  // clearRect (called right after this, by the caller) still operates in the same CSS-pixel space
  // the already-applied transform maps correctly.
  // Returns true only when it actually reassigned canvas.width/height (which always clears the
  // entire backing store per the Canvas spec) — Phase 8K's incremental live-preview draw (below)
  // uses this to know when it must fall back to a one-time full repaint instead of assuming
  // everything painted so far is still there.
  function sizeCanvas(canvas: HTMLCanvasElement): boolean {
    const cssWidth = `${size.width}px`;
    const cssHeight = `${size.height}px`;
    if (canvas.style.width === cssWidth && canvas.style.height === cssHeight) return false;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    canvas.style.width = cssWidth;
    canvas.style.height = cssHeight;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  // Redraws every COMMITTED stroke — triggered only by a real prop change (a new/erased stroke, a
  // resize/zoom), never by an in-progress pointer move.
  //
  // Task 2 — this effect fires once per finished stroke (JS-drawn OR native-committed, since both
  // flow into the same `strokes` prop). It used to re-run perfect-freehand (drawStrokePath ->
  // strokeOutline -> getStroke) for EVERY existing ink/highlighter stroke on every firing, an
  // O(n)-in-stroke-count cost this project's own history measured as too expensive for hot-path use
  // on real Android hardware (see the now-removed DIAGNOSTIC_SKIP_INK_REDRAW workaround). Now each
  // stroke's outline is fetched via getCachedOutline: an unchanged stroke reuses its cached outline
  // (no getStroke call at all), and only a genuinely new/edited stroke or an actual resize triggers
  // one fresh computation, for that stroke alone. Stale entries for strokes that no longer exist
  // (erased, or cleared) are pruned first so the cache never grows unbounded.
  useEffect(() => {
    const canvas = committedCanvasRef.current;
    if (!canvas || size.width === 0) return;
    sizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    if (!annotationsVisible) return;

    const cache = strokeOutlineCacheRef.current;
    const liveStrokeIds = new Set(strokes.map((s) => s.id));
    for (const cachedId of cache.keys()) {
      if (!liveStrokeIds.has(cachedId)) cache.delete(cachedId);
    }
    for (const stroke of strokes) {
      const outline = getCachedOutline(cache, stroke, size);
      drawStrokePath(ctx, stroke, size, outline);
    }

    for (const s of shapesAndArrows) {
      if (s.type === 'shape') drawShapeOutline(ctx, s, size);
      else drawArrowPath(ctx, s, size);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes.map((s) => s.id).join(','), shapesAndArrows.map((s) => s.id).join(','), size.width, size.height, annotationsVisible]);

  function clearActiveCanvas() {
    const canvas = activeCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, size.width, size.height);
    activePaintedCountRef.current = 0;
  }

  function drawActivePreview() {
    const canvas = activeCanvasRef.current;
    if (!canvas) return;
    const resized = sizeCanvas(canvas);
    if (resized) activePaintedCountRef.current = 0; // the resize above already wiped the backing store
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (activeTool === 'eraser') {
      ctx.clearRect(0, 0, size.width, size.height);
      return;
    }
    if (activeTool === 'lasso') {
      ctx.clearRect(0, 0, size.width, size.height);
      if (moveStartRef.current && moveDeltaRef.current) {
        const { x: dx, y: dy } = moveDeltaRef.current;
        for (const a of selectedAnnotations) {
          const moved = translatePoints(a.points, dx, dy);
          if (a.type === 'ink' || a.type === 'highlighterInk') drawStrokePath(ctx, { ...a, points: moved }, size);
          else if (a.type === 'shape') drawShapeOutline(ctx, { ...a, points: moved as [NormalizedPoint, NormalizedPoint] }, size);
          else drawArrowPath(ctx, { ...a, points: moved as [NormalizedPoint, NormalizedPoint] }, size);
        }
      } else if (lassoPointsRef.current.length > 1) {
        const pts = lassoPointsRef.current.map((p) => toPx(p, size));
        ctx.save();
        ctx.strokeStyle = '#475569';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    if (isShapeDragTool) {
      ctx.clearRect(0, 0, size.width, size.height);
      const [p0, p1] = activePointsRef.current;
      if (!p0 || !p1) return;
      if (isArrowTool) {
        drawArrowPath(ctx, { id: 'preview', documentId: '', renderMode, pageNumber: 1, studyTags: [], type: 'arrow', color, thickness, opacity, points: [p0, p1], createdAt: '', updatedAt: '' }, size);
      } else if (shapeKind) {
        drawShapeOutline(ctx, { id: 'preview', documentId: '', renderMode, pageNumber: 1, studyTags: [], type: 'shape', shapeKind, color, thickness, opacity, points: [p0, p1], createdAt: '', updatedAt: '' }, size);
      }
      return;
    }
    // Phase 8J — the live, in-progress preview uses the FULL, undecimated activePointsRef.current
    // (no point cap, no downsampling) and the cheap drawLivePreviewStroke renderer, never
    // perfect-freehand's getStroke() — see strokeRendering.ts's own header and drawLivePreviewStroke's
    // doc comment for why. finishStroke/onCommitStroke below always commits this same full array;
    // only the committed canvas's redraw (the strokes-driven effect above) ever calls the expensive
    // full-quality drawStrokePath/strokeOutline path, exactly once per finished stroke.
    //
    // Phase 8K — unlike every other branch above, this one does NOT clearRect the canvas each frame:
    // it paints only the segment(s) added since the last frame (drawLivePreviewStroke's own
    // fromIndex), appended onto whatever is already there. A full clear+redraw here would touch the
    // Document canvas's ENTIRE backing store every animation frame — which, unlike MiniInkCanvas's
    // small bounded canvas, spans the whole scrollable document and can be many times the visible
    // viewport's area (see DocumentAnnotator.tsx's scrollBoxClassName vs. its children) — real,
    // avoidable per-frame cost confirmed on physical Android hardware even after Phase 8J removed
    // perfect-freehand from this same hot path. Earlier segments never need to be touched again once
    // painted, since captured points never change; clearActiveCanvas (called once per finished
    // gesture, not per frame) is what actually erases the preview once the committed canvas takes
    // over.
    const previewStroke: InkAnnotation | HighlighterInkAnnotation =
      activeTool === 'highlighter'
        ? { id: 'preview', documentId: '', renderMode, pageNumber: 1, studyTags: [], type: 'highlighterInk', color, thickness, opacity, points: activePointsRef.current as NormalizedPoint[], createdAt: '', updatedAt: '' }
        : { id: 'preview', documentId: '', renderMode, pageNumber: 1, studyTags: [], type: 'ink', penStyle, color, thickness, opacity, points: activePointsRef.current as NormalizedPoint[], createdAt: '', updatedAt: '' };
    drawLivePreviewStroke(ctx, previewStroke, size, activePaintedCountRef.current);
    if (previewStroke.points.length >= 2) activePaintedCountRef.current = previewStroke.points.length - 1;
  }

  function scheduleActiveDraw() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawActivePreview();
    });
  }

  /** Generic over any {clientX, clientY, pressure}-shaped source — a React pointer event, or one
   * of a native PointerEvent's own getCoalescedEvents() entries (see handlePointerMove).
   *
   * Phase 8E fix — this used to discard a real pressure of exactly 0 (`e.pressure > 0 ? e.pressure
   * : undefined`), treating it as "no pressure data" rather than a genuine sample. A pressure of 0
   * is the NORMAL, expected value for the trailing samples right before a stylus lifts off — it is
   * real data, not a signal to erase or discard anything (only the Eraser tool/eraser-tip ever
   * removes a stroke — see handleErase). Passing it straight through leaves mouse input unaffected
   * (a mouse always reports a constant pressure of 0.5, which already passed the old `>0` check). */
  function toRelativePoint(e: { clientX: number; clientY: number; pressure: number }): NormalizedPoint {
    const rect = wrapperRef.current!.getBoundingClientRect();
    return relativePointFromClient(e.clientX, e.clientY, rect, e.pressure);
  }

  function handleErase(e: ReactPointerEvent) {
    const p = toRelativePoint(e);
    const hit = findInkNear(geometryAnnotations, p, ERASER_RADIUS);
    if (hit && !erasedThisDragRef.current.has(hit.id)) {
      erasedThisDragRef.current.add(hit.id);
      onEraseStroke(hit);
    }
  }

  /** Whether `p` falls within (a small margin around) any CURRENTLY selected annotation's own
   * bounding box — used only to decide whether a fresh lasso-tool pointerdown starts a MOVE drag
   * on the existing selection vs. starts drawing a brand-new lasso. Pure geometry against the
   * annotations' own normalized points, same as every other hit-test in this module. */
  function isPointNearSelection(p: NormalizedPoint): boolean {
    const margin = 0.02;
    for (const a of selectedAnnotations) {
      const xs = a.points.map((pt) => pt.x);
      const ys = a.points.map((pt) => pt.y);
      if (p.x >= Math.min(...xs) - margin && p.x <= Math.max(...xs) + margin && p.y >= Math.min(...ys) - margin && p.y <= Math.max(...ys) + margin) return true;
    }
    return false;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!annotationsVisible) return;
    if (e.pointerType === 'touch') return; // finger never draws/selects — see this module's own header
    // A physical stylus eraser tip — W3C Pointer Events' standard `button === 5` (Chromium/Android
    // WebView implements this the same as desktop Chrome; not a Samsung-specific API) — always
    // erases, regardless of whichever tool is currently armed, bypassing the "no tool armed" guard
    // below: it's an explicit, unambiguous physical gesture, not something that needs a toolbar
    // selection first. A stylus/browser that never reports button 5 never takes this branch, so
    // every existing tool's behaviour is completely unaffected.
    const isStylusEraserTip = e.pointerType === 'pen' && e.button === 5;
    if (!activeTool && !isStylusEraserTip) return;
    // A gesture (stroke/lasso/erase/shape-drag) is already in progress for a different pointer —
    // ignore a second pointerdown rather than reassigning drawingPointerIdRef to it, which would
    // silently discard the first gesture's in-progress points and orphan its eventual pointerup
    // (that event's id would no longer match, so it would never reach finishStroke/finishLasso).
    if (drawingPointerIdRef.current !== null) return;
    const p = toRelativePoint(e);

    if (isStylusEraserTip) {
      drawingPointerIdRef.current = e.pointerId;
      eraserOverrideRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      erasedThisDragRef.current = new Set();
      handleErase(e);
      return;
    }

    if (activeTool === 'lasso') {
      drawingPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      if (selectedIds.size > 0 && isPointNearSelection(p)) {
        moveStartRef.current = p;
        moveDeltaRef.current = { x: 0, y: 0 };
      } else {
        setSelectedIds(new Set());
        lassoPointsRef.current = [p];
      }
      scheduleActiveDraw();
      return;
    }

    drawingPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (activeTool === 'eraser') {
      erasedThisDragRef.current = new Set();
      handleErase(e);
      return;
    }
    // Shape/arrow tools only ever track a 2-point [start, end] drag — never accumulate a full
    // stroke's worth of samples the way ink/highlighter does.
    activePointsRef.current = isShapeDragTool ? [p, p] : [p];
    scheduleActiveDraw();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (drawingPointerIdRef.current !== e.pointerId) return;
    // Pointer capture is already held (set on pointerdown) — this only ever suppresses an
    // incidental browser gesture for the ACTIVE drawing pointer, never a finger (which never
    // reaches this branch: handlePointerDown returns early for pointerType 'touch').
    e.preventDefault();
    if (activeTool === 'eraser' || eraserOverrideRef.current) {
      handleErase(e);
      return;
    }
    if (activeTool === 'lasso') {
      const p = toRelativePoint(e);
      if (moveStartRef.current) {
        moveDeltaRef.current = { x: p.x - moveStartRef.current.x, y: p.y - moveStartRef.current.y };
      } else {
        lassoPointsRef.current.push(p);
      }
      scheduleActiveDraw();
      return;
    }
    if (isShapeDragTool) {
      const start = activePointsRef.current[0];
      activePointsRef.current = [start, toRelativePoint(e)];
      scheduleActiveDraw();
      return;
    }
    const points = activePointsRef.current;
    // High-frequency sampling: getCoalescedEvents() returns every sample the hardware actually
    // reported since the last event (a real stylus can report far more samples than one per
    // animation frame) — feature-detected, since not every browser implements it (graceful
    // fallback to the single event otherwise). Each sample is still just pushed onto the same ref
    // buffer; nothing here triggers a React state update or an extra render.
    const nativeEvent = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const samples = typeof nativeEvent.getCoalescedEvents === 'function' ? nativeEvent.getCoalescedEvents() : [nativeEvent];
    const toAppend = samples.length > 0 ? samples : [nativeEvent];
    // Phase 8K — the wrapper's bounding rect is read ONCE for this whole batch, not once per sample
    // (toRelativePoint's own getBoundingClientRect() call, repeated for every one of a
    // high-frequency stylus's coalesced samples within a single native event dispatch, was real,
    // avoidable per-sample DOM-read cost) — the rect cannot change between samples captured within
    // the same dispatch.
    const rect = wrapperRef.current!.getBoundingClientRect();
    for (const sample of toAppend) {
      if (points.length >= MAX_POINTS_PER_STROKE) break;
      points.push(relativePointFromClient(sample.clientX, sample.clientY, rect, sample.pressure));
    }
    scheduleActiveDraw();
  }

  function finishStroke() {
    const points = activePointsRef.current;
    activePointsRef.current = [];
    clearActiveCanvas();
    if (isShapeDragTool) {
      const [p0, p1] = points;
      if (p0 && p1 && isMeaningfulShape(p0, p1)) {
        if (isArrowTool) onCommitArrow([p0, p1]);
        else if (shapeKind) onCommitShape(shapeKind, [p0, p1]);
      }
      return;
    }
    if (isMeaningfulStroke(points)) onCommitStroke(points);
  }

  function finishLasso() {
    clearActiveCanvas();
    if (moveStartRef.current && moveDeltaRef.current) {
      const { x: dx, y: dy } = moveDeltaRef.current;
      if (isMeaningfulShape({ x: 0, y: 0 }, { x: dx, y: dy })) onMoveSelection(Array.from(selectedIds), dx, dy);
      moveStartRef.current = null;
      moveDeltaRef.current = null;
      return;
    }
    const polygon = lassoPointsRef.current;
    lassoPointsRef.current = [];
    const selected = findGeometryInLasso(geometryAnnotations, polygon);
    setSelectedIds(new Set(selected.map((a) => a.id)));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (drawingPointerIdRef.current !== e.pointerId) return;
    drawingPointerIdRef.current = null;
    releaseCaptureSafely(e.currentTarget, e.pointerId);
    if (activeTool === 'eraser' || eraserOverrideRef.current) {
      eraserOverrideRef.current = false;
      erasedThisDragRef.current = new Set();
      return;
    }
    if (activeTool === 'lasso') {
      finishLasso();
      return;
    }
    finishStroke();
  }

  // Phase 8E fix — this used to unconditionally discard the entire active gesture on cancel
  // (activePointsRef wiped, canvas cleared, nothing committed). On Android, pointercancel fires far
  // more readily than on desktop: the OS/WebView's own gesture arbitration (edge-swipe-back and
  // other system gestures) can claim an in-progress pointer sequence mid-stroke even though the
  // user's physical S Pen contact never actually broke. The live preview canvas had already
  // rendered the stroke by then, so silently throwing it away on cancel is exactly what "the
  // handwriting disappeared after lifting the pen" looks like from the user's side — real user data
  // loss, not a deliberate erase. A note-taking app should salvage what was drawn so far rather than
  // discard it: for ink/highlighter/shape/arrow, cancel now commits through the SAME path pointerup
  // already uses (finishStroke — still gated by isMeaningfulStroke/isMeaningfulShape, so a
  // degenerate/near-empty gesture still commits nothing). Lasso and eraser are unaffected: a
  // cancelled lasso never had drawn content to lose (just abandon the in-progress selection), and
  // an eraser's removals already happened live, per point, during pointermove — there is nothing
  // pending to commit or lose on cancel for either.
  function handlePointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    if (drawingPointerIdRef.current !== e.pointerId) return;
    drawingPointerIdRef.current = null;
    releaseCaptureSafely(e.currentTarget, e.pointerId);
    const wasEraserGesture = activeTool === 'eraser' || eraserOverrideRef.current;
    eraserOverrideRef.current = false;
    if (activeTool === 'lasso') {
      lassoPointsRef.current = [];
      moveStartRef.current = null;
      moveDeltaRef.current = null;
      clearActiveCanvas();
      return;
    }
    if (wasEraserGesture) {
      erasedThisDragRef.current = new Set();
      clearActiveCanvas();
      return;
    }
    finishStroke();
  }

  function handleDeleteSelection() {
    onDeleteSelection(selectedAnnotations);
    setSelectedIds(new Set());
  }

  const interactive = !!activeTool && annotationsVisible;

  // Phase 6-7A fix — the pointer handlers below used to live on the ACTIVE canvas element itself,
  // with that canvas set to `pointer-events: auto` whenever a drawing tool was armed. That made the
  // canvas the hit-test target for EVERY pointer type while a tool was armed, including touch —
  // so a finger long-press over the underlying text could never reach the text to start a native
  // selection, even though handlePointerDown already bails out for pointerType 'touch' and never
  // draws with it. The fix: the wrapper (which contains both the canvas and the real text) owns the
  // pointer listeners instead, and the canvas itself is always `pointer-events: none` (a pure
  // render target, never a hit-test target). Touch now reaches the real text underneath regardless
  // of activeTool, restoring native long-press text selection on tablets even with a tool armed.
  // Pen/mouse behaviour is unchanged: handlePointerDown still calls preventDefault() for those
  // pointer types when a tool is armed, which suppresses the browser's own selection-start gesture
  // for that drag exactly as the canvas's hit-test capture used to — drawing, lasso, eraser and
  // shapes all keep working identically, just event-sourced from the wrapper instead of the canvas.
  // toRelativePoint already reads wrapperRef's own bounding rect (not the canvas's), so this move
  // changes nothing about stroke coordinates.
  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        if (containerRef) containerRef.current = el;
      }}
      className="relative"
      style={{ touchAction: 'pan-y pinch-zoom', cursor: interactive ? 'crosshair' : 'auto' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
      {annotationsVisible && textRects.length > 0 && (
        // pointer-events-none on the container, same as the sticky-notes overlay below — this div's
        // own box covers the FULL content area (`inset-0`) and sits above the real text in paint
        // order, so without this it would intercept hit-testing (including the mousedown-drag a
        // browser needs to start a selection) across the whole document the instant this container
        // renders, not just near its own child marks. Each mark button already opts back into
        // `pointer-events-auto` individually below — this only stops the CONTAINER itself from being
        // a full-page invisible click/selection blocker.
        <div className="pointer-events-none absolute inset-0">
          {textRects.map((tr) =>
            tr.rects.map((r, i) => {
              const key = `${tr.id}-${i}`;
              // Selectable (tap-to-select, then Delete) only in reading mode — with a drawing
              // tool active, the active canvas already sits above this overlay to own pointer
              // input, so these become inert `pointer-events-none` marks instead, consistent with
              // the ContextualSelectionToolbar's own "only while activeTool === null" rule.
              const clickable = !activeTool;
              if (tr.type === 'textHighlight' || tr.type === 'underline' || tr.type === 'strikethrough') {
                const isSelected = tr.id === selectedMarkupId;
                const baseStyle: React.CSSProperties =
                  tr.type === 'textHighlight'
                    ? { left: r.left, top: r.top, width: r.width, height: r.height, backgroundColor: tr.color, opacity: 0.35 }
                    : tr.type === 'underline'
                      ? { left: r.left, top: r.top + r.height - 2, width: r.width, height: 2, backgroundColor: tr.color }
                      : { left: r.left, top: r.top + r.height / 2 - 1, width: r.width, height: 2, backgroundColor: tr.color };
                return (
                  <button
                    key={key}
                    type="button"
                    tabIndex={clickable ? 0 : -1}
                    aria-label={`${tr.type} — tap to select`}
                    onClick={clickable ? () => setSelectedMarkupId((cur) => (cur === tr.id ? null : tr.id)) : undefined}
                    className={cx('absolute cursor-pointer border-0 bg-transparent p-0', clickable ? 'pointer-events-auto' : 'pointer-events-none', isSelected && clickable && 'ring-2 ring-brand-500')}
                    style={baseStyle}
                  />
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={clickable ? () => tr.note && onOpenTextNote(tr.note) : undefined}
                  title={tr.note?.text || 'Note'}
                  className={cx('absolute cursor-pointer border-b-2 border-dotted bg-transparent p-0', clickable ? 'pointer-events-auto' : 'pointer-events-none')}
                  style={{ left: r.left, top: r.top, width: r.width, height: r.height, borderColor: tr.color }}
                />
              );
            }),
          )}
          {selectedMarkupId &&
            (() => {
              const selected = textRects.find((tr) => tr.id === selectedMarkupId);
              if (!selected || selected.rects.length === 0) return null;
              const top = Math.min(...selected.rects.map((r) => r.top));
              const left = Math.min(...selected.rects.map((r) => r.left));
              return (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTextMarkup(selectedMarkupId);
                    setSelectedMarkupId(null);
                  }}
                  title="Remove"
                  aria-label="Remove this mark"
                  className="pointer-events-auto absolute inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 dark:border-red-700 dark:bg-red-950/60 dark:text-red-400"
                  style={{ left, top: Math.max(0, top - 36) }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              );
            })()}
        </div>
      )}
      {annotationsVisible && <canvas ref={committedCanvasRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />}
      {/* Pure render target now — pointer-events: none always. The wrapper div above owns pointer
          capture/hit-testing (see its own comment for why), so this canvas never blocks native text
          selection underneath it, for any pointer type. */}
      <canvas ref={activeCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      {annotationsVisible && notes.length > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onOpenNote(note)}
              title={note.noteKind === 'text' ? note.text || 'Note' : 'Handwritten note'}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 shadow-sm hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
            >
              <StickyNote className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
      {activeTool === 'lasso' && selectedAnnotations.length > 0 && size.width > 0 && (
        <>
          {selectedAnnotations.map((a) => {
            const box = geometryBoundingBoxPx(a, size);
            return (
              <span
                key={a.id}
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-brand-500"
                style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }}
              />
            );
          })}
          {(() => {
            const boxes = selectedAnnotations.map((a) => geometryBoundingBoxPx(a, size));
            const top = Math.min(...boxes.map((b) => b.top));
            const left = Math.min(...boxes.map((b) => b.left));
            return (
              <button
                type="button"
                onClick={handleDeleteSelection}
                title="Delete selection"
                aria-label="Delete selected annotations"
                className="pointer-events-auto absolute inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 dark:border-red-700 dark:bg-red-950/60 dark:text-red-400"
                style={{ left, top: Math.max(0, top - 44) }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            );
          })()}
        </>
      )}
      {pulseAnnotationId &&
        (() => {
          const textMatch = textRects.find((tr) => tr.id === pulseAnnotationId);
          if (textMatch) {
            return textMatch.rects.map((r, i) => (
              <span
                key={i}
                className="pointer-events-none absolute animate-pulse rounded-sm ring-2 ring-brand-500"
                style={{ left: r.left - 3, top: r.top - 3, width: r.width + 6, height: r.height + 6 }}
              />
            ));
          }
          const geometryMatch = geometryAnnotations.find((a) => a.id === pulseAnnotationId);
          if (geometryMatch && size.width > 0) {
            const box = geometryBoundingBoxPx(geometryMatch, size);
            return (
              <span
                className="pointer-events-none absolute animate-pulse rounded-md ring-2 ring-brand-500"
                style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }}
              />
            );
          }
          return null;
        })()}
    </div>
  );
}
