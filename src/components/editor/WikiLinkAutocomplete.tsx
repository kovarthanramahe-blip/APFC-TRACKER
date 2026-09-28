import { FileText, NotebookPen } from 'lucide-react';
import { cx } from '../../lib/utils';
import type { WikiLinkCandidate } from '../../lib/wikiLinks';

// Premium Knowledge Editor, Phase 5G — the [[ autocomplete picker. Same docked-popup, controlled-
// by-parent pattern as SlashCommandMenu (see that component's own header for why it's docked rather
// than caret-positioned) — the textarea keeps keyboard focus throughout; NoteEditor owns the active
// trigger/candidates/highlighted-index state and all keyboard handling.
export function WikiLinkAutocomplete({
  candidates,
  activeIndex,
  onSelect,
  onHover,
}: {
  candidates: readonly WikiLinkCandidate[];
  activeIndex: number;
  onSelect: (candidate: WikiLinkCandidate) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div className="mb-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
      {candidates.length === 0 ? (
        <p className="px-3 py-3 text-xs text-slate-400">No matching notes or documents in this workspace.</p>
      ) : (
        candidates.map((candidate, i) => {
          const Icon = candidate.type === 'note' ? NotebookPen : FileText;
          return (
            <button
              key={`${candidate.type}:${candidate.id}`}
              type="button"
              onClick={() => onSelect(candidate)}
              onMouseEnter={() => onHover(i)}
              // Keeps the textarea focused (no blur) on tap/click — see SlashCommandMenu's own
              // onMouseDown for why this must never race NoteEditor's close-on-blur closed.
              onMouseDown={(e) => e.preventDefault()}
              className={cx(
                'flex w-full items-center gap-2 px-3 py-3 text-left text-sm',
                i === activeIndex ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{candidate.title || 'Untitled'}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{candidate.type === 'note' ? 'Note' : 'Document'}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
