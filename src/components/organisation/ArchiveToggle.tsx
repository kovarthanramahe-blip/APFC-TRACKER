import { Archive, ArchiveRestore } from 'lucide-react';

// Premium Note Organisation (Phase 4E) — the archive/unarchive equivalent of PinToggle. Archiving
// only ever flips a display-visibility flag (isArchived) — it never deletes or mutates anything
// else, and an archived item stays fully persisted and discoverable via the Archived view.
export function ArchiveToggle({ archived, onToggle, size = 'md' }: { archived: boolean; onToggle: () => void; size?: 'sm' | 'md' }) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={archived ? 'Unarchive' : 'Archive'}
      title={archived ? 'Unarchive' : 'Archive'}
      className="rounded-lg p-2.5 text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      {archived ? <ArchiveRestore className={iconClass} /> : <Archive className={iconClass} />}
    </button>
  );
}
