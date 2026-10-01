import { getReadingStatus, READING_STATUSES, READING_STATUS_LABELS, type ReadingStatus } from '../../lib/phdReadingStatus';
import { cx } from '../../lib/utils';
import type { ImportedContent } from '../../lib/contentImport';

// PhD Research — Reading Status Picker (Phase 7). One small, reusable control shared by
// pages/WorkingBibliography.tsx (the bibliography table) and pages/PhdResearch.tsx ("By Source"
// tree), so a source/chapter's reading progression is set the same way everywhere it appears. A
// native <select> (not a 4-button toggle group) because both call sites already pack several
// controls into a tight row/cell — this is the same compact-select pattern PhdDashboard.tsx's own
// micro-target priority/Topic Area pickers already use, just sized for inline use.
//
// Reads/writes nothing itself: the caller supplies the current `item` and an `onChange` that
// applies the update through its own existing updateImportedContent call (no new store action).

const READING_STATUS_TONE: Record<ReadingStatus, string> = {
  unread: 'text-slate-400 dark:text-slate-500',
  reading: 'text-amber-600 dark:text-amber-400',
  read: 'text-brand-600 dark:text-brand-400',
  reviewed: 'text-emerald-600 dark:text-emerald-400',
};

export function ReadingStatusPicker({
  item,
  onChange,
  className,
}: {
  item: ImportedContent;
  onChange: (next: ReadingStatus) => void;
  className?: string;
}) {
  const value = getReadingStatus(item);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ReadingStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Reading status for ${item.title || 'this item'}`}
      className={cx(
        'rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        READING_STATUS_TONE[value],
        className,
      )}
    >
      {READING_STATUSES.map((s) => (
        <option key={s} value={s}>
          {READING_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
