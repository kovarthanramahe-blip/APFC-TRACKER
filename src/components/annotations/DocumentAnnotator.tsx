import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { cx } from '../../lib/utils';
import {
  annotationsForDocument,
  geometryAnnotationsFor,
  textAnchoredAnnotationsFor,
  stickyNotesForDocument,
  bookmarkForDocument,
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
  isTextAnchored,
  isGeometryAnnotation,
  isMeaningfulStroke,
  isNativeInkCapableTool,
  translatePoints,
  DEFAULT_PEN_THICKNESS,
  DEFAULT_HIGHLIGHTER_THICKNESS,
  DEFAULT_SHAPE_THICKNESS,
  DEFAULT_INK_OPACITY,
  DEFAULT_HIGHLIGHTER_OPACITY,
  PEN_STYLE_DEFAULTS,
  INK_COLORS,
  HIGHLIGHTER_COLORS,
  TEXT_MARKUP_COLORS,
  type AnnotationTool,
  type NormalizedPoint,
  type RenderMode,
  type ShapeKind,
  type GeometryAnnotation,
  type StickyNoteAnnotation,
  type InkAnnotation,
  type HighlighterInkAnnotation,
  type PenStyle,
  type StudyTag,
  type TextNoteAnnotation,
} from '../../lib/annotations';
import { createTextAnchorFromRange, resolveTextAnchor, rangeFromOffsets, type TextAnchor } from '../../lib/textAnchor';
import { createHistoryState, pushHistoryEntry, popForUndo, popForRedo, canUndo as canUndoHistory, canRedo as canRedoHistory } from '../../lib/annotationHistory';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnnotationLayer } from './AnnotationLayer';
import { NoteEditorDialog } from './NoteEditorDialog';
import { ContextualSelectionToolbar } from './ContextualSelectionToolbar';
import NativeInk, { isNativeInkAvailable, toNativeBrushConfig } from '../../lib/nativeInk';

/** Session-local, not persisted — a lightweight "colours you've used recently" convenience for the
 * custom colour picker, capped so it never grows into a second colour-history feature. */
const MAX_RECENT_COLORS = 6;

const PULSE_DURATION_MS = 1400;

/** Imperative handle (Phase E) so the Annotation Index — which lives OUTSIDE any single
 * DocumentAnnotator, at the ContentView level that owns the Raw/Preview toggle — can ask the
 * currently-mounted instance to jump to one of its own annotations. Returns false when this
 * instance can't handle it (the annotation belongs to the document but the OTHER render mode is
 * currently mounted) so the caller knows to switch render mode first and retry. */
export interface DocumentAnnotatorHandle {
  navigateToAnnotation: (annotationId: string) => boolean;
}

const DEFAULT_TEXT_MARKUP_COLOR = TEXT_MARKUP_COLORS[0];

// Premium Study Reader — orchestrates the toolbar + freehand drawing layer + note dialog for ONE
// document/render-mode pair, wiring them to the store's generic `annotations` field (see
// lib/store.ts, lib/annotations.ts). This is the only place that calls the store's
// addAnnotation/updateAnnotationText/deleteAnnotation actions for this feature — every store write
// happens on a completed, meaningful action (stroke finished, note saved, bookmark toggled), never
// mid-gesture. Undo/redo history (lib/annotationHistory.ts) is local component state, reset
// whenever `documentId`/`renderMode` changes (via React's own key-based remount — see
// RepositoryDetail.tsx) — it is explicitly NOT persisted, per this feature's "only annotation
// history, never an app-wide undo system" scope.
//
// `documentId` is always the real, stable Repository entity key (never suffixed by render mode —
// see lib/annotations.ts's own header for why). Ink/highlighter strokes are scoped to THIS
// renderMode only (Raw and Preview lay out the same text too differently to share pixel geometry);
// a bookmark and sticky notes are document-level and shown/toggled identically in both modes.
//
// Phase C adds natural ink rendering (lib/strokeRendering.ts, perfect-freehand) and a pen-style
// selector (pen/pencil/fountain — see AnnotationToolbar) on top of the tool set Phase A+B already
// wired up (pen/highlighter/eraser, undo/redo, colour/thickness, bookmark, note, show/hide, clear).
//
// Phase D adds SELECT -> HIGHLIGHT/NOTE/STUDY-ACTION: a `selectionchange` listener (active only
// while no drawing tool is selected, so it never fights the canvas's own pointer handling) turns a
// live text selection into a durable TextAnchor (lib/textAnchor.ts) and shows a floating
// ContextualSelectionToolbar with 9 actions. "Add to Revision"/"Create Flashcard"/"Mark
// Important"/"Mark Doubt" each create a tagged textHighlight (see lib/annotations.ts's own
// `studyTags` doc comment) rather than inventing a second revision/flashcard system. Shapes/arrows/
// lasso-select-and-move UI and the Annotation Index remain later-phase work, not part of this pass.

export const DocumentAnnotator = forwardRef<DocumentAnnotatorHandle, { documentId: string; renderMode: RenderMode; scrollBoxClassName: string; children: React.ReactNode }>(function DocumentAnnotator(
  { documentId, renderMode, scrollBoxClassName, children },
  ref,
) {
  const allAnnotations = useAppStore((s) => s.annotations);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const updateAnnotationText = useAppStore((s) => s.updateAnnotationText);
  const updateAnnotationPoints = useAppStore((s) => s.updateAnnotationPoints);
  const deleteAnnotation = useAppStore((s) => s.deleteAnnotation);

  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_COLORS[0]);
  // Split exactly like inkColor/highlighterColor and inkOpacity/highlighterOpacity below — a single
  // shared `thickness` used to mean the highlighter's committed stroke (floored to
  // DEFAULT_HIGHLIGHTER_THICKNESS in handleCommitStroke) could visibly differ from what the active
  // drag preview rendered (AnnotationLayer draws the preview from this same prop, unfloored), and a
  // user could never actually thin the highlighter below the floor via the toolbar slider.
  const [inkThickness, setInkThickness] = useState<number>(DEFAULT_PEN_THICKNESS);
  const [highlighterThickness, setHighlighterThickness] = useState<number>(DEFAULT_HIGHLIGHTER_THICKNESS);
  const [inkOpacity, setInkOpacity] = useState<number>(DEFAULT_INK_OPACITY);
  const [highlighterOpacity, setHighlighterOpacity] = useState<number>(DEFAULT_HIGHLIGHTER_OPACITY);
  const [penStyle, setPenStyle] = useState<PenStyle>('fine');
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [editingNote, setEditingNote] = useState<StickyNoteAnnotation | null | 'new'>(null);
  const [editingTextNote, setEditingTextNote] = useState<TextNoteAnnotation | null>(null);
  const [pendingTextNoteAnchor, setPendingTextNoteAnchor] = useState<TextAnchor | null>(null);
  const [history, setHistory] = useState(() => createHistoryState());
  const [pulseId, setPulseId] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ anchor: TextAnchor; top: number; left: number; width: number } | null>(null);

  // Annotation Index "jump to source" (Phase E) — imperative because navigation is driven from
  // OUTSIDE this component (ContentView owns the Raw/Preview toggle and only one render mode's
  // DocumentAnnotator is ever mounted at a time). Reuses the SAME TextAnchor/normalized-point
  // models as everything else here — no second anchoring system.
  useImperativeHandle(
    ref,
    () => ({
      navigateToAnnotation(annotationId: string): boolean {
        const a = allAnnotations.find((x) => x.id === annotationId);
        if (!a || a.documentId !== documentId) return false;

        if (a.type === 'bookmark') {
          scrollBoxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return true;
        }
        if (a.renderMode !== renderMode) return false; // caller must switch render mode and retry

        if (isTextAnchored(a)) {
          const container = contentRef.current;
          if (!container) return false;
          const resolution = resolveTextAnchor(container.textContent ?? '', a.anchor);
          if (resolution.status === 'unresolved') return false;
          const range = rangeFromOffsets(container, resolution.start, resolution.end);
          if (!range) return false;
          const startNode = range.startContainer;
          const el = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : (startNode as Element);
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setPulseId(a.id);
          window.setTimeout(() => setPulseId((cur) => (cur === a.id ? null : cur)), PULSE_DURATION_MS);
          return true;
        }

        if (isGeometryAnnotation(a)) {
          const container = contentRef.current;
          const scrollBox = scrollBoxRef.current;
          if (container && scrollBox) {
            const containerRect = container.getBoundingClientRect();
            const scrollRect = scrollBox.getBoundingClientRect();
            const ys = a.points.map((p) => p.y);
            const centerYFraction = (Math.min(...ys) + Math.max(...ys)) / 2;
            const targetTop = containerRect.top - scrollRect.top + scrollBox.scrollTop + centerYFraction * containerRect.height - scrollBox.clientHeight / 2;
            scrollBox.scrollTo({ top: targetTop, behavior: 'smooth' });
          }
          setPulseId(a.id);
          window.setTimeout(() => setPulseId((cur) => (cur === a.id ? null : cur)), PULSE_DURATION_MS);
          return true;
        }

        return false;
      },
    }),
    [allAnnotations, documentId, renderMode],
  );

  // Ink/highlighter/shape/arrow: scoped to THIS render mode's own pixel geometry.
  const geometry = geometryAnnotationsFor(allAnnotations, documentId, renderMode);
  // Text-anchored highlight/underline/strikethrough/note: scoped to THIS render mode too — a
  // quote's offsets are only meaningful within the exact text layout it was captured from (Raw and
  // Preview lay out the same source completely differently — see lib/annotations.ts's own header).
  const textAnnotations = textAnchoredAnnotationsFor(allAnnotations, documentId, renderMode);
  // Sticky notes + bookmark: document-level, identical in both render modes.
  const notes = stickyNotesForDocument(allAnnotations, documentId);
  const bookmark = bookmarkForDocument(annotationsForDocument(allAnnotations, documentId), documentId);
  const layerAnnotations = [...geometry, ...notes];

  // Selection -> ContextualSelectionToolbar. Phase 6-7A fix — this used to bail out unconditionally
  // whenever a drawing tool was armed, on the assumption that the tool already owned all
  // pointer/touch interaction so a selection could never legitimately exist. That's no longer true:
  // AnnotationLayer's active canvas is now always pointer-events:none (see its own header comment),
  // so a touch long-press over the text can produce a real selection even while a tool is armed. A
  // genuine selection is a clear, unambiguous signal the user wants to mark up TEXT, not draw — so
  // it's honoured regardless of activeTool, and armed tool is cleared with it (the user should never
  // need to know a tool was even active, let alone manually deactivate it, to highlight text).
  useEffect(() => {
    function handleSelectionChange() {
      const container = contentRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const anchor = createTextAnchorFromRange(container, range);
      if (!anchor) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelection(null);
        return;
      }
      setSelection({ anchor, top: rect.top, left: rect.left, width: rect.width });
      setActiveTool((cur) => (cur ? null : cur));
    }
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const color = activeTool === 'highlighter' ? highlighterColor : inkColor;
  const opacity = activeTool === 'highlighter' ? highlighterOpacity : inkOpacity;
  const thickness = activeTool === 'highlighter' ? highlighterThickness : inkThickness;

  function setColor(c: string) {
    if (activeTool === 'highlighter') setHighlighterColor(c);
    else setInkColor(c);
    if (!INK_COLORS.includes(c) && !HIGHLIGHTER_COLORS.includes(c)) {
      setRecentColors((prev) => [c, ...prev.filter((existing) => existing !== c)].slice(0, MAX_RECENT_COLORS));
    }
  }

  function setOpacity(o: number) {
    const clamped = Math.min(1, Math.max(0.05, o));
    if (activeTool === 'highlighter') setHighlighterOpacity(clamped);
    else setInkOpacity(clamped);
  }

  function setThickness(t: number) {
    if (activeTool === 'highlighter') setHighlighterThickness(t);
    else setInkThickness(t);
  }

  /** Switching pen style also applies that style's own sensible thickness/opacity defaults (see
   * PEN_STYLE_DEFAULTS) — e.g. picking Marker starts semi-transparent and thick, Fine Pen starts
   * thin and fully opaque, matching how most note-taking apps behave. The user can still override
   * either afterward via the toolbar's own thickness/opacity controls; this only sets the starting
   * point for the newly-selected style. Never touches the highlighter's own thickness/opacity,
   * which penStyle has no relationship to. */
  function selectPenStyle(style: PenStyle) {
    setPenStyle(style);
    const defaults = PEN_STYLE_DEFAULTS[style];
    setInkThickness(defaults.thickness);
    setInkOpacity(defaults.opacity);
  }

  function record(entry: Parameters<typeof pushHistoryEntry>[1]) {
    setHistory((h) => pushHistoryEntry(h, entry));
  }

  function handleCommitStroke(points: NormalizedPoint[]) {
    const stroke: InkAnnotation | HighlighterInkAnnotation =
      activeTool === 'highlighter'
        ? createHighlighterInkAnnotation({ documentId, renderMode, color, thickness, opacity: highlighterOpacity, points })
        : createInkAnnotation({ documentId, renderMode, color, thickness, opacity: inkOpacity, penStyle, points });
    addAnnotation(stroke);
    record({ action: 'create', annotation: stroke });
  }

  // A finished NATIVE stroke is committed through the SAME addAnnotation/record primitives
  // handleCommitStroke above already uses — not a second, parallel persistence path — so it
  // renders, undoes/redoes, and persists exactly like a JS-drawn stroke. Uses whatever the toolbar
  // currently has selected (colour/thickness/opacity/penStyle, or the highlighter's own colour/
  // thickness/opacity if that's the active tool) rather than a hardcoded brush, since
  // NativeInkPlugin.setBrushConfig (below) keeps the native brush in sync with these same values.
  function handleNativeInkStroke(points: NormalizedPoint[]) {
    if (!isMeaningfulStroke(points)) return;
    const stroke: InkAnnotation | HighlighterInkAnnotation =
      activeTool === 'highlighter'
        ? createHighlighterInkAnnotation({ documentId, renderMode, color: highlighterColor, thickness: highlighterThickness, opacity: highlighterOpacity, points })
        : createInkAnnotation({ documentId, renderMode, color: inkColor, thickness: inkThickness, opacity: inkOpacity, penStyle, points });
    addAnnotation(stroke);
    record({ action: 'create', annotation: stroke });
  }

  useEffect(() => {
    if (!isNativeInkAvailable) return;
    const listenerPromise = NativeInk.addListener('nativeInkStrokeFinished', (event) => {
      handleNativeInkStroke(event.points);
    });
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, renderMode]);

  // Native ink is only attached while a native-capable tool is armed (see isNativeInkCapableTool —
  // currently pen [covering all five PenStyle variants] and highlighter), exactly the same gating
  // AnnotationLayer's own `interactive = !!activeTool` already applies to the JS path. While lasso/
  // eraser/shape/arrow is selected (or no tool at all), the overlay is detached so a stylus reaches
  // the WebView/JS layer instead, where those tools already work correctly — the native overlay has
  // no concept of "which JS tool is active" and would otherwise unconditionally treat any stylus
  // contact as an ink stroke regardless of toolbar selection.
  const nativeInkShouldBeActive = isNativeInkAvailable && isNativeInkCapableTool(activeTool);
  useEffect(() => {
    if (!nativeInkShouldBeActive) return;
    NativeInk.enableNativeInk().catch((err) => console.error('NativeInk.enableNativeInk failed', err));
    return () => {
      NativeInk.disableNativeInk().catch((err) => console.error('NativeInk.disableNativeInk failed', err));
    };
  }, [nativeInkShouldBeActive]);

  // Keeps the native brush in sync with the toolbar's own colour/thickness/opacity selection (see
  // toNativeBrushConfig's own header for why PenStyle itself doesn't map to a different native
  // brush family) — this is what makes "the selected tool controls the actual native drawing
  // configuration" true, and what stops the native stroke rendering a fixed test colour regardless
  // of the toolbar's own selection.
  //
  // Bug fix — this used to call NativeInk.setBrushConfig() directly, racing the separate
  // enable/disable effect above's own unawaited NativeInk.enableNativeInk() call: both fire in the
  // same commit the moment a native-capable tool is first armed, and nothing guaranteed
  // attachOverlay() (which constructs the overlay and assigns NativeInkPlugin's `overlay` field)
  // finished before this effect's setBrushConfig reached native. When the race was lost,
  // `overlay?.updateBrush(...)` silently no-op'd against a still-null overlay, permanently leaving
  // the just-attached overlay on its hardcoded default brush (black) until the next colour change
  // — explaining "native stroke is always black even when a different colour is selected" on the
  // very first stroke of a session. Explicitly awaiting enableNativeInk() first — a cheap,
  // idempotent no-op when the overlay already exists, since attachOverlay() returns immediately if
  // `overlay != null` — closes the race with a real ordering guarantee instead of an assumption
  // about the Capacitor bridge's own call ordering. This does NOT touch the separate attach/detach
  // effect above or its cleanup, so switching tools still only attaches/detaches once; a colour/
  // thickness/opacity change alone never detaches or recreates the overlay.
  useEffect(() => {
    if (!nativeInkShouldBeActive) return;

    const applyBrushConfig = async () => {
      try {
        await NativeInk.enableNativeInk();
        const dpr = window.devicePixelRatio || 1;
        await NativeInk.setBrushConfig(toNativeBrushConfig(color, thickness, opacity, dpr));
      } catch (err) {
        console.error('NativeInk brush configuration failed', err);
      }
    };

    void applyBrushConfig();
  }, [nativeInkShouldBeActive, color, thickness, opacity]);

  // Coordinate-mapping fix (this session's own forensic finding): tells the native side where the
  // document's own scrollable content box currently sits on screen, so a finished native stroke's
  // points are normalized against that SAME box the JS AnnotationLayer already uses — not this
  // overlay's on-screen viewport bounds. Re-sent on mount, on resize (ResizeObserver), and whenever
  // the scroll box scrolls (which moves the content box's own getBoundingClientRect() top/left).
  // Not gated on nativeInkShouldBeActive: cheap to keep fresh, and avoids a stale/missing bounds
  // report on the very first stroke right after a tool switch.
  useEffect(() => {
    if (!isNativeInkAvailable) return;
    const content = contentRef.current;
    const scrollBox = scrollBoxRef.current;
    if (!content || !scrollBox) return;
    function reportBounds() {
      if (!content) return;
      const rect = content.getBoundingClientRect();
      NativeInk.setDocumentBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      }).catch((err) => console.error('NativeInk.setDocumentBounds failed', err));
    }
    reportBounds();
    const ro = new ResizeObserver(reportBounds);
    ro.observe(content);
    scrollBox.addEventListener('scroll', reportBounds, { passive: true });
    return () => {
      ro.disconnect();
      scrollBox.removeEventListener('scroll', reportBounds);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, renderMode]);

  function handleCommitShape(shapeKind: ShapeKind, points: [NormalizedPoint, NormalizedPoint]) {
    const shape = createShapeAnnotation({ documentId, renderMode, shapeKind, color, thickness: Math.max(thickness, DEFAULT_SHAPE_THICKNESS), opacity: inkOpacity, points });
    addAnnotation(shape);
    record({ action: 'create', annotation: shape });
  }

  function handleCommitArrow(points: [NormalizedPoint, NormalizedPoint]) {
    const arrow = createArrowAnnotation({ documentId, renderMode, color, thickness: Math.max(thickness, DEFAULT_SHAPE_THICKNESS), opacity: inkOpacity, points });
    addAnnotation(arrow);
    record({ action: 'create', annotation: arrow });
  }

  function handleEraseStroke(annotation: GeometryAnnotation) {
    deleteAnnotation(annotation.id);
    record({ action: 'delete', annotation });
  }

  function handleMoveSelection(ids: string[], deltaX: number, deltaY: number) {
    for (const id of ids) {
      const a = geometry.find((g) => g.id === id);
      if (!a) continue;
      const before = a.points;
      const after = translatePoints(before, deltaX, deltaY);
      updateAnnotationPoints(id, after);
      record({ action: 'updateGeometry', id, before, after });
    }
  }

  function handleDeleteSelection(selected: GeometryAnnotation[]) {
    for (const a of selected) {
      deleteAnnotation(a.id);
      record({ action: 'delete', annotation: a });
    }
  }

  function handleUndo() {
    const popped = popForUndo(history);
    if (!popped) return;
    setHistory(popped.next);
    const { entry } = popped;
    if (entry.action === 'create') deleteAnnotation(entry.annotation.id);
    else if (entry.action === 'delete') addAnnotation(entry.annotation);
    else if (entry.action === 'updateText') updateAnnotationText(entry.id, entry.before);
    else if (entry.action === 'updateGeometry') updateAnnotationPoints(entry.id, entry.before);
  }

  function handleRedo() {
    const popped = popForRedo(history);
    if (!popped) return;
    setHistory(popped.next);
    const { entry } = popped;
    if (entry.action === 'create') addAnnotation(entry.annotation);
    else if (entry.action === 'delete') deleteAnnotation(entry.annotation.id);
    else if (entry.action === 'updateText') updateAnnotationText(entry.id, entry.after);
    else if (entry.action === 'updateGeometry') updateAnnotationPoints(entry.id, entry.after);
  }

  function handleToggleBookmark() {
    if (bookmark) {
      deleteAnnotation(bookmark.id);
      record({ action: 'delete', annotation: bookmark });
    } else {
      const b = createBookmark({ documentId, renderMode });
      addAnnotation(b);
      record({ action: 'create', annotation: b });
    }
  }

  function handleClearPage() {
    // Clears this render mode's geometry (ink/highlighter/shape/arrow) + text markup
    // (highlight/underline/strikethrough/textNote) + this document's sticky notes — everything
    // currently rendered in this view. The bookmark is a document-level fact, deliberately left
    // untouched by "clear this page's annotations".
    for (const a of [...geometry, ...notes, ...textAnnotations]) deleteAnnotation(a.id);
    // A bulk clear is intentionally NOT pushed onto the undo stack as N separate entries (that
    // would make one "Clear" tap take many taps of Undo to reverse) — this action is a deliberate,
    // confirmed (see AnnotationToolbar's own two-tap confirmation), one-way operation.
    setHistory(createHistoryState());
  }

  function handleDeleteTextMarkup(id: string) {
    const annotation = textAnnotations.find((a) => a.id === id);
    if (!annotation || annotation.type === 'textNote') return; // textNote deletes via its own edit dialog
    deleteAnnotation(id);
    record({ action: 'delete', annotation });
  }

  function handleSaveNote(input: { noteKind: 'text' | 'freehand'; text: string; inkPoints?: NormalizedPoint[] }) {
    if (editingNote && editingNote !== 'new') {
      const before = editingNote.text;
      updateAnnotationText(editingNote.id, input.text);
      record({ action: 'updateText', id: editingNote.id, before, after: input.text });
    } else {
      const note = createStickyNote({ documentId, renderMode, color: '#fde047', noteKind: input.noteKind, text: input.text, inkPoints: input.inkPoints });
      addAnnotation(note);
      record({ action: 'create', annotation: note });
    }
    setEditingNote(null);
  }

  function handleDeleteNote() {
    if (!editingNote || editingNote === 'new') return;
    deleteAnnotation(editingNote.id);
    record({ action: 'delete', annotation: editingNote });
    setEditingNote(null);
  }

  function clearSelectionUi() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function handleHighlightSelection() {
    if (!selection) return;
    const a = createTextHighlight({ documentId, renderMode, anchor: selection.anchor, color: DEFAULT_TEXT_MARKUP_COLOR });
    addAnnotation(a);
    record({ action: 'create', annotation: a });
    clearSelectionUi();
  }

  function handleUnderlineSelection() {
    if (!selection) return;
    const a = createUnderline({ documentId, renderMode, anchor: selection.anchor, color: DEFAULT_TEXT_MARKUP_COLOR });
    addAnnotation(a);
    record({ action: 'create', annotation: a });
    clearSelectionUi();
  }

  function handleStrikethroughSelection() {
    if (!selection) return;
    const a = createStrikethrough({ documentId, renderMode, anchor: selection.anchor, color: DEFAULT_TEXT_MARKUP_COLOR });
    addAnnotation(a);
    record({ action: 'create', annotation: a });
    clearSelectionUi();
  }

  function handleBookmarkSelection() {
    handleToggleBookmark();
    clearSelectionUi();
  }

  function handleMakeNoteFromSelection() {
    if (!selection) return;
    setPendingTextNoteAnchor(selection.anchor);
    clearSelectionUi();
  }

  /** Add to Revision / Create Flashcard / Mark Important / Mark Doubt: each creates ONE tagged
   * textHighlight rather than a bare, anchor-less tag — see lib/annotations.ts's own `studyTags`
   * doc comment for why this reuses the highlight model instead of a parallel tagging mechanism. */
  function handleTagSelection(tag: StudyTag) {
    if (!selection) return;
    const a = createTextHighlight({ documentId, renderMode, anchor: selection.anchor, color: DEFAULT_TEXT_MARKUP_COLOR, studyTags: [tag] });
    addAnnotation(a);
    record({ action: 'create', annotation: a });
    clearSelectionUi();
  }

  function handleSaveTextNote(input: { text: string }) {
    if (!pendingTextNoteAnchor) return;
    const note = createTextNote({ documentId, renderMode, anchor: pendingTextNoteAnchor, color: DEFAULT_TEXT_MARKUP_COLOR, text: input.text });
    addAnnotation(note);
    record({ action: 'create', annotation: note });
    setPendingTextNoteAnchor(null);
  }

  function handleSaveEditedTextNote(input: { text: string }) {
    if (!editingTextNote) return;
    const before = editingTextNote.text;
    updateAnnotationText(editingTextNote.id, input.text);
    record({ action: 'updateText', id: editingTextNote.id, before, after: input.text });
    setEditingTextNote(null);
  }

  function handleDeleteTextNote() {
    if (!editingTextNote) return;
    deleteAnnotation(editingTextNote.id);
    record({ action: 'delete', annotation: editingTextNote });
    setEditingTextNote(null);
  }

  return (
    <div>
      <div className="mb-3">
        <AnnotationToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          color={color}
          onSelectColor={setColor}
          recentColors={recentColors}
          thickness={thickness}
          onChangeThickness={(t) => setThickness(Math.min(24, Math.max(1, Math.round(t))))}
          opacity={opacity}
          onChangeOpacity={setOpacity}
          penStyle={penStyle}
          onSelectPenStyle={selectPenStyle}
          canUndo={canUndoHistory(history)}
          canRedo={canRedoHistory(history)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isBookmarked={!!bookmark}
          onToggleBookmark={handleToggleBookmark}
          onAddNote={() => setEditingNote('new')}
          annotationsVisible={annotationsVisible}
          onToggleVisible={() => setAnnotationsVisible((v) => !v)}
          onClearPage={handleClearPage}
          hasAnnotations={layerAnnotations.length > 0 || textAnnotations.length > 0}
        />
      </div>

      <div ref={scrollBoxRef} className={cx('overflow-y-auto', scrollBoxClassName)}>
        <AnnotationLayer
          annotations={layerAnnotations}
          textAnnotations={textAnnotations}
          renderMode={renderMode}
          activeTool={activeTool}
          color={color}
          thickness={thickness}
          opacity={opacity}
          penStyle={penStyle}
          annotationsVisible={annotationsVisible}
          onCommitStroke={handleCommitStroke}
          onCommitShape={handleCommitShape}
          onCommitArrow={handleCommitArrow}
          onEraseStroke={handleEraseStroke}
          onMoveSelection={handleMoveSelection}
          onDeleteSelection={handleDeleteSelection}
          onOpenNote={(note) => setEditingNote(note)}
          onOpenTextNote={(note) => setEditingTextNote(note)}
          onDeleteTextMarkup={handleDeleteTextMarkup}
          containerRef={contentRef}
          pulseAnnotationId={pulseId}
        >
          {children}
        </AnnotationLayer>
      </div>

      {selection && !editingNote && !editingTextNote && !pendingTextNoteAnchor && (
        <ContextualSelectionToolbar
          top={selection.top}
          left={selection.left}
          width={selection.width}
          onHighlight={handleHighlightSelection}
          onUnderline={handleUnderlineSelection}
          onStrikethrough={handleStrikethroughSelection}
          onMakeNote={handleMakeNoteFromSelection}
          onBookmark={handleBookmarkSelection}
          onAddToRevision={() => handleTagSelection('revision')}
          onCreateFlashcard={() => handleTagSelection('flashcard')}
          onMarkImportant={() => handleTagSelection('important')}
          onMarkDoubt={() => handleTagSelection('doubt')}
        />
      )}

      {editingNote && (
        <NoteEditorDialog
          note={editingNote === 'new' ? null : editingNote}
          onSave={handleSaveNote}
          onDelete={editingNote !== 'new' ? handleDeleteNote : undefined}
          onClose={() => setEditingNote(null)}
        />
      )}

      {pendingTextNoteAnchor && <NoteEditorDialog note={null} allowFreehand={false} onSave={handleSaveTextNote} onClose={() => setPendingTextNoteAnchor(null)} />}

      {editingTextNote && (
        <NoteEditorDialog
          note={{ noteKind: 'text', text: editingTextNote.text }}
          allowFreehand={false}
          onSave={handleSaveEditedTextNote}
          onDelete={handleDeleteTextNote}
          onClose={() => setEditingTextNote(null)}
        />
      )}
    </div>
  );
});
