import { useState } from 'react';
import { X, Search, Highlighter, Underline, Strikethrough, StickyNote, Bookmark, PenLine, Brain, Layers, Star, HelpCircle, Check } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { annotationsForDocument, type Annotation } from '../../lib/annotations';
import { ALL_INDEX_CATEGORIES, filterAnnotationIndex, previewTextFor, formatAnnotationTimestamp, type IndexCategory } from '../../lib/annotationIndex';
import { isAnnotationInRevisionQueue } from '../../lib/annotationRevisionBridge';
import { cx, getLocalDateString } from '../../lib/utils';

// Premium Study Reader — Annotation Index (Phase E). A responsive panel listing every annotation
// on ONE document (both render modes — see lib/annotationIndex.ts's own header for why this is a
// separate module from lib/annotations.ts's generic queries), grouped into the categories the
// project's own spec calls for. Reads directly from the store's `annotations` field — the SAME
// array DocumentAnnotator already reads/writes, never a second index/cache of its own, so this
// panel is always exactly in sync with what's actually drawn/marked on the document.
//
// Clicking an item hands the raw Annotation up to the caller (ContentView, in
// pages/RepositoryDetail.tsx) via `onNavigate` — THAT'S where the render-mode switch + the actual
// scroll-to-source + pulse happens (via DocumentAnnotatorHandle.navigateToAnnotation), since only
// ContentView owns the Raw/Preview toggle both render modes live behind.

const CATEGORY_META: Record<IndexCategory, { label: string; icon: typeof Highlighter }> = {
  highlights: { label: 'Highlights', icon: Highlighter },
  notes: { label: 'Notes', icon: StickyNote },
  bookmarks: { label: 'Bookmarks', icon: Bookmark },
  handwriting: { label: 'Handwriting', icon: PenLine },
  revision: { label: 'Revision', icon: Brain },
  flashcard: { label: 'Flashcards', icon: Layers },
  important: { label: 'Important', icon: Star },
  doubt: { label: 'Doubts', icon: HelpCircle },
};

const ANNOTATION_TYPE_ICON: Record<Annotation['type'], typeof Highlighter> = {
  textHighlight: Highlighter,
  underline: Underline,
  strikethrough: Strikethrough,
  textNote: StickyNote,
  stickyNote: StickyNote,
  bookmark: Bookmark,
  ink: PenLine,
  highlighterInk: PenLine,
  shape: PenLine,
  arrow: PenLine,
};

function CategoryChip({ label, icon: Icon, active, onClick }: { label: string; icon?: typeof Highlighter; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
          : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function IndexItemIcon({ annotation }: { annotation: Annotation }) {
  const Icon = ANNOTATION_TYPE_ICON[annotation.type];
  const color = 'color' in annotation ? annotation.color : '#64748b';
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}26` }}>
      <Icon className="h-3.5 w-3.5" style={{ color }} />
    </span>
  );
}

function EmptyState({ category, hasAnyAnnotations }: { category: IndexCategory | 'all'; hasAnyAnnotations: boolean }) {
  const label = category === 'all' ? 'annotations' : CATEGORY_META[category].label.toLowerCase();
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
      <p>{hasAnyAnnotations ? `No ${label} match here yet.` : `No ${label} yet.`}</p>
      {!hasAnyAnnotations && category === 'all' && <p className="text-xs">Select text or start writing to create your first one.</p>}
    </div>
  );
}

export interface AnnotationIndexProps {
  documentId: string;
  onNavigate: (annotation: Annotation) => void;
  onClose: () => void;
}

/** Wave 4A, Scope C — the explicit "Add to Revision Queue" action for an item already tagged
 * 'revision' (see lib/annotationRevisionBridge.ts for the full contract). Rendered only inside the
 * Revision category tab, right where those tagged items are already browsed, rather than cluttering
 * every other category with a button that would never apply there. Shows one of three states —
 * never silently no-ops: already queued (done, disabled), just added (brief confirmation), or the
 * action itself — so the three outcomes lib/annotationRevisionBridge.ts can report (added/
 * already_exists/cannot_add) are always visible to the user, never swallowed. */
function AddToRevisionQueueButton({ annotation }: { annotation: Annotation }) {
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const bridgeAnnotationToRevisionQueue = useAppStore((s) => s.bridgeAnnotationToRevisionQueue);
  const [justAdded, setJustAdded] = useState(false);
  const alreadyQueued = justAdded || isAnnotationInRevisionQueue(revisionQueue, annotation);

  if (alreadyQueued) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Check className="h-3 w-3" /> In Revision Queue
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const status = bridgeAnnotationToRevisionQueue(annotation.id, getLocalDateString());
        if (status === 'added' || status === 'already_exists') setJustAdded(true);
      }}
      className="shrink-0 rounded-full border border-brand-200 px-2 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
    >
      Add to Revision Queue
    </button>
  );
}

export function AnnotationIndex({ documentId, onNavigate, onClose }: AnnotationIndexProps) {
  const allAnnotations = useAppStore((s) => s.annotations);
  const docAnnotations = annotationsForDocument(allAnnotations, documentId);
  const [category, setCategory] = useState<IndexCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const results = filterAnnotationIndex(docAnnotations, category, query);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm sm:hidden" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-slate-200 sm:shadow-xl sm:dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Annotations{docAnnotations.length > 0 ? ` (${docAnnotations.length})` : ''}</h3>
          <button type="button" onClick={onClose} aria-label="Close annotation index" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search annotations…"
              aria-label="Search annotations"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <CategoryChip label="All" active={category === 'all'} onClick={() => setCategory('all')} />
          {ALL_INDEX_CATEGORIES.map((c) => (
            <CategoryChip key={c} label={CATEGORY_META[c].label} icon={CATEGORY_META[c].icon} active={category === c} onClick={() => setCategory(c)} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {results.length === 0 ? (
            <EmptyState category={category} hasAnyAnnotations={docAnnotations.length > 0} />
          ) : (
            <ul className="space-y-1">
              {results.map((a) => (
                <li key={a.id} className="flex items-start gap-1 rounded-xl border border-transparent px-1 hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60">
                  <button type="button" onClick={() => onNavigate(a)} className="flex min-w-0 flex-1 items-start gap-2.5 py-2 pl-1.5 text-left">
                    <IndexItemIcon annotation={a} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{previewTextFor(a)}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{formatAnnotationTimestamp(a.createdAt)}</span>
                        {a.type !== 'bookmark' && <span className="rounded bg-slate-100 px-1 py-0.5 font-mono uppercase dark:bg-slate-800">{a.renderMode}</span>}
                      </div>
                    </div>
                  </button>
                  {category === 'revision' && a.studyTags.includes('revision') && (
                    <div className="shrink-0 self-center pr-1.5">
                      <AddToRevisionQueueButton annotation={a} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
