import { Check } from 'lucide-react';
import { cx } from '../../lib/utils';

// Architecture Deduplication Phase 2 — the shared card/row multi-select checkbox, extracted from
// four independent, near-verbatim copies (pages/Notes.tsx's OrganiseNoteCard, pages/Repository.tsx's
// result card, pages/PhdResearch.tsx's document card, pages/WorkingBibliography.tsx's table row).
// Same sibling pattern as PinToggle/ArchiveToggle in this same directory: a single shared toggle
// control, callers own the selection state and pass their own onToggleSelected.
export function SelectionCheckbox({ selected, title, onToggleSelected }: { selected: boolean; title: string; onToggleSelected: () => void }) {
  const label = selected ? `Deselect ${title}` : `Select ${title}`;
  return (
    <button
      type="button"
      onClick={onToggleSelected}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span className={cx('flex h-4 w-4 items-center justify-center rounded border', selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600')}>
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}
