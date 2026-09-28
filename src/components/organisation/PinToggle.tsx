import { Pin } from 'lucide-react';
import { cx } from '../../lib/utils';

// Premium Note Organisation (Phase 4E) — a single, shared pin/unpin icon button. Pinning is
// advisory display state only (see lib/importedContentRepository.ts's isContentPinned doc
// comment): it never duplicates the underlying item, so this component owns only the toggle
// affordance, never any persistence of its own — callers pass their own onToggle.
export function PinToggle({ pinned, onToggle, size = 'md' }: { pinned: boolean; onToggle: () => void; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      title={pinned ? 'Unpin' : 'Pin'}
      className={cx(
        'rounded-lg p-2.5 text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
        pinned && 'text-gold-500',
      )}
    >
      <Pin className={cx(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', pinned && 'fill-gold-400')} />
    </button>
  );
}
