import { Highlighter, Underline, Strikethrough, StickyNote, Bookmark, Brain, Layers, Star, HelpCircle } from 'lucide-react';

// Premium Study Reader (Phase D) — the floating action bar shown above a live text selection made
// while no drawing tool is active (see DocumentAnnotator's selectionchange listener). Positioned
// via the selection Range's own getBoundingClientRect() in FIXED viewport coordinates — this is
// deliberately different from every persisted annotation's own normalized/text-anchor geometry
// (see lib/annotations.ts's own header): this toolbar is transient, non-persisted UI, recomputed
// fresh on every selection change, so raw viewport pixels are the right coordinate space for it.

export interface ContextualSelectionToolbarProps {
  /** The selection's own bounding rect, in viewport coordinates (from Range.getBoundingClientRect()). */
  top: number;
  left: number;
  width: number;
  onHighlight: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onMakeNote: () => void;
  onBookmark: () => void;
  onAddToRevision: () => void;
  onCreateFlashcard: () => void;
  onMarkImportant: () => void;
  onMarkDoubt: () => void;
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // A plain click on this bar would otherwise fire a `mousedown` first, which collapses the
      // browser's own text selection before the click (and this action) ever runs — preventing
      // that default is what lets the selection still be live when `onClick` reads it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

const TOOLBAR_WIDTH = 328;

export function ContextualSelectionToolbar({
  top,
  left,
  width,
  onHighlight,
  onUnderline,
  onStrikethrough,
  onMakeNote,
  onBookmark,
  onAddToRevision,
  onCreateFlashcard,
  onMarkImportant,
  onMarkDoubt,
}: ContextualSelectionToolbarProps) {
  const clampedLeft = Math.max(8, Math.min(left + width / 2 - TOOLBAR_WIDTH / 2, window.innerWidth - TOOLBAR_WIDTH - 8));
  const clampedTop = Math.max(8, top - 56);

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      style={{ top: clampedTop, left: clampedLeft }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ActionButton label="Text Highlight — marks exactly the selected text" onClick={onHighlight}>
        <Highlighter className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Underline" onClick={onUnderline}>
        <Underline className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Strikethrough" onClick={onStrikethrough}>
        <Strikethrough className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Make note" onClick={onMakeNote}>
        <StickyNote className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Bookmark" onClick={onBookmark}>
        <Bookmark className="h-4 w-4" />
      </ActionButton>
      <div className="mx-0.5 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
      <ActionButton label="Add to revision" onClick={onAddToRevision}>
        <Brain className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Create flashcard" onClick={onCreateFlashcard}>
        <Layers className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Mark important" onClick={onMarkImportant}>
        <Star className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Mark doubt" onClick={onMarkDoubt}>
        <HelpCircle className="h-4 w-4" />
      </ActionButton>
    </div>
  );
}
