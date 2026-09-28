import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X, Trash2, Type, PenLine } from 'lucide-react';
import { Button } from '../ui/Primitives';
import { cx } from '../../lib/utils';
import type { NormalizedPoint } from '../../lib/annotations';
import { relativePointFromClient, clampPoint, isMeaningfulStroke } from '../../lib/annotations';

// Document Reading & Annotation (Phase 7) — the note create/edit dialog, same responsive bottom-
// sheet-to-centered-dialog pattern as the existing Repository export/import modals (see
// components/repository/ExportRepositoryModal.tsx), so it looks and behaves consistently with the
// rest of the app rather than inventing a new dialog style. Supports both a typed text note and a
// small handwritten/freehand doodle note — its own tiny, self-contained ink canvas (NOT the page's
// annotation layer; see lib/annotations.ts's StickyNoteAnnotation.inkPoints doc comment).

const MINI_CANVAS_HEIGHT = 160;

function MiniInkCanvas({ initialPoints, onChange }: { initialPoints: NormalizedPoint[]; onChange: (points: NormalizedPoint[]) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<NormalizedPoint[]>(initialPoints);
  const drawingRef = useRef(false);
  // A plain boolean, not the ref itself, drives the placeholder text — reading pointsRef.current
  // during render would be a React anti-pattern (the ref mutating never triggers the re-render
  // needed to hide/show the placeholder at the right time).
  const [hasPoints, setHasPoints] = useState(initialPoints.length > 0);

  function redraw() {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x * rect.width, pts[0].y * rect.height);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * rect.width, pts[i].y * rect.height);
    ctx.stroke();
  }

  // Renders any pre-existing doodle (editing a saved freehand note) as soon as the canvas mounts,
  // and keeps it correctly sized if the dialog itself is resized (e.g. an orientation change).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    redraw();
    const ro = new ResizeObserver(() => redraw());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toPoint(e: ReactPointerEvent): NormalizedPoint {
    const rect = wrapperRef.current!.getBoundingClientRect();
    return relativePointFromClient(e.clientX, e.clientY, rect);
  }

  function handleDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'touch') return; // same finger-never-draws rule as the main page layer
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    pointsRef.current = [toPoint(e)];
    setHasPoints(true);
    redraw();
  }
  function handleMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    pointsRef.current = [...pointsRef.current, clampPoint(toPoint(e))];
    redraw();
  }
  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(pointsRef.current);
  }

  return (
    <div ref={wrapperRef} className="relative h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      {!hasPoints && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">Draw with a stylus or mouse</p>}
      <button
        type="button"
        onClick={() => {
          pointsRef.current = [];
          setHasPoints(false);
          onChange([]);
          redraw();
        }}
        className="absolute right-1.5 top-1.5 rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-white dark:bg-slate-900/80 dark:text-slate-300"
      >
        Clear
      </button>
    </div>
  );
}

/** Plain data, not the full StickyNoteAnnotation — this dialog is reused for text-anchored notes
 * (created from a selection's contextual toolbar) too, which have no `noteKind`/`inkPoints` of
 * their own concept-wise; the caller decides what kind of annotation the returned {text} becomes. */
export interface NoteEditorInitialValue {
  noteKind: 'text' | 'freehand';
  text: string;
  inkPoints?: NormalizedPoint[];
}

export interface NoteEditorDialogProps {
  note: NoteEditorInitialValue | null;
  onSave: (input: { noteKind: 'text' | 'freehand'; text: string; inkPoints?: NormalizedPoint[] }) => void;
  onDelete?: () => void;
  onClose: () => void;
  /** false for a note anchored to selected text — a freehand doodle has no meaningful relationship
   * to a specific text quote, so that tab is hidden entirely rather than offered and ignored. */
  allowFreehand?: boolean;
}

export function NoteEditorDialog({ note, onSave, onDelete, onClose, allowFreehand = true }: NoteEditorDialogProps) {
  const [kind, setKind] = useState<'text' | 'freehand'>(note?.noteKind ?? 'text');
  const [text, setText] = useState(note?.text ?? '');
  const [inkPoints, setInkPoints] = useState<NormalizedPoint[]>(note?.inkPoints ?? []);

  const canSave = kind === 'text' ? text.trim().length > 0 : isMeaningfulStroke(inkPoints);

  function handleSave() {
    if (!canSave) return;
    onSave(kind === 'text' ? { noteKind: 'text', text: text.trim() } : { noteKind: 'freehand', text: '', inkPoints });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:inset-0 sm:top-24 sm:bottom-auto sm:h-fit sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{note ? 'Edit Note' : 'Add Note'}</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {allowFreehand && (
            <div className="inline-flex rounded-xl border border-slate-200 p-1 text-sm dark:border-slate-700">
              <button
                type="button"
                onClick={() => setKind('text')}
                className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium', kind === 'text' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400')}
              >
                <Type className="h-4 w-4" /> Text
              </button>
              <button
                type="button"
                onClick={() => setKind('freehand')}
                className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium', kind === 'freehand' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400')}
              >
                <PenLine className="h-4 w-4" /> Freehand
              </button>
            </div>
          )}

          {(allowFreehand ? kind : 'text') === 'text' ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Write a note about this document…"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              style={{ minHeight: MINI_CANVAS_HEIGHT }}
            />
          ) : (
            <MiniInkCanvas initialPoints={inkPoints} onChange={setInkPoints} />
          )}

          <div className="flex items-center justify-between gap-2">
            {note && onDelete ? (
              <Button variant="danger" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!canSave}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
